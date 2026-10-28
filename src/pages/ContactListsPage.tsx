import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import {
  Users,
  Plus,
  FileSpreadsheet,
  Trash2,
  Eye,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Download,
  Search,
  LayoutGrid,
  RefreshCw,
  Filter,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { normalizePhoneNumber } from '../utils/phoneNormalizer.ts';
import type { ContactList, ContactItem, ChatwootConnection } from '../types/index.ts';

export const ContactListsPage: React.FC = () => {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'csv' | 'kanban'>('csv');
  const [selectedListDetail, setSelectedListDetail] = useState<
    (ContactList & { contacts: ContactItem[] }) | null
  >(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Connections & Kanban State
  const [connections, setConnections] = useState<ChatwootConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [kanbanLoadingMeta, setKanbanLoadingMeta] = useState(false);
  const [kanbanFetching, setKanbanFetching] = useState(false);
  const [kanbanError, setKanbanError] = useState<string | null>(null);
  const [kanbanFunnels, setKanbanFunnels] = useState<Array<{ id: string | number; name: string }>>([]);
  const [kanbanStages, setKanbanStages] = useState<Array<{ id: string; name: string; funnelId?: string | number }>>([]);
  const [kanbanAgents, setKanbanAgents] = useState<Array<{ id: number; name: string; email?: string }>>([]);
  const [kanbanFunnelId, setKanbanFunnelId] = useState<string>('');
  const [kanbanStageId, setKanbanStageId] = useState<string>('');
  const [kanbanAgentId, setKanbanAgentId] = useState<string>('');
  const [kanbanPriorities, setKanbanPriorities] = useState<string[]>([]);
  const [kanbanFetchAll, setKanbanFetchAll] = useState(true);

  // CSV Import State
  const [listName, setListName] = useState('');
  const [listDescription, setListDescription] = useState('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [nameCol, setNameCol] = useState('name');
  const [phoneCol, setPhoneCol] = useState('phone_number');
  const [validContacts, setValidContacts] = useState<
    Array<{ name: string; phoneNumber: string; customAttributes?: Record<string, string> }>
  >([]);
  const [stats, setStats] = useState({ total: 0, valid: 0, invalid: 0, duplicates: 0 });
  const [saving, setSaving] = useState(false);

  const fetchLists = async () => {
    try {
      const data = await api.getContactLists();
      setLists(data);
    } catch (err) {
      console.error('Error fetching contact lists:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLists();
    api.getConnections().then((conns) => {
      setConnections(conns);
      const active = conns.find((c) => c.active) || conns[0];
      if (active) {
        setSelectedConnectionId(active.id);
        loadKanbanMeta(active.id);
      }
    }).catch(console.error);
  }, []);

  const loadKanbanMeta = async (connId: string) => {
    if (!connId) return;
    setKanbanLoadingMeta(true);
    setKanbanError(null);
    try {
      const res = await api.getChatwootKanbanMetadata(connId);
      if (res.success && res.metadata) {
        setKanbanFunnels(res.metadata.funnels || []);
        setKanbanStages(res.metadata.stages || []);
        setKanbanAgents(res.metadata.agents || []);
      }
    } catch (err: unknown) {
      console.warn('Kanban metadata fetch failed:', err);
    } finally {
      setKanbanLoadingMeta(false);
    }
  };

  const handleQueryKanban = async () => {
    if (!selectedConnectionId) {
      setKanbanError('Nenhuma conexão Chatwoot selecionada.');
      return;
    }
    setKanbanFetching(true);
    setKanbanError(null);
    try {
      const res = await api.queryChatwootKanbanItems(selectedConnectionId, {
        funnelId: kanbanFunnelId || undefined,
        stageId: kanbanStageId || undefined,
        agentId: kanbanAgentId ? Number(kanbanAgentId) : undefined,
        priorities: kanbanPriorities.length > 0 ? kanbanPriorities : undefined,
        fetchAllPages: kanbanFetchAll,
      });

      const seen = new Set<string>();
      const valid: Array<{ name: string; phoneNumber: string; customAttributes?: Record<string, string> }> = [];
      let duplicates = 0;
      let invalid = 0;

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
        valid.push({
          name: item.name || 'Contato Kanban',
          phoneNumber: norm.e164,
          customAttributes: {
            ...(item.customAttributes || {}),
            origem: 'Kanban Chatwoot',
            funil: item.funnelName || (kanbanFunnelId ? `Funil #${kanbanFunnelId}` : ''),
            etapa: item.stageName || (kanbanStageId ? `Etapa #${kanbanStageId}` : ''),
            prioridade: item.priority || '',
          },
        });
      }

      setValidContacts(valid);
      setStats({
        total: res.items.length,
        valid: valid.length,
        invalid,
        duplicates,
      });

      if (!listName.trim()) {
        const stageName = kanbanStages.find((s) => s.id === kanbanStageId)?.name;
        const funnelName = kanbanFunnels.find((f) => String(f.id) === kanbanFunnelId)?.name;
        const prefix = stageName ? `Kanban - ${stageName}` : funnelName ? `Kanban - ${funnelName}` : 'Contatos Kanban';
        setListName(`${prefix} (${valid.length} contatos)`);
      }

      if (valid.length === 0) {
        setKanbanError('Nenhum contato com telefone válido com DDD foi encontrado com os filtros selecionados.');
      }
    } catch (err: unknown) {
      setKanbanError(err instanceof Error ? err.message : 'Falha ao buscar itens do Kanban.');
    } finally {
      setKanbanFetching(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        setRawHeaders(headers);
        const rows = results.data as Record<string, string>[];
        setParsedRows(rows);

        const guessName =
          headers.find((h) => /^(name|nome|contato|cliente)$/i.test(h)) || headers[0] || 'name';
        const guessPhone =
          headers.find((h) => /^(phone|phone_number|telefone|celular|whatsapp|numero)$/i.test(h)) ||
          headers[1] ||
          'phone_number';

        setNameCol(guessName);
        setPhoneCol(guessPhone);

        evaluateContacts(rows, guessName, guessPhone);
      },
      error: (err) => {
        alert(`Erro ao ler CSV: ${err.message}`);
      },
    });
  };

  const evaluateContacts = (rows: Record<string, string>[], nKey: string, pKey: string) => {
    const seen = new Set<string>();
    const valid: Array<{ name: string; phoneNumber: string; customAttributes?: Record<string, string> }> = [];
    let duplicates = 0;
    let invalid = 0;

    for (const r of rows) {
      const rawPhone = r[pKey] || '';
      const rawName = r[nKey] || 'Contato';

      const norm = normalizePhoneNumber(rawPhone);
      if (!norm.isValid) {
        invalid++;
        continue;
      }

      if (seen.has(norm.e164)) {
        duplicates++;
        continue;
      }
      seen.add(norm.e164);

      const customAttrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        if (k !== nKey && k !== pKey && v !== undefined && v !== null && v !== '') {
          customAttrs[k] = String(v);
        }
      }

      valid.push({
        name: rawName.trim(),
        phoneNumber: norm.e164,
        customAttributes: customAttrs,
      });
    }

    setValidContacts(valid);
    setStats({
      total: rows.length,
      valid: valid.length,
      invalid,
      duplicates,
    });
  };

  const handleColumnChange = (newN: string, newP: string) => {
    setNameCol(newN);
    setPhoneCol(newP);
    evaluateContacts(parsedRows, newN, newP);
  };

  const handleSaveList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listName.trim() || validContacts.length === 0) return;

    setSaving(true);
    try {
      await api.createContactList({
        name: listName.trim(),
        description: listDescription.trim(),
        contacts: validContacts,
      });
      setIsImportModalOpen(false);
      // Reset form
      setListName('');
      setListDescription('');
      setRawHeaders([]);
      setParsedRows([]);
      setValidContacts([]);
      await fetchLists();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao salvar lista');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteList = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta lista de contatos?')) return;
    try {
      await api.deleteContactList(id);
      await fetchLists();
      if (selectedListDetail?.id === id) {
        setSelectedListDetail(null);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir lista');
    }
  };

  const handleViewDetail = async (list: ContactList) => {
    setDetailLoading(true);
    try {
      const full = await api.getContactList(list.id);
      setSelectedListDetail(full);
    } catch (err) {
      console.error('Error fetching list detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Listas de Contatos Salvas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerencie bases reutilizáveis para disparos sem precisar subir CSV toda vez.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setListName('');
              setListDescription('');
              setRawHeaders([]);
              setParsedRows([]);
              setValidContacts([]);
              setImportMode('kanban');
              setIsImportModalOpen(true);
              if (selectedConnectionId && kanbanFunnels.length === 0) {
                loadKanbanMeta(selectedConnectionId);
              }
            }}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300/80 rounded-lg transition-colors shadow-xs cursor-pointer whitespace-nowrap"
          >
            <LayoutGrid className="w-4 h-4 text-emerald-600" />
            <span>Importar do Kanban</span>
          </button>
          <button
            onClick={() => {
              setListName('');
              setListDescription('');
              setRawHeaders([]);
              setParsedRows([]);
              setValidContacts([]);
              setImportMode('csv');
              setIsImportModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Importar CSV</span>
          </button>
        </div>
      </div>

      {/* Grid of Lists */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-xl">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-800">Nenhuma lista salva ainda</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Faça o upload do seu primeiro arquivo CSV para normalizar números no padrão internacional e salvar contatos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((list) => (
            <div
              key={list.id}
              className="p-5 bg-white border border-slate-200 rounded-xl flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-sm text-slate-900">{list.name}</h3>
                  <span className="text-xs font-mono tabular-nums font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    {list.contactCount} contatos
                  </span>
                </div>
                {list.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1">{list.description}</p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 mt-4">
                <span className="font-mono tabular-nums">
                  Criada em: {new Date(list.createdAt).toLocaleDateString('pt-BR')}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewDetail(list)}
                    className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                    title="Ver contatos"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteList(list.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                    title="Excluir lista"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Drawer / Modal */}
      {selectedListDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {selectedListDetail.name}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedListDetail.contactCount} contatos normalizados
                </p>
              </div>
              <button
                onClick={() => setSelectedListDetail(null)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 uppercase text-[11px]">
                  <tr>
                    <th className="py-2 px-3">Nome</th>
                    <th className="py-2 px-3">Telefone E.164</th>
                    <th className="py-2 px-3">Atributos CSV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedListDetail.contacts.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 px-3 font-medium text-slate-800">{c.name}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700">
                        {c.phoneNumber}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {c.customAttributes && Object.keys(c.customAttributes).length > 0
                          ? Object.entries(c.customAttributes)
                              .map(([k, v]) => `${k}=${v}`)
                              .join(', ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedListDetail(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal (CSV or Chatwoot Kanban) */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                {importMode === 'csv' ? (
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                ) : (
                  <LayoutGrid className="w-4 h-4 text-emerald-600" />
                )}
                <h3 className="text-sm font-semibold text-slate-900">
                  Criar Nova Lista de Contatos
                </h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Mode Tabs */}
            <div className="px-6 pt-4 pb-2 border-b border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setImportMode('csv')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  importMode === 'csv'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Importar CSV</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportMode('kanban');
                  if (selectedConnectionId && kanbanFunnels.length === 0) {
                    loadKanbanMeta(selectedConnectionId);
                  }
                }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  importMode === 'kanban'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Importar do Kanban</span>
              </button>
            </div>

            <form onSubmit={handleSaveList} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome da Lista *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Leads Kanban - Negociação, Clientes VIP"
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Descrição (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Breve nota sobre a origem desses contatos..."
                    value={listDescription}
                    onChange={(e) => setListDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-900"
                  />
                </div>
              </div>

              {/* Mode CSV */}
              {importMode === 'csv' && (
                <>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50/60">
                    <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-700">Selecione seu arquivo CSV</p>
                    <label className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer transition-colors shadow-xs">
                      <span>Procurar arquivo</span>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {rawHeaders.length > 0 && (
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                      <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                        Mapear Colunas
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Coluna de Nome
                          </label>
                          <select
                            value={nameCol}
                            onChange={(e) => handleColumnChange(e.target.value, phoneCol)}
                            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs"
                          >
                            {rawHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Coluna de Telefone
                          </label>
                          <select
                            value={phoneCol}
                            onChange={(e) => handleColumnChange(nameCol, e.target.value)}
                            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs"
                          >
                            {rawHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Mode Kanban */}
              {importMode === 'kanban' && (
                <div className="space-y-3.5 border border-slate-200 rounded-xl p-4 bg-slate-50/70">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-semibold text-slate-800">
                        Filtros do Kanban Chatwoot
                      </span>
                    </div>
                    {selectedConnectionId && (
                      <button
                        type="button"
                        onClick={() => loadKanbanMeta(selectedConnectionId)}
                        disabled={kanbanLoadingMeta}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
                        title="Recarregar etapas e atendentes do Chatwoot"
                      >
                        <RefreshCw className={`w-3 h-3 ${kanbanLoadingMeta ? 'animate-spin' : ''}`} />
                        <span>Atualizar dados</span>
                      </button>
                    )}
                  </div>

                  {connections.length > 1 && (
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Conta / Conexão Chatwoot
                      </label>
                      <select
                        value={selectedConnectionId}
                        onChange={(e) => {
                          setSelectedConnectionId(e.target.value);
                          loadKanbanMeta(e.target.value);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.baseUrl} - Conta #{c.accountId})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* Funnel */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Funil (Opcional)
                      </label>
                      {kanbanFunnels.length > 0 ? (
                        <select
                          value={kanbanFunnelId}
                          onChange={(e) => setKanbanFunnelId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">Todos os Funis</option>
                          {kanbanFunnels.map((f) => (
                            <option key={f.id} value={String(f.id)}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="ID do Funil (ex: 1)"
                          value={kanbanFunnelId}
                          onChange={(e) => setKanbanFunnelId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      )}
                    </div>

                    {/* Stage */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Etapa / Coluna
                      </label>
                      {kanbanStages.length > 0 ? (
                        <select
                          value={kanbanStageId}
                          onChange={(e) => setKanbanStageId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">Todas as Etapas</option>
                          {kanbanStages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="ID da Etapa (ex: 2)"
                          value={kanbanStageId}
                          onChange={(e) => setKanbanStageId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      )}
                    </div>

                    {/* Agent */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Atendente
                      </label>
                      {kanbanAgents.length > 0 ? (
                        <select
                          value={kanbanAgentId}
                          onChange={(e) => setKanbanAgentId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">Todos os Atendentes</option>
                          {kanbanAgents.map((a) => (
                            <option key={a.id} value={String(a.id)}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="ID do Atendente"
                          value={kanbanAgentId}
                          onChange={(e) => setKanbanAgentId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      )}
                    </div>
                  </div>

                  {/* Priority Checkboxes */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
                      Filtrar por Prioridade (Opcional)
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { label: 'Urgente', value: 'urgent', color: 'text-rose-700 bg-rose-50 border-rose-200' },
                        { label: 'Alta', value: 'high', color: 'text-orange-700 bg-orange-50 border-orange-200' },
                        { label: 'Média', value: 'medium', color: 'text-amber-700 bg-amber-50 border-amber-200' },
                        { label: 'Baixa', value: 'low', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                      ].map((p) => {
                        const checked = kanbanPriorities.includes(p.value);
                        return (
                          <label
                            key={p.value}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border font-medium cursor-pointer transition-colors ${
                              checked ? p.color : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setKanbanPriorities([...kanbanPriorities, p.value]);
                                } else {
                                  setKanbanPriorities(kanbanPriorities.filter((x) => x !== p.value));
                                }
                              }}
                              className="rounded text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                            />
                            <span>{p.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pagination toggle */}
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={kanbanFetchAll}
                      onChange={(e) => setKanbanFetchAll(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-slate-600">
                      Buscar todas as páginas de resultados do Kanban automaticamente
                    </span>
                  </label>

                  {/* Error banner */}
                  {kanbanError && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{kanbanError}</span>
                    </div>
                  )}

                  {/* Action button */}
                  <button
                    type="button"
                    onClick={handleQueryKanban}
                    disabled={kanbanFetching}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    {kanbanFetching ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Consultando itens do Kanban...</span>
                      </>
                    ) : (
                      <>
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>Consultar Itens do Kanban</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Stats breakdown */}
              {validContacts.length > 0 && (
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="bg-slate-50 p-2 rounded border border-slate-200">
                      <span className="block text-[10px] text-slate-400">Total</span>
                      <span className="font-semibold font-mono">{stats.total}</span>
                    </div>
                    <div className="bg-emerald-50 p-2 rounded border border-emerald-200 text-emerald-700">
                      <span className="block text-[10px] text-slate-500">Válidos</span>
                      <span className="font-semibold font-mono">{stats.valid}</span>
                    </div>
                    <div className="bg-amber-50 p-2 rounded border border-amber-200 text-amber-700">
                      <span className="block text-[10px] text-slate-500">Duplicados</span>
                      <span className="font-semibold font-mono">{stats.duplicates}</span>
                    </div>
                    <div className="bg-rose-50 p-2 rounded border border-rose-200 text-rose-700">
                      <span className="block text-[10px] text-slate-500">Inválidos</span>
                      <span className="font-semibold font-mono">{stats.invalid}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || validContacts.length === 0}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Salvando Lista...' : `Salvar Lista (${validContacts.length} contatos)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
