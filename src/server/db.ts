import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  Campaign,
  CampaignContactLog,
  ChatwootConnection,
  ContactItem,
  ContactList,
  MessageTemplate,
  OpenAISettings,
  User,
} from '../types/index.ts';
import { pushStateToFirestore, pullStateFromFirestore } from './firestoreSync.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Secret for token encryption (can be overridden via ENV)
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(process.env.APP_SECRET || 'chatwoot-campaign-hub-secret-key-2026')
  .digest();

export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptSecret(cipherText: string): string {
  if (!cipherText || !cipherText.includes(':')) return cipherText || '';
  try {
    const [ivHex, authTagHex, encrypted] = cipherText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt secret:', err);
    return '';
  }
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(originalHash, 'hex'), Buffer.from(verifyHash, 'hex'));
}

export interface StoredCampaignContact {
  id: string;
  campaignId: string;
  name: string;
  phoneNumber: string;
  customAttributes?: Record<string, string>;
  status: 'pendente' | 'enviado' | 'erro';
  messageSent?: string;
  sentAt?: string;
  errorMessage?: string;
  chatwootConversationId?: number;
}

export interface DbSchema {
  users: Array<User & { passwordHash: string }>;
  chatwootConnections: Array<ChatwootConnection & { encryptedToken: string }>;
  openaiSettings: OpenAISettings & { encryptedApiKey: string };
  templates: MessageTemplate[];
  contactLists: ContactList[];
  contacts: Array<ContactItem & { listId?: string }>;
  campaigns: Campaign[];
  campaignContacts: StoredCampaignContact[];
  campaignLogs: CampaignContactLog[];
}

