import fs from 'fs';
import path from 'path';
import { normalizePhoneNumber } from '../utils/phoneNormalizer.ts';

export interface ChatwootApiConfig {
  baseUrl: string;
  accountId: number;
  apiAccessToken: string;
}

export interface ChatwootInboxResponse {
  id: number;
  name: string;
  channel_type: string;
  phone_number?: string;
  avatar_url?: string;
  provider?: string;
  medium?: string;
}

export function sanitizeError(err: unknown, tokenToScrub?: string): string {
  let message = '';
  if (err instanceof Error) {
    message = err.message;
  } else if (typeof err === 'object' && err !== null) {
    message = JSON.stringify(err);
  } else {
    message = String(err);
  }

  // Scrub any access token occurrences
  if (tokenToScrub && tokenToScrub.length > 4) {
    message = message.split(tokenToScrub).join('[SCRUBBED_TOKEN]');
  }
  // Scrub typical bearer/api_access_token strings
  message = message.replace(/api_access_token=[a-zA-Z0-9_\-]+/gi, 'api_access_token=[PROTECTED]');
  message = message.replace(/Bearer\s+[a-zA-Z0-9_\-]+/gi, 'Bearer [PROTECTED]');

  return message.slice(0, 500); // cap size for clean logging
}

/**
 * Validate Chatwoot connection credentials and retrieve inboxes
 */
export async function getChatwootInboxes(config: ChatwootApiConfig): Promise<{
  success: boolean;
  inboxes: Array<{
    id: number;
    name: string;
    channelType: string;
    phoneNumber?: string;
  }>;
  error?: string;
}> {
  try {
    const cleanUrl = config.baseUrl.replace(/\/+$/, '');
    const url = `${cleanUrl}/api/v1/accounts/${config.accountId}/inboxes`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        api_access_token: config.apiAccessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return {
        success: false,
        inboxes: [],
        error: `Chatwoot HTTP ${res.status}: ${sanitizeError(errBody, config.apiAccessToken) || res.statusText}`,
      };
    }

    const data = await res.json();
    const list: ChatwootInboxResponse[] = Array.isArray(data)
      ? data
      : Array.isArray(data.payload)
      ? data.payload
      : [];

    const inboxes = list.map((inbox) => ({
      id: inbox.id,
      name: inbox.name || `Inbox #${inbox.id}`,
      channelType: inbox.channel_type || 'Unknown',
      phoneNumber: inbox.phone_number || undefined,
    }));

    return {
      success: true,
      inboxes,
    };
  } catch (err) {
    return {
      success: false,
      inboxes: [],
      error: sanitizeError(err, config.apiAccessToken),
    };
  }
}

/**
 * Search contact by phone number
 */
