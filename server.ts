import 'dotenv/config';
import fs from 'fs';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, verifyPassword } from './src/server/db.ts';
import { authMiddleware, generateSessionToken } from './src/server/auth.ts';
import {
  getChatwootInboxes,
  createOrGetContact,
  sendChatwootMessage,
  getChatwootKanbanItems,
  getChatwootKanbanMetadata,
} from './src/server/chatwoot.ts';
import { CampaignQueueManager } from './src/server/queue.ts';
import { generateVariations, testOpenAIConnection } from './src/server/openai.ts';
import { normalizePhoneNumber } from './src/utils/phoneNormalizer.ts';
import type { Campaign } from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Ensure uploads directory exists and is statically served
const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(express.json({ limit: '20mb' }));

// Media upload endpoint for campaign photos and captions
app.post('/api/upload-media', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { dataUrl, base64, filename, mimeType } = req.body;
    let fileBuffer: Buffer | null = null;
    let targetMime = mimeType || 'image/jpeg';
    let targetExt = 'jpg';

    if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
      const match = dataUrl.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
      if (match) {
        targetMime = match[1];
        fileBuffer = Buffer.from(match[2], 'base64');
        targetExt = targetMime.split('/')[1]?.split(';')[0] || 'jpg';
      }
    } else if (base64 && typeof base64 === 'string') {
      fileBuffer = Buffer.from(base64, 'base64');
      if (filename && filename.includes('.')) {
        targetExt = filename.split('.').pop() || 'jpg';
      }
    }

    if (!fileBuffer) {
      res.status(400).json({ error: 'Nenhum dado de imagem recebido.' });
      return;
    }

    const safeName = (filename || 'imagem')
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .slice(0, 50);
    const uniqueFilename = `${Date.now()}_${safeName.endsWith('.' + targetExt) ? safeName : safeName + '.' + targetExt}`;
    const destination = path.join(UPLOADS_DIR, uniqueFilename);

    fs.writeFileSync(destination, fileBuffer);

    res.json({
      url: `/uploads/${uniqueFilename}`,
      filename: uniqueFilename,
      mimeType: targetMime,
      size: fileBuffer.length,
    });
  } catch (err: unknown) {
    res.status(500).json({
      error: 'Erro ao fazer upload da imagem: ' + (err instanceof Error ? err.message : String(err)),
    });
  }
});

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    return;
  }

  const user = db.findUserByUsername(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Credenciais inválidas. Verifique usuário e senha.' });
    return;
  }

  const token = generateSessionToken(user.id, user.username);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
    },
  });
});

app.get('/api/auth/me', authMiddleware, (req: Request, res: Response) => {
  const sessionUser = (req as any).user;
  const user = db.findUserById(sessionUser.userId);
  if (!user) {
    res.status(404).json({ error: 'Usuário não encontrado.' });
    return;
  }
  res.json({
    user: {
      id: user.id,
      username: user.username,
    },
  });
});

app.put('/api/auth/profile', authMiddleware, (req: Request, res: Response) => {
  const sessionUser = (req as any).user;
  const { currentPassword, newUsername, newPassword } = req.body;

  const user = db.findUserById(sessionUser.userId);
  if (!user) {
    res.status(404).json({ error: 'Usuário não encontrado.' });
    return;
  }

  if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
    res.status(400).json({ error: 'Senha atual incorreta.' });
    return;
  }

  const updated = db.updateUserCredentials(user.id, newUsername, newPassword);
  res.json({ success: true, user: updated });
});

// -------------------------------------------------------------
// Chatwoot Connections Endpoints
// -------------------------------------------------------------
app.get('/api/connections', authMiddleware, (_req: Request, res: Response) => {
  const connections = db.getChatwootConnections();
  res.json(connections);
});

app.post('/api/connections', authMiddleware, (req: Request, res: Response) => {
  const { name, baseUrl, accountId, apiAccessToken, active } = req.body;
  if (!name || !baseUrl || !accountId || !apiAccessToken) {
    res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos.' });
    return;
  }

  const newConn = db.addChatwootConnection({
    name,
    baseUrl,
    accountId: Number(accountId),
    apiAccessToken,
    active: active !== undefined ? active : true,
  });

  res.status(201).json(newConn);
});

