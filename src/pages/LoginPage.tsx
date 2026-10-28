import React, { useState } from 'react';
import { Radio, Lock, User as UserIcon, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '../services/api.ts';
import type { User } from '../types/index.ts';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('Edgard');
  const [password, setPassword] = useState('edgard@123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await api.login(username.trim(), password);
      onLoginSuccess(response.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      {/* Container */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
        {/* Top Header Card */}
        <div className="bg-slate-900 p-8 text-white relative">
          <div className="flex items-center gap-3 mb-3">
            <img
              src="/assets/aistudio/I_cone_de_Fita_S_em_Gradiente_dffbab2c.png"
              alt="SendFlow Logo"
              className="w-12 h-12 rounded-xl object-contain shadow-sm bg-white/5 p-1 border border-white/10"
            />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">SendFlow</h1>
              <p className="text-xs text-slate-400">Gestão e Disparo de Campanhas</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed mt-2">
            Autentique-se para gerenciar conexões com Chatwoot, filas de envio e variações com IA.
          </p>
        </div>

        {/* Form Body */}
        <div className="p-8">
          {error && (
            <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
              <span className="font-semibold">Erro:</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Usuário
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nome de usuário"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha segura"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <span>Verificando...</span>
              ) : (
                <>
                  <span>Acessar Painel</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Notice about credentials */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-start gap-2.5 text-slate-500 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-700">Credenciais Temporárias Iniciais:</p>
              <p className="text-[11px] text-slate-500">
                Usuário: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-mono">Edgard</code> · 
                Senha: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-mono">edgard@123</code>
              </p>
              <p className="text-[11px] text-slate-400">
                Você poderá alterar usuário e senha na aba Configurações após entrar.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Developer Footer */}
      <footer className="mt-6 text-center text-xs text-slate-400 font-medium">
        Desenvolvido por Edgard Mendes | (91) 99168-7851
      </footer>
    </div>
  );
};
