import { db } from './db.ts';
import {
  createOrGetContact,
  sendChatwootMessage,
} from './chatwoot.ts';
import { interpolateVariables, normalizePhoneNumber } from '../utils/phoneNormalizer.ts';
import type { CampaignInboxTarget } from '../types/index.ts';

// In-memory registry of running campaign loops
const activeWorkers = new Map<
  string,
  {
    abortController: AbortController;
    wakeUpPause?: () => void;
  }
>();

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Aborted'));
    }
    const timer = setTimeout(() => {
      resolve();
    }, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
      });
    }
  });
}

function sleepWithWakeup(
  ms: number,
  signal: AbortSignal,
  registerWakeup: (wake: () => void) => void
): Promise<'completed' | 'skipped'> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      return reject(new Error('Aborted'));
    }
    let timer: NodeJS.Timeout | null = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };
    const abortHandler = () => {
      cleanup();
      reject(new Error('Aborted'));
    };
    signal.addEventListener('abort', abortHandler, { once: true });

    timer = setTimeout(() => {
      signal.removeEventListener('abort', abortHandler);
      resolve('completed');
    }, ms);

    registerWakeup(() => {
      cleanup();
      signal.removeEventListener('abort', abortHandler);
      resolve('skipped');
    });
  });
}

function getRandomInt(min: number, max: number): number {
  const minVal = Math.ceil(min);
  const maxVal = Math.floor(max);
  return Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
}

/**
 * Calculates the next window for business hours dispatch
 */
export function getNextBusinessWindow(
  startTimeStr = '09:00',
  endTimeStr = '18:00',
  businessDaysOnly = false,
  forceNextDay = false
): { isCurrentlyAllowed: boolean; nextResumeDate: Date; waitMs: number } {
  const now = new Date();
  const [startHour, startMin] = startTimeStr.split(':').map((v) => Number(v) || 0);
  const [endHour, endMin] = endTimeStr.split(':').map((v) => Number(v) || 0);

  let target = new Date(now);

  if (forceNextDay) {
    target.setDate(target.getDate() + 1);
    target.setHours(startHour, startMin, 0, 0);
  } else {
    const todayStart = new Date(now);
    todayStart.setHours(startHour, startMin, 0, 0);

    const todayEnd = new Date(now);
    todayEnd.setHours(endHour, endMin, 0, 0);

    const dayOfWeek = now.getDay(); // 0 is Sunday, 6 is Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (businessDaysOnly && isWeekend) {
      const daysUntilMonday = dayOfWeek === 0 ? 1 : 2;
      target.setDate(target.getDate() + daysUntilMonday);
      target.setHours(startHour, startMin, 0, 0);
    } else if (now.getTime() < todayStart.getTime()) {
      target = todayStart;
    } else if (now.getTime() >= todayEnd.getTime()) {
      target.setDate(target.getDate() + 1);
      target.setHours(startHour, startMin, 0, 0);
    } else {
      return {
        isCurrentlyAllowed: true,
        nextResumeDate: now,
        waitMs: 0,
      };
    }
  }

  if (businessDaysOnly) {
    while (target.getDay() === 0 || target.getDay() === 6) {
      target.setDate(target.getDate() + 1);
      target.setHours(startHour, startMin, 0, 0);
    }
  }

  const waitMs = Math.max(1000, target.getTime() - now.getTime());
  return {
    isCurrentlyAllowed: false,
    nextResumeDate: target,
    waitMs,
  };
}

export class CampaignQueueManager {
  private static watcherInterval: NodeJS.Timeout | null = null;

  /**
   * Start or resume a campaign
   */
  public static async startCampaign(campaignId: string): Promise<{ success: boolean; message: string }> {
    const campaign = db.getCampaignById(campaignId);
    if (!campaign) {
      return { success: false, message: 'Campanha não encontrada' };
    }

    if (activeWorkers.has(campaignId)) {
      return { success: false, message: 'Campanha já está em execução' };
    }

    // Set status to "Em andamento"
    db.updateCampaign(campaignId, {
      status: 'Em andamento',
      startedAt: campaign.startedAt || new Date().toISOString(),
    });

    const abortController = new AbortController();
    activeWorkers.set(campaignId, { abortController });

    // Spawn async background processing loop
    this.runCampaignLoop(campaignId, abortController.signal).catch((err) => {
      console.error(`Campaign worker ${campaignId} error:`, err);
    });

    return { success: true, message: 'Campanha iniciada com sucesso' };
  }