app.put('/api/connections/:id', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const updated = db.updateChatwootConnection(id, req.body);
  if (!updated) {
    res.status(404).json({ error: 'Conexão não encontrada.' });
    return;
  }
  res.json(updated);
});

app.delete('/api/connections/:id', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const success = db.deleteChatwootConnection(id);
  res.json({ success });
});

// Test connection live using provided credentials or stored ID
app.post('/api/connections/test', authMiddleware, async (req: Request, res: Response) => {
  const { connectionId, baseUrl, accountId, apiAccessToken } = req.body;

  let testBaseUrl = baseUrl;
  let testAccountId = accountId;
  let testToken = apiAccessToken;

  if (connectionId) {
    const conn = db.getChatwootConnectionDecrypted(connectionId);
    if (!conn) {
      res.status(404).json({ success: false, error: 'Conexão salva não encontrada.' });
      return;
    }
    testBaseUrl = conn.baseUrl;
    testAccountId = conn.accountId;
    testToken = conn.rawToken;
  }

  if (!testBaseUrl || !testAccountId || !testToken) {
    res.status(400).json({ success: false, error: 'Credenciais incompletas para teste.' });
    return;
  }

  const result = await getChatwootInboxes({
    baseUrl: testBaseUrl,
    accountId: Number(testAccountId),
    apiAccessToken: testToken,
  });

  res.json(result);
});

// Fetch inboxes for a saved connection
app.get('/api/connections/:id/inboxes', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const conn = db.getChatwootConnectionDecrypted(id);
  if (!conn) {
    res.status(404).json({ error: 'Conexão não encontrada.' });
    return;
  }

  const result = await getChatwootInboxes({
    baseUrl: conn.baseUrl,
    accountId: conn.accountId,
    apiAccessToken: conn.rawToken,
  });

  if (!result.success) {
    res.status(400).json({ error: result.error, inboxes: [] });
    return;
  }

  res.json(result.inboxes);
});

// Fetch Kanban metadata (funnels, stages, agents) for a saved Chatwoot connection
app.get('/api/connections/:id/kanban-metadata', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const conn = db.getChatwootConnectionDecrypted(id);
  if (!conn) {
    res.status(404).json({ error: 'Conexão não encontrada.' });
    return;
  }

  const result = await getChatwootKanbanMetadata({
    baseUrl: conn.baseUrl,
    accountId: conn.accountId,
    apiAccessToken: conn.rawToken,
  });

  res.json(result);
});

// Query Kanban items from Chatwoot using account credentials and filters
app.post('/api/connections/:id/kanban-items', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { funnelId, stageId, agentId, page, priorities, fetchAllPages } = req.body;

  const conn = db.getChatwootConnectionDecrypted(id);
  if (!conn) {
    res.status(404).json({ error: 'Conexão não encontrada.' });
    return;
  }

  const result = await getChatwootKanbanItems(
    {
      baseUrl: conn.baseUrl,
      accountId: conn.accountId,
      apiAccessToken: conn.rawToken,
    },
    {
      funnelId,
      stageId,
      agentId,
      page: Number(page) || 1,
      priorities: Array.isArray(priorities) ? priorities : [],
      fetchAllPages: fetchAllPages !== undefined ? Boolean(fetchAllPages) : true,
    }
  );

  if (!result.success) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});

// -------------------------------------------------------------
// Message Templates Endpoints
// -------------------------------------------------------------
app.get('/api/templates', authMiddleware, (_req: Request, res: Response) => {
  res.json(db.getTemplates());
});

app.post('/api/templates', authMiddleware, (req: Request, res: Response) => {
  const { title, category, content, mediaUrl, mediaFilename } = req.body;
  if (!title || !content) {
    res.status(400).json({ error: 'Título e conteúdo são obrigatórios.' });
    return;
  }
  const created = db.addTemplate({
    title,
    category: category || 'Geral',
    content,
    mediaUrl,
    mediaFilename,
  });
  res.status(201).json(created);
});

app.put('/api/templates/:id', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const updated = db.updateTemplate(id, req.body);
  if (!updated) {
    res.status(404).json({ error: 'Template não encontrado.' });
    return;
  }
  res.json(updated);
});

app.delete('/api/templates/:id', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const success = db.deleteTemplate(id);
  res.json({ success });
});

