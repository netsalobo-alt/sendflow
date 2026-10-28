import type {
  Campaign,
  CampaignContactLog,
  ChatwootConnection,
  ChatwootInbox,
  ContactList,
  DashboardMetrics,
  MessageTemplate,
  OpenAISettings,
  User,
} from '../types/index.ts';

const TOKEN_KEY = 'chatwoot_campaign_token';
const USER_KEY = 'chatwoot_campaign_user';

export const authStorage = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  getUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  setUser(user: User) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    authStorage.clear();
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let errorMsg = `Erro HTTP ${res.status}`;
    if (isJson) {
      const errorData = await res.json().catch(() => ({}));
      errorMsg = errorData.error || errorData.message || errorMsg;
    } else {
      const text = await res.text().catch(() => '');
      if (text && text.length < 200 && !text.includes('<!doctype')) {
        errorMsg = text;
      }
    }
    throw new Error(errorMsg);
  }

  if (!isJson) {
    throw new Error(`Resposta inesperada do servidor (${res.status})`);
  }

  return res.json();
}

export const api = {
  // Auth
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const data = await request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    authStorage.setToken(data.token);
    authStorage.setUser(data.user);
    return data;
  },
  async getMe(): Promise<{ user: User }> {
    return request<{ user: User }>('/api/auth/me');
  },
  async updateProfile(params: {
    currentPassword: string;
    newUsername?: string;
    newPassword?: string;
  }): Promise<{ success: boolean; user: User }> {
    const data = await request<{ success: boolean; user: User }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(params),
    });
    if (data.user) {
      authStorage.setUser(data.user);
    }
    return data;
  },
  logout() {
    authStorage.clear();
  },

  // Dashboard
  async getDashboard(): Promise<DashboardMetrics> {
    return request<DashboardMetrics>('/api/dashboard');
  },

  // Chatwoot Connections
  async getConnections(): Promise<ChatwootConnection[]> {
    return request<ChatwootConnection[]>('/api/connections');
  },
  async createConnection(conn: {
    name: string;
    baseUrl: string;
    accountId: number;
    apiAccessToken: string;
    active: boolean;
  }): Promise<ChatwootConnection> {
    return request<ChatwootConnection>('/api/connections', {
      method: 'POST',
      body: JSON.stringify(conn),
    });
  },
  async updateConnection(id: string, updates: Partial<ChatwootConnection>): Promise<ChatwootConnection> {
    return request<ChatwootConnection>(`/api/connections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },
  async deleteConnection(id: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/api/connections/${id}`, {
      method: 'DELETE',
    });
  },
  async testConnection(params: {
    connectionId?: string;
    baseUrl?: string;
    accountId?: number;
    apiAccessToken?: string;
  }): Promise<{ success: boolean; inboxes: ChatwootInbox[]; error?: string }> {
    return request('/api/connections/test', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
  async getConnectionInboxes(connectionId: string): Promise<ChatwootInbox[]> {
    return request<ChatwootInbox[]>(`/api/connections/${connectionId}/inboxes`);
  },
  async getChatwootKanbanMetadata(connectionId: string): Promise<{
    success: boolean;
    metadata: {
      funnels: Array<{ id: string | number; name: string; stages?: Array<{ id: string; name: string }> }>;
      stages: Array<{ id: string; name: string; funnelId?: string | number }>;
      agents: Array<{ id: number; name: string; email?: string }>;
      priorities: string[];
    };
  }> {
    return request(`/api/connections/${connectionId}/kanban-metadata`);
  },
  async queryChatwootKanbanItems(
    connectionId: string,
    filters: {
      funnelId?: string | number;
      stageId?: string;
      agentId?: string | number;
      page?: number;
      priorities?: string[];
      fetchAllPages?: boolean;
    }
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
    currentPage: number;
    error?: string;
  }> {
    return request(`/api/connections/${connectionId}/kanban-items`, {
      method: 'POST',
      body: JSON.stringify(filters),
    });
  },

  // Templates
  async getTemplates(): Promise<MessageTemplate[]> {
    return request<MessageTemplate[]>('/api/templates');
  },
  async createTemplate(template: {
    title: string;
    category: string;
    content: string;
    mediaUrl?: string;
    mediaFilename?: string;
  }): Promise<MessageTemplate> {
    return request<MessageTemplate>('/api/templates', {
      method: 'POST',
      body: JSON.stringify(template),
    });
  },
  async updateTemplate(id: string, updates: Partial<MessageTemplate>): Promise<MessageTemplate> {
    return request<MessageTemplate>(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },
  async deleteTemplate(id: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/api/templates/${id}`, {
      method: 'DELETE',
    });
  },

  // Contact Lists
  async getContactLists(): Promise<ContactList[]> {
    return request<ContactList[]>('/api/contact-lists');
  },
  async getContactList(id: string): Promise<ContactList & { contacts: any[] }> {
    return request<ContactList & { contacts: any[] }>(`/api/contact-lists/${id}`);
  },
  async createContactList(params: {
    name: string;
    description?: string;
    contacts: Array<{ name: string; phoneNumber: string; customAttributes?: Record<string, string> }>;
  }): Promise<ContactList> {
    return request<ContactList>('/api/contact-lists', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
  async deleteContactList(id: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/api/contact-lists/${id}`, {
      method: 'DELETE',
    });
  },

  // Campaigns
  async getCampaigns(): Promise<Campaign[]> {
    return request<Campaign[]>('/api/campaigns');
  },
  async getCampaign(id: string): Promise<Campaign & { contacts: any[]; logs: CampaignContactLog[]; isRunning: boolean }> {
    return request<Campaign & { contacts: any[]; logs: CampaignContactLog[]; isRunning: boolean }>(
      `/api/campaigns/${id}`
    );
  },
  async createCampaign(campaignData: any): Promise<Campaign> {
    return request<Campaign>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(campaignData),
    });
  },
  async startCampaign(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/campaigns/${id}/start`, {
      method: 'POST',
    });
  },
  async pauseCampaign(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/campaigns/${id}/pause`, {
      method: 'POST',
    });
  },
  async skipBatchPause(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/campaigns/${id}/skip-pause`, {
      method: 'POST',
    });
  },
  async skipDailyPause(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/campaigns/${id}/skip-daily-pause`, {
      method: 'POST',
    });
  },
  async updateCampaignSettings(id: string, settings: Partial<Campaign>): Promise<Campaign> {
    return request<Campaign>(`/api/campaigns/${id}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  },
  async cancelCampaign(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/campaigns/${id}/cancel`, {
      method: 'POST',
    });
  },
  async deleteCampaign(id: string): Promise<{ success: boolean; message?: string }> {
    return request<{ success: boolean; message?: string }>(`/api/campaigns/${id}`, {
      method: 'DELETE',
    });
  },
  async uploadMedia(file: File): Promise<{ url: string; filename: string; mimeType: string; size: number }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const res = await request<{ url: string; filename: string; mimeType: string; size: number }>(
            '/api/upload-media',
            {
              method: 'POST',
              body: JSON.stringify({
                dataUrl,
                filename: file.name,
                mimeType: file.type || 'image/jpeg',
              }),
            }
          );
          resolve(res);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Falha ao processar arquivo de imagem.'));
      reader.readAsDataURL(file);
    });
  },
  async testSendMessage(params: {
    connectionId: string;
    inboxId: number;
    phoneNumber: string;
    message: string;
    contactName?: string;
    mediaUrl?: string;
  }): Promise<{ success: boolean; message: string; conversationId?: number }> {
    return request('/api/campaigns/test-send', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  // AI Variations
  async generateVariations(params: {
    baseMessage: string;
    count: number;
    tone?: string;
    customInstructions?: string;
  }): Promise<{ success: boolean; variations: string[]; providerUsed: string }> {
    return request('/api/ai/variations', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
  async getOpenAISettings(): Promise<OpenAISettings> {
    return request<OpenAISettings>('/api/settings/openai');
  },
  async updateOpenAISettings(settings: Partial<OpenAISettings>): Promise<OpenAISettings> {
    return request<OpenAISettings>('/api/settings/openai', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },
  async testOpenAI(apiKey?: string, model?: string): Promise<{ success: boolean; message: string }> {
    return request('/api/settings/openai/test', {
      method: 'POST',
      body: JSON.stringify({ apiKey, model }),
    });
  },

  // Cloud Sync & Backup
  async getSyncStatus(): Promise<{
    cloudDatabase: string;
    projectId: string;
    status: string;
    campaignsCount: number;
    contactListsCount: number;
    connectionsCount: number;
  }> {
    return request('/api/sync/status');
  },
  async backupNow(): Promise<{ success: boolean; message: string }> {
    return request('/api/sync/backup-now', { method: 'POST' });
  },
  async exportBackupJson(): Promise<Record<string, unknown>> {
    return request('/api/sync/export-json');
  },
  async restoreBackupJson(data: unknown): Promise<{ success: boolean; message: string }> {
    return request('/api/sync/restore-json', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
