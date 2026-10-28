import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Copy,
  Edit2,
  Trash2,
  Search,
  Check,
  Calendar,
  Layers,
  Image as ImageIcon,
  UploadCloud,
  X,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api.ts';
import type { MessageTemplate } from '../types/index.ts';

export const TemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MessageTemplate['category']>('Vendas');
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [mediaFilename, setMediaFilename] = useState<string>('');
  const [hasPhoto, setHasPhoto] = useState<boolean>(false);
  const [uploadingMedia, setUploadingMedia] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = ['Todas', 'Vendas', 'Follow-up', 'Promoção', 'Cobrança', 'Pós-venda', 'Geral'];

  const fetchTemplates = async () => {
    try {
      const data = await api.getTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const openCreateModal = () => {
    setEditingTemplate(null);
    setTitle('');
    setCategory('Vendas');
    setContent('');
    setMediaUrl('');
    setMediaFilename('');
    setHasPhoto(false);
    setIsModalOpen(true);
  };

  const openEditModal = (tmpl: MessageTemplate) => {
    setEditingTemplate(tmpl);
    setTitle(tmpl.title);
    setCategory(tmpl.category);
    setContent(tmpl.content);
    setMediaUrl(tmpl.mediaUrl || '');
    setMediaFilename(tmpl.mediaFilename || '');
    setHasPhoto(Boolean(tmpl.mediaUrl));
    setIsModalOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione um arquivo de imagem (JPEG, PNG, WebP, etc.).');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      alert('O tamanho da foto não pode exceder 15MB.');
      return;
    }

    setUploadingMedia(true);
    try {
      const res = await api.uploadMedia(file);
      if (res && res.url) {
        setMediaUrl(res.url);
        setMediaFilename(res.filename || file.name);
        setHasPhoto(true);
      } else {
        alert('Erro ao fazer upload da imagem.');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha no upload da foto');
    } finally {
      setUploadingMedia(false);
      e.target.value = '';
    }
  };

  const handleDuplicate = async (tmpl: MessageTemplate) => {
    try {
      await api.createTemplate({
        title: `${tmpl.title} (Cópia)`,
        category: tmpl.category,
        content: tmpl.content,
        mediaUrl: tmpl.mediaUrl,
        mediaFilename: tmpl.mediaFilename,
      });
      await fetchTemplates();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao duplicar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este modelo de mensagem?')) return;
    try {
      await api.deleteTemplate(id);
      await fetchTemplates();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSaving(true);
    try {
      if (editingTemplate) {
        await api.updateTemplate(editingTemplate.id, {
          title,
          category,
          content,
          mediaUrl: hasPhoto && mediaUrl ? mediaUrl : undefined,
          mediaFilename: hasPhoto && mediaFilename ? mediaFilename : undefined,
        });
      } else {
        await api.createTemplate({
          title,
          category,
          content,
          mediaUrl: hasPhoto && mediaUrl ? mediaUrl : undefined,
          mediaFilename: hasPhoto && mediaFilename ? mediaFilename : undefined,
        });
      }
      setIsModalOpen(false);
      await fetchTemplates();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyContent = (tmpl: MessageTemplate) => {
    navigator.clipboard.writeText(tmpl.content);
    setCopiedId(tmpl.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = templates.filter((t) => {
    if (selectedCategory !== 'Todas' && t.category !== selectedCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Biblioteca de Mensagens
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Modelos prontos e testados para reutilizar em campanhas do Chatwoot.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Modelo</span>
        </button>
      </div>

      {/* Toolbar & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar por título ou texto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 w-64 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-xl">
          <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-800">Nenhum modelo encontrado</h3>
          <p className="text-xs text-slate-500 mt-1">Crie um novo modelo para salvar seus textos frequentes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tmpl) => (
            <div
              key={tmpl.id}
              className="p-5 bg-white border border-slate-200 rounded-xl flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h3 className="font-semibold text-sm text-slate-900 truncate">{tmpl.title}</h3>
                    {tmpl.mediaUrl && (
                      <span className="shrink-0 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded font-medium inline-flex items-center gap-0.5">
                        <ImageIcon className="w-2.5 h-2.5" />
                        Legenda
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 shrink-0">
                    {tmpl.category}
                  </span>
                </div>

                {tmpl.mediaUrl && (
                  <div className="mb-2 relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100 max-h-32">
                    <img
                      src={tmpl.mediaUrl}
                      alt={tmpl.title}
                      className="w-full h-28 object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                <p className="text-xs text-slate-600 line-clamp-4 leading-relaxed whitespace-pre-line mb-4 bg-slate-50/60 p-3 rounded-lg border border-slate-100 font-sans">
                  {tmpl.content}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span>Usado {tmpl.usageCount || 0}x</span>
                  <span>·</span>
                  <span className="font-mono tabular-nums">
                    {new Date(tmpl.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-slate-500">
                  <button
                    onClick={() => handleCopyContent(tmpl)}
                    className="p-1.5 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                    title="Copiar texto"
                  >
                    {copiedId === tmpl.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDuplicate(tmpl)}
                    className="p-1.5 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                    title="Duplicar modelo"
                  >
                    <Layers className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => openEditModal(tmpl)}
                    className="p-1.5 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(tmpl.id)}
                    className="p-1.5 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
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

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingTemplate ? 'Editar Modelo de Mensagem' : 'Novo Modelo de Mensagem'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Título do Modelo
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Follow-up de Vendas Proposta"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as MessageTemplate['category'])}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-900"
                >
                  <option value="Vendas">Vendas</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Promoção">Promoção</option>
                  <option value="Cobrança">Cobrança</option>
                  <option value="Pós-venda">Pós-venda</option>
                  <option value="Geral">Geral</option>
                </select>
              </div>

              {/* Photo with Caption Toggle & Upload in Template */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">
                        Foto com Legenda (Caption)
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Anexar foto ao modelo para disparo conjunto
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={hasPhoto}
                    onChange={(e) => {
                      setHasPhoto(e.target.checked);
                      if (!e.target.checked) {
                        setMediaUrl('');
                        setMediaFilename('');
                      }
                    }}
                    className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </div>

                {hasPhoto && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    {mediaUrl ? (
                      <div className="flex items-center justify-between gap-3 p-2 bg-white rounded border border-emerald-200">
                        <img
                          src={mediaUrl}
                          alt="Foto"
                          className="w-12 h-12 rounded object-cover border border-slate-200 shrink-0"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium text-slate-800 block truncate">
                            {mediaFilename || 'foto.jpg'}
                          </span>
                          <span className="text-[10px] text-emerald-600 font-medium">
                            Foto pronta para legenda
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setMediaUrl('');
                            setMediaFilename('');
                          }}
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                          title="Remover foto"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 p-3 bg-white border border-dashed border-emerald-300 rounded-lg cursor-pointer hover:bg-emerald-50/30 transition-colors">
                        {uploadingMedia ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                            <span className="text-xs text-slate-600">Enviando foto...</span>
                          </>
                        ) : (
                          <>
                            <UploadCloud className="w-4 h-4 text-emerald-600" />
                            <span className="text-xs font-medium text-emerald-700">
                              Escolher foto do computador
                            </span>
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
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    {hasPhoto ? 'Legenda da Foto (Caption)' : 'Conteúdo da Mensagem'}
                  </label>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <button
                      type="button"
                      onClick={() => setContent((prev) => prev + ' {{name}}')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-mono"
                    >
                      + {'{{name}}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setContent((prev) => prev + ' {{phone_number}}')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-mono"
                    >
                      + {'{{phone_number}}'}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={5}
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Olá {{name}}, temos uma condição especial..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-900 leading-relaxed font-sans focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
                >
                  {saving ? 'Salvando...' : 'Salvar Modelo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