// -------------------------------------------------------------
// Contact Lists Endpoints
// -------------------------------------------------------------
app.get('/api/contact-lists', authMiddleware, (_req: Request, res: Response) => {
  res.json(db.getContactLists());
});

app.get('/api/contact-lists/:id', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const list = db.getContactListById(id);
  if (!list) {
    res.status(404).json({ error: 'Lista não encontrada.' });
    return;
  }
  const contacts = db.getContactsByListId(id);
  res.json({ ...list, contacts });
});

app.post('/api/contact-lists', authMiddleware, (req: Request, res: Response) => {
  const { name, description, contacts } = req.body;
  if (!name || !Array.isArray(contacts) || contacts.length === 0) {
    res.status(400).json({ error: 'Nome da lista e contatos válidos são obrigatórios.' });
    return;
  }

  const created = db.createContactList(name, description || '', contacts);
  res.status(201).json(created);
});

app.delete('/api/contact-lists/:id', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const success = db.deleteContactList(id);
  res.json({ success });
});

// -------------------------------------------------------------
// Campaigns Endpoints
// -------------------------------------------------------------
app.get('/api/campaigns', authMiddleware, (_req: Request, res: Response) => {
  const campaigns = db.getCampaigns();
  res.json(campaigns);
});

app.get('/api/campaigns/:id', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const campaign = db.getCampaignById(id);
  if (!campaign) {
    res.status(404).json({ error: 'Campanha não encontrada.' });
    return;
  }
  const contacts = db.getCampaignContacts(id);
  const logs = db.getCampaignLogs(id);
  const isRunning = CampaignQueueManager.isRunning(id);

  res.json({
    ...campaign,
    contacts,
    logs,
    isRunning,
  });
});

app.post('/api/campaigns', authMiddleware, (req: Request, res: Response) => {
  const {
    name,
    description,
    connectionId,
    connectionName,
    inboxId,
    inboxName,
    inboxes,
    inboxRotation = 'round-robin',
    status = 'Rascunho',
    minDelaySeconds = 15,
    maxDelaySeconds = 30,
    batchSize = 50,
    batchPauseMinutes = 0,
    dailyLimit = 0,
    businessHoursStart = '09:00',
    businessHoursEnd = '18:00',
    businessDaysOnly = false,
    baseMessage,
    variations = [],
    mediaUrl,
    mediaFilename,
    contactListId,
    contacts = [],
  } = req.body;

  const validInboxes = Array.isArray(inboxes) && inboxes.length > 0 ? inboxes : undefined;
  const primaryInboxId = inboxId ? Number(inboxId) : validInboxes ? Number(validInboxes[0].inboxId) : undefined;

  if (!name || !connectionId || !primaryInboxId || !baseMessage || !Array.isArray(contacts) || contacts.length === 0) {
    res.status(400).json({ error: 'Dados incompletos para criação de campanha.' });
    return;
  }

  const primaryInboxName =
    inboxName ||
    (validInboxes && validInboxes.length > 1
      ? `Rotativo (${validInboxes.length} canais: ${validInboxes.map((i: any) => i.inboxName).join(', ')})`
      : validInboxes
      ? validInboxes[0].inboxName
      : `Inbox #${primaryInboxId}`);

  const newCampaign = db.createCampaign(
    {
      name,
      description,
      connectionId,
      connectionName: connectionName || 'Conexão Chatwoot',
      inboxId: primaryInboxId,
      inboxName: primaryInboxName,
      inboxes: validInboxes,
      inboxRotation: validInboxes && validInboxes.length > 1 ? (inboxRotation as 'round-robin' | 'random') : undefined,
      status,
      minDelaySeconds: Number(minDelaySeconds) || 15,
      maxDelaySeconds: Number(maxDelaySeconds) || 30,
      batchSize: Number(batchSize) || 50,
      batchPauseMinutes: Number(batchPauseMinutes) || 0,
      dailyLimit: Number(dailyLimit) || 0,
      businessHoursStart: businessHoursStart || '09:00',
      businessHoursEnd: businessHoursEnd || '18:00',
      businessDaysOnly: Boolean(businessDaysOnly),
      totalContacts: contacts.length,
      baseMessage,
      variations: variations.length > 0 ? variations : [baseMessage],
      mediaUrl: mediaUrl || undefined,
      mediaFilename: mediaFilename || undefined,
      contactListId,
    },
    contacts
  );

  // If user requested to immediately start:
  if (status === 'Em andamento') {
    CampaignQueueManager.startCampaign(newCampaign.id);
  }

  res.status(201).json(newCampaign);
});