export async function searchChatwootContact(
  config: ChatwootApiConfig,
  phoneOrQuery: string
): Promise<{ id: number; name: string; phone_number: string } | null> {
  try {
    const cleanUrl = config.baseUrl.replace(/\/+$/, '');
    const cleanQuery = phoneOrQuery.replace(/\s+/g, '');
    const url = `${cleanUrl}/api/v1/accounts/${config.accountId}/contacts/search?q=${encodeURIComponent(cleanQuery)}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        api_access_token: config.apiAccessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const payload = Array.isArray(data.payload) ? data.payload : Array.isArray(data) ? data : [];

    if (payload.length > 0) {
      const match = payload[0];
      return {
        id: match.id,
        name: match.name || '',
        phone_number: match.phone_number || '',
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Create or resolve contact in Chatwoot
 */
export async function createOrGetContact(
  config: ChatwootApiConfig,
  contact: {
    inboxId: number;
    name: string;
    phoneNumber: string;
    customAttributes?: Record<string, string>;
  }
): Promise<{ success: boolean; contactId?: number; error?: string }> {
  const norm = normalizePhoneNumber(contact.phoneNumber);
  const targetPhone = norm.isValid ? norm.e164 : contact.phoneNumber;

  // First, attempt to search if contact already exists
  const existing = await searchChatwootContact(config, targetPhone);
  if (existing && existing.id) {
    return { success: true, contactId: existing.id };
  }

  // Attempt creation
  try {
    const cleanUrl = config.baseUrl.replace(/\/+$/, '');
    const url = `${cleanUrl}/api/v1/accounts/${config.accountId}/contacts`;

    const body: Record<string, unknown> = {
      inbox_id: contact.inboxId,
      name: contact.name || 'Contato',
      phone_number: targetPhone,
    };

    if (contact.customAttributes && Object.keys(contact.customAttributes).length > 0) {
      body.custom_attributes = contact.customAttributes;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        api_access_token: config.apiAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      const contactId = data?.payload?.contact?.id || data?.id;
      if (contactId) {
        return { success: true, contactId };
      }
    }

    // If 422 because phone already taken, re-search by digits
    if (res.status === 422) {
      const secondSearch = await searchChatwootContact(config, targetPhone.replace(/\D/g, ''));
      if (secondSearch && secondSearch.id) {
        return { success: true, contactId: secondSearch.id };
      }
    }

    const errorMsg = data?.message || data?.error || `HTTP ${res.status}`;
    return {
      success: false,
      error: sanitizeError(errorMsg, config.apiAccessToken),
    };
  } catch (err) {
    return {
      success: false,
      error: sanitizeError(err, config.apiAccessToken),
    };
  }
}

/**
 * Resolve a mediaUrl (data URI, local upload file, or remote HTTP URL)
 * into a Blob suitable for Chatwoot attachments[] multipart upload.
 */
export async function resolveMediaBlob(mediaUrl: string): Promise<{ blob: Blob; filename: string; contentType: string } | null> {
  try {
    if (!mediaUrl) return null;

    // 1. Data URL (e.g. data:image/png;base64,...)
    if (mediaUrl.startsWith('data:')) {
      const match = mediaUrl.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
      if (match) {
        const contentType = match[1] || 'image/jpeg';
        const base64Data = match[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
        const blob = new Blob([buffer], { type: contentType });
        return {
          blob,
          filename: `foto_${Date.now()}.${ext}`,
          contentType,
        };
      }
    }

    // 2. Local uploads (e.g. /uploads/123.jpg or uploads/123.jpg)
    if (mediaUrl.startsWith('/uploads/') || mediaUrl.startsWith('uploads/')) {
      const cleanRelative = mediaUrl.replace(/^\/?uploads\//, '');
      const localFilePath = path.join(process.cwd(), 'data', 'uploads', cleanRelative);
      if (fs.existsSync(localFilePath)) {
        const buffer = fs.readFileSync(localFilePath);
        const ext = path.extname(localFilePath).toLowerCase().replace('.', '') || 'jpg';
        const mimeMap: Record<string, string> = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
          gif: 'image/gif',
        };
        const contentType = mimeMap[ext] || 'image/jpeg';
        const blob = new Blob([buffer], { type: contentType });
        return {
          blob,
          filename: path.basename(localFilePath),
          contentType,
        };
      }
    }

    // 3. Remote HTTP/HTTPS URL
    if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
      const res = await fetch(mediaUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const contentType = res.headers.get('content-type') || 'image/jpeg';
        const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
        const blob = new Blob([arrayBuf], { type: contentType });
        return {
          blob,
          filename: `foto_${Date.now()}.${ext}`,
          contentType,
        };
      }
    }

    return null;
  } catch (err) {
    console.error('Failed to resolve media blob:', err);
    return null;
  }
}

/**
 * Dispatch message to a contact in a specific inbox via Chatwoot Conversation
 * Supports sending photo with caption (legendada) via attachments[]
 */
export async function sendChatwootMessage(
  config: ChatwootApiConfig,
  params: {
    inboxId: number;
    contactId: number;
    content: string;
    mediaUrl?: string;
  }
): Promise<{ success: boolean; conversationId?: number; error?: string }> {
  try {
    const cleanUrl = config.baseUrl.replace(/\/+$/, '');

    // Step A: Find existing open conversation for this contact and inbox, or create a conversation
    let conversationId: number | undefined = undefined;

    // Check existing contact conversations
    try {
      const listConvUrl = `${cleanUrl}/api/v1/accounts/${config.accountId}/contacts/${params.contactId}/conversations`;
      const listRes = await fetch(listConvUrl, {
        method: 'GET',
        headers: {
          api_access_token: config.apiAccessToken,
          'Content-Type': 'application/json',
        },
      });

      if (listRes.ok) {
        const listData = await listRes.json().catch(() => ({}));
        const conversations = Array.isArray(listData.payload) ? listData.payload : [];
        const existingConv = conversations.find(
          (c: { inbox_id: number; status: string }) => c.inbox_id === params.inboxId
        );
        if (existingConv && existingConv.id) {
          conversationId = existingConv.id;
        }
      }
    } catch {
      // Non-blocking, fallback to creation
    }

    // If no existing conversation found, create one
    if (!conversationId) {
      const convUrl = `${cleanUrl}/api/v1/accounts/${config.accountId}/conversations`;

      // If we DON'T have media, we can create the conversation directly with initial message:
      const initialPayload: Record<string, unknown> = {
        inbox_id: params.inboxId,
        contact_id: params.contactId,
        status: 'open',
      };

      if (!params.mediaUrl) {
        initialPayload.message = {
          content: params.content,
        };
      }

      const createRes = await fetch(convUrl, {
        method: 'POST',
        headers: {
          api_access_token: config.apiAccessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(initialPayload),
      });

      const createData = await createRes.json().catch(() => ({}));
      if (createRes.ok) {
        conversationId = createData?.id || createData?.payload?.id;
        // If message was already sent in initial creation (no media case), we're done!
        if (!params.mediaUrl && conversationId) {
          return {
            success: true,
            conversationId,
          };
        }
      } else {
        // If 422 or already exists, try looking up again
        const listConvUrl = `${cleanUrl}/api/v1/accounts/${config.accountId}/contacts/${params.contactId}/conversations`;
        const retryRes = await fetch(listConvUrl, {
          headers: { api_access_token: config.apiAccessToken },
        });
        if (retryRes.ok) {
          const listData = await retryRes.json().catch(() => ({}));
          const conversations = Array.isArray(listData.payload) ? listData.payload : [];
          const existingConv = conversations.find(
            (c: { inbox_id: number; status: string }) => c.inbox_id === params.inboxId
          );
          if (existingConv && existingConv.id) {
            conversationId = existingConv.id;
          }
        }

        if (!conversationId) {
          const errorMsg = createData?.message || createData?.error || `HTTP ${createRes.status}`;
          return {
            success: false,
            error: sanitizeError(errorMsg, config.apiAccessToken),
          };
        }
      }
    }

    // Now send the message into the conversation
    const msgUrl = `${cleanUrl}/api/v1/accounts/${config.accountId}/conversations/${conversationId}/messages`;

    // Case 1: Send Photo with Caption (Legenda)
    if (params.mediaUrl) {
      const mediaItem = await resolveMediaBlob(params.mediaUrl);
      if (mediaItem) {
        const formData = new FormData();
        // content acts as the caption
        formData.append('content', params.content);
        formData.append('message_type', 'outgoing');
        formData.append('private', 'false');
        formData.append('attachments[]', mediaItem.blob, mediaItem.filename);

        const uploadRes = await fetch(msgUrl, {
          method: 'POST',
          headers: {
            api_access_token: config.apiAccessToken,
            // Note: Content-Type is intentionally omitted so fetch sets multipart boundary
          },
          body: formData,
        });

        const uploadData = await uploadRes.json().catch(() => ({}));
        if (uploadRes.ok) {
          return {
            success: true,
            conversationId,
          };
        }

        const errMsg = uploadData?.message || uploadData?.error || `HTTP ${uploadRes.status}`;
        return {
          success: false,
          error: `Erro ao enviar foto com legenda: ${sanitizeError(errMsg, config.apiAccessToken)}`,
        };
      }
    }

    // Case 2: Standard Text Message
    const textRes = await fetch(msgUrl, {
      method: 'POST',
      headers: {
        api_access_token: config.apiAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: params.content,
        message_type: 'outgoing',
        private: false,
      }),
    });

    const textData = await textRes.json().catch(() => ({}));
    if (textRes.ok) {
      return {
        success: true,
        conversationId,
      };
    }

    const errDetail = textData?.message || textData?.error || `HTTP ${textRes.status}`;
    return {
      success: false,
      error: sanitizeError(errDetail, config.apiAccessToken),
    };
  } catch (err) {
    return {
      success: false,
      error: sanitizeError(err, config.apiAccessToken),
    };
  }
}

export interface ChatwootKanbanFilter {
  funnelId?: string | number;
  stageId?: string;
  agentId?: string | number;
  page?: number;
  priorities?: string[];
  fetchAllPages?: boolean;
}

export interface ChatwootKanbanMetadata {
  funnels: Array<{ id: string | number; name: string; stages?: Array<{ id: string; name: string }> }>;
  stages: Array<{ id: string; name: string; funnelId?: string | number }>;
  agents: Array<{ id: number; name: string; email?: string }>;
  priorities: string[];
}

/**
 * Query Kanban items from Chatwoot using account credentials
 */
export async function getChatwootKanbanItems(
  config: ChatwootApiConfig,
  filters: ChatwootKanbanFilter = {}
): Promise<{
  success: boolean;
  items: Array<{
    id: string;
    name: string;
    phoneNumber: string;
    formattedPhone: string;
    isValidPhone: boolean;
    stageId?: string;
    stageName?: string;
    funnelId?: string | number;
    funnelName?: string;
    priority?: string;
    customAttributes: Record<string, string>;
    rawItem?: any;
  }>;
  totalFound: number;
  totalPages?: number;
  currentPage: number;
  error?: string;
}> {
  try {
    const cleanUrl = config.baseUrl.replace(/\/+$/, '');
    const accountId = config.accountId;
    const token = config.apiAccessToken;

    const allExtractedItems: Array<{
      id: string;
      name: string;
      phoneNumber: string;
      formattedPhone: string;
      isValidPhone: boolean;
      stageId?: string;
      stageName?: string;
      funnelId?: string | number;
      funnelName?: string;
      priority?: string;
      customAttributes: Record<string, string>;
      rawItem?: any;
    }> = [];

    const fetchAll = filters.fetchAllPages ?? true;
    let currentPage = filters.page || 1;
    const maxPages = fetchAll ? 20 : 1;
    let hasMore = true;

    while (hasMore && currentPage <= maxPages) {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));

      if (filters.funnelId != null && String(filters.funnelId).trim() !== '') {
        params.set('funnel_id', String(filters.funnelId));
      }

      if (filters.stageId != null && String(filters.stageId).trim() !== '') {
        params.set('stage_id', String(filters.stageId));
      }

      if (filters.agentId != null && String(filters.agentId).trim() !== '') {
        params.set('agent_id', String(filters.agentId));
      }

      if (Array.isArray(filters.priorities) && filters.priorities.length > 0) {
        filters.priorities.forEach((priority) => {
          if (priority) params.append('priorities[]', priority);
        });
      }

      const url = `${cleanUrl}/api/v1/accounts/${accountId}/kanban_items?${params.toString()}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          api_access_token: token,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        if (currentPage === 1) {
          return {
            success: false,
            items: [],
            totalFound: 0,
            currentPage,
            error: `Erro HTTP ${res.status} ao consultar Kanban: ${sanitizeError(errText, token) || res.statusText}`,
          };
        }
        break;
      }

      const data = await res.json();

      let rawList: any[] = [];
      if (Array.isArray(data)) {
        rawList = data;
      } else if (Array.isArray(data.items)) {
        rawList = data.items;
      } else if (Array.isArray(data.payload)) {
        rawList = data.payload;
      } else if (Array.isArray(data.kanban_items)) {
        rawList = data.kanban_items;
      } else if (data.data && Array.isArray(data.data)) {
        rawList = data.data;
      }

      if (rawList.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of rawList) {
        const contactObj = item.contact || item.conversation?.contact;
        const candidateName =
          contactObj?.name ||
          item.name ||
          item.title ||
          item.customer_name ||
          item.client_name ||
          'Contato Kanban';

        const candidatePhone =
          contactObj?.phone_number ||
          contactObj?.phone ||
          item.phone_number ||
          item.phoneNumber ||
          item.phone ||
          item.telephone ||
          '';

        const norm = normalizePhoneNumber(candidatePhone);

        const customAttrs: Record<string, string> = {
          kanban_item_id: String(item.id || ''),
          kanban_funnel_id: String(item.funnel_id || filters.funnelId || ''),
          kanban_stage_id: String(item.stage_id || filters.stageId || ''),
          kanban_priority: String(item.priority || ''),
          ...(item.custom_attributes || {}),
          ...(contactObj?.custom_attributes || {}),
        };

        allExtractedItems.push({
          id: String(item.id || `k_${Math.random().toString(36).substring(2, 8)}`),
          name: String(candidateName).trim(),
          phoneNumber: norm.isValid ? norm.e164 : String(candidatePhone).trim(),
          formattedPhone: norm.formatted || candidatePhone,
          isValidPhone: norm.isValid,
          stageId: String(item.stage_id || filters.stageId || ''),
          stageName: item.stage_name || item.stage?.name || undefined,
          funnelId: item.funnel_id || filters.funnelId || undefined,
          funnelName: item.funnel_name || item.funnel?.name || undefined,
          priority: item.priority || undefined,
          customAttributes: customAttrs,
          rawItem: item,
        });
      }

      if (rawList.length < 10 || !fetchAll) {
        hasMore = false;
      } else {
        currentPage++;
      }
    }

    return {
      success: true,
      items: allExtractedItems,
      totalFound: allExtractedItems.length,
      currentPage,
    };
  } catch (err: unknown) {
    return {
      success: false,
      items: [],
      totalFound: 0,
      currentPage: 1,
      error: sanitizeError(err, config.apiAccessToken),
    };
  }
}

