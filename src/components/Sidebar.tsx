import React from 'react';
import {
  LayoutDashboard,
  Send,
  PlusCircle,
  MessageSquare,
  Users,
  Settings,
  LogOut,
  Radio,
  ExternalLink,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'campaigns'
  | 'new-campaign'
  | 'templates'
  | 'contact-lists'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  username: string;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  username,
  onLogout,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Campanhas', icon: Send },
    { id: 'new-campaign', label: 'Nova Campanha', icon: PlusCircle },
    { id: 'templates', label: 'Mensagens', icon: MessageSquare },
    { id: 'contact-lists', label: 'Listas de Contatos', icon: Users },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-screen border-r border-slate-800 selection:bg-slate-700">
      {/* Brand Zone */}
      <div className="p-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <img
            src="/assets/aistudio/I_cone_de_Fita_S_em_Gradiente_dffbab2c.png"
            alt="SendFlow Logo"
            className="w-9 h-9 rounded-lg object-contain shadow-xs bg-white/5 p-0.5 border border-white/10"
          />
          <div className="flex flex-col">
            <span className="font-semibold text-white tracking-tight text-base whitespace-nowrap">
              SendFlow
            </span>
            <span className="text-xs text-slate-400 font-medium">Chatwoot Campanhas</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id as NavTab)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap text-left ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Chatwoot API documentation link */}
      <div className="p-4 mx-3 mb-3 bg-slate-800/40 rounded-lg border border-slate-800 text-xs text-slate-400">
        <div className="flex items-center justify-between text-slate-300 font-medium mb-1">
          <span>Docs Oficiais</span>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
          API Application Chatwoot integrada para inboxes e contatos.
        </p>
        <a
          href="https://developers.chatwoot.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 hover:text-emerald-300 text-[11px] font-medium underline inline-flex items-center gap-1"
        >
          developers.chatwoot.com
        </a>
      </div>

      {/* User Footer Profile */}
      <div className="p-4 border-t border-slate-800/80 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200 shrink-0">
            {username.slice(0, 2).toUpperCase()}
          </div>
          <div className="truncate">
            <p className="text-xs font-semibold text-white truncate">{username}</p>
            <p className="text-[11px] text-slate-400">Administrador</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          title="Sair da conta"
          className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