app.post('/api/campaigns/:id/start', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await CampaignQueueManager.startCampaign(id);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/campaigns/:id/pause', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const result = CampaignQueueManager.pauseCampaign(id);
  res.json(result);
});

app.post('/api/campaigns/:id/skip-pause', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const result = CampaignQueueManager.skipBatchPause(id);
  res.json(result);
});

app.post('/api/campaigns/:id/skip-daily-pause', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const result = CampaignQueueManager.skipDailyPause(id);
  res.json(result);
});

app.patch('/api/campaigns/:id/settings', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    dailyLimit,
    businessHoursStart,
    businessHoursEnd,
    businessDaysOnly,
    batchSize,
    batchPauseMinutes,
    minDelaySeconds,
    maxDelaySeconds,
  } = req.body;

  const updates: Partial<Campaign> = {};
  if (dailyLimit !== undefined) updates.dailyLimit = Number(dailyLimit) || 0;
  if (businessHoursStart !== undefined) updates.businessHoursStart = businessHoursStart;
  if (businessHoursEnd !== undefined) updates.businessHoursEnd = businessHoursEnd;
  if (businessDaysOnly !== undefined) updates.businessDaysOnly = Boolean(businessDaysOnly);
  if (batchSize !== undefined) updates.batchSize = Number(batchSize) || 50;
  if (batchPauseMinutes !== undefined) updates.batchPauseMinutes = Number(batchPauseMinutes) || 0;
  if (minDelaySeconds !== undefined) updates.minDelaySeconds = Number(minDelaySeconds) || 15;
  if (maxDelaySeconds !== undefined) updates.maxDelaySeconds = Number(maxDelaySeconds) || 30;

  const updated = db.updateCampaign(id, updates);
  if (!updated) {
    res.status(404).json({ error: 'Campanha não encontrada.' });
    return;
  }
  res.json(updated);
});

app.post('/api/campaigns/:id/cancel', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const result = CampaignQueueManager.cancelCampaign(id);
  res.json(result);
});

app.delete('/api/campaigns/:id', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const success = CampaignQueueManager.cancelAndRemoveCampaign(id);
  if (!success) {
    res.status(404).json({ error: 'Campanha não encontrada.' });
    return;
  }
  res.json({ success: true, message: 'Campanha excluída com sucesso.' });
});

