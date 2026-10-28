import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  XCircle,
  Copy,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Filter,
  Download,
  Eye,
  Layers,
  Image as ImageIcon,
  Shield,
  Repeat,
  Timer,
  Sun,
  Calendar,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api.ts';
import type { Campaign, CampaignContactLog } from '../types/index.ts';

interface CampaignDetailPageProps {
  campaignId: string;
  onBack: () => void;
  onCloneCampaign: (campaign: Campaign) => void;
}

export const CampaignDetailPage: React.FC<CampaignDetailPageProps> = ({
  campaignId,
  onBack,
  onCloneCampaign,
}) => {
  const [campaign, setCampaign] = useState<
    (Campaign & { contacts: any[]; logs: CampaignContactLog[]; isRunning: boolean }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'todos' | 'enviado' | 'pendente' | 'erro'>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<CampaignContactLog | null>(null);
  const isPollingRef = useRef(true);

  const fetchCampaign = async (showLoadingSkeleton = false): Promise<boolean> => {
    if (showLoadingSkeleton) setLoading(true);
    try {
      const data = await api.getCampaign(campaignId);
      setCampaign(data);
      setFetchError(null);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Campanha não encontrada.';
      setFetchError(msg);
      // Stop polling immediately if not found
      isPollingRef.current = false;
      return false;
    } finally {
      if (showLoadingSkeleton) setLoading(false);
    }
  };

  useEffect(() => {
    isPollingRef.current = true;
    let timer: NodeJS.Timeout | null = null;
    let isMounted = true;

    const init = async () => {
      const success = await fetchCampaign(true);
      if (!isMounted || !success) return;

      // Only continue polling if campaign exists
      timer = setInterval(async () => {
        if (!isPollingRef.current || !isMounted) {
          if (timer) clearInterval(timer);
          return;
        }
        await fetchCampaign(false);
      }, 3000);
    };

    init();

    return () => {
      isMounted = false;
      isPollingRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, [campaignId]);

  const handleStartResume = async () => {
    setActionLoading(true);
    try {
      await api.startCampaign(campaignId);
      await fetchCampaign();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao iniciar campanha');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    try {
      await api.pauseCampaign(campaignId);
      await fetchCampaign();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao pausar campanha');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSkipPause = async () => {
    setActionLoading(true);
    try {
      await api.skipBatchPause(campaignId);
      await fetchCampaign();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao pular pausa');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSkipDailyPause = async () => {
    setActionLoading(true);
    try {
      await api.skipDailyPause(campaignId);
      await fetchCampaign();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao retomar do limite diário');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Deseja realmente cancelar esta campanha? Contatos pendentes não serão enviados.')) {
      return;
    }
    setActionLoading(true);
    try {
      await api.cancelCampaign(campaignId);
      await fetchCampaign();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao cancelar');
    } finally {
      setActionLoading(false);
    }
  };

  const exportLogsCsv = () => {
    if (!campaign || !campaign.logs) return;
    const headers = ['Nome', 'Telefone', 'Mensagem', 'Canal', 'Horario', 'Status', 'Erro'];
    const rows = campaign.logs.map((log) => [
      `"${log.contactName.replace(/"/g, '""')}"`,
      `"${log.phoneNumber}"`,
      `"${log.messageContent.replace(/"/g, '""').replace(/\n/g, ' ')}"`,
      `"${log.channelName}"`,
      `"${new Date(log.timestamp).toLocaleString('pt-BR')}"`,
      `"${log.status}"`,
      `"${(log.errorDetails || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `logs_${campaign.name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteCampaign = async () => {
    if (!confirm('Deseja realmente excluir esta campanha e todos os seus históricos? Esta ação não pode ser desfeita.')) {
      return;
    }
    setActionLoading(true);
    try {
      await api.deleteCampaign(campaignId);
      onBack();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir campanha');
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6 max-w-7xl mx-auto">
        <div className="h-20 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (fetchError || !campaign) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Voltar para a lista"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Detalhes da Campanha</h1>
            <p className="text-xs text-slate-500 mt-0.5">Gerenciador de campanhas e histórico de disparos</p>
          </div>
        </div>

        <div className="p-10 bg-white border border-slate-200 rounded-xl text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto">
            <h2 className="text-base font-semibold text-slate-900">Campanha não encontrada</h2>
            <p className="text-xs text-slate-500 mt-1">
              {fetchError || 'A campanha solicitada não foi encontrada ou foi removida do sistema.'}
            </p>
            <div className="mt-2 text-[11px] font-mono text-slate-400 bg-slate-50 px-2.5 py-1 rounded border border-slate-200 inline-block">
              ID: {campaignId}
            </div>
          </div>
          <div className="pt-3 flex items-center justify-center gap-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para Lista de Campanhas</span>
            </button>
            <button
              onClick={() => {
                isPollingRef.current = true;
                fetchCampaign(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tentar Novamente</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progressPct =
    campaign.totalContacts > 0
      ? Math.round((campaign.sentCount / campaign.totalContacts) * 100)
      : 0;

  // Filter logs
  const filteredLogs = (campaign.logs || []).filter((log) => {
    if (statusFilter !== 'todos' && log.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = log.contactName.toLowerCase().includes(q);
      const matchPhone = log.phoneNumber.includes(q);
      return matchName || matchPhone;
    }
    return true;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            title="Voltar para a lista"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{campaign.name}</h1>
              <span className="text-xs text-slate-400">·</span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                  campaign.isRestingDailyLimit
                    ? 'bg-sky-100 text-sky-900 border border-sky-300'
                    : campaign.isRestingBetweenBatches
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : campaign.status === 'Em andamento'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : campaign.status === 'Concluída'
                    ? 'bg-slate-100 text-slate-700'
                    : campaign.status === 'Pausada'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {campaign.isRestingDailyLimit ? (
                  <>
                    <Sun className="w-3 h-3 text-sky-700 animate-pulse" />
                    <span>Em Espera (Limite Diário)</span>
                  </>
                ) : campaign.isRestingBetweenBatches ? (
                  <>
                    <Shield className="w-3 h-3 text-amber-700 animate-pulse" />
                    <span>Em Pausa de Lote (Anti-Ban)</span>
                  </>
                ) : (
                  campaign.status
                )}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Conta: <strong className="text-slate-700 font-medium">{campaign.connectionName}</strong> ·{' '}
              {campaign.inboxes && campaign.inboxes.length > 1 ? (
                <span>
                  Canais:{' '}
                  <strong className="text-emerald-700 font-semibold">
                    {campaign.inboxes.length} canais (
                    {campaign.inboxRotation === 'random' ? 'Aleatório' : 'Rotativo Round-Robin'}
                    )
                  </strong>
                </span>
              ) : (
                <span>
                  Canal: <strong className="text-slate-700 font-medium">{campaign.inboxName}</strong>
                </span>
              )}
              {campaign.dailyLimit && campaign.dailyLimit > 0 ? (
                <span>
                  {' '}· Limite Diário:{' '}
                  <strong className="text-sky-700 font-semibold">
                    {campaign.sentTodayCount || 0}/{campaign.dailyLimit} hoje ({campaign.businessHoursStart || '09:00'} - {campaign.businessHoursEnd || '18:00'})
                  </strong>
                </span>
              ) : null}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {campaign.status === 'Em andamento' ? (
            <button
              onClick={handlePause}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pausar Campanha</span>
            </button>
          ) : campaign.status === 'Pausada' || campaign.status === 'Rascunho' ? (
            <button
              onClick={handleStartResume}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{campaign.status === 'Pausada' ? 'Retomar Disparo' : 'Iniciar Campanha'}</span>
            </button>
          ) : null}

          {campaign.status === 'Em andamento' || campaign.status === 'Pausada' ? (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="p-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors"
              title="Cancelar campanha"
            >
              <XCircle className="w-4 h-4" />
            </button>
          ) : null}

          {/* User Requested: "Criar nova campanha baseada nesta" */}
          <button
            onClick={() => onCloneCampaign(campaign)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Criar nova baseada nesta</span>
          </button>

          {/* Delete Campaign */}
          <button
            onClick={handleDeleteCampaign}
            disabled={actionLoading}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-300 hover:border-rose-200 rounded-lg transition-colors cursor-pointer"
            title="Excluir campanha"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Anti-Ban Daily Limit Resting Banner */}
      {campaign.isRestingDailyLimit && (
        <div className="bg-sky-50 border border-sky-300 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2.5 bg-sky-600 text-white rounded-lg shrink-0">
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-sky-950">
                  Proteção Anti-Banimento: Limite Diário Atingido
                </span>
                <span className="text-[10px] font-mono bg-white text-sky-800 border border-sky-300 px-2 py-0.5 rounded-full font-semibold">
                  {campaign.sentTodayCount || campaign.dailyLimit || 0} / {campaign.dailyLimit} msgs hoje
                </span>
              </div>
              <p className="text-xs text-sky-900 mt-0.5">
                A campanha atingiu o teto de envios programado para hoje e pausou para evitar bloqueios no WhatsApp.
                {campaign.resumeAt && (
                  <span className="font-semibold block sm:inline sm:ml-1">
                    Retomada automática programada para {new Date(campaign.resumeAt).toLocaleDateString('pt-BR')} às {new Date(campaign.resumeAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (horário comercial).
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={handleSkipDailyPause}
            disabled={actionLoading}
            className="px-3.5 py-2 text-xs font-semibold text-sky-950 bg-white hover:bg-sky-100 border border-sky-300 rounded-lg transition-colors inline-flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-sky-900 text-sky-900" />
            <span>Continuar Agora (Ignorar Limite)</span>
          </button>
        </div>
      )}

      {/* Anti-Ban Resting Banner if currently cooling down */}
      {campaign.isRestingBetweenBatches && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2.5 bg-amber-500 text-white rounded-lg shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-amber-950">
                  Proteção Anti-Banimento Ativa (Descanso de Lote)
                </span>
                <span className="text-[10px] font-mono bg-white text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-semibold">
                  Lote de {campaign.batchSize} msgs concluído
                </span>
              </div>
              <p className="text-xs text-amber-900 mt-0.5">
                O robô pausou temporariamente os disparos para resfriar os canais do WhatsApp e evitar suspensões.
                {campaign.resumeAt && (
                  <span className="font-semibold block sm:inline sm:ml-1">
                    Retomada automática prevista para às {new Date(campaign.resumeAt).toLocaleTimeString('pt-BR')}.
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={handleSkipPause}
            disabled={actionLoading}
            className="px-3.5 py-2 text-xs font-semibold text-amber-950 bg-white hover:bg-amber-100/90 border border-amber-300 rounded-lg transition-colors inline-flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-amber-900" />
            <span>Pular Pausa e Continuar Agora</span>
          </button>
        </div>
      )}

      {/* Multiple Inboxes Rotative Info Card */}
      {campaign.inboxes && campaign.inboxes.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <Repeat className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold text-slate-900">
              Alternância entre {campaign.inboxes.length} Canais:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {campaign.inboxes.map((inbox, idx) => (
                <span
                  key={inbox.inboxId || idx}
                  className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-medium text-slate-700 text-[11px]"
                >
                  #{idx + 1} {inbox.inboxName}
                </span>
              ))}
            </div>
          </div>
          <span className="text-slate-500 font-mono text-[11px]">
            Modo: {campaign.inboxRotation === 'random' ? 'Aleatório' : 'Rotativo Sequencial (Round-Robin)'}
          </span>
        </div>
      )}

      {/* Progress & Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-xs text-slate-500 font-medium block mb-1">Total de Contatos</span>
          <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {campaign.totalContacts}
          </span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-xs text-slate-500 font-medium block mb-1">Enviados com Sucesso</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
              {campaign.sentCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">({progressPct}%)</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-xs text-slate-500 font-medium block mb-1">Pendentes na Fila</span>
          <span className="text-2xl font-bold font-mono tabular-nums text-slate-600">
            {campaign.pendingCount}
          </span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-xs text-slate-500 font-medium block mb-1">Erros de Envio</span>
          <span
            className={`text-2xl font-bold font-mono tabular-nums ${
              campaign.failedCount > 0 ? 'text-rose-700' : 'text-slate-400'
            }`}
          >
            {campaign.failedCount}
          </span>
        </div>
      </div>

      {/* Photo with Caption Banner if present */}
      {campaign.mediaUrl && (
        <div className="bg-white border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src={campaign.mediaUrl}
              alt="Foto da campanha"
              className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-900">
                  Campanha com Envio de Foto + Legenda (Caption)
                </span>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded font-medium">
                  Caption Ativo
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                Arquivo: {campaign.mediaFilename || 'foto_campanha.jpg'} · As mensagens desta campanha são disparadas como legenda desta imagem.
              </p>
            </div>
          </div>
          <a
            href={campaign.mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1.5 shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Ver Imagem</span>
          </a>
        </div>
      )}

      {/* Progress Bar Container */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>Progresso geral do envio:</span>
          <span className="font-mono tabular-nums font-semibold text-slate-900">{progressPct}%</span>
        </div>
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              campaign.failedCount > 0 ? 'bg-amber-500' : 'bg-emerald-600'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
          <span>
            Intervalo: {campaign.minDelaySeconds}s - {campaign.maxDelaySeconds}s entre disparos
            {campaign.batchPauseMinutes && campaign.batchPauseMinutes > 0
              ? ` · Pausa de ${campaign.batchPauseMinutes} min a cada lote de ${campaign.batchSize} msgs (Anti-Ban)`
              : ''}
            {campaign.dailyLimit && campaign.dailyLimit > 0
              ? ` · Limite diário: ${campaign.sentTodayCount || 0}/${campaign.dailyLimit} msgs hoje (${campaign.businessHoursStart || '09:00'} às ${campaign.businessHoursEnd || '18:00'}${campaign.businessDaysOnly ? ' · Dias úteis' : ''})`
              : ''}
          </span>
          <span>
            {campaign.startedAt ? `Iniciado em: ${new Date(campaign.startedAt).toLocaleTimeString('pt-BR')}` : 'Não iniciado'}
          </span>
        </div>
      </div>

      {/* Logs Table Area */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Histórico de Disparos</h2>
            {/* Status Segmented Control */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {(['todos', 'enviado', 'pendente', 'erro'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                    statusFilter === tab
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar por nome ou número..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 w-56 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={exportLogsCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
              title="Exportar logs para CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Nenhum registro encontrado para este filtro.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Nome</th>
                  <th className="py-2.5 px-4">Telefone</th>
                  <th className="py-2.5 px-4">Mensagem Utilizada</th>
                  <th className="py-2.5 px-4">Canal</th>
                  <th className="py-2.5 px-4">Horário</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Erro / Detalhes</th>
                  <th className="py-2.5 px-4 text-right">Ver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-900">{log.contactName}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                      {log.phoneNumber}
                    </td>
                    <td className="py-3 px-4 max-w-xs text-slate-600">
                      <div className="flex items-center gap-1.5 truncate">
                        {(log.mediaUrl || campaign.mediaUrl) && (
                          <span className="shrink-0 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded font-mono inline-flex items-center gap-1">
                            <ImageIcon className="w-2.5 h-2.5" />
                            Foto+Legenda
                          </span>
                        )}
                        <span className="truncate">{log.messageContent}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-500">{log.channelName}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono tabular-nums whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {log.status === 'enviado' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Enviado
                        </span>
                      ) : log.status === 'erro' ? (
                        <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Erro
                        </span>
                      ) : (
                        <span className="text-slate-500 font-medium">Pendente</span>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-rose-600 text-[11px]">
                      {log.errorDetails || '—'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                        title="Ver mensagem completa"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">Detalhe do Disparo</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-3.5 text-xs max-h-[80vh] overflow-y-auto">
              <div>
                <span className="text-slate-500 block">Contato:</span>
                <span className="font-semibold text-slate-800">
                  {selectedLog.contactName} ({selectedLog.phoneNumber})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Horário:</span>
                <span className="font-mono tabular-nums text-slate-800">
                  {new Date(selectedLog.timestamp).toLocaleString('pt-BR')}
                </span>
              </div>

              {(selectedLog.mediaUrl || campaign.mediaUrl) && (
                <div>
                  <span className="text-slate-500 block mb-1">Foto da Mensagem:</span>
                  <img
                    src={selectedLog.mediaUrl || campaign.mediaUrl}
                    alt="Foto disparada com legenda"
                    className="w-full max-h-56 object-cover rounded-lg border border-slate-200"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              )}

              <div>
                <span className="text-slate-500 block mb-1">
                  {(selectedLog.mediaUrl || campaign.mediaUrl) ? 'Legenda da foto (Caption):' : 'Mensagem enviada:'}
                </span>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 whitespace-pre-line leading-relaxed">
                  {selectedLog.messageContent}
                </div>
              </div>

              {selectedLog.errorDetails && (
                <div>
                  <span className="text-rose-600 font-semibold block mb-1">Motivo do erro:</span>
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-mono text-[11px]">
                    {selectedLog.errorDetails}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