  /**
   * Pause a campaign
   */
  public static pauseCampaign(campaignId: string): { success: boolean; message: string } {
    const worker = activeWorkers.get(campaignId);
    if (worker) {
      if (worker.wakeUpPause) {
        worker.wakeUpPause();
      }
      worker.abortController.abort();
      activeWorkers.delete(campaignId);
    }
    db.updateCampaign(campaignId, {
      status: 'Pausada',
      isRestingBetweenBatches: false,
      isRestingDailyLimit: false,
      resumeAt: undefined,
    });
    return { success: true, message: 'Campanha pausada com sucesso' };
  }

  /**
   * Cancel a campaign
   */
  public static cancelCampaign(campaignId: string): { success: boolean; message: string } {
    const worker = activeWorkers.get(campaignId);
    if (worker) {
      if (worker.wakeUpPause) {
        worker.wakeUpPause();
      }
      worker.abortController.abort();
      activeWorkers.delete(campaignId);
    }
    db.updateCampaign(campaignId, {
      status: 'Cancelada',
      isRestingBetweenBatches: false,
      isRestingDailyLimit: false,
      resumeAt: undefined,
      completedAt: new Date().toISOString(),
    });
    return { success: true, message: 'Campanha cancelada' };
  }

  /**
   * Cancel and delete a campaign completely from database and active queues
   */
  public static cancelAndRemoveCampaign(campaignId: string): boolean {
    const worker = activeWorkers.get(campaignId);
    if (worker) {
      if (worker.wakeUpPause) {
        worker.wakeUpPause();
      }
      worker.abortController.abort();
      activeWorkers.delete(campaignId);
    }
    return db.deleteCampaign(campaignId);
  }

  /**
   * Skip batch anti-ban pause or daily limit pause and immediately resume next dispatch
   */
  public static skipBatchPause(campaignId: string): { success: boolean; message: string } {
    const worker = activeWorkers.get(campaignId);
    const camp = db.getCampaignById(campaignId);

    if (worker && worker.wakeUpPause) {
      worker.wakeUpPause();
      worker.wakeUpPause = undefined;
      db.updateCampaign(campaignId, {
        isRestingBetweenBatches: false,
        isRestingDailyLimit: false,
        resumeAt: undefined,
        // Reset sentTodayCount so user can continue sending today
        sentTodayCount: 0,
      });
      return { success: true, message: 'Pausa ignorada. Retomando envios imediatamente.' };
    } else if (camp && (camp.isRestingDailyLimit || camp.isRestingBetweenBatches)) {
      db.updateCampaign(campaignId, {
        isRestingBetweenBatches: false,
        isRestingDailyLimit: false,
        resumeAt: undefined,
        sentTodayCount: 0,
      });
      this.startCampaign(campaignId);
      return { success: true, message: 'Pausa resetada. Campanha retomada.' };
    }
    return { success: false, message: 'A campanha não está em pausa no momento.' };
  }

  public static skipDailyPause(campaignId: string): { success: boolean; message: string } {
    return this.skipBatchPause(campaignId);
  }

  /**
   * Check if a campaign is currently executing
   */
  public static isRunning(campaignId: string): boolean {
    return activeWorkers.has(campaignId);
  }

