import React, { useEffect, useState } from 'react';
import {
  Send,
  Radio,
  Clock,
  Calendar,
  AlertTriangle,
  Users,
  ArrowUpRight,
  PlusCircle,
  Play,
  Pause,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../services/api.ts';
import type { Campaign, DashboardMetrics } from '../types/index.ts';

interface DashboardPageProps {
  onNavigateToNewCampaign: () => void;
  onNavigateToCampaigns: () => void;
  onNavigateToContacts: () => void;
  onSelectCampaign: (id: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigateToNewCampaign,
  onNavigateToCampaigns,
  onNavigateToContacts,
  onSelectCampaign,
}) => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchMetrics = async () => {
    try {
      const data = await api.getDashboard();
      if (data) {
        setMetrics(data);
      }
    } catch (err) {
      console.warn('Dashboard fetch notice:', err);
      // Fallback empty metrics so UI stays responsive and functional
      setMetrics((prev) => prev || {
        totalCampaigns: 0,
        activeCampaigns: 0,
        sentToday: 0,
        sentThisMonth: 0,
        failedCount: 0,
        totalContacts: 0,
        recentCampaigns: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    // Poll dashboard every 5 seconds to keep live counters updated during active campaigns
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleCampaign = async (e: React.MouseEvent, campaign: Campaign) => {
    e.stopPropagation();
    setActionLoading(campaign.id);
    try {
      if (campaign.status === 'Em andamento') {
        await api.pauseCampaign(campaign.id);
      } else {
        await api.startCampaign(campaign.id);
      }
      await fetchMetrics();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao alterar estado da campanha');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  const statCards = [
    {
      title: 'Campanhas Totais',
      value: metrics?.totalCampaigns ?? 0,
      icon: Send,
      color: 'text-slate-900',
      bgColor: 'bg-slate-100',
    },
    {
      title: 'Em Andamento',
      value: metrics?.activeCampaigns ?? 0,
      icon: Radio,
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50',
      highlight: (metrics?.activeCampaigns ?? 0) > 0,
    },
    {
      title: 'Enviadas Hoje',
      value: metrics?.sentToday ?? 0,
      icon: Clock,
      color: 'text-sky-700',
      bgColor: 'bg-sky-50',
    },
    {
      title: 'Enviadas no Mês',
      value: metrics?.sentThisMonth ?? 0,
      icon: Calendar,
      color: 'text-indigo-700',
      bgColor: 'bg-indigo-50',
    },
    {
      title: 'Erros de Envio',
      value: metrics?.failedCount ?? 0,
      icon: AlertTriangle,
      color: (metrics?.failedCount ?? 0) > 0 ? 'text-rose-700' : 'text-slate-500',
      bgColor: (metrics?.failedCount ?? 0) > 0 ? 'bg-rose-50' : 'bg-slate-50',
    },
    {
      title: 'Contatos na Base',
      value: metrics?.totalContacts ?? 0,
      icon: Users,
      color: 'text-violet-700',
      bgColor: 'bg-violet-50',
    },
  ];

  const getStatusBadge = (status: Campaign['status']) => {
    switch (status) {
      case 'Em andamento':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Em andamento
          </span>
        );
      case 'Concluída':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Concluída
          </span>
        );
      case 'Pausada':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
            <Pause className="w-3.5 h-3.5 text-amber-600" />
            Pausada
          </span>
        );
      case 'Com erro':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            Com erro
          </span>
        );
      default:
        return <span className="text-xs text-slate-500 font-medium">Rascunho</span>;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Painel Geral de Campanhas
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Métricas de disparos sincronizados em tempo real com o Chatwoot.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateToContacts}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm whitespace-nowrap cursor-pointer"
          >
            Importar CSV
          </button>
          <button
            onClick={onNavigateToNewCampaign}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm whitespace-nowrap cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Criar Campanha</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className={`p-4 rounded-xl bg-white border border-slate-200 transition-all ${
                card.highlight ? 'ring-2 ring-emerald-500/20 border-emerald-500/40' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 font-medium truncate">{card.title}</span>
                <div className={`p-1.5 rounded-lg ${card.bgColor} ${card.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
                {card.value.toLocaleString('pt-BR')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Campaigns Section */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900 text-sm">Campanhas Recentes</h2>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">
              {metrics?.recentCampaigns.length ?? 0} registradas
            </span>
          </div>
          <button
            onClick={onNavigateToCampaigns}
            className="text-xs font-semibold text-slate-700 hover:text-emerald-600 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>Ver todas</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {(!metrics?.recentCampaigns || metrics.recentCampaigns.length === 0) ? (
          <div className="p-12 text-center">
            <Send className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">Nenhuma campanha criada ainda</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Crie sua primeira campanha para importar contatos, selecionar sua caixa de entrada do Chatwoot e iniciar envios em fila.
            </p>
            <button
              onClick={onNavigateToNewCampaign}
              className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Criar Primeira Campanha</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-medium border-b border-slate-200/60 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-6">Nome da Campanha</th>
                  <th className="py-3 px-4">Canal / Inbox</th>
                  <th className="py-3 px-4">Progresso de Envio</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Criada em</th>
                  <th className="py-3 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.recentCampaigns.map((camp) => {
                  const progressPct =
                    camp.totalContacts > 0
                      ? Math.round((camp.sentCount / camp.totalContacts) * 100)
                      : 0;

                  return (
                    <tr
                      key={camp.id}
                      onClick={() => onSelectCampaign(camp.id)}
                      className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-6 font-semibold text-slate-900">
                        <div className="truncate max-w-[220px]">{camp.name}</div>
                        {camp.description && (
                          <div className="text-[11px] text-slate-400 font-normal truncate max-w-[220px]">
                            {camp.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        <div className="font-medium text-slate-800">{camp.inboxName}</div>
                        <div className="text-[11px] text-slate-400">{camp.connectionName}</div>
                      </td>
                      <td className="py-3.5 px-4 min-w-[160px]">
                        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 mb-1">
                          <span>{camp.sentCount} / {camp.totalContacts} enviados</span>
                          <span>{progressPct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              camp.failedCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getStatusBadge(camp.status)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap font-mono tabular-nums">
                        {new Date(camp.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3.5 px-6 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {(camp.status === 'Em andamento' || camp.status === 'Pausada' || camp.status === 'Rascunho') && (
                            <button
                              onClick={(e) => handleToggleCampaign(e, camp)}
                              disabled={actionLoading === camp.id}
                              className={`p-1.5 rounded-md border text-xs font-medium transition-colors ${
                                camp.status === 'Em andamento'
                                  ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                                  : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                              }`}
                              title={camp.status === 'Em andamento' ? 'Pausar' : 'Iniciar'}
                            >
                              {camp.status === 'Em andamento' ? (
                                <Pause className="w-3.5 h-3.5" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => onSelectCampaign(camp.id)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Ver detalhes"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
