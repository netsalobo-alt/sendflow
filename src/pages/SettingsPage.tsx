import React, { useState, useEffect } from 'react';
import {
  Radio,
  Sparkles,
  User,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Shield,
  Key,
  Database,
  Cloud,
  Download,
  Upload,
} from 'lucide-react';
import { api } from '../services/api.ts';
import type { ChatwootConnection, OpenAISettings } from '../types/index.ts';

interface SettingsPageProps {
  currentUsername: string;
  onProfileUpdated: (newUsername: string) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentUsername,
  onProfileUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'chatwoot' | 'openai' | 'profile' | 'cloud'>('chatwoot');
  const [syncStatus, setSyncStatus] = useState<{
    cloudDatabase: string;
    projectId: string;
    status: string;
    campaignsCount: number;
    contactListsCount: number;
    connectionsCount: number;
  } | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Chatwoot Connections State
  const [connections, setConnections] = useState<ChatwootConnection[]>([]);
  const [loadingConns, setLoadingConns] = useState(true);
  const [isConnModalOpen, setIsConnModalOpen] = useState(false);
  const [editingConn, setEditingConn] = useState<ChatwootConnection | null>(null);

  // Connection form
  const [connName, setConnName] = useState('');
  const [connUrl, setConnUrl] = useState('');
  const [connAccountId, setConnAccountId] = useState<number | string>(1);
  const [connToken, setConnToken] = useState('');
  const [connActive, setConnActive] = useState(true);
  const [savingConn, setSavingConn] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    inboxes?: any[];
    error?: string;
  } | null>(null);
  const [testingConn, setTestingConn] = useState(false);

  // OpenAI Settings State
  const [openAiSettings, setOpenAiSettings] = useState<OpenAISettings | null>(null);
  const [openAiKey, setOpenAiKey] = useState('');
  const [openAiModel, setOpenAiModel] = useState('gpt-4o-mini');
  const [openAiDefaultCount, setOpenAiDefaultCount] = useState(5);
  const [openAiDefaultPrompt, setOpenAiDefaultPrompt] = useState('');
  const [savingOpenAi, setSavingOpenAi] = useState(false);
  const [testingOpenAi, setTestingOpenAi] = useState(false);
  const [openAiTestResult, setOpenAiTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Profile Credentials State
  const [newUsername, setNewUsername] = useState(currentUsername);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{
    success: boolean;
    text: string;
  } | null>(null);

  // Load initial data
  const fetchConnections = async () => {
    try {
      const data = await api.getConnections();
      setConnections(data);
    } catch (err) {
      console.error('Error fetching connections:', err);
    } finally {
      setLoadingConns(false);
    }
  };

  const fetchOpenAiSettings = async () => {
    try {
      const data = await api.getOpenAISettings();
      setOpenAiSettings(data);
      setOpenAiModel(data.model);
      setOpenAiDefaultCount(data.defaultCount);
      setOpenAiDefaultPrompt(data.defaultPrompt);
    } catch (err) {
      console.error('Error fetching OpenAI settings:', err);
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const data = await api.getSyncStatus();
      setSyncStatus(data);
    } catch (err) {
      console.warn('Sync status notice:', err);
    }
  };

  useEffect(() => {
    fetchConnections();
    fetchOpenAiSettings();
    fetchSyncStatus();
  }, []);

  const handleBackupNow = async () => {
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const res = await api.backupNow();
      setSyncMessage(res.message);
      await fetchSyncStatus();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao sincronizar com nuvem');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const data = await api.exportBackupJson();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sendflow_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao exportar backup');
    }
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (!confirm('Deseja restaurar este arquivo de backup? Os dados atuais serão mesclados e restaurados.')) {
          return;
        }
        setSyncLoading(true);
        const res = await api.restoreBackupJson(parsed);
        alert(res.message);
        await fetchSyncStatus();
        await fetchConnections();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Arquivo de backup inválido');
      } finally {
        setSyncLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const openNewConnectionModal = () => {
    setEditingConn(null);
    setConnName('');
    setConnUrl('https://conversa.nortetelecom.net.br');
    setConnAccountId(1);
    setConnToken('');
    setConnActive(true);
    setTestResult(null);
    setIsConnModalOpen(true);
  };

  const openEditConnectionModal = (conn: ChatwootConnection) => {
    setEditingConn(conn);
    setConnName(conn.name);
    setConnUrl(conn.baseUrl);
    setConnAccountId(conn.accountId);
    setConnToken(''); // keep empty unless replacing
    setConnActive(conn.active);
    setTestResult(null);
    setIsConnModalOpen(true);
  };

  const handleTestConnectionLive = async () => {
    if (!connUrl || !connAccountId) {
      alert('Informe URL base e Account ID para testar.');
      return;
    }
    setTestingConn(true);
    setTestResult(null);
    try {
      const res = await api.testConnection({
        connectionId: editingConn && !connToken ? editingConn.id : undefined,
        baseUrl: connUrl,
        accountId: Number(connAccountId),
        apiAccessToken: connToken || undefined,
      });
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Falha na conexão com Chatwoot.',
      });
    } finally {
      setTestingConn(false);
    }
  };

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connName.trim() || !connUrl.trim() || !connAccountId) return;
    if (!editingConn && !connToken.trim()) {
      alert('O API Access Token é obrigatório para nova conexão.');
      return;
    }

    setSavingConn(true);
    try {
      if (editingConn) {
        await api.updateConnection(editingConn.id, {
          name: connName,
          baseUrl: connUrl,
          accountId: Number(connAccountId),
          active: connActive,
          apiAccessToken: connToken ? connToken : undefined,
        });
      } else {
        await api.createConnection({
          name: connName,
          baseUrl: connUrl,
          accountId: Number(connAccountId),
          apiAccessToken: connToken,
          active: connActive,
        });
      }
      setIsConnModalOpen(false);
      await fetchConnections();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar conexão.');
    } finally {
      setSavingConn(false);
    }
  };

  const handleDeleteConnection = async (id: string) => {
    if (!confirm('Deseja excluir esta conexão do Chatwoot?')) return;
    try {
      await api.deleteConnection(id);
      await fetchConnections();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir conexão.');
    }
  };

  const handleSaveOpenAi = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOpenAi(true);
    setOpenAiTestResult(null);
    try {
      const updated = await api.updateOpenAISettings({
        apiKey: openAiKey ? openAiKey.trim() : undefined,
        model: openAiModel,
        defaultCount: openAiDefaultCount,
        defaultPrompt: openAiDefaultPrompt,
      });
      setOpenAiSettings(updated);
      setOpenAiKey('');
      setOpenAiTestResult({ success: true, message: 'Configurações da OpenAI salvas com sucesso!' });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar configurações da OpenAI.');
    } finally {
      setSavingOpenAi(false);
    }
  };

  const handleTestOpenAi = async () => {
    setTestingOpenAi(true);
    setOpenAiTestResult(null);
    try {
      const res = await api.testOpenAI(openAiKey || undefined, openAiModel);
      setOpenAiTestResult(res);
    } catch (err: unknown) {
      setOpenAiTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Erro no teste da API OpenAI.',
      });
    } finally {
      setTestingOpenAi(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      alert('Informe a senha atual para confirmar alterações.');
      return;
    }
    setSavingProfile(true);
    setProfileMessage(null);
    try {
      const res = await api.updateProfile({
        currentPassword,
        newUsername: newUsername !== currentUsername ? newUsername : undefined,
        newPassword: newPassword ? newPassword : undefined,
      });
      setProfileMessage({ success: true, text: 'Credenciais atualizadas com sucesso!' });
      setCurrentPassword('');
      setNewPassword('');
      if (res.user?.username) {
        onProfileUpdated(res.user.username);
      }
    } catch (err: unknown) {
      setProfileMessage({
        success: false,
        text: err instanceof Error ? err.message : 'Erro ao atualizar credenciais.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Configurações Gerais</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Conexões com Chatwoot, chaves da OpenAI e credenciais de acesso do usuário.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('chatwoot')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 ${
            activeTab === 'chatwoot'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Radio className="w-3.5 h-3.5 text-emerald-600" />
          <span>Conexões Chatwoot</span>
        </button>
        <button
          onClick={() => setActiveTab('openai')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 ${
            activeTab === 'openai'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>OpenAI & IA</span>
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 ${
            activeTab === 'profile'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <User className="w-3.5 h-3.5 text-slate-700" />
          <span>Credenciais & Usuário</span>
        </button>
        <button
          onClick={() => setActiveTab('cloud')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 ${
            activeTab === 'cloud'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-sky-600" />
          <span>Banco de Dados & Nuvem</span>
        </button>
      </div>

      {/* TAB 1: Chatwoot */}
      {activeTab === 'chatwoot' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Instalações Chatwoot</h2>
              <p className="text-xs text-slate-500">
                Cadastre suas instâncias do Chatwoot com URL base e Access Token.
              </p>
            </div>
            <button
              onClick={openNewConnectionModal}
              className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Conexão</span>
            </button>
          </div>

          {loadingConns ? (
            <div className="p-8 text-center text-xs text-slate-500">Carregando conexões...</div>
          ) : connections.length === 0 ? (
            <div className="p-8 text-center bg-white border border-slate-200 rounded-xl">
              <Radio className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-800">Nenhuma conexão cadastrada</h3>
              <p className="text-xs text-slate-500 mt-1">
                Adicione a URL do seu servidor Chatwoot e o token de acesso da sua conta.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="p-5 bg-white border border-slate-200 rounded-xl flex flex-col justify-between shadow-xs"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-sm text-slate-900">{conn.name}</h3>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                          conn.active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {conn.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-1 truncate">{conn.baseUrl}</p>
                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                      <div>
                        Account ID: <strong className="font-mono">{conn.accountId}</strong>
                      </div>
                      <div>
                        Access Token: <span className="font-mono text-slate-400">{conn.apiAccessToken}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs mt-4">
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(conn.updatedAt).toLocaleDateString('pt-BR')}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditConnectionModal(conn)}
                        className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                        title="Editar conexão"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteConnection(conn.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Modal to Add/Edit Chatwoot Connection */}
          {isConnModalOpen && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {editingConn ? 'Editar Conexão Chatwoot' : 'Cadastrar Conexão Chatwoot'}
                  </h3>
                  <button
                    onClick={() => setIsConnModalOpen(false)}
                    className="text-xs text-slate-400 hover:text-slate-700"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveConnection} className="p-6 space-y-4 overflow-y-auto">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nome da Conexão *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: VR Multimarcas, Suporte Norte Telecom"
                      value={connName}
                      onChange={(e) => setConnName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      URL Base do Chatwoot *
                    </label>
                    <input
                      type="url"
                      required
                      placeholder="https://conversa.nortetelecom.net.br"
                      value={connUrl}
                      onChange={(e) => setConnUrl(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Account ID *
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={connAccountId}
                        onChange={(e) => setConnAccountId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono text-slate-900"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <input
                        type="checkbox"
                        id="connActiveCheck"
                        checked={connActive}
                        onChange={(e) => setConnActive(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <label htmlFor="connActiveCheck" className="text-xs font-medium text-slate-700">
                        Conexão Ativa
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      API Access Token {editingConn ? '(deixe em branco para manter o atual)' : '*'}
                    </label>
                    <input
                      type="password"
                      required={!editingConn}
                      placeholder={editingConn ? '••••••••' : 'Cole o access token gerado no Chatwoot'}
                      value={connToken}
                      onChange={(e) => setConnToken(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Obtido em Chatwoot &gt; Configurações do Perfil &gt; Access Token. Criptografado no backend.
                    </p>
                  </div>

                  {/* Test Connection Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={testingConn}
                      onClick={handleTestConnectionLive}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {testingConn ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Testando conexão com Chatwoot...</span>
                        </>
                      ) : (
                        <>
                          <Radio className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Testar Conexão e Buscar Inboxes</span>
                        </>
                      )}
                    </button>
                  </div>

                  {testResult && (
                    <div
                      className={`p-3 rounded-lg text-xs ${
                        testResult.success
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border border-rose-200 text-rose-800'
                      }`}
                    >
                      {testResult.success ? (
                        <div>
                          <p className="font-semibold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Conexão bem-sucedida!
                          </p>
                          <p className="mt-1 text-[11px]">
                            {testResult.inboxes?.length || 0} canal(is)/inbox encontrados na conta.
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-semibold flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                            Falha na conexão:
                          </p>
                          <p className="mt-1 text-[11px] font-mono">{testResult.error}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsConnModalOpen(false)}
                      className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingConn}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
                    >
                      {savingConn ? 'Salvando...' : 'Salvar Conexão'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: OpenAI */}
      {activeTab === 'openai' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-sm font-semibold text-slate-900">Configuração da API OpenAI</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Utilizada para sugerir variações inteligentes de mensagens mantendo a intenção comercial e variáveis.
            </p>
          </div>

          <form onSubmit={handleSaveOpenAi} className="space-y-4 max-w-xl">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                OpenAI API Key
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder={openAiSettings?.apiKey ? openAiSettings.apiKey : 'sk-proj-...'}
                  value={openAiKey}
                  onChange={(e) => setOpenAiKey(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  disabled={testingOpenAi}
                  onClick={handleTestOpenAi}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                >
                  {testingOpenAi ? 'Testando...' : 'Testar Chave'}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Armazenada com criptografia de ponta a ponta no backend.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Modelo da OpenAI
                </label>
                <select
                  value={openAiModel}
                  onChange={(e) => setOpenAiModel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-medium text-slate-900"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Rápido e Econômico)</option>
                  <option value="gpt-4o">gpt-4o (Alta Precisão)</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantidade Padrão de Variações
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={openAiDefaultCount}
                  onChange={(e) => setOpenAiDefaultCount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Prompt Padrão de Geração
              </label>
              <textarea
                rows={3}
                value={openAiDefaultPrompt}
                onChange={(e) => setOpenAiDefaultPrompt(e.target.value)}
                placeholder="Instrução do sistema para guiar a IA..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-900 leading-relaxed font-sans"
              />
            </div>

            {openAiTestResult && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  openAiTestResult.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}
              >
                {openAiTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{openAiTestResult.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={savingOpenAi}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs cursor-pointer"
            >
              {savingOpenAi ? 'Salvando...' : 'Salvar Configurações da OpenAI'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: User Profile & Credentials */}
      {activeTab === 'profile' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-sm font-semibold text-slate-900">Alterar Credenciais de Acesso</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Substitua o usuário e senha temporários iniciais (Edgard / edgard@123) por seus dados definitivos.
            </p>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome de Usuário
              </label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Senha Atual (para confirmar alteração) *
              </label>
              <input
                type="password"
                required
                placeholder="Informe sua senha atual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nova Senha (deixe em branco se desejar manter a mesma)
              </label>
              <input
                type="password"
                placeholder="Nova senha segura"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-900"
              />
            </div>

            {profileMessage && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  profileMessage.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}
              >
                {profileMessage.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{profileMessage.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={savingProfile}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs cursor-pointer"
            >
              {savingProfile ? 'Atualizando...' : 'Atualizar Credenciais'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: Banco de Dados & Nuvem */}
      {activeTab === 'cloud' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Persistência em Nuvem & Backup Permanente</h2>
            <p className="text-xs text-slate-500">
              O SendFlow agora está integrado ao Firebase Firestore. Suas campanhas, contatos e configurações ficam protegidos na nuvem de forma permanente.
            </p>
          </div>

          {/* Status Card */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-xs">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-slate-900">Firebase Firestore</h3>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Ativo & Conectado
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Projeto: <code className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{syncStatus?.projectId || 'ai-studio-applet-webapp-cea53'}</code>
                  </p>
                </div>
              </div>

              <button
                onClick={handleBackupNow}
                disabled={syncLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
                <span>{syncLoading ? 'Salvando...' : 'Salvar na Nuvem Agora'}</span>
              </button>
            </div>

            {syncMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{syncMessage}</span>
              </div>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-[11px] text-slate-500 font-medium">Campanhas Protegidas</span>
                <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                  {syncStatus?.campaignsCount ?? 0}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-[11px] text-slate-500 font-medium">Listas de Contatos</span>
                <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                  {syncStatus?.contactListsCount ?? 0}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-[11px] text-slate-500 font-medium">Conexões Chatwoot</span>
                <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                  {syncStatus?.connectionsCount ?? 0}
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-500 bg-sky-50 border border-sky-200/70 p-3.5 rounded-lg flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Auto-Restauração Automática:</strong> Sempre que o servidor reiniciar após um período de inatividade, o SendFlow busca e restaura o snapshot mais recente do Firestore automaticamente em segundo plano.
              </p>
            </div>
          </div>

          {/* Manual Backup & Restore Section */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-xs">
            <div>
              <h3 className="font-semibold text-sm text-slate-900">Backup Local em Arquivo (.JSON)</h3>
              <p className="text-xs text-slate-500">
                Exporte todo o banco de dados do sistema em um arquivo portátil ou importe um arquivo previamente salvo.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={handleExportBackup}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Baixar Backup Completo (.JSON)</span>
              </button>

              <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors shadow-xs cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-slate-600" />
                <span>Restaurar de Arquivo (.JSON)</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleRestoreFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