  /**
   * Worker loop that iterates through pending contacts, alternates inboxes, and handles batch pauses
   */
  private static async runCampaignLoop(campaignId: string, signal: AbortSignal) {
    let sentInCurrentBatch = 0;

    try {
      while (!signal.aborted) {
        const campaign = db.getCampaignById(campaignId);
        if (!campaign || campaign.status !== 'Em andamento') {
          break;
        }

        // Fetch pending contacts for this campaign
        const allContacts = db.getCampaignContacts(campaignId);
        const pendingContacts = allContacts.filter((c) => c.status === 'pendente');

        if (pendingContacts.length === 0) {
          // All contacts processed! Mark campaign as completed
          db.updateCampaign(campaignId, {
            status: 'Concluída',
            isRestingBetweenBatches: false,
            isRestingDailyLimit: false,
            resumeAt: undefined,
            completedAt: new Date().toISOString(),
          });
          break;
        }

        // -------------------------------------------------------------
        // Daily Limit & Calendar Day Reset Verification
        // -------------------------------------------------------------
        const todayStr = new Date().toLocaleDateString('en-CA');
        let currentSentToday = campaign.sentTodayCount ?? 0;
        if (campaign.lastDailyResetDate !== todayStr) {
          currentSentToday = 0;
          campaign.sentTodayCount = 0;
          campaign.lastDailyResetDate = todayStr;
          campaign.isRestingDailyLimit = false;
          db.updateCampaign(campaignId, {
            sentTodayCount: 0,
            lastDailyResetDate: todayStr,
            isRestingDailyLimit: false,
          });
        }

        // Check if daily limit reached
        const dailyLimit = Number(campaign.dailyLimit) || 0;
        if (dailyLimit > 0 && currentSentToday >= dailyLimit) {
          const nextBusiness = getNextBusinessWindow(
            campaign.businessHoursStart || '09:00',
            campaign.businessHoursEnd || '18:00',
            Boolean(campaign.businessDaysOnly),
            true // forceNextDay
          );

          const formattedDate = nextBusiness.nextResumeDate.toLocaleDateString('pt-BR');
          const formattedTime = nextBusiness.nextResumeDate.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          });

          db.updateCampaign(campaignId, {
            isRestingDailyLimit: true,
            isRestingBetweenBatches: false,
            resumeAt: nextBusiness.nextResumeDate.toISOString(),
          });

          db.addCampaignLog({
            campaignId,
            contactName: 'Proteção Anti-Banimento',
            phoneNumber: '—',
            messageContent: `🛡️ Limite diário de ${dailyLimit} contatos atingido (${currentSentToday}/${dailyLimit}). Campanha pausada para proteção do número. Retomada automática prevista para ${formattedDate} às ${formattedTime} (horário comercial).`,
            channelName: 'Limite Diário',
            status: 'enviado',
          });

          const currentWorker = activeWorkers.get(campaignId);
          const result = await sleepWithWakeup(nextBusiness.waitMs, signal, (wake) => {
            if (currentWorker) {
              currentWorker.wakeUpPause = wake;
            }
          });

          if (currentWorker) {
            currentWorker.wakeUpPause = undefined;
          }

          if (result === 'skipped') {
            // User manually skipped pause, allow extra sends today
            db.updateCampaign(campaignId, {
              isRestingDailyLimit: false,
              resumeAt: undefined,
              sentTodayCount: 0,
            });
          } else {
            // Naturally awakened next day
            db.updateCampaign(campaignId, {
              isRestingDailyLimit: false,
              resumeAt: undefined,
              sentTodayCount: 0,
              lastDailyResetDate: new Date().toLocaleDateString('en-CA'),
            });
          }
          continue;
        }

        // Check if currently inside business hours (if configured)
        if (campaign.businessHoursStart && campaign.businessHoursEnd) {
          const businessCheck = getNextBusinessWindow(
            campaign.businessHoursStart,
            campaign.businessHoursEnd,
            Boolean(campaign.businessDaysOnly),
            false
          );

          if (!businessCheck.isCurrentlyAllowed) {
            const formattedDate = businessCheck.nextResumeDate.toLocaleDateString('pt-BR');
            const formattedTime = businessCheck.nextResumeDate.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            });

            db.updateCampaign(campaignId, {
              isRestingDailyLimit: true,
              resumeAt: businessCheck.nextResumeDate.toISOString(),
            });

            db.addCampaignLog({
              campaignId,
              contactName: 'Horário Comercial',
              phoneNumber: '—',
              messageContent: `⏰ Fora do expediente comercial (${campaign.businessHoursStart} às ${campaign.businessHoursEnd}). Campanha pausada. Retomada automática prevista para ${formattedDate} às ${formattedTime}.`,
              channelName: 'Horário Comercial',
              status: 'enviado',
            });

            const currentWorker = activeWorkers.get(campaignId);
            await sleepWithWakeup(businessCheck.waitMs, signal, (wake) => {
              if (currentWorker) {
                currentWorker.wakeUpPause = wake;
              }
            });

            if (currentWorker) {
              currentWorker.wakeUpPause = undefined;
            }

            db.updateCampaign(campaignId, {
              isRestingDailyLimit: false,
              resumeAt: undefined,
            });
            continue;
          }
        }

        // Process next contact
        const contact = pendingContacts[0];

        // -------------------------------------------------------------
        // Multiple Inboxes Alternation (Round-Robin or Random)
        // -------------------------------------------------------------
        const allInboxes: CampaignInboxTarget[] =
          campaign.inboxes && campaign.inboxes.length > 0
            ? campaign.inboxes
            : [
                {
                  inboxId: campaign.inboxId,
                  inboxName: campaign.inboxName,
                  connectionId: campaign.connectionId,
                  connectionName: campaign.connectionName,
                },
              ];

        // Calculate current sent count to determine round-robin index
        const processedTotal = allContacts.filter((c) => c.status !== 'pendente').length;
        let targetInbox: CampaignInboxTarget;
        if (campaign.inboxRotation === 'random') {
          targetInbox = allInboxes[Math.floor(Math.random() * allInboxes.length)];
        } else {
          // Round-Robin sequential rotation
          targetInbox = allInboxes[processedTotal % allInboxes.length];
        }

        // Determine connection credentials for the target inbox
        const targetConnectionId = targetInbox.connectionId || campaign.connectionId;
        const connWithToken = db.getChatwootConnectionDecrypted(targetConnectionId);
        if (!connWithToken) {
          db.updateCampaign(campaignId, {
            status: 'Com erro',
            lastError: `Conexão Chatwoot associada (${targetConnectionId}) não foi encontrada`,
          });
          break;
        }

        const chatwootConfig = {
          baseUrl: connWithToken.baseUrl,
          accountId: connWithToken.accountId,
          apiAccessToken: connWithToken.rawToken,
        };

        const variations =
          campaign.variations && campaign.variations.length > 0
            ? campaign.variations
            : [campaign.baseMessage];

        // Random distribution variation selection
        const selectedVariation =
          variations[Math.floor(Math.random() * variations.length)] || campaign.baseMessage;

        // Normalize phone number
        const normPhone = normalizePhoneNumber(contact.phoneNumber);
        const targetPhone = normPhone.isValid ? normPhone.e164 : contact.phoneNumber;

        // Build interpolation dictionary
        const varData: Record<string, string> = {
          name: contact.name,
          phone_number: normPhone.formatted || targetPhone,
          telefone: normPhone.formatted || targetPhone,
          ...(contact.customAttributes || {}),
        };

        const finalMessage = interpolateVariables(selectedVariation, varData);

        // Dispatch via Chatwoot using selected inbox
        let dispatchSuccess = false;
        let errorMessage = '';
        let conversationId: number | undefined;

        try {
          // Step 1: Create or get contact in Chatwoot for target inbox
          const contactResult = await createOrGetContact(chatwootConfig, {
            inboxId: targetInbox.inboxId,
            name: contact.name,
            phoneNumber: targetPhone,
            customAttributes: contact.customAttributes,
          });

          if (!contactResult.success || !contactResult.contactId) {
            dispatchSuccess = false;
            errorMessage = contactResult.error || 'Falha ao sincronizar contato no Chatwoot';
          } else {
            // Step 2: Send message to conversation (supports photo with caption)
            const msgResult = await sendChatwootMessage(chatwootConfig, {
              inboxId: targetInbox.inboxId,
              contactId: contactResult.contactId,
              content: finalMessage,
              mediaUrl: campaign.mediaUrl,
            });

            if (msgResult.success) {
              dispatchSuccess = true;
              conversationId = msgResult.conversationId;
            } else {
              dispatchSuccess = false;
              errorMessage = msgResult.error || 'Falha no envio da mensagem';
            }
          }
        } catch (dispatchErr: unknown) {
          dispatchSuccess = false;
          errorMessage = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
        }

        // Update contact record and logs
        const contactStatus = dispatchSuccess ? 'enviado' : 'erro';
        db.updateCampaignContactStatus(
          contact.id,
          contactStatus,
          finalMessage,
          dispatchSuccess ? undefined : errorMessage,
          conversationId
        );

        db.addCampaignLog({
          campaignId,
          contactName: contact.name,
          phoneNumber: normPhone.formatted || targetPhone,
          messageContent: finalMessage,
          mediaUrl: campaign.mediaUrl,
          channelName: targetInbox.inboxName,
          status: contactStatus,
          errorDetails: dispatchSuccess ? undefined : errorMessage,
          chatwootConversationId: conversationId,
        });

        // Update campaign aggregated metrics
        const updatedContacts = db.getCampaignContacts(campaignId);
        const sentCount = updatedContacts.filter((c) => c.status === 'enviado').length;
        const failedCount = updatedContacts.filter((c) => c.status === 'erro').length;
        const pendingCount = updatedContacts.filter((c) => c.status === 'pendente').length;

        const updatedSentToday = (campaign.sentTodayCount || 0) + (dispatchSuccess ? 1 : 0);

        db.updateCampaign(campaignId, {
          sentCount,
          failedCount,
          pendingCount,
          sentTodayCount: updatedSentToday,
        });

        sentInCurrentBatch++;

        // -------------------------------------------------------------
        // Anti-Ban Protection: Batch Pause vs Individual Delay
        // -------------------------------------------------------------
        const batchLimit = campaign.batchSize || 50;
        const pauseMinutes = campaign.batchPauseMinutes || 0;

        if (pauseMinutes > 0 && batchLimit > 0 && sentInCurrentBatch >= batchLimit && pendingCount > 0) {
          // Reached batch threshold! Enter anti-ban resting period
          sentInCurrentBatch = 0; // Reset batch counter
          const pauseMs = Math.round(pauseMinutes * 60 * 1000);
          const resumeAt = new Date(Date.now() + pauseMs).toISOString();

          db.updateCampaign(campaignId, {
            isRestingBetweenBatches: true,
            resumeAt,
          });

          db.addCampaignLog({
            campaignId,
            contactName: 'Proteção Anti-Banimento',
            phoneNumber: '—',
            messageContent: `🛡️ Pausa estratégica de ${pauseMinutes} minutos ativada após lote de ${batchLimit} mensagens. Retomada automática prevista para às ${new Date(resumeAt).toLocaleTimeString('pt-BR')}.`,
            channelName: 'Anti-Banimento',
            status: 'enviado',
          });

          const currentWorker = activeWorkers.get(campaignId);
          await sleepWithWakeup(pauseMs, signal, (wake) => {
            if (currentWorker) {
              currentWorker.wakeUpPause = wake;
            }
          });

          // Finished resting or skipped!
          if (currentWorker) {
            currentWorker.wakeUpPause = undefined;
          }

          db.updateCampaign(campaignId, {
            isRestingBetweenBatches: false,
            resumeAt: undefined,
          });
        } else if (pendingCount > 0) {
          // Standard cadence delay between individual messages
          const minSec = Math.max(1, campaign.minDelaySeconds || 15);
          const maxSec = Math.max(minSec, campaign.maxDelaySeconds || 30);
          const delaySeconds = getRandomInt(minSec, maxSec);
          await sleep(delaySeconds * 1000, signal);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Aborted') {
        // Paused or cancelled cleanly
        return;
      }
      console.error(`Campaign ${campaignId} worker interrupted:`, err);
    } finally {
      activeWorkers.delete(campaignId);
    }
  }

  /**
   * Resumes any campaign that was in progress on server boot and maintains a periodic check
   */
  public static initAutoResume() {
    const checkAndResume = () => {
      const runningCampaigns = db.getCampaigns().filter((c) => c.status === 'Em andamento');
      for (const c of runningCampaigns) {
        if (!activeWorkers.has(c.id)) {
          console.log(`Auto-resuming campaign in progress: ${c.id} (${c.name})`);
          this.startCampaign(c.id).catch(console.error);
        }
      }
    };

    checkAndResume();

    if (!this.watcherInterval) {
      this.watcherInterval = setInterval(checkAndResume, 60000);
    }
  }
}