// Test send single message to a phone number (supports photo with caption)
app.post('/api/campaigns/test-send', authMiddleware, async (req: Request, res: Response) => {
  const { connectionId, inboxId, phoneNumber, message, contactName = 'Teste', mediaUrl } = req.body;

  if (!connectionId || !inboxId || !phoneNumber || !message) {
    res.status(400).json({ success: false, error: 'Parâmetros incompletos para envio de teste.' });
    return;
  }

  const conn = db.getChatwootConnectionDecrypted(connectionId);
  if (!conn) {
    res.status(404).json({ success: false, error: 'Conexão Chatwoot não encontrada.' });
    return;
  }

  const norm = normalizePhoneNumber(phoneNumber);
  const targetPhone = norm.isValid ? norm.e164 : phoneNumber;

  const chatwootConfig = {
    baseUrl: conn.baseUrl,
    accountId: conn.accountId,
    apiAccessToken: conn.rawToken,
  };

  try {
    const contactRes = await createOrGetContact(chatwootConfig, {
      inboxId: Number(inboxId),
      name: contactName,
      phoneNumber: targetPhone,
    });

    if (!contactRes.success || !contactRes.contactId) {
      res.status(400).json({
        success: false,
        error: contactRes.error || 'Falha ao sincronizar contato de teste no Chatwoot.',
      });
      return;
    }

    const msgRes = await sendChatwootMessage(chatwootConfig, {
      inboxId: Number(inboxId),
      contactId: contactRes.contactId,
      content: message,
      mediaUrl: mediaUrl || undefined,
    });

    if (!msgRes.success) {
      res.status(400).json({
        success: false,
        error: msgRes.error || 'Falha ao enviar mensagem de teste.',
      });
      return;
    }

    res.json({
      success: true,
      message: `Mensagem de teste enviada com sucesso para ${norm.formatted || targetPhone}!`,
      conversationId: msgRes.conversationId,
    });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// -------------------------------------------------------------
// OpenAI & AI Variations Endpoints
// -------------------------------------------------------------
app.post('/api/ai/variations', authMiddleware, async (req: Request, res: Response) => {
  const { baseMessage, count = 5, tone = 'padrão', customInstructions } = req.body;
  const result = await generateVariations({
    baseMessage,
    count: Math.min(10, Math.max(1, Number(count) || 5)),
    tone,
    customInstructions,
  });

  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.get('/api/settings/openai', authMiddleware, (_req: Request, res: Response) => {
  res.json(db.getOpenAISettings());
});

app.put('/api/settings/openai', authMiddleware, (req: Request, res: Response) => {
  const updated = db.updateOpenAISettings(req.body);
  res.json(updated);
});

app.post('/api/settings/openai/test', authMiddleware, async (req: Request, res: Response) => {
  const { apiKey, model } = req.body;
  const targetKey = apiKey || db.getRawOpenAIKey();
  if (!targetKey) {
    res.status(400).json({ success: false, message: 'Nenhuma chave informada para teste.' });
    return;
  }
  const result = await testOpenAIConnection(targetKey, model);
  res.json(result);
});

// -------------------------------------------------------------
// Dashboard Metrics Endpoint
// -------------------------------------------------------------
app.get('/api/dashboard', authMiddleware, (_req: Request, res: Response) => {
  try {
    const metrics = db.getDashboardMetrics();
    const campaigns = db.getCampaigns() || [];
    const recentCampaigns = campaigns.slice(0, 5);
    res.json({
      ...metrics,
      recentCampaigns,
    });
  } catch (err: unknown) {
    console.error('Error serving /api/dashboard:', err);
    res.json({
      totalCampaigns: 0,
      activeCampaigns: 0,
      sentToday: 0,
      sentThisMonth: 0,
      failedCount: 0,
      totalContacts: 0,
      recentCampaigns: [],
    });
  }
});

// -------------------------------------------------------------
// Cloud Sync & Persistent Backup Endpoints
// -------------------------------------------------------------
app.get('/api/sync/status', authMiddleware, (_req: Request, res: Response) => {
  res.json({
    cloudDatabase: 'Firebase Firestore',
    projectId: 'ai-studio-applet-webapp-cea53',
    status: 'connected',
    campaignsCount: db.getCampaigns().length,
    contactListsCount: db.getContactLists().length,
    connectionsCount: db.getChatwootConnections().length,
  });
});

app.post('/api/sync/backup-now', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const success = await db.forceCloudBackup();
    res.json({
      success,
      message: success
        ? 'Backup permanente salvo no Firebase Firestore com sucesso!'
        : 'Falha ao salvar no Firestore.',
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/sync/export-json', authMiddleware, (_req: Request, res: Response) => {
  const data = db.getRawData();
  const exportPayload = {
    campaigns: data.campaigns || [],
    campaignContacts: data.campaignContacts || [],
    contactLists: data.contactLists || [],
    contacts: data.contacts || [],
    templates: data.templates || [],
    chatwootConnections: data.chatwootConnections || [],
    openaiSettings: data.openaiSettings,
    exportedAt: new Date().toISOString(),
    version: 1,
  };
  res.json(exportPayload);
});

app.post('/api/sync/restore-json', authMiddleware, (req: Request, res: Response) => {
  const backup = req.body;
  if (!backup || typeof backup !== 'object') {
    res.status(400).json({ success: false, error: 'Dados de backup inválidos.' });
    return;
  }
  const restored = db.restoreFromPayload(backup);
  if (!restored) {
    res.status(400).json({ success: false, error: 'Falha ao restaurar dados.' });
    return;
  }
  res.json({
    success: true,
    message: 'Dados restaurados com sucesso!',
    campaignsCount: db.getCampaigns().length,
    contactListsCount: db.getContactLists().length,
  });
});

// -------------------------------------------------------------
// Server & Vite Middleware Configuration
// -------------------------------------------------------------
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SendFlow running on http://0.0.0.0:${PORT}`);
    // Auto resume any campaigns that were active before restart
    CampaignQueueManager.initAutoResume();
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
