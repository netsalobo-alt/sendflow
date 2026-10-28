import React, { useState, useEffect } from 'react';
import {
  Send,
  PlusCircle,
  Play,
  Pause,
  Copy,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Repeat,
  Shield,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api.ts';
import type { Campaign } from '../types/index.ts';

interface CampaignsPageProps {
  onSelectCampaign: (id: string) => void;
  onNewCampaign: () => void;
  onCloneCampaign: (campaign: Campaign) => void;
}

export const CampaignsPage: React.FC<CampaignsPageProps> = ({
  onSelectCampaign,
  onNewCampaign,
  onCloneCampaign,
}) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      const data = await api.getCampaigns();
      setCampaigns(data);
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    const interval = setInterval(fetchCampaigns, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async (e: React.MouseEvent, camp: Campaign) => {
    e.stopPropagation();
    setActionLoading(camp.id);
    try {
      if (camp.status === 'Em andamento') {
        await api.pauseCampaign(camp.id);
      } else {
        await api.startCampaign(camp.id);
      }
      await fetchCampaigns();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao alterar estado da campanha');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteCampaign = async (e: React.MouseEvent, camp: Campaign) => {
    e.stopPropagation();
    if (!confirm(`Deseja realmente excluir a campanha "${camp.name}"? Esta ação removerá o histórico e os contatos da campanha.`)) {
      return;
    }
    setActionLoading(camp.id);
    try {
      await api.deleteCampaign(camp.id);
      await fetchCampaigns();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir campanha');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = campaigns.filter((c) => {
    if (statusFilter !== 'todas') {
      if (statusFilter === 'ativas' && c.status !== 'Em andamento') return false;
      if (statusFilter === 'concluidas' && c.status !== 'Concluída') return false;
      if (statusFilter === 'pausadas' && c.status !== 'Pausada') return false;
      if (statusFilter === 'rascunho' && c.status !== 'Rascunho') return false;
    }
    if (searchQuery) {
      return (
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.inboxName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Gerenciamento de Campanhas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Visualize o progresso, controle o fluxo de envio e consulte históricos de cada campanha.
          </p>
        </div>
        <button
          onClick={onNewCampaign}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs cursor-pointer whitespace-nowrap"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Criar Nova Campanha</span>
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Segmented Filter */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {[
            { id: 'todas', label: 'Todas' },
            { id: 'ativas', label: 'Em andamento' },
            { id: 'pausadas', label: 'Pausadas' },
            { id: 'concluidas', label: 'Concluídas' },
            { id: 'rascunho', label: 'Rascunhos' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setStatusFilter(item.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                statusFilter === item.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar campanha por nome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 w-64 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">Carregando campanhas...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Send className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">Nenhuma campanha encontrada</h3>
            <p className="text-xs text-slate-500 mt-1">
              {searchQuery ? 'Tente ajustar os filtros ou a busca.' : 'Comece criando uma nova campanha.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-6">Campanha</th>
                  <th className="py-3 px-4">Canal Chatwoot</th>
                  <th className="py-3 px-4">Progresso</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Criada em</th>
                  <th className="py-3 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((camp) => {
                  const progressPct =
                    camp.totalContacts > 0
                      ? Math.round((camp.sentCount / camp.totalContacts) * 100)
                      : 0;

                  return (
                    <tr
                      key={camp.id}
                      onClick={() => onSelectCampaign(camp.id)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    >
                      <td className="py-4 px-6 font-semibold text-slate-900">
                        <div className="truncate max-w-xs">{camp.name}</div>
                        {camp.description && (
                          <div className="text-[11px] text-slate-400 font-normal truncate max-w-xs">
                            {camp.description}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-normal mt-1 flex-wrap">
                          <span>{camp.variations?.length || 1} variações</span>
                          <span>·</span>
                          <span>
                            Fila: {camp.minDelaySeconds}s-{camp.maxDelaySeconds}s
                          </span>
                          {camp.dailyLimit && camp.dailyLimit > 0 ? (
                            <>
                              <span>·</span>
                              <span className="text-sky-700 font-semibold bg-sky-50 px-1 rounded">
                                {camp.sentTodayCount || 0}/{camp.dailyLimit} hoje ({camp.businessHoursStart || '09:00'})
                              </span>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-800">{camp.inboxName}</div>
                        <div className="text-[11px] text-slate-400">{camp.connectionName}</div>
                      </td>
                      <td className="py-4 px-4 min-w-[160px]">
                        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 mb-1">
                          <span>
                            {camp.sentCount} / {camp.totalContacts}
                          </span>
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
                        {camp.failedCount > 0 && (
                          <div className="text-[10px] text-rose-600 mt-1">
                            {camp.failedCount} erro(s) de envio
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        {camp.isRestingDailyLimit ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                            Pausa Diária
                          </span>
                        ) : camp.isRestingBetweenBatches ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            Pausa Lote
                          </span>
                        ) : camp.status === 'Em andamento' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Em andamento
                          </span>
                        ) : camp.status === 'Concluída' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Concluída
                          </span>
                        ) : camp.status === 'Pausada' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                            <Pause className="w-3.5 h-3.5 text-amber-600" />
                            Pausada
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 font-medium">Rascunho</span>
                        )}
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap font-mono tabular-nums text-slate-500">
                        {new Date(camp.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-4 px-6 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {(camp.status === 'Em andamento' ||
                            camp.status === 'Pausada' ||
                            camp.status === 'Rascunho') && (
                            <button
                              onClick={(e) => handleToggle(e, camp)}
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
                            onClick={() => onCloneCampaign(camp)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Criar nova campanha baseada nesta"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onSelectCampaign(camp.id)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Ver histórico e logs"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteCampaign(e, camp)}
                            disabled={actionLoading === camp.id}
                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Excluir campanha"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
