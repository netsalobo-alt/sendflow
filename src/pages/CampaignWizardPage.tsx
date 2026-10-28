import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import {
  Send,
  Radio,
  FileSpreadsheet,
  MessageSquare,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  PhoneCall,
  Check,
  ChevronRight,
  ChevronLeft,
  Info,
  Clock,
  Layers,
  Edit2,
  Search,
  UserPlus,
  CheckSquare,
  Square,
  X,
  Filter,
  Image as ImageIcon,
  UploadCloud,
  Link as LinkIcon,
  Paperclip,
  Shield,
  Repeat,
  Shuffle,
  Timer,
  PauseCircle,
  Calendar,
  Sun,
  LayoutGrid,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { normalizePhoneNumber, interpolateVariables } from '../utils/phoneNormalizer.ts';
import type {
  ChatwootConnection,
  ChatwootInbox,
  ContactList,
  MessageTemplate,
  Campaign,
} from '../types/index.ts';

export interface WizardContactItem {
  id: string;
  name: string;
  phoneNumber: string;
  customAttributes?: Record<string, string>;
  selected: boolean;
  isEdited?: boolean;
}

interface CampaignWizardPageProps {
  initialCloneData?: Partial<Campaign> | null;
  onCampaignCreated: (campaignId: string) => void;
  onCancel: () => void;
}

export const CampaignWizardPage: React.FC<CampaignWizardPageProps> = ({
  initialCloneData,
  onCampaignCreated,
  onCancel,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1: Info
  const [name, setName] = useState(initialCloneData ? `${initialCloneData.name} (Cópia)` : '');
  const [description, setDescription] = useState(initialCloneData?.description || '');

  // Step 2: Connection
  const [connections, setConnections] = useState<ChatwootConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(
    initialCloneData?.connectionId || ''
  );
  const [loadingConnections, setLoadingConnections] = useState(true);

  // Step 3: Inbox (supports multiple outbox channels for rotation)
  const [inboxes, setInboxes] = useState<ChatwootInbox[]>([]);
  const [selectedInboxIds, setSelectedInboxIds] = useState<number[]>(
    initialCloneData?.inboxes && initialCloneData.inboxes.length > 0
      ? initialCloneData.inboxes.map((i) => i.inboxId)
      : initialCloneData?.inboxId
      ? [initialCloneData.inboxId]
      : []
  );
  const [inboxRotation, setInboxRotation] = useState<'round-robin' | 'random'>(
    initialCloneData?.inboxRotation || 'round-robin'
  );
  const [loadingInboxes, setLoadingInboxes] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);

  // Fallback for single operations like test send
  const selectedInboxId = selectedInboxIds[0] || null;

  // Step 4: Contacts
  const [contactMode, setContactMode] = useState<'upload' | 'list' | 'kanban'>('upload');
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [contacts, setContacts] = useState<WizardContactItem[]>([]);
  const [rawCsvRows, setRawCsvRows] = useState<Record<string, string>[]>([]);
  const [csvStats, setCsvStats] = useState<{
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
  }>({ total: 0, valid: 0, invalid: 0, duplicates: 0 });

  // Chatwoot Kanban Import State
  const [kanbanLoadingMeta, setKanbanLoadingMeta] = useState(false);
  const [kanbanFetching, setKanbanFetching] = useState(false);
  const [kanbanError, setKanbanError] = useState<string | null>(null);
  const [kanbanFunnels, setKanbanFunnels] = useState<
    Array<{ id: string | number; name: string; stages?: Array<{ id: string; name: string }> }>
  >([]);
  const [kanbanStages, setKanbanStages] = useState<
    Array<{ id: string; name: string; funnelId?: string | number }>
  >([]);
  const [kanbanAgents, setKanbanAgents] = useState<
    Array<{ id: number; name: string; email?: string }>
  >([]);
  const [kanbanFunnelId, setKanbanFunnelId] = useState<string>('');
  const [kanbanStageId, setKanbanStageId] = useState<string>('');
  const [kanbanAgentId, setKanbanAgentId] = useState<string>('');
  const [kanbanPriorities, setKanbanPriorities] = useState<string[]>([]);
  const [kanbanFetchAll, setKanbanFetchAll] = useState<boolean>(true);
  const [kanbanPage, setKanbanPage] = useState<number>(1);
  const [kanbanImportStats, setKanbanImportStats] = useState<{
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
  } | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [nameColumn, setNameColumn] = useState<string>('name');
  const [phoneColumn, setPhoneColumn] = useState<string>('phone_number');
  const [saveAsNewList, setSaveAsNewList] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Contacts management in Step 4
  const [contactSearch, setContactSearch] = useState('');
  const [contactFilter, setContactFilter] = useState<'all' | 'selected' | 'unselected'>('all');
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Manual Contact Add Modal
  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Step 5: Base Message, Templates & Photo with Caption (Legenda)
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [baseMessage, setBaseMessage] = useState(initialCloneData?.baseMessage || '');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [hasPhoto, setHasPhoto] = useState<boolean>(Boolean(initialCloneData?.mediaUrl));
  const [mediaUrl, setMediaUrl] = useState<string>(initialCloneData?.mediaUrl || '');
  const [mediaFilename, setMediaFilename] = useState<string>(initialCloneData?.mediaFilename || '');
  const [uploadingMedia, setUploadingMedia] = useState<boolean>(false);
  const [mediaInputMode, setMediaInputMode] = useState<'upload' | 'url'>('upload');
  const [customMediaUrl, setCustomMediaUrl] = useState<string>('');
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);

  // Step 6: Variations & AI
  const [variations, setVariations] = useState<string[]>(
    initialCloneData?.variations && initialCloneData.variations.length > 0
      ? initialCloneData.variations
      : []
  );
  const [newVariationText, setNewVariationText] = useState('');
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiCount, setAiCount] = useState(3);
  const [aiTone, setAiTone] = useState<string>('mais comercial');
  const [aiCustomPrompt, setAiCustomPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiGeneratedSuggestions, setAiGeneratedSuggestions] = useState<string[]>([]);
  const [approvedSuggestions, setApprovedSuggestions] = useState<Record<number, boolean>>({});

  // Step 7: Delivery Settings & Anti-Ban Batch Pause
  const [minDelay, setMinDelay] = useState(initialCloneData?.minDelaySeconds || 15);
  const [maxDelay, setMaxDelay] = useState(initialCloneData?.maxDelaySeconds || 35);
  const [batchSize, setBatchSize] = useState(initialCloneData?.batchSize || 30);
  const [batchPauseMinutes, setBatchPauseMinutes] = useState(
    initialCloneData?.batchPauseMinutes ?? 10
  );
  const [enableBatchPause, setEnableBatchPause] = useState(
    initialCloneData?.batchPauseMinutes !== undefined ? initialCloneData.batchPauseMinutes > 0 : true
  );

  // Daily Limit & Business Hours (Requested by user)
  const [enableDailyLimit, setEnableDailyLimit] = useState(
    initialCloneData?.dailyLimit !== undefined ? initialCloneData.dailyLimit > 0 : false
  );
  const [dailyLimit, setDailyLimit] = useState(initialCloneData?.dailyLimit || 100);
  const [businessHoursStart, setBusinessHoursStart] = useState(
    initialCloneData?.businessHoursStart || '09:00'
  );
  const [businessHoursEnd, setBusinessHoursEnd] = useState(
    initialCloneData?.businessHoursEnd || '18:00'
  );
  const [businessDaysOnly, setBusinessDaysOnly] = useState(
    initialCloneData?.businessDaysOnly ?? false
  );

  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Step 8: Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load initial dependencies
  useEffect(() => {
    async function loadInitial() {
      try {
        const [connsData, listsData, templatesData] = await Promise.all([
          api.getConnections(),
          api.getContactLists(),
          api.getTemplates(),
        ]);
        setConnections(connsData);
        setContactLists(listsData);
        setTemplates(templatesData);

        if (!selectedConnectionId && connsData.length > 0) {
          const activeOne = connsData.find((c) => c.active) || connsData[0];
          setSelectedConnectionId(activeOne.id);
        }
      } catch (err) {
        console.error('Failed to load initial wizard data:', err);
      } finally {
        setLoadingConnections(false);
      }
    }
    loadInitial();
  }, []);

  // When connection changes, fetch its inboxes
  useEffect(() => {
    if (!selectedConnectionId) {
      setInboxes([]);
      return;
    }

    async function loadInboxes() {
      setLoadingInboxes(true);
      setInboxError(null);
      try {
        const inboxesData = await api.getConnectionInboxes(selectedConnectionId);
        setInboxes(inboxesData);
        if (inboxesData.length > 0 && selectedInboxIds.length === 0) {
          setSelectedInboxIds([inboxesData[0].id]);
        }
      } catch (err: unknown) {
        setInboxError(err instanceof Error ? err.message : 'Falha ao buscar inboxes.');
        setInboxes([]);
      } finally {
        setLoadingInboxes(false);
      }
    }
    loadInboxes();
  }, [selectedConnectionId]);

  // Handle CSV file selection
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        setRawHeaders(headers);
        const rows = results.data as Record<string, string>[];
        setRawCsvRows(rows);

        // Auto-guess columns
        const guessName =
          headers.find((h) => /^(name|nome|contato|cliente)$/i.test(h)) || headers[0] || 'name';
        const guessPhone =
          headers.find((h) => /^(phone|phone_number|telefone|celular|whatsapp|numero)$/i.test(h)) ||
          headers[1] ||
          'phone_number';

        setNameColumn(guessName);
        setPhoneColumn(guessPhone);

        processParsedRows(rows, guessName, guessPhone);
      },
      error: (err) => {
        alert(`Erro ao ler CSV: ${err.message}`);
      },
    });
  };

  const processParsedRows = (
    rows: Record<string, string>[],
    nameKey: string,
    phoneKey: string
  ) => {
    const seenPhones = new Set<string>();
    const validList: WizardContactItem[] = [];
    let duplicates = 0;
    let invalid = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawPhone = row[phoneKey] || '';
      const rawName = row[nameKey] || 'Contato';

      const norm = normalizePhoneNumber(rawPhone);
      if (!norm.isValid) {
        invalid++;
        continue;
      }

      if (seenPhones.has(norm.e164)) {
        duplicates++;
        continue;
      }
      seenPhones.add(norm.e164);

      // Collect custom attributes
      const customAttrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        if (k !== nameKey && k !== phoneKey && v !== undefined && v !== null && v !== '') {
          customAttrs[k] = String(v);
        }
      }

      validList.push({
        id: `wiz_ct_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        name: rawName.trim(),
        phoneNumber: norm.e164,
        customAttributes: customAttrs,
        selected: true,
      });
    }

    setContacts(validList);
    setCsvStats({
      total: rows.length,
      valid: validList.length,
      invalid,
      duplicates,
    });
  };

  // Re-process when column mapping changes
  const handleColumnMapChange = (newNameKey: string, newPhoneKey: string) => {
    setNameColumn(newNameKey);
    setPhoneColumn(newPhoneKey);
    if (rawCsvRows.length > 0) {
      processParsedRows(rawCsvRows, newNameKey, newPhoneKey);
    }
  };

  // Handle contact list select
  const handleSelectSavedList = async (listId: string) => {
    setSelectedListId(listId);
    if (!listId) return;
    try {
      const fullList = await api.getContactList(listId);
      if (fullList && Array.isArray(fullList.contacts)) {
        setContacts(
          fullList.contacts.map((c, idx) => ({
            id: c.id || `wiz_list_${Date.now()}_${idx}`,
            name: c.name,
            phoneNumber: c.phoneNumber,
            customAttributes: c.customAttributes,
            selected: true,
          }))
        );
        setCsvStats({
          total: fullList.contacts.length,
          valid: fullList.contacts.length,
          invalid: 0,
          duplicates: 0,
        });
      }
    } catch (err) {
      console.error('Error fetching list contacts:', err);
    }
  };

  // Load Kanban metadata (funnels, stages, agents)
  const loadKanbanMetadata = async (connId: string) => {
    if (!connId) return;
    setKanbanLoadingMeta(true);
    setKanbanError(null);
    try {
      const res = await api.getChatwootKanbanMetadata(connId);
      if (res && res.metadata) {
        setKanbanFunnels(res.metadata.funnels || []);
        setKanbanStages(res.metadata.stages || []);
        setKanbanAgents(res.metadata.agents || []);
        if (res.metadata.funnels.length > 0 && !kanbanFunnelId) {
          setKanbanFunnelId(String(res.metadata.funnels[0].id));
        }
      }
    } catch (err: unknown) {
      console.warn('Kanban metadata error:', err);
    } finally {
      setKanbanLoadingMeta(false);
    }
  };

  // Query Kanban items from Chatwoot API
  const handleQueryKanban = async () => {
    if (!selectedConnectionId) {
      setKanbanError('Por favor, selecione primeiro uma conexão Chatwoot na Etapa 2.');
      return;
    }

    setKanbanFetching(true);
    setKanbanError(null);

    try {
      const res = await api.queryChatwootKanbanItems(selectedConnectionId, {
        funnelId: kanbanFunnelId || undefined,
        stageId: kanbanStageId || undefined,
        agentId: kanbanAgentId || undefined,
        priorities: kanbanPriorities.length > 0 ? kanbanPriorities : undefined,
        page: kanbanPage,
        fetchAllPages: kanbanFetchAll,
      });

      if (!res.success) {
        setKanbanError(res.error || 'Falha ao consultar itens do Kanban.');
        return;
      }

      if (res.items.length === 0) {
        setKanbanError('Nenhum item encontrado no Kanban para os filtros informados.');
        return;
      }

      const seen = new Set<string>();
      const newItems: WizardContactItem[] = [];
      let valid = 0;
      let invalid = 0;
      let duplicates = 0;

      for (const item of res.items) {
        const norm = normalizePhoneNumber(item.phoneNumber);
        if (!norm.isValid) {
          invalid++;
          continue;
        }

        if (seen.has(norm.e164)) {
          duplicates++;
          continue;
        }
        seen.add(norm.e164);
        valid++;

        newItems.push({
          id: `kb_${item.id}_${Math.random().toString(36).substring(2, 6)}`,
          name: item.name || 'Contato Kanban',
          phoneNumber: norm.e164,
          customAttributes: {
            ...(item.customAttributes || {}),
            origem: 'Kanban Chatwoot',
            funil: item.funnelName || (kanbanFunnelId ? `Funil #${kanbanFunnelId}` : ''),
            etapa: item.stageName || (kanbanStageId ? `Etapa #${kanbanStageId}` : ''),
            prioridade: item.priority || '',
          },
          selected: true,
        });
      }

      setContacts(newItems);
      setKanbanImportStats({
        total: res.items.length,
        valid,
        invalid,
        duplicates,
      });
      setCsvStats({
        total: res.items.length,
        valid,
        invalid,
        duplicates,
      });

      if (valid === 0) {
        setKanbanError('Os itens do Kanban foram consultados, porém nenhum continha telefone válido com DDD.');
      }
    } catch (err: unknown) {
      setKanbanError(err instanceof Error ? err.message : 'Falha ao buscar contatos do Kanban.');
    } finally {
      setKanbanFetching(false);
    }
  };

  // Select / Deselect contacts
  const toggleSelectAll = (select: boolean) => {
    setContacts((prev) => prev.map((c) => ({ ...c, selected: select })));
  };

  const toggleSelectContact = (id: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  // Contact editing handlers
  const handleStartEdit = (contact: WizardContactItem) => {
    setEditingContactId(contact.id);
    setEditName(contact.name);
    setEditPhone(contact.phoneNumber);
    setEditError(null);
  };

  const handleSaveEdit = (id: string) => {
    if (!editPhone.trim()) {
      setEditError('Número de telefone obrigatório.');
      return;
    }
    const norm = normalizePhoneNumber(editPhone.trim());
    if (!norm.isValid) {
      setEditError(norm.reason || 'Número de telefone inválido.');
      return;
    }
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            name: editName.trim() || 'Contato',
            phoneNumber: norm.e164,
            isEdited: true,
          };
        }
        return c;
      })
    );
    setEditingContactId(null);
    setEditError(null);
  };

  const handleCancelEdit = () => {
    setEditingContactId(null);
    setEditError(null);
  };

  const handleDeleteContact = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const handleAddManualContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPhone.trim()) {
      setManualError('Número de telefone obrigatório.');
      return;
    }
    const norm = normalizePhoneNumber(manualPhone.trim());
    if (!norm.isValid) {
      setManualError(norm.reason || 'Número de telefone inválido.');
      return;
    }
    const newContact: WizardContactItem = {
      id: `wiz_manual_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: manualName.trim() || 'Contato',
      phoneNumber: norm.e164,
      customAttributes: {},
      selected: true,
    };
    setContacts((prev) => [newContact, ...prev]);
    setIsAddContactModalOpen(false);
    setManualName('');
    setManualPhone('');
    setManualError(null);
  };

  // Photo / Media handlers
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMediaUploadError('Por favor selecione um arquivo de imagem válido (JPG, PNG, WebP, GIF, etc.)');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setMediaUploadError('A imagem selecionada é muito grande. O limite máximo é 15MB.');
      return;
    }

    setUploadingMedia(true);
    setMediaUploadError(null);
    try {
      const res = await api.uploadMedia(file);
      setMediaUrl(res.url);
      setMediaFilename(file.name);
      setHasPhoto(true);
    } catch (err: unknown) {
      setMediaUploadError(err instanceof Error ? err.message : 'Falha ao fazer upload da imagem.');
    } finally {
      setUploadingMedia(false);
      e.target.value = '';
    }
  };

  const handleApplyCustomUrl = () => {
    if (!customMediaUrl.trim()) return;
    setMediaUrl(customMediaUrl.trim());
    setMediaFilename(customMediaUrl.split('/').pop() || 'foto_url.jpg');
    setHasPhoto(true);
    setCustomMediaUrl('');
  };

  const handleRemovePhoto = () => {
    setMediaUrl('');
    setMediaFilename('');
    setHasPhoto(false);
    setMediaUploadError(null);
  };

  // Add a manual variation
  const handleAddManualVariation = () => {
    if (!newVariationText.trim()) return;
    setVariations([...variations, newVariationText.trim()]);
    setNewVariationText('');
  };

  const handleRemoveVariation = (index: number) => {
    setVariations(variations.filter((_, i) => i !== index));
  };

  // Generate variations via OpenAI
  const handleTriggerAiVariations = async () => {
    if (!baseMessage.trim()) {
      alert('Por favor, escreva uma mensagem-base no Passo 5 primeiro!');
      return;
    }
    setAiLoading(true);
    try {
      const result = await api.generateVariations({
        baseMessage,
        count: aiCount,
        tone: aiTone,
        customInstructions: aiCustomPrompt,
      });

      if (result.success && result.variations.length > 0) {
        setAiGeneratedSuggestions(result.variations);
        const initApproved: Record<number, boolean> = {};
        result.variations.forEach((_, idx) => {
          initApproved[idx] = true;
        });
        setApprovedSuggestions(initApproved);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao gerar variações com IA');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddApprovedAiVariations = () => {
    const selected = aiGeneratedSuggestions.filter((_, idx) => approvedSuggestions[idx]);
    if (selected.length === 0) {
      alert('Selecione pelo menos uma variação aprovada.');
      return;
    }
    setVariations([...variations, ...selected]);
    setIsAiModalOpen(false);
    setAiGeneratedSuggestions([]);
  };

  // Handle test send to a single phone number
  const handleTestSend = async () => {
    if (!testPhoneNumber.trim()) {
      setTestResult({ success: false, message: 'Informe um número de telefone com DDD' });
      return;
    }
    if (!selectedConnectionId || !selectedInboxId) {
      setTestResult({ success: false, message: 'Selecione uma conta Chatwoot e um canal antes do teste' });
      return;
    }
    if (!baseMessage) {
      setTestResult({ success: false, message: 'Mensagem-base não definida' });
      return;
    }

    setTestSending(true);
    setTestResult(null);

    const sampleContact = contacts.find((c) => c.selected) || contacts[0];
    const sampleName = sampleContact ? sampleContact.name : 'Edgard';
    const sampleMsg = interpolateVariables(baseMessage, {
      name: sampleName,
      phone_number: testPhoneNumber,
      telefone: testPhoneNumber,
    });

    try {
      const res = await api.testSendMessage({
        connectionId: selectedConnectionId,
        inboxId: selectedInboxId,
        phoneNumber: testPhoneNumber.trim(),
        message: sampleMsg,
        contactName: sampleName,
        mediaUrl: hasPhoto && mediaUrl ? mediaUrl : undefined,
      });
      setTestResult({ success: res.success, message: res.message });
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Erro ao enviar mensagem de teste.',
      });
    } finally {
      setTestSending(false);
    }
  };

  // Save or Launch Campaign
  const handleFinalSubmit = async (startNow: boolean) => {
    const contactsToSend = contacts
      .filter((c) => c.selected)
      .map((c) => ({
        name: c.name,
        phoneNumber: c.phoneNumber,
        customAttributes: c.customAttributes,
      }));

    if (contactsToSend.length === 0) {
      setSubmitError('Nenhum contato selecionado para o envio. Selecione pelo menos um contato na Etapa 4.');
      return;
    }
    if (!selectedConnectionId || selectedInboxIds.length === 0) {
      setSubmitError('Conexão Chatwoot e pelo menos um canal de saída são obrigatórios.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const selectedConn = connections.find((c) => c.id === selectedConnectionId);
      const selectedInboxesData = inboxes
        .filter((i) => selectedInboxIds.includes(i.id))
        .map((i) => ({
          inboxId: i.id,
          inboxName: i.name,
          connectionId: selectedConnectionId,
          connectionName: selectedConn?.name || 'Chatwoot',
          channelType: i.channelType,
          phoneNumber: i.phoneNumber,
        }));

      const primaryInbox = selectedInboxesData[0] || inboxes[0];
      const primaryInboxName =
        selectedInboxesData.length > 1
          ? `Rotativo (${selectedInboxesData.length} canais: ${selectedInboxesData.map((i) => i.inboxName).join(', ')})`
          : primaryInbox?.inboxName || `Inbox #${primaryInbox?.inboxId}`;

      // If requested to save as reusable contact list
      let savedListId = selectedListId;
      if (saveAsNewList && newListName.trim() && contactsToSend.length > 0) {
        const createdList = await api.createContactList({
          name: newListName.trim(),
          description: `Importada para campanha ${name}`,
          contacts: contactsToSend,
        });
        savedListId = createdList.id;
      }

      const allVariations =
        variations.length > 0 ? variations : [baseMessage];

      const newCampaign = await api.createCampaign({
        name: name.trim() || `Campanha ${new Date().toLocaleDateString('pt-BR')}`,
        description,
        connectionId: selectedConnectionId,
        connectionName: selectedConn?.name || 'Chatwoot',
        inboxId: primaryInbox.inboxId,
        inboxName: primaryInboxName,
        inboxes: selectedInboxesData,
        inboxRotation: selectedInboxesData.length > 1 ? inboxRotation : undefined,
        status: startNow ? 'Em andamento' : 'Rascunho',
        minDelaySeconds: minDelay,
        maxDelaySeconds: maxDelay,
        batchSize,
        batchPauseMinutes: enableBatchPause ? batchPauseMinutes : 0,
        dailyLimit: enableDailyLimit ? Number(dailyLimit) || 0 : 0,
        businessHoursStart: businessHoursStart || '09:00',
        businessHoursEnd: businessHoursEnd || '18:00',
        businessDaysOnly: Boolean(businessDaysOnly),
        baseMessage,
        variations: allVariations,
        mediaUrl: hasPhoto && mediaUrl ? mediaUrl : undefined,
        mediaFilename: hasPhoto && mediaFilename ? mediaFilename : undefined,
        contactListId: savedListId,
        contacts: contactsToSend,
      });

      onCampaignCreated(newCampaign.id);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Falha ao salvar campanha.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCount = contacts.filter((c) => c.selected).length;
  const filteredContacts = contacts.filter((c) => {
    if (contactFilter === 'selected' && !c.selected) return false;
    if (contactFilter === 'unselected' && c.selected) return false;
    if (contactSearch.trim()) {
      const q = contactSearch.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q);
      const matchPhone = c.phoneNumber.includes(q);
      return matchName || matchPhone;
    }
    return true;
  });
  const isAllFilteredSelected =
    filteredContacts.length > 0 && filteredContacts.every((c) => c.selected);
  const isSomeFilteredSelected =
    filteredContacts.some((c) => c.selected) && !isAllFilteredSelected;

  const stepsList = [
    { num: 1, title: 'Identificação' },
    { num: 2, title: 'Chatwoot' },
    { num: 3, title: 'Canal de Saída' },
    { num: 4, title: 'Contatos' },
    { num: 5, title: 'Mensagem' },
    { num: 6, title: 'Variações IA' },
    { num: 7, title: 'Fila e Teste' },
    { num: 8, title: 'Revisão' },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Step Header */}
      <div className="border-b border-slate-200 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Assistente de Criação de Campanha
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Etapa {currentStep} de 8 — {stepsList[currentStep - 1].title}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            Cancelar
          </button>
        </div>

        {/* Clean Progress Tracker (Zero-Pill, Typographic) */}
        <div className="grid grid-cols-8 gap-2">
          {stepsList.map((step) => {
            const isCompleted = currentStep > step.num;
            const isCurrent = currentStep === step.num;
            return (
              <div
                key={step.num}
                onClick={() => {
                  if (step.num < currentStep) setCurrentStep(step.num);
                }}
                className={`flex flex-col gap-1.5 cursor-pointer ${
                  step.num < currentStep ? 'opacity-90' : isCurrent ? 'opacity-100' : 'opacity-40'
                }`}
              >
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    isCompleted
                      ? 'bg-emerald-600'
                      : isCurrent
                      ? 'bg-slate-900'
                      : 'bg-slate-200'
                  }`}
                />
                <span className="text-[11px] font-medium text-slate-600 truncate hidden md:inline">
                  {step.num}. {step.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP 1: Informações da Campanha */}
      {currentStep === 1 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-semibold text-slate-900">1. Informações Básicas</h2>
            <p className="text-xs text-slate-500 mt-1">
              Dê um nome claro para identificar esta campanha no histórico e nos relatórios.
            </p>
          </div>

          <div className="space-y-4 max-w-xl">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nome da Campanha *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Follow-up Clientes Outubro, Oferta Especial VIP"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Descrição ou Observações (opcional)
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Disparo promocional para contatos que demonstraram interesse no WhatsApp..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Conexão Chatwoot */}
      {currentStep === 2 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-semibold text-slate-900">2. Selecionar Conexão Chatwoot</h2>
            <p className="text-xs text-slate-500 mt-1">
              Escolha qual instalação ou conta do Chatwoot será usada para sincronizar contatos e conversas.
            </p>
          </div>

          {loadingConnections ? (
            <div className="p-8 text-center text-xs text-slate-500">Carregando conexões...</div>
          ) : connections.length === 0 ? (
            <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <p className="font-semibold mb-1">Nenhuma conexão Chatwoot cadastrada</p>
              <p>Por favor, vá para a aba Configurações e adicione sua conta com URL base e Access Token.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connections.map((conn) => {
                const isSelected = selectedConnectionId === conn.id;
                return (
                  <div
                    key={conn.id}
                    onClick={() => setSelectedConnectionId(conn.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-600'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-sm text-slate-900">{conn.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{conn.baseUrl}</p>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-300'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 text-[11px] text-slate-500">
                      <span>Account ID: {conn.accountId}</span>
                      <span>·</span>
                      <span className={conn.active ? 'text-emerald-700' : 'text-slate-400'}>
                        {conn.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Canais de Saída (Inboxes) com Alternância */}
      {currentStep === 3 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  3. Selecionar Canais de Saída (Inboxes)
                </h2>
                {selectedInboxIds.length > 1 && (
                  <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Repeat className="w-3 h-3 text-emerald-600" />
                    Alternância Ativa ({selectedInboxIds.length} Canais)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Selecione um ou múltiplos canais. O sistema alternará automaticamente os disparos entre os canais selecionados para evitar bloqueios.
              </p>
            </div>

            {inboxes.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedInboxIds(inboxes.map((i) => i.id))}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md transition-colors cursor-pointer"
                >
                  Marcar Todos
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInboxIds([])}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md transition-colors cursor-pointer"
                >
                  Desmarcar Todos
                </button>
              </div>
            )}
          </div>

          {loadingInboxes ? (
            <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
              <span>Consultando inboxes da conta Chatwoot...</span>
            </div>
          ) : inboxError ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Erro ao consultar inboxes</p>
                <p className="mt-0.5">{inboxError}</p>
              </div>
            </div>
          ) : inboxes.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Nenhum canal/inbox encontrado nessa conta Chatwoot.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Rotation Mode Setting (shown when 2+ inboxes selected) */}
              {selectedInboxIds.length > 1 && (
                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-emerald-600 text-white rounded-lg">
                        <Repeat className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900">
                          Modo de Alternância entre os Canais
                        </h4>
                        <p className="text-[11px] text-slate-600">
                          Como as mensagens da fila serão distribuídas entre os {selectedInboxIds.length} canais
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-emerald-200 text-xs">
                      <button
                        type="button"
                        onClick={() => setInboxRotation('round-robin')}
                        className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                          inboxRotation === 'round-robin'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Repeat className="w-3.5 h-3.5" />
                        <span>Rotativo Sequencial (Round-Robin)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setInboxRotation('random')}
                        className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                          inboxRotation === 'random'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        <span>Aleatório Balanceado</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 bg-white/80 rounded-lg border border-emerald-200/80 text-[11px] text-emerald-900 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                    <span>
                      {inboxRotation === 'round-robin'
                        ? `As mensagens serão alternadas rigorosamente uma a uma entre os ${selectedInboxIds.length} canais (Canal 1 -> Canal 2 -> Canal 3...), dividindo a lista igualmente e protegendo cada número contra limites do WhatsApp.`
                        : `O backend sorteará aleatoriamente um dos ${selectedInboxIds.length} canais para cada contato, simulando envio distribuído natural.`}
                    </span>
                  </div>
                </div>
              )}

              {/* Inboxes Multi-select Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {inboxes.map((inbox) => {
                  const isSelected = selectedInboxIds.includes(inbox.id);
                  const selectedIndex = selectedInboxIds.indexOf(inbox.id);
                  return (
                    <div
                      key={inbox.id}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedInboxIds(selectedInboxIds.filter((id) => id !== inbox.id));
                        } else {
                          setSelectedInboxIds([...selectedInboxIds, inbox.id]);
                        }
                      }}
                      className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-600 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm text-slate-900 truncate">
                              {inbox.name}
                            </h3>
                            {isSelected && selectedInboxIds.length > 1 && (
                              <span className="text-[10px] font-mono font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-200">
                                #{selectedIndex + 1} no rodízio
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Tipo de Canal: <span className="font-medium text-slate-700">{inbox.channelType || 'WhatsApp'}</span>
                          </p>
                          {inbox.phoneNumber && (
                            <p className="text-xs text-slate-600 font-mono mt-0.5">
                              {inbox.phoneNumber}
                            </p>
                          )}
                        </div>

                        {/* Checkbox badge */}
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Inbox ID: {inbox.id}</span>
                        <span className={isSelected ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                          {isSelected ? '✓ Selecionado para envio' : 'Clique para incluir'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selection Counter bar */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <span className="text-slate-600 font-medium">
                  {selectedInboxIds.length === 0 ? (
                    <span className="text-rose-600 font-semibold">
                      Nenhum canal selecionado. Selecione pelo menos 1 canal para continuar.
                    </span>
                  ) : selectedInboxIds.length === 1 ? (
                    <span>
                      <strong>1 Canal de Saída ativo</strong>: os disparos serão feitos exclusivamente por ele.
                    </span>
                  ) : (
                    <span className="text-emerald-800 font-semibold flex items-center gap-1.5">
                      <Repeat className="w-3.5 h-3.5 text-emerald-600" />
                      {selectedInboxIds.length} Canais configurados para alternância ({inboxRotation === 'round-robin' ? 'Rotativo 1 a 1' : 'Aleatório'})
                    </span>
                  )}
                </span>
                <span className="text-slate-400 font-mono">
                  {selectedInboxIds.length} / {inboxes.length} canais
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: Contatos (CSV ou Lista Salva) */}
      {currentStep === 4 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">4. Importar ou Selecionar Contatos</h2>
              <p className="text-xs text-slate-500 mt-1">
                Suba uma planilha CSV ou selecione uma lista de contatos salva previamente.
              </p>
            </div>
            {/* Mode Selector */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setContactMode('upload')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  contactMode === 'upload'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Importar CSV
              </button>
              <button
                type="button"
                onClick={() => setContactMode('list')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  contactMode === 'list'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Usar Lista Salva
              </button>
              <button
                type="button"
                onClick={() => {
                  setContactMode('kanban');
                  if (selectedConnectionId) {
                    loadKanbanMetadata(selectedConnectionId);
                  }
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                  contactMode === 'kanban'
                    ? 'bg-white text-indigo-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 text-indigo-600" />
                <span>Importar do Kanban</span>
              </button>
            </div>
          </div>

          {contactMode === 'upload' ? (
            <div className="space-y-6">
              {/* File upload box */}
              <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 transition-colors rounded-xl p-8 text-center bg-slate-50/50">
                <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-800">
                  Arraste seu arquivo CSV ou clique para selecionar
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Requer pelo menos colunas de Nome e Telefone com DDD (ex: <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-700">Maria,+5591999999999</code>)
                </p>
                <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors shadow-xs">
                  <span>Selecionar Arquivo CSV</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleCsvUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Column Mapping Selector if file uploaded */}
              {rawHeaders.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
                  <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                    Mapeamento de Colunas do CSV
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Coluna de Nome (variável <code className="text-emerald-700 font-mono">{'{{name}}'}</code>)
                      </label>
                      <select
                        value={nameColumn}
                        onChange={(e) => handleColumnMapChange(e.target.value, phoneColumn)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-800"
                      >
                        {rawHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Coluna de Telefone (normalização E.164)
                      </label>
                      <select
                        value={phoneColumn}
                        onChange={(e) => handleColumnMapChange(nameColumn, e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-800"
                      >
                        {rawHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Save list option */}
                  <div className="pt-3 border-t border-slate-200 flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="saveListCheckbox"
                      checked={saveAsNewList}
                      onChange={(e) => setSaveAsNewList(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="saveListCheckbox" className="text-xs font-medium text-slate-700">
                      Salvar estes contatos como uma nova Lista reutilizável
                    </label>
                    {saveAsNewList && (
                      <input
                        type="text"
                        placeholder="Nome da lista (ex: Leads WhatsApp)"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        className="ml-auto px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white w-52"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : contactMode === 'list' ? (
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-slate-700">
                Selecione uma Lista Salva
              </label>
              {contactLists.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhuma lista salva ainda.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {contactLists.map((list) => {
                    const isSelected = selectedListId === list.id;
                    return (
                      <div
                        key={list.id}
                        onClick={() => handleSelectSavedList(list.id)}
                        className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-600'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-xs text-slate-900">{list.name}</h4>
                          <span className="text-[11px] font-mono tabular-nums text-slate-500">
                            {list.contactCount} contatos
                          </span>
                        </div>
                        {list.description && (
                          <p className="text-[11px] text-slate-400 mt-1 truncate">{list.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* KANBAN IMPORT MODE */
            <div className="space-y-5">
              <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-600 text-white rounded-lg shrink-0">
                      <LayoutGrid className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">
                        Sincronização de Contatos do Kanban (Chatwoot)
                      </h3>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Utiliza a conexão ativa{' '}
                        <strong>
                          {connections.find((c) => c.id === selectedConnectionId)?.name || 'Chatwoot'}
                        </strong>{' '}
                        (Account ID:{' '}
                        {connections.find((c) => c.id === selectedConnectionId)?.accountId || '—'}),
                        consultando os itens do Kanban via endpoint oficial com os filtros abaixo.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedConnectionId) loadKanbanMetadata(selectedConnectionId);
                    }}
                    disabled={kanbanLoadingMeta}
                    className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${kanbanLoadingMeta ? 'animate-spin' : ''}`} />
                    <span>Recarregar Funis</span>
                  </button>
                </div>

                {/* Filter Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  {/* Funnel */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Funil / Pipeline (funnel_id)
                    </label>
                    {kanbanFunnels.length > 0 ? (
                      <select
                        value={kanbanFunnelId}
                        onChange={(e) => {
                          setKanbanFunnelId(e.target.value);
                          setKanbanStageId('');
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Todos os Funis / Padrão</option>
                        {kanbanFunnels.map((f) => (
                          <option key={f.id} value={String(f.id)}>
                            {f.name} (ID: {f.id})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="Ex: 1 ou ID do funil (opcional)"
                        value={kanbanFunnelId}
                        onChange={(e) => setKanbanFunnelId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-indigo-500"
                      />
                    )}
                  </div>

                  {/* Stage */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Etapa do Kanban (stage_id)
                    </label>
                    {kanbanStages.length > 0 ? (
                      <select
                        value={kanbanStageId}
                        onChange={(e) => setKanbanStageId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Todas as Etapas</option>
                        {kanbanStages
                          .filter((s) => !kanbanFunnelId || String(s.funnelId) === String(kanbanFunnelId))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} (ID: {s.id})
                            </option>
                          ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="Ex: lead_qualificado ou ID da etapa"
                        value={kanbanStageId}
                        onChange={(e) => setKanbanStageId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-indigo-500"
                      />
                    )}
                  </div>

                  {/* Agent */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Atendente / Agente (agent_id)
                    </label>
                    {kanbanAgents.length > 0 ? (
                      <select
                        value={kanbanAgentId}
                        onChange={(e) => setKanbanAgentId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Todos os Atendentes</option>
                        {kanbanAgents.map((a) => (
                          <option key={a.id} value={String(a.id)}>
                            {a.name} (ID: {a.id})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="ID do Atendente (opcional)"
                        value={kanbanAgentId}
                        onChange={(e) => setKanbanAgentId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-indigo-500"
                      />
                    )}
                  </div>
                </div>

                {/* Priorities Multi-selection */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Filtrar por Prioridade (Opcional - selecione as desejadas):
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { id: 'baixa', label: 'Baixa (Low)' },
                      { id: 'media', label: 'Média (Medium)' },
                      { id: 'alta', label: 'Alta (High)' },
                      { id: 'urgente', label: 'Urgente (Urgent)' },
                    ].map((p) => {
                      const isChecked = kanbanPriorities.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setKanbanPriorities((prev) =>
                              isChecked ? prev.filter((item) => item !== p.id) : [...prev, p.id]
                            );
                          }}
                          className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer ${
                            isChecked
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {isChecked ? '✓ ' : '+ '}
                          {p.label}
                        </button>
                      );
                    })}
                    {kanbanPriorities.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setKanbanPriorities([])}
                        className="text-[11px] text-slate-500 hover:text-slate-800 underline ml-1 cursor-pointer"
                      >
                        Limpar prioridades
                      </button>
                    )}
                  </div>
                </div>

                {/* Additional Settings & Fetch Action */}
                <div className="pt-3 border-t border-indigo-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="kanbanFetchAllCheck"
                      checked={kanbanFetchAll}
                      onChange={(e) => setKanbanFetchAll(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <label
                      htmlFor="kanbanFetchAllCheck"
                      className="text-xs text-slate-700 font-medium cursor-pointer"
                    >
                      Buscar todas as páginas automaticamente (paginação contínua)
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleQueryKanban}
                    disabled={kanbanFetching}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {kanbanFetching ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Consultando Kanban no Chatwoot...</span>
                      </>
                    ) : (
                      <>
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>Carregar Contatos do Kanban</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Save list option */}
                <div className="pt-2 border-t border-indigo-100 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="saveKanbanListCheckbox"
                    checked={saveAsNewList}
                    onChange={(e) => setSaveAsNewList(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="saveKanbanListCheckbox" className="text-xs font-medium text-slate-700">
                    Salvar contatos importados do Kanban como uma nova Lista reutilizável
                  </label>
                  {saveAsNewList && (
                    <input
                      type="text"
                      placeholder="Nome da lista (ex: Leads Kanban Fechamento)"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      className="ml-auto px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white w-56"
                    />
                  )}
                </div>
              </div>

              {/* Kanban Error Message */}
              {kanbanError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Não foi possível carregar contatos do Kanban</span>
                    <span>{kanbanError}</span>
                  </div>
                </div>
              )}

              {/* Kanban Success summary */}
              {kanbanImportStats && kanbanImportStats.total > 0 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Importação concluída:</strong> {kanbanImportStats.total} itens consultados no Kanban. {kanbanImportStats.valid} contatos com WhatsApp válido prontos para disparo.
                    </span>
                  </div>
                  {kanbanImportStats.duplicates > 0 && (
                    <span className="text-[11px] text-amber-800 font-mono">
                      ({kanbanImportStats.duplicates} telefones duplicados ignorados)
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Validation & Contacts Selection Toolbar */}
          {contacts.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-4">
              {/* Stats Cards */}
              <div className="grid grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Total Lidos:</span>
                  <span className="font-semibold font-mono tabular-nums text-slate-800">
                    {csvStats.total}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Válidos E.164:</span>
                  <span className="font-semibold font-mono tabular-nums text-emerald-700">
                    {csvStats.valid}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Duplicados:</span>
                  <span className="font-semibold font-mono tabular-nums text-amber-700">
                    {csvStats.duplicates}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Inválidos:</span>
                  <span className="font-semibold font-mono tabular-nums text-rose-700">
                    {csvStats.invalid}
                  </span>
                </div>
              </div>

              {/* Selection and Filter Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="flex items-center flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-800">
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                    <span>
                      {selectedCount} de {contacts.length} contatos selecionados para envio
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleSelectAll(true)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md transition-colors cursor-pointer"
                    >
                      Marcar Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSelectAll(false)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md transition-colors cursor-pointer"
                    >
                      Desmarcar Todos
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou número..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 w-52 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setManualName('');
                      setManualPhone('');
                      setManualError(null);
                      setIsAddContactModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>+ Adicionar Contato</span>
                  </button>
                </div>
              </div>

              {/* Filter Tabs: Todos, Selecionados, Desmarcados */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit text-xs">
                <button
                  type="button"
                  onClick={() => setContactFilter('all')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    contactFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos ({contacts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setContactFilter('selected')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    contactFilter === 'selected'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Selecionados ({selectedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setContactFilter('unselected')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    contactFilter === 'unselected'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Desmarcados ({contacts.length - selectedCount})
                </button>
              </div>

              {/* Interactive Contacts Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 uppercase tracking-wider text-[11px] sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-10">
                          <input
                            type="checkbox"
                            checked={isAllFilteredSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = isSomeFilteredSelected;
                            }}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setContacts((prev) =>
                                prev.map((c) => {
                                  if (filteredContacts.some((fc) => fc.id === c.id)) {
                                    return { ...c, selected: checked };
                                  }
                                  return c;
                                })
                              );
                            }}
                            className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            title="Selecionar / Desmarcar filtrados"
                          />
                        </th>
                        <th className="py-2.5 px-3">Nome</th>
                        <th className="py-2.5 px-3">Telefone Normalizado (E.164)</th>
                        <th className="py-2.5 px-3">Variáveis Dinâmicas</th>
                        <th className="py-2.5 px-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredContacts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            Nenhum contato encontrado com o filtro atual.
                          </td>
                        </tr>
                      ) : (
                        filteredContacts.map((c) => {
                          const isEditing = editingContactId === c.id;
                          return (
                            <tr
                              key={c.id}
                              className={`transition-colors ${
                                c.selected ? 'bg-white hover:bg-slate-50/70' : 'bg-slate-50/40 text-slate-400 hover:bg-slate-100/50'
                              }`}
                            >
                              {/* Checkbox */}
                              <td className="py-2.5 px-3">
                                <input
                                  type="checkbox"
                                  checked={c.selected}
                                  onChange={() => toggleSelectContact(c.id)}
                                  className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                              </td>

                              {/* Name column */}
                              <td className="py-2.5 px-3">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveEdit(c.id);
                                      if (e.key === 'Escape') handleCancelEdit();
                                    }}
                                    className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-medium text-slate-900 w-full focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                                    placeholder="Nome do contato"
                                  />
                                ) : (
                                  <div className="flex items-center gap-1.5 font-medium text-slate-800">
                                    <span className={c.selected ? 'text-slate-900' : 'text-slate-500'}>
                                      {c.name}
                                    </span>
                                    {c.isEdited && (
                                      <span className="text-[10px] bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.2 rounded font-medium">
                                        Editado
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Phone column */}
                              <td className="py-2.5 px-3 font-mono tabular-nums">
                                {isEditing ? (
                                  <div className="space-y-1">
                                    <input
                                      type="text"
                                      value={editPhone}
                                      autoFocus
                                      onChange={(e) => {
                                        setEditPhone(e.target.value);
                                        if (editError) setEditError(null);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveEdit(c.id);
                                        if (e.key === 'Escape') handleCancelEdit();
                                      }}
                                      className="px-2 py-1 bg-white border border-emerald-500 rounded text-xs font-mono text-slate-900 w-full focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                                      placeholder="Ex: 91999998888 ou +5591999998888"
                                    />
                                    {editError ? (
                                      <p className="text-[11px] text-rose-600 font-sans">{editError}</p>
                                    ) : (
                                      <p className="text-[10px] text-slate-400 font-sans">
                                        Pressione Enter para salvar
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <span className={c.selected ? 'text-slate-700' : 'text-slate-400'}>
                                    {c.phoneNumber}
                                  </span>
                                )}
                              </td>

                              {/* Dynamic Attributes */}
                              <td className="py-2.5 px-3 text-[11px] text-slate-500">
                                {c.customAttributes && Object.keys(c.customAttributes).length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1.5 font-sans">
                                    {c.customAttributes.etapa && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        Etapa: {c.customAttributes.etapa}
                                      </span>
                                    )}
                                    {c.customAttributes.prioridade && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                        Prioridade: {c.customAttributes.prioridade}
                                      </span>
                                    )}
                                    {c.customAttributes.funil && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                        {c.customAttributes.funil}
                                      </span>
                                    )}
                                    {Object.entries(c.customAttributes)
                                      .filter(([k, v]) => !['origem', 'etapa', 'prioridade', 'funil'].includes(k) && Boolean(v))
                                      .map(([k, v]) => (
                                        <span key={k} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200">
                                          {k}={String(v)}
                                        </span>
                                      ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-mono">—</span>
                                )}
                              </td>

                              {/* Action Buttons */}
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEdit(c.id)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                                      title="Salvar alterações"
                                    >
                                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                      <span>Salvar</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCancelEdit}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 text-xs font-medium transition-colors cursor-pointer"
                                      title="Cancelar edição"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      <span>Cancelar</span>
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleStartEdit(c)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 text-xs font-medium transition-colors cursor-pointer"
                                      title="Editar número ou nome"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                      <span>Editar</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteContact(c.id)}
                                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                      title="Remover da lista de envio"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 5: Mensagem e Foto com Legenda (Caption) */}
      {currentStep === 5 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  5. Escrever Mensagem e Foto com Legenda (Caption)
                </h2>
                {hasPhoto && mediaUrl && (
                  <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    Foto + Legenda Ativa
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Defina o texto e ative a opção de foto para enviar a mensagem como legenda (caption) no WhatsApp / Chatwoot.
              </p>
            </div>
            {/* Quick Template Picker */}
            {templates.length > 0 && (
              <select
                value={selectedTemplateId}
                onChange={(e) => {
                  setSelectedTemplateId(e.target.value);
                  const tmpl = templates.find((t) => t.id === e.target.value);
                  if (tmpl) {
                    setBaseMessage(tmpl.content);
                    if (tmpl.mediaUrl) {
                      setHasPhoto(true);
                      setMediaUrl(tmpl.mediaUrl);
                      setMediaFilename(tmpl.mediaFilename || 'foto_template.jpg');
                    }
                  }
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <option value="">Carregar da Biblioteca...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.category}] {t.title} {t.mediaUrl ? '📷' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-6">
            {/* TOGGLE: Enviar Foto com Legenda (Caption) */}
            <div className={`p-4 rounded-xl border transition-all ${
              hasPhoto
                ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-300'
                : 'bg-slate-50/70 border-slate-200'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg mt-0.5 ${hasPhoto ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <label
                      htmlFor="toggleHasPhoto"
                      className="text-xs font-semibold text-slate-900 cursor-pointer flex items-center gap-2"
                    >
                      <span>Enviar foto junto ao texto (Legenda / Caption)</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white border border-slate-300 text-slate-600 uppercase">
                        WhatsApp & Chatwoot
                      </span>
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      A imagem selecionada será disparada pelo canal e o texto da mensagem funcionará como legenda (caption) na mesma bolha.
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    id="toggleHasPhoto"
                    checked={hasPhoto}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setHasPhoto(enabled);
                      if (!enabled) {
                        setMediaUploadError(null);
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Photo Upload / Attachment Area */}
              {hasPhoto && (
                <div className="mt-4 pt-4 border-t border-emerald-200/70 space-y-4">
                  {mediaUrl ? (
                    // Display attached image card
                    <div className="flex items-center justify-between gap-4 p-3 bg-white rounded-lg border border-emerald-300 shadow-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={mediaUrl}
                          alt="Foto selecionada para envio"
                          className="w-14 h-14 rounded-md object-cover border border-slate-200 shrink-0"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-slate-900 block truncate">
                            {mediaFilename || 'foto_anexada.jpg'}
                          </span>
                          <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Foto carregada com sucesso para envio com legenda
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <label className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer transition-colors">
                          <span>Trocar Foto</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          title="Remover foto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Upload / URL picker
                    <div className="space-y-3">
                      <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-emerald-200 w-fit text-xs">
                        <button
                          type="button"
                          onClick={() => setMediaInputMode('upload')}
                          className={`px-3 py-1 rounded-md font-medium transition-colors ${
                            mediaInputMode === 'upload'
                              ? 'bg-slate-900 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Upload do Computador
                        </button>
                        <button
                          type="button"
                          onClick={() => setMediaInputMode('url')}
                          className={`px-3 py-1 rounded-md font-medium transition-colors ${
                            mediaInputMode === 'url'
                              ? 'bg-slate-900 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Link / URL de Imagem
                        </button>
                      </div>

                      {mediaInputMode === 'upload' ? (
                        <div className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl p-6 text-center bg-white/70 transition-colors">
                          <UploadCloud className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                          <p className="text-xs font-semibold text-slate-800">
                            {uploadingMedia ? 'Enviando imagem...' : 'Selecione ou arraste a foto para a campanha'}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Formatos aceitos: JPG, PNG, WebP ou GIF (tamanho máximo: 15MB)
                          </p>
                          <label className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer transition-colors shadow-xs">
                            {uploadingMedia ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Processando upload...</span>
                              </>
                            ) : (
                              <>
                                <ImageIcon className="w-3.5 h-3.5" />
                                <span>Escolher Imagem do Computador</span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingMedia}
                              onChange={handlePhotoUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="url"
                            placeholder="https://exemplo.com/fotos/produto.jpg"
                            value={customMediaUrl}
                            onChange={(e) => setCustomMediaUrl(e.target.value)}
                            className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={handleApplyCustomUrl}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                          >
                            Carregar Foto
                          </button>
                        </div>
                      )}

                      {mediaUploadError && (
                        <p className="text-xs text-rose-600 font-medium">{mediaUploadError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* MESSAGE TEXTAREA (Caption or standard text) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-800">
                  {hasPhoto ? 'Texto da Legenda (Caption da Foto)' : 'Texto da Mensagem'}
                </label>
                <span className="text-[11px] text-slate-400">
                  {hasPhoto ? 'Será exibido abaixo da imagem no WhatsApp' : 'Texto principal'}
                </span>
              </div>
              <textarea
                rows={5}
                required
                value={baseMessage}
                onChange={(e) => setBaseMessage(e.target.value)}
                placeholder={
                  hasPhoto
                    ? 'Escreva a legenda que acompanhará a foto (ex: Olá {{name}}, confira nossa nova oportunidade imperdível!)...'
                    : 'Olá {{name}}, tudo bem? Temos uma oportunidade exclusiva para você...'
                }
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white leading-relaxed font-sans"
              />
            </div>

            {/* Variable insertion pills */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-slate-500 font-medium">Inserir tag dinâmica:</span>
              <button
                type="button"
                onClick={() => setBaseMessage((prev) => prev + ' {{name}}')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-mono transition-colors cursor-pointer"
              >
                + {'{{name}}'}
              </button>
              <button
                type="button"
                onClick={() => setBaseMessage((prev) => prev + ' {{phone_number}}')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-mono transition-colors cursor-pointer"
              >
                + {'{{phone_number}}'}
              </button>
            </div>

            {/* Interactive WhatsApp / Chatwoot Simulation Preview */}
            <div className="bg-slate-100/70 border border-slate-200 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                  Pré-visualização do envio (Simulação WhatsApp / Chatwoot):
                </span>
                <span className="text-[11px] text-slate-400">
                  Substituindo variáveis com o 1º contato da lista
                </span>
              </div>

              {/* Chat Bubble simulation */}
              <div className="max-w-md mx-auto sm:mx-0 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden mt-3">
                {/* Photo in bubble if active */}
                {hasPhoto && mediaUrl ? (
                  <div className="relative bg-slate-100">
                    <img
                      src={mediaUrl}
                      alt="Legenda prévia"
                      className="w-full max-h-64 object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute top-2 right-2 bg-slate-900/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded backdrop-blur-xs">
                      Foto da Mensagem
                    </div>
                  </div>
                ) : null}

                {/* Caption or message content */}
                <div className="p-3.5 space-y-2">
                  <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed font-sans">
                    {baseMessage ? (
                      interpolateVariables(baseMessage, {
                        name: contacts.length > 0 ? contacts[0].name : 'Maria Silva',
                        phone_number: contacts.length > 0 ? contacts[0].phoneNumber : '+55 (91) 99999-9999',
                        ...(contacts.length > 0 ? contacts[0].customAttributes : {}),
                      })
                    ) : (
                      <span className="text-slate-400 italic">
                        {hasPhoto
                          ? 'Digite a legenda da foto acima...'
                          : 'Digite o texto da mensagem acima...'}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 font-mono">
                    <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-emerald-600 font-bold">✓✓</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 6: Variações & Gerador IA */}
      {currentStep === 6 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">6. Variações da Mensagem</h2>
              <p className="text-xs text-slate-500 mt-1">
                Adicione versões alternativas da mensagem para distribuição aleatória, evitando filtros e melhorando a entrega.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAiModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gerar variações com IA</span>
            </button>
          </div>

          <div className="space-y-4">
            {hasPhoto && mediaUrl && (
              <div className="flex items-center gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Foto com Legenda Ativa:</strong> Cada uma das variações abaixo será disparada aleatoriamente como a legenda (caption) da foto anexada.
                </span>
              </div>
            )}

            {/* Input to add manual variation */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newVariationText}
                onChange={(e) => setNewVariationText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddManualVariation();
                  }
                }}
                placeholder="Escreva uma nova variação manual e clique em Adicionar..."
                className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={handleAddManualVariation}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Adicionar
              </button>
            </div>

            {/* List of active variations */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Variações cadastradas ({variations.length + 1} no total com a base):</span>
              </div>

              {/* Base variation card */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">
                    {hasPhoto ? 'Legenda Base' : 'Mensagem Base'}
                  </span>
                  <p className="whitespace-pre-line">{baseMessage}</p>
                </div>
              </div>

              {/* Additional variation cards */}
              {variations.map((v, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 flex items-start justify-between gap-3 group"
                >
                  <div className="space-y-0.5 flex-1">
                    <span className="text-[10px] uppercase font-bold text-indigo-600">
                      {hasPhoto ? `Legenda Alternativa ${idx + 1}` : `Variação ${idx + 1}`}
                    </span>
                    <p className="whitespace-pre-line">{v}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveVariation(idx)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded opacity-70 group-hover:opacity-100 transition-opacity"
                    title="Remover variação"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 7: Configuração de Envio & Teste */}
      {currentStep === 7 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-semibold text-slate-900">7. Cadência da Fila e Teste de Envio</h2>
            <p className="text-xs text-slate-500 mt-1">
              Configure intervalos aleatórios entre envios para respeitar as diretrizes do canal e faça um teste com seu número.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Queue configuration */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                Configurações da Fila e Cadência
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Intervalo Mínimo (segundos)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={minDelay}
                    onChange={(e) => setMinDelay(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Intervalo Máximo (segundos)
                  </label>
                  <input
                    type="number"
                    min={minDelay}
                    max={600}
                    value={maxDelay}
                    onChange={(e) => setMaxDelay(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900"
                  />
                </div>
              </div>

              {/* Anti-Ban Batch Pause Box */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-300 rounded-xl space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-emerald-600 text-white rounded-lg mt-0.5 shrink-0">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <label
                        htmlFor="toggleBatchPause"
                        className="text-xs font-semibold text-slate-900 cursor-pointer flex items-center gap-2"
                      >
                        <span>Pausa entre Lotes (Proteção Anti-Banimento)</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white border border-emerald-300 text-emerald-800 uppercase font-semibold">
                          Recomendado
                        </span>
                      </label>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Interrompe os disparos por um período de descanso programado após cada lote para esfriar os números do WhatsApp e evitar suspensões.
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      id="toggleBatchPause"
                      checked={enableBatchPause}
                      onChange={(e) => setEnableBatchPause(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {enableBatchPause && (
                  <div className="pt-3 border-t border-emerald-200/80 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Tamanho do Lote (mensagens)
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={500}
                          value={batchSize}
                          onChange={(e) => setBatchSize(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Dispara {batchSize} mensagens antes de pausar
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Tempo de Pausa (minutos)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={180}
                          value={batchPauseMinutes}
                          onChange={(e) => setBatchPauseMinutes(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Descanso de {batchPauseMinutes} min entre cada lote
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 bg-white/90 rounded-lg border border-emerald-200 text-[11px] text-emerald-950 flex items-start gap-2">
                      <Timer className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                      <span>
                        <strong>Ciclo de Segurança:</strong> O robô enviará {batchSize} mensagens (com intervalo de {minDelay}s a {maxDelay}s{selectedInboxIds.length > 1 ? ` alternando entre ${selectedInboxIds.length} canais` : ''}). Ao atingir {batchSize} mensagens, pausará por {batchPauseMinutes} minutos para resfriar os canais e continuará automaticamente em seguida.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Daily Limit & Business Hours Anti-Ban Box (User Request) */}
              <div className="p-4 bg-sky-50/70 border border-sky-300 rounded-xl space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-sky-600 text-white rounded-lg mt-0.5 shrink-0">
                      <Sun className="w-4 h-4" />
                    </div>
                    <div>
                      <label
                        htmlFor="toggleDailyLimit"
                        className="text-xs font-semibold text-slate-900 cursor-pointer flex items-center gap-2"
                      >
                        <span>Limitador Diário e Horário Comercial</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white border border-sky-300 text-sky-800 uppercase font-semibold">
                          Anti-Ban Avançado
                        </span>
                      </label>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Limita a quantidade de contatos disparados por dia. Ao atingir o limite, a campanha pausa e retoma automaticamente no dia seguinte no horário comercial.
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      id="toggleDailyLimit"
                      checked={enableDailyLimit}
                      onChange={(e) => setEnableDailyLimit(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                  </label>
                </div>

                {enableDailyLimit && (
                  <div className="pt-3 border-t border-sky-200/80 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Limite Máximo Diário (contatos/dia)
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={5000}
                          value={dailyLimit}
                          onChange={(e) => setDailyLimit(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:ring-1 focus:ring-sky-500"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Máximo de disparos por data civil
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Início do Horário Comercial
                        </label>
                        <input
                          type="time"
                          value={businessHoursStart}
                          onChange={(e) => setBusinessHoursStart(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:ring-1 focus:ring-sky-500"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Horário de retomada no dia seguinte
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Fim do Horário Comercial
                        </label>
                        <input
                          type="time"
                          value={businessHoursEnd}
                          onChange={(e) => setBusinessHoursEnd(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:ring-1 focus:ring-sky-500"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Término das mensagens no dia
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="businessDaysOnlyCheck"
                        checked={businessDaysOnly}
                        onChange={(e) => setBusinessDaysOnly(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                      <label htmlFor="businessDaysOnlyCheck" className="text-xs text-slate-700 font-medium cursor-pointer">
                        Enviar apenas em dias úteis (Segunda a Sexta-feira, ignorando sábados e domingos)
                      </label>
                    </div>

                    <div className="p-2.5 bg-white/95 rounded-lg border border-sky-200 text-[11px] text-sky-950 flex items-start gap-2">
                      <Calendar className="w-3.5 h-3.5 text-sky-700 shrink-0 mt-0.5" />
                      <span>
                        <strong>Comportamento Automático:</strong> O sistema disparará até <strong>{dailyLimit} mensagens</strong> hoje. Assim que atingir esse limite, a campanha pausará com segurança e retomará no dia seguinte pontualmente às <strong>{businessHoursStart}</strong>{businessDaysOnly ? ' (ou na próxima segunda-feira se for final de semana)' : ''}, tudo sem necessidade de intervenção manual.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  O backend continuará processando a fila em segundo plano mesmo que o navegador seja fechado.
                </span>
              </div>
            </div>

            {/* Test Send to a Real Number */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <PhoneCall className="w-4 h-4 text-emerald-600" />
                <span>Disparo de Teste (1 Contato)</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Envie uma mensagem de amostra para seu WhatsApp ou telefone antes de iniciar a campanha completa.
              </p>

              {hasPhoto && mediaUrl && (
                <div className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-emerald-200 text-xs">
                  <img
                    src={mediaUrl}
                    alt="Foto teste"
                    className="w-10 h-10 object-cover rounded border border-slate-200 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-900 block truncate">
                      {mediaFilename || 'foto_anexada.jpg'}
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      Será disparada com a legenda para o número de teste
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Número de Teste (com DDD)
                </label>
                <input
                  type="text"
                  placeholder="+55 91 99999-9999"
                  value={testPhoneNumber}
                  onChange={(e) => setTestPhoneNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-900"
                />
              </div>

              <button
                type="button"
                disabled={testSending}
                onClick={handleTestSend}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {testSending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Disparando teste via Chatwoot...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>{hasPhoto && mediaUrl ? 'Enviar Foto + Legenda de Teste' : 'Enviar Mensagem de Teste'}</span>
                  </>
                )}
              </button>

              {testResult && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                    testResult.success
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STEP 8: Revisar & Iniciar */}
      {currentStep === 8 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-semibold text-slate-900">8. Revisão Final da Campanha</h2>
            <p className="text-xs text-slate-500 mt-1">
              Confira os parâmetros configurados antes de liberar o disparo.
            </p>
          </div>

          {submitError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Exact structured summary as requested by user prompt */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Campanha:</span>
                <span className="font-semibold text-slate-900">{name || 'Sem nome'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Contatos para Envio:</span>
                <span className="font-semibold font-mono tabular-nums text-emerald-700">
                  {selectedCount} selecionados (de {contacts.length} importados)
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Foto com Legenda (Caption):</span>
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  {hasPhoto && mediaUrl ? (
                    <>
                      <span className="text-emerald-700">Sim (1 foto anexada)</span>
                      <img
                        src={mediaUrl}
                        alt="Foto"
                        className="w-5 h-5 rounded object-cover border border-slate-200"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </>
                  ) : (
                    <span className="text-slate-500">Não (Apenas Texto)</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Conta Chatwoot:</span>
                <span className="font-semibold text-slate-900">
                  {connections.find((c) => c.id === selectedConnectionId)?.name || '—'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Canais de Saída:</span>
                <span className="font-semibold text-slate-900 text-right">
                  {selectedInboxIds.length > 1 ? (
                    <span className="text-emerald-700">
                      {selectedInboxIds.length} Canais (
                      {inboxRotation === 'round-robin' ? 'Rotativo Sequencial' : 'Aleatório'}
                      )
                    </span>
                  ) : (
                    inboxes.find((i) => i.id === selectedInboxId)?.name || '—'
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Variações Totais:</span>
                <span className="font-semibold font-mono tabular-nums text-indigo-700">
                  {variations.length + 1}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Intervalo entre Mensagens:</span>
                <span className="font-semibold font-mono tabular-nums text-slate-900">
                  {minDelay}s a {maxDelay}s
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Tamanho do Lote:</span>
                <span className="font-semibold font-mono tabular-nums text-slate-900">
                  {batchSize} mensagens
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Pausa Anti-Banimento:</span>
                <span className="font-semibold font-mono tabular-nums text-emerald-800">
                  {enableBatchPause && batchPauseMinutes > 0
                    ? `Pausa de ${batchPauseMinutes} min após cada lote`
                    : 'Desativada'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Limitador Diário:</span>
                <span className="font-semibold font-mono tabular-nums text-sky-800">
                  {enableDailyLimit && dailyLimit > 0
                    ? `${dailyLimit} msgs/dia (${businessHoursStart} às ${businessHoursEnd}${businessDaysOnly ? ' · Úteis' : ''})`
                    : 'Sem limite diário'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Tempo Estimado:</span>
                <span className="font-semibold font-mono tabular-nums text-slate-900">
                  ~{Math.round(
                    (selectedCount * ((minDelay + maxDelay) / 2)) / 60 +
                      (enableBatchPause && batchPauseMinutes > 0
                        ? Math.floor(selectedCount / batchSize) * batchPauseMinutes
                        : 0)
                  )}{' '}
                  min
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleFinalSubmit(false)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Salvar como Rascunho
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleFinalSubmit(true)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Iniciando campanha...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Iniciar Campanha Agora</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Navigation Buttons for Wizard Steps */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          disabled={currentStep === 1}
          onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        {currentStep < 8 ? (
          <button
            type="button"
            onClick={() => {
              if (currentStep === 1 && !name.trim()) {
                alert('Por favor, informe o nome da campanha.');
                return;
              }
              if (currentStep === 2 && !selectedConnectionId) {
                alert('Por favor, selecione uma conexão Chatwoot.');
                return;
              }
              if (currentStep === 3 && selectedInboxIds.length === 0) {
                alert('Por favor, selecione pelo menos um canal/inbox de saída.');
                return;
              }
              if (currentStep === 4) {
                if (contacts.length === 0) {
                  alert('Por favor, importe ou selecione contatos válidos.');
                  return;
                }
                if (selectedCount === 0) {
                  alert('Por favor, selecione pelo menos um contato para o envio da campanha.');
                  return;
                }
              }
              if (currentStep === 5 && !baseMessage.trim()) {
                alert('Por favor, escreva a mensagem-base.');
                return;
              }
              setCurrentStep((prev) => Math.min(8, prev + 1));
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <span>Próxima Etapa</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {/* Modal: AI Variations Generator */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Gerador de Variações com IA (OpenAI)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAiModalOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tom Desejado
                  </label>
                  <select
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-800 font-medium"
                  >
                    <option value="mais comercial">Mais comercial</option>
                    <option value="mais curto">Mais curto</option>
                    <option value="mais natural">Mais natural</option>
                    <option value="mais amigável">Mais amigável</option>
                    <option value="urgência">Urgência / Escassez</option>
                    <option value="padrão">Padrão equilibrado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quantidade de Variações
                  </label>
                  <select
                    value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-800 font-medium"
                  >
                    <option value={3}>3 variações</option>
                    <option value={5}>5 variações</option>
                    <option value={10}>10 variações</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Instruções Adicionais (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Focar no desconto de 20%, não usar emojis exagerados..."
                  value={aiCustomPrompt}
                  onChange={(e) => setAiCustomPrompt(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900"
                />
              </div>

              <button
                type="button"
                disabled={aiLoading}
                onClick={handleTriggerAiVariations}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {aiLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Gerando variações mantendo intenção e variáveis...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Gerar Agora</span>
                  </>
                )}
              </button>

              {/* Suggestions to approve */}
              {aiGeneratedSuggestions.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-800 block">
                    Revise e aprove as variações sugeridas:
                  </span>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {aiGeneratedSuggestions.map((suggestion, idx) => {
                      const isApproved = approvedSuggestions[idx] ?? true;
                      return (
                        <div
                          key={idx}
                          onClick={() =>
                            setApprovedSuggestions({
                              ...approvedSuggestions,
                              [idx]: !isApproved,
                            })
                          }
                          className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                            isApproved
                              ? 'bg-indigo-50/50 border-indigo-300 text-slate-900'
                              : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={isApproved}
                              onChange={() => {}}
                              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <p className="whitespace-pre-line leading-relaxed">{suggestion}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAiModalOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancelar
              </button>
              {aiGeneratedSuggestions.length > 0 && (
                <button
                  type="button"
                  onClick={handleAddApprovedAiVariations}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                >
                  Adicionar Aprovadas à Campanha
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Contato Manualmente */}
      {isAddContactModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Adicionar Contato à Campanha
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddContactModalOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddManualContact} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Contato
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Ferreira"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Telefone (com DDD)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: (91) 98888-7777 ou +5591988887777"
                  value={manualPhone}
                  onChange={(e) => {
                    setManualPhone(e.target.value);
                    if (manualError) setManualError(null);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Será automaticamente normalizado no padrão internacional E.164.
                </p>
                {manualError && (
                  <p className="text-xs text-rose-600 mt-1.5 font-medium">{manualError}</p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddContactModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
                >
                  Adicionar Contato
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