// Initial seed
function getDefaultDatabase(): DbSchema {
  const initialSalt = crypto.randomBytes(16).toString('hex');
  const initialHash = hashPassword('edgard@123', initialSalt);

  return {
    users: [
      {
        id: 'usr_edgard_initial',
        username: 'Edgard',
        passwordHash: initialHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    chatwootConnections: [
      {
        id: 'conn_demo_norte',
        name: 'Norte Telecom (Exemplo)',
        baseUrl: 'https://conversa.nortetelecom.net.br',
        accountId: 1,
        apiAccessToken: 'cw_demo_token',
        encryptedToken: encryptSecret('demo_token_value_placeholder'),
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    openaiSettings: {
      apiKey: '',
      encryptedApiKey: '',
      model: 'gpt-4o-mini',
      defaultCount: 5,
      defaultPrompt:
        'Crie variações persuasivas e naturais para a mensagem comercial a seguir, preservando sempre as variáveis {{name}}, {{phone_number}} e outras tags dinâmicas. Mantenha o objetivo comercial intacto.',
      updatedAt: new Date().toISOString(),
    },
    templates: [
      {
        id: 'tmpl_1',
        title: 'Condição Especial VIP',
        category: 'Vendas',
        content: 'Olá {{name}}, tudo bem? Temos uma oportunidade exclusiva para você hoje com condições especiais. Posso te apresentar os detalhes?',
        usageCount: 14,
        lastUsedAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tmpl_2',
        title: 'Follow-up de Proposta',
        category: 'Follow-up',
        content: 'Oi {{name}}, tudo certo? Passando para saber se você conseguiu analisar a nossa proposta anterior. Fico à disposição para tirar qualquer dúvida!',
        usageCount: 8,
        lastUsedAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tmpl_3',
        title: 'Aviso Amigável de Vencimento',
        category: 'Cobrança',
        content: 'Olá {{name}}, tudo bem? Notamos que o seu boleto com vencimento recente ainda está pendente. Segue a 2ª via atualizada para sua comodidade. Caso já tenha pago, desconsidere!',
        usageCount: 22,
        lastUsedAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tmpl_4',
        title: 'Pesquisa de Satisfação Pós-Venda',
        category: 'Pós-venda',
        content: 'Olá {{name}}! Como está sendo sua experiência conosco? Sua opinião é fundamental para continuarmos melhorando nosso atendimento.',
        usageCount: 5,
        lastUsedAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tmpl_5',
        title: 'Super Promoção Relâmpago',
        category: 'Promoção',
        content: 'Aproveite {{name}}! Liberamos uma condição promocional por tempo limitado para a sua linha. Responda SIM para receber a tabela completa!',
        usageCount: 19,
        lastUsedAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    contactLists: [
      {
        id: 'list_amostra_1',
        name: 'Base de Teste Comercial',
        description: 'Contatos de exemplo para validação e testes de disparo',
        contactCount: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    contacts: [
      {
        id: 'ct_1',
        listId: 'list_amostra_1',
        name: 'Maria Silva',
        phoneNumber: '+5591999999999',
        customAttributes: { cidade: 'Belém', plano: 'Fibra 500M' },
        createdAt: new Date().toISOString(),
      },
      {
        id: 'ct_2',
        listId: 'list_amostra_1',
        name: 'João Santos',
        phoneNumber: '+5591988888888',
        customAttributes: { cidade: 'Ananindeua', plano: 'Fibra 300M' },
        createdAt: new Date().toISOString(),
      },
      {
        id: 'ct_3',
        listId: 'list_amostra_1',
        name: 'Carlos Oliveira',
        phoneNumber: '+5591977777777',
        customAttributes: { cidade: 'Castanhal', plano: 'Fibra 600M' },
        createdAt: new Date().toISOString(),
      },
    ],
    campaigns: [
      {
        id: 'cmp_demo_1',
        name: 'Campanha Exemplo - Boas Vindas',
        description: 'Campanha de demonstração do sistema',
        connectionId: 'conn_demo_norte',
        connectionName: 'Norte Telecom (Exemplo)',
        inboxId: 1,
        inboxName: 'WhatsApp Suporte (Exemplo)',
        status: 'Rascunho',
        minDelaySeconds: 15,
        maxDelaySeconds: 30,
        batchSize: 50,
        totalContacts: 3,
        sentCount: 0,
        failedCount: 0,
        pendingCount: 3,
        baseMessage: 'Olá {{name}}, tudo bem? Seja bem-vindo à nossa base!',
        variations: [
          'Olá {{name}}, tudo bem? Seja bem-vindo à nossa base!',
          'Oi {{name}}, tudo certo? Que bom ter você conosco!',
          'Olá {{name}}! Prazer falar com você, qualquer dúvida estamos à disposição.',
        ],
        contactListId: 'list_amostra_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    campaignContacts: [
      {
        id: 'cc_1',
        campaignId: 'cmp_demo_1',
        name: 'Maria Silva',
        phoneNumber: '+5591999999999',
        customAttributes: { cidade: 'Belém' },
        status: 'pendente',
      },
      {
        id: 'cc_2',
        campaignId: 'cmp_demo_1',
        name: 'João Santos',
        phoneNumber: '+5591988888888',
        customAttributes: { cidade: 'Ananindeua' },
        status: 'pendente',
      },
      {
        id: 'cc_3',
        campaignId: 'cmp_demo_1',
        name: 'Carlos Oliveira',
        phoneNumber: '+5591977777777',
        customAttributes: { cidade: 'Castanhal' },
        status: 'pendente',
      },
    ],
    campaignLogs: [],
  };
}

class Database {
  private data: DbSchema;
  private cloudSyncTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDirectory();
    this.data = this.load();
    // Non-blocking cloud hydration from Firestore
    this.initCloudSync();
  }

  public async initCloudSync() {
    try {
      const cloudData = await pullStateFromFirestore();
      if (cloudData && (cloudData.campaigns || cloudData.contactLists || cloudData.chatwootConnections)) {
        console.log(`[CloudSync] Restoring state from Firebase Firestore...`);
        if (Array.isArray(cloudData.campaigns) && cloudData.campaigns.length > 0) {
          this.data.campaigns = cloudData.campaigns;
        }
        if (Array.isArray(cloudData.campaignContacts) && cloudData.campaignContacts.length > 0) {
          this.data.campaignContacts = cloudData.campaignContacts;
        }
        if (Array.isArray(cloudData.campaignLogs) && cloudData.campaignLogs.length > 0) {
          this.data.campaignLogs = cloudData.campaignLogs;
        }
        if (Array.isArray(cloudData.contactLists) && cloudData.contactLists.length > 0) {
          this.data.contactLists = cloudData.contactLists;
        }
        if (Array.isArray(cloudData.contacts) && cloudData.contacts.length > 0) {
          this.data.contacts = cloudData.contacts;
        }
        if (Array.isArray(cloudData.templates) && cloudData.templates.length > 0) {
          this.data.templates = cloudData.templates;
        }
        if (Array.isArray(cloudData.chatwootConnections) && cloudData.chatwootConnections.length > 0) {
          this.data.chatwootConnections = cloudData.chatwootConnections;
        }
        if (cloudData.openaiSettings) {
          this.data.openaiSettings = { ...this.data.openaiSettings, ...cloudData.openaiSettings };
        }
        this.saveDiskOnly();
        console.log(`[CloudSync] State restored: ${this.data.campaigns.length} campaigns, ${this.data.contactLists.length} lists, ${this.data.chatwootConnections.length} connections.`);
      }
    } catch (err) {
      console.warn('[CloudSync] Cloud sync initialization notice:', err);
    }
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load(): DbSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        // Ensure all arrays and keys exist in case of schema additions
        const defaults = getDefaultDatabase();
        return {
          users: parsed.users || defaults.users,
          chatwootConnections: parsed.chatwootConnections || defaults.chatwootConnections,
          openaiSettings: { ...defaults.openaiSettings, ...(parsed.openaiSettings || {}) },
          templates: parsed.templates || defaults.templates,
          contactLists: parsed.contactLists || defaults.contactLists,
          contacts: parsed.contacts || defaults.contacts,
          campaigns: parsed.campaigns || defaults.campaigns,
          campaignContacts: parsed.campaignContacts || defaults.campaignContacts,
          campaignLogs: parsed.campaignLogs || defaults.campaignLogs,
        };
      }
    } catch (err) {
      console.error('Error loading db.json, falling back to default:', err);
    }
    const def = getDefaultDatabase();
    this.saveDiskOnly(def);
    return def;
  }

  private saveDiskOnly(dataToSave: DbSchema = this.data) {
    try {
      this.ensureDirectory();
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(dataToSave, null, 2), 'utf8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Failed to write db.json:', err);
    }
  }

  private save(dataToSave: DbSchema = this.data) {
    this.saveDiskOnly(dataToSave);

    // Debounce cloud push to Firestore by 1.5s
    if (this.cloudSyncTimer) {
      clearTimeout(this.cloudSyncTimer);
    }
    this.cloudSyncTimer = setTimeout(() => {
      pushStateToFirestore(this.data).catch((err) => {
        console.warn('[CloudSync] Background push error:', err);
      });
    }, 1500);
  }

  public async forceCloudBackup(): Promise<boolean> {
    return pushStateToFirestore(this.data);
  }

  public restoreFromPayload(backup: Partial<DbSchema>): boolean {
    if (!backup) return false;
    if (Array.isArray(backup.campaigns)) this.data.campaigns = backup.campaigns;
    if (Array.isArray(backup.campaignContacts)) this.data.campaignContacts = backup.campaignContacts;
    if (Array.isArray(backup.campaignLogs)) this.data.campaignLogs = backup.campaignLogs;
    if (Array.isArray(backup.contactLists)) this.data.contactLists = backup.contactLists;
    if (Array.isArray(backup.contacts)) this.data.contacts = backup.contacts;
    if (Array.isArray(backup.templates)) this.data.templates = backup.templates;
    if (Array.isArray(backup.chatwootConnections)) this.data.chatwootConnections = backup.chatwootConnections;
    if (backup.openaiSettings) this.data.openaiSettings = { ...this.data.openaiSettings, ...backup.openaiSettings };
    this.save();
    return true;
  }

  public getRawData(): DbSchema {
    return this.data;
  }

  // --- Users ---
  public findUserByUsername(username: string) {
    return this.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  }

  public findUserById(id: string) {
    return this.data.users.find((u) => u.id === id);
  }

  public updateUserCredentials(id: string, newUsername?: string, newPassword?: string) {
    const user = this.data.users.find((u) => u.id === id);
    if (!user) return null;
    if (newUsername) {
      user.username = newUsername;
    }
    if (newPassword) {
      user.passwordHash = hashPassword(newPassword);
    }
    user.updatedAt = new Date().toISOString();
    this.save();
    return { id: user.id, username: user.username, createdAt: user.createdAt, updatedAt: user.updatedAt };
  }

  // --- Chatwoot Connections ---
  public getChatwootConnections(): ChatwootConnection[] {
    return this.data.chatwootConnections.map((c) => ({
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      accountId: c.accountId,
      apiAccessToken: c.encryptedToken ? '••••••••' + decryptSecret(c.encryptedToken).slice(-4) : '',
      active: c.active,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  public getChatwootConnectionDecrypted(id: string): (ChatwootConnection & { rawToken: string }) | null {
    const conn = this.data.chatwootConnections.find((c) => c.id === id);
    if (!conn) return null;
    return {
      ...conn,
      apiAccessToken: '••••••••',
      rawToken: decryptSecret(conn.encryptedToken),
    };
  }

  public addChatwootConnection(data: {
    name: string;
    baseUrl: string;
    accountId: number;
    apiAccessToken: string;
    active: boolean;
  }): ChatwootConnection {
    const id = `cw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const encryptedToken = encryptSecret(data.apiAccessToken);
    const newConn = {
      id,
      name: data.name,
      baseUrl: data.baseUrl.replace(/\/+$/, ''), // strip trailing slash
      accountId: Number(data.accountId),
      apiAccessToken: '••••••••' + data.apiAccessToken.slice(-4),
      encryptedToken,
      active: data.active,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.chatwootConnections.push(newConn);
    this.save();
    return {
      id: newConn.id,
      name: newConn.name,
      baseUrl: newConn.baseUrl,
      accountId: newConn.accountId,
      apiAccessToken: newConn.apiAccessToken,
      active: newConn.active,
      createdAt: newConn.createdAt,
      updatedAt: newConn.updatedAt,
    };
  }

  public updateChatwootConnection(
    id: string,
    updates: Partial<{
      name: string;
      baseUrl: string;
      accountId: number;
      apiAccessToken: string;
      active: boolean;
    }>
  ) {
    const conn = this.data.chatwootConnections.find((c) => c.id === id);
    if (!conn) return null;
    if (updates.name !== undefined) conn.name = updates.name;
    if (updates.baseUrl !== undefined) conn.baseUrl = updates.baseUrl.replace(/\/+$/, '');
    if (updates.accountId !== undefined) conn.accountId = Number(updates.accountId);
    if (updates.active !== undefined) conn.active = updates.active;
    if (updates.apiAccessToken) {
      conn.encryptedToken = encryptSecret(updates.apiAccessToken);
      conn.apiAccessToken = '••••••••' + updates.apiAccessToken.slice(-4);
    }
    conn.updatedAt = new Date().toISOString();
    this.save();
    return {
      id: conn.id,
      name: conn.name,
      baseUrl: conn.baseUrl,
      accountId: conn.accountId,
      apiAccessToken: conn.apiAccessToken,
      active: conn.active,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    };
  }

  public deleteChatwootConnection(id: string): boolean {
    const idx = this.data.chatwootConnections.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    this.data.chatwootConnections.splice(idx, 1);
    this.save();
    return true;
  }

  // --- OpenAI Settings ---
  public getOpenAISettings(): OpenAISettings {
    const s = this.data.openaiSettings;
    const rawKey = decryptSecret(s.encryptedApiKey);
    return {
      apiKey: rawKey ? '••••••••' + rawKey.slice(-4) : '',
      model: s.model || 'gpt-4o-mini',
      defaultCount: s.defaultCount || 5,
      defaultPrompt: s.defaultPrompt || '',
      updatedAt: s.updatedAt || new Date().toISOString(),
    };
  }

  public getRawOpenAIKey(): string {
    return decryptSecret(this.data.openaiSettings.encryptedApiKey) || process.env.OPENAI_API_KEY || '';
  }

  public updateOpenAISettings(settings: Partial<OpenAISettings>) {
    if (settings.apiKey) {
      this.data.openaiSettings.encryptedApiKey = encryptSecret(settings.apiKey);
    }
    if (settings.model) this.data.openaiSettings.model = settings.model;
    if (settings.defaultCount) this.data.openaiSettings.defaultCount = Number(settings.defaultCount);
    if (settings.defaultPrompt !== undefined) this.data.openaiSettings.defaultPrompt = settings.defaultPrompt;
    this.data.openaiSettings.updatedAt = new Date().toISOString();
    this.save();
    return this.getOpenAISettings();
  }

  // --- Templates ---
  public getTemplates(): MessageTemplate[] {
    return this.data.templates;
  }

  public getTemplate(id: string): MessageTemplate | undefined {
    return this.data.templates.find((t) => t.id === id);
  }

  public addTemplate(tmpl: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): MessageTemplate {
    const newTmpl: MessageTemplate = {
      id: `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: tmpl.title,
      category: tmpl.category,
      content: tmpl.content,
      mediaUrl: tmpl.mediaUrl,
      mediaFilename: tmpl.mediaFilename,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.templates.unshift(newTmpl);
    this.save();
    return newTmpl;
  }

  public updateTemplate(id: string, updates: Partial<MessageTemplate>): MessageTemplate | null {
    const tmpl = this.data.templates.find((t) => t.id === id);
    if (!tmpl) return null;
    Object.assign(tmpl, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return tmpl;
  }

  public incrementTemplateUsage(id: string) {
    const tmpl = this.data.templates.find((t) => t.id === id);
    if (tmpl) {
      tmpl.usageCount = (tmpl.usageCount || 0) + 1;
      tmpl.lastUsedAt = new Date().toISOString();
      this.save();
    }
  }

  public deleteTemplate(id: string): boolean {
    const idx = this.data.templates.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.data.templates.splice(idx, 1);
    this.save();
    return true;
  }

  // --- Contact Lists & Contacts ---
  public getContactLists(): ContactList[] {
    return this.data.contactLists;
  }

  public getContactListById(id: string): ContactList | undefined {
    return this.data.contactLists.find((l) => l.id === id);
  }

  public getContactsByListId(listId: string): ContactItem[] {
    return this.data.contacts.filter((c) => c.listId === listId);
  }

  public createContactList(name: string, description: string, contacts: Omit<ContactItem, 'id'>[]): ContactList {
    const listId = `list_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newList: ContactList = {
      id: listId,
      name,
      description,
      contactCount: contacts.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.contactLists.unshift(newList);

    for (const c of contacts) {
      this.data.contacts.push({
        id: `ct_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        listId,
        name: c.name,
        phoneNumber: c.phoneNumber,
        customAttributes: c.customAttributes || {},
        createdAt: new Date().toISOString(),
      });
    }

    this.save();
    return newList;
  }

  public deleteContactList(id: string): boolean {
    const idx = this.data.contactLists.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    this.data.contactLists.splice(idx, 1);
    this.data.contacts = this.data.contacts.filter((c) => c.listId !== id);
    this.save();
    return true;
  }

  // --- Campaigns ---
  public getCampaigns(): Campaign[] {
    const list = Array.isArray(this.data?.campaigns) ? this.data.campaigns : [];
    return [...list].sort((a, b) => {
      const timeA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });
  }

  public getCampaignById(id: string): Campaign | undefined {
    if (!id) return undefined;
    const cleanId = String(id).trim();
    return this.data.campaigns.find((c) => c.id === cleanId);
  }

  public createCampaign(campaign: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'sentCount' | 'failedCount' | 'pendingCount'>, contacts: Array<{ name: string; phoneNumber: string; customAttributes?: Record<string, string> }>): Campaign {
    const id = `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const todayStr = new Date().toLocaleDateString('en-CA');
    const newCamp: Campaign = {
      ...campaign,
      id,
      sentCount: 0,
      failedCount: 0,
      pendingCount: contacts.length,
      totalContacts: contacts.length,
      sentTodayCount: 0,
      lastDailyResetDate: todayStr,
      isRestingDailyLimit: false,
      dailyLimit: Number(campaign.dailyLimit) || 0,
      businessHoursStart: campaign.businessHoursStart || '09:00',
      businessHoursEnd: campaign.businessHoursEnd || '18:00',
      businessDaysOnly: Boolean(campaign.businessDaysOnly),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.campaigns.unshift(newCamp);

    // Save campaign contacts
    for (const c of contacts) {
      this.data.campaignContacts.push({
        id: `cc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        campaignId: id,
        name: c.name,
        phoneNumber: c.phoneNumber,
        customAttributes: c.customAttributes || {},
        status: 'pendente',
      });
    }

    this.save();
    return newCamp;
  }

  public updateCampaign(id: string, updates: Partial<Campaign>): Campaign | null {
    if (!id) return null;
    const cleanId = String(id).trim();
    const camp = this.data.campaigns.find((c) => c.id === cleanId);
    if (!camp) return null;
    Object.assign(camp, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return camp;
  }

  public deleteCampaign(id: string): boolean {
    if (!id) return false;
    const cleanId = String(id).trim();
    const campaigns = Array.isArray(this.data?.campaigns) ? this.data.campaigns : [];
    const idx = campaigns.findIndex((c) => c && c.id === cleanId);
    if (idx === -1) return false;
    campaigns.splice(idx, 1);
    this.data.campaignContacts = (this.data.campaignContacts || []).filter((c) => c && c.campaignId !== cleanId);
    this.data.campaignLogs = (this.data.campaignLogs || []).filter((l) => l && l.campaignId !== cleanId);
    this.save();
    return true;
  }

  public getCampaignContacts(campaignId: string): StoredCampaignContact[] {
    const list = Array.isArray(this.data?.campaignContacts) ? this.data.campaignContacts : [];
    return list.filter((c) => c && c.campaignId === campaignId);
  }

  public updateCampaignContactStatus(
    contactId: string,
    status: 'enviado' | 'erro',
    messageSent: string,
    errorMessage?: string,
    chatwootConversationId?: number
  ) {
    const list = Array.isArray(this.data?.campaignContacts) ? this.data.campaignContacts : [];
    const c = list.find((item) => item && item.id === contactId);
    if (c) {
      c.status = status;
      c.messageSent = messageSent;
      c.sentAt = new Date().toISOString();
      c.errorMessage = errorMessage;
      c.chatwootConversationId = chatwootConversationId;
      this.save();
    }
  }

  // --- Campaign Logs ---
  public addCampaignLog(log: Omit<CampaignContactLog, 'id' | 'timestamp'>): CampaignContactLog {
    const newLog: CampaignContactLog = {
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
    };
    if (!Array.isArray(this.data.campaignLogs)) {
      this.data.campaignLogs = [];
    }
    this.data.campaignLogs.unshift(newLog);
    // Keep max 5000 logs in memory/disk to prevent unlimited growth
    if (this.data.campaignLogs.length > 5000) {
      this.data.campaignLogs.length = 5000;
    }
    this.save();
    return newLog;
  }

  public getCampaignLogs(campaignId: string): CampaignContactLog[] {
    const list = Array.isArray(this.data?.campaignLogs) ? this.data.campaignLogs : [];
    return list.filter((l) => l && l.campaignId === campaignId);
  }

  // --- Metrics ---
  public getDashboardMetrics(): {
    totalCampaigns: number;
    activeCampaigns: number;
    sentToday: number;
    sentThisMonth: number;
    failedCount: number;
    totalContacts: number;
  } {
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      let sentToday = 0;
      let sentThisMonth = 0;
      let failedCount = 0;

      const logs = Array.isArray(this.data?.campaignLogs) ? this.data.campaignLogs : [];
      for (const log of logs) {
        if (!log) continue;
        const logTime = log.timestamp ? new Date(log.timestamp).getTime() : 0;
        if (log.status === 'enviado') {
          if (!isNaN(logTime)) {
            if (logTime >= startOfToday) sentToday++;
            if (logTime >= startOfMonth) sentThisMonth++;
          } else {
            sentToday++;
            sentThisMonth++;
          }
        } else if (log.status === 'erro') {
          failedCount++;
        }
      }

      const campaigns = Array.isArray(this.data?.campaigns) ? this.data.campaigns : [];
      const activeCampaigns = campaigns.filter((c) => c && c.status === 'Em andamento').length;
      const contacts = Array.isArray(this.data?.contacts) ? this.data.contacts : [];

      return {
        totalCampaigns: campaigns.length,
        activeCampaigns,
        sentToday,
        sentThisMonth,
        failedCount,
        totalContacts: contacts.length,
      };
    } catch (err) {
      console.error('Error computing dashboard metrics:', err);
      return {
        totalCampaigns: 0,
        activeCampaigns: 0,
        sentToday: 0,
        sentThisMonth: 0,
        failedCount: 0,
        totalContacts: 0,
      };
    }
  }
}

export const db = new Database();
