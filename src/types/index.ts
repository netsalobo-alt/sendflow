export interface User {
  id: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatwootConnection {
  id: string;
  name: string;
  baseUrl: string;
  accountId: number;
  apiAccessToken: string; // masked in frontend (e.g. "cw_****..."), full in backend
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatwootInbox {
  id: number;
  name: string;
  channelType: string;
  phoneNumber?: string;
  avatarUrl?: string;
  provider?: string;
  medium?: string;
}

export interface OpenAISettings {
  apiKey: string; // masked in frontend
  model: string;
  defaultCount: number;
  defaultPrompt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  id: string;
  title: string;
  category: 'Vendas' | 'Follow-up' | 'Promoção' | 'Cobrança' | 'Pós-venda' | 'Geral';
  content: string;
  mediaUrl?: string; // URL da imagem para envio de foto com legenda (caption)
  mediaFilename?: string;
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactItem {
  id: string;
  name: string;
  phoneNumber: string;
  customAttributes?: Record<string, string>;
  createdAt?: string;
}

export interface ContactList {
  id: string;
  name: string;
  description?: string;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus =
  | 'Rascunho'
  | 'Programada'
  | 'Em andamento'
  | 'Pausada'
  | 'Concluída'
  | 'Cancelada'
  | 'Com erro';

export interface CampaignInboxTarget {
  inboxId: number;
  inboxName: string;
  connectionId?: string;
  connectionName?: string;
  channelType?: string;
  phoneNumber?: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  connectionId: string;
  connectionName: string;
  inboxId: number;
  inboxName: string;
  inboxes?: CampaignInboxTarget[]; // Múltiplos canais de saída para alternância
  inboxRotation?: 'round-robin' | 'random'; // Modo de alternância entre os canais
  status: CampaignStatus;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  batchSize: number;
  batchPauseMinutes?: number; // Período de pausa (em minutos) após cada lote para proteção anti-banimento
  isRestingBetweenBatches?: boolean; // Se a campanha está atualmente no período de descanso entre lotes
  dailyLimit?: number; // Limite diário de mensagens (0 = sem limite diário)
  sentTodayCount?: number; // Mensagens disparadas na data de hoje
  lastDailyResetDate?: string; // Data YYYY-MM-DD da contagem diária
  isRestingDailyLimit?: boolean; // Se atingiu o limite diário e aguarda o horário comercial do próximo dia
  businessHoursStart?: string; // Início do horário comercial (ex: "08:00" ou "09:00")
  businessHoursEnd?: string; // Término do horário comercial (ex: "18:00")
  businessDaysOnly?: boolean; // Disparar somente em dias úteis (segunda a sexta-feira)
  resumeAt?: string; // Previsão de horário para retomada automática após a pausa do lote ou dia seguinte
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  baseMessage: string;
  variations: string[];
  mediaUrl?: string; // foto/imagem anexada com legenda (caption)
  mediaFilename?: string;
  contactListId?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface CampaignContactLog {
  id: string;
  campaignId: string;
  contactName: string;
  phoneNumber: string;
  messageContent: string;
  mediaUrl?: string; // foto enviada com legenda
  channelName: string;
  status: 'enviado' | 'pendente' | 'erro';
  errorDetails?: string;
  chatwootConversationId?: number;
  chatwootContactId?: number;
  timestamp: string;
}

export interface DashboardMetrics {
  totalCampaigns: number;
  activeCampaigns: number;
  sentToday: number;
  sentThisMonth: number;
  failedCount: number;
  totalContacts: number;
  recentCampaigns: Campaign[];
}

export interface CsvValidationResult {
  totalRows: number;
  validRows: ContactItem[];
  invalidRows: { row: number; data: Record<string, string>; reason: string }[];
  duplicateCount: number;
  headers: string[];
}