/**
 * Retrieve Kanban funnels, stages and account agents metadata
 */
export async function getChatwootKanbanMetadata(
  config: ChatwootApiConfig
): Promise<{
  success: boolean;
  metadata: ChatwootKanbanMetadata;
  error?: string;
}> {
  const cleanUrl = config.baseUrl.replace(/\/+$/, '');
  const headers = {
    api_access_token: config.apiAccessToken,
    'Content-Type': 'application/json',
  };

  const metadata: ChatwootKanbanMetadata = {
    funnels: [],
    stages: [],
    agents: [],
    priorities: ['baixa', 'media', 'alta', 'urgente', 'low', 'medium', 'high', 'urgent'],
  };

  try {
    // 1. Fetch Agents (standard Chatwoot endpoint)
    try {
      const agentsRes = await fetch(`${cleanUrl}/api/v1/accounts/${config.accountId}/agents`, {
        method: 'GET',
        headers,
      });
      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        const list = Array.isArray(agentsData)
          ? agentsData
          : Array.isArray(agentsData.payload)
          ? agentsData.payload
          : [];
        metadata.agents = list.map((a: any) => ({
          id: a.id,
          name: a.name || a.available_name || a.email || `Agente #${a.id}`,
          email: a.email,
        }));
      }
    } catch (agentErr) {
      console.warn('Could not fetch agents:', agentErr);
    }

    // 2. Fetch Funnels / Stages if endpoint exists
    let funnelsFound = false;
    for (const endpoint of [
      `/api/v1/accounts/${config.accountId}/funnels`,
      `/api/v1/accounts/${config.accountId}/kanban/funnels`,
      `/api/v1/accounts/${config.accountId}/pipelines`,
    ]) {
      try {
        const res = await fetch(`${cleanUrl}${endpoint}`, { method: 'GET', headers });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data)
            ? data
            : Array.isArray(data.payload)
            ? data.payload
            : Array.isArray(data.funnels)
            ? data.funnels
            : [];
          if (list.length > 0) {
            metadata.funnels = list.map((f: any) => ({
              id: f.id,
              name: f.name || `Funil #${f.id}`,
              stages: Array.isArray(f.stages)
                ? f.stages.map((s: any) => ({ id: String(s.id), name: s.name || `Etapa #${s.id}` }))
                : undefined,
            }));

            for (const f of metadata.funnels) {
              if (f.stages) {
                for (const s of f.stages) {
                  metadata.stages.push({ ...s, funnelId: f.id });
                }
              }
            }
            funnelsFound = true;
            break;
          }
        }
      } catch {
        // Fallback
      }
    }

    // 3. Fallback: inspect sample kanban_items to discover active funnels/stages
    if (!funnelsFound) {
      try {
        const itemsRes = await fetch(
          `${cleanUrl}/api/v1/accounts/${config.accountId}/kanban_items?page=1`,
          { method: 'GET', headers }
        );
        if (itemsRes.ok) {
          const data = await itemsRes.json();
          const list: any[] = Array.isArray(data)
            ? data
            : Array.isArray(data.items)
            ? data.items
            : Array.isArray(data.payload)
            ? data.payload
            : Array.isArray(data.kanban_items)
            ? data.kanban_items
            : [];

          const funnelMap = new Map<string, { id: string | number; name: string }>();
          const stageMap = new Map<string, { id: string; name: string; funnelId?: string | number }>();

          for (const item of list) {
            if (item.funnel_id) {
              const fid = String(item.funnel_id);
              if (!funnelMap.has(fid)) {
                funnelMap.set(fid, {
                  id: item.funnel_id,
                  name: item.funnel_name || `Funil #${item.funnel_id}`,
                });
              }
            }
            if (item.stage_id) {
              const sid = String(item.stage_id);
              if (!stageMap.has(sid)) {
                stageMap.set(sid, {
                  id: sid,
                  name: item.stage_name || `Etapa #${item.stage_id}`,
                  funnelId: item.funnel_id,
                });
              }
            }
          }

          metadata.funnels = Array.from(funnelMap.values());
          metadata.stages = Array.from(stageMap.values());
        }
      } catch {
        // Non-blocking
      }
    }

    return {
      success: true,
      metadata,
    };
  } catch (err) {
    return {
      success: false,
      metadata,
      error: sanitizeError(err, config.apiAccessToken),
    };
  }
}
