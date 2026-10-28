import React from 'react';
import { PlusCircle, Radio } from 'lucide-react';
import { NavTab } from './Sidebar.tsx';

interface HeaderProps {
  currentTab: NavTab;
  onNewCampaignClick?: () => void;
  activeCampaignCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onNewCampaignClick,
  activeCampaignCount = 0,
}) => {
  const getBreadcrumbs = () => {
    switch (currentTab) {
      case 'dashboard':
        return 'Visão Geral / Painel de Métricas';
      case 'campaigns':
        return 'Campanhas / Gerenciamento de Envios';
      case 'new-campaign':
        return 'Campanhas / Assistente de Nova Campanha';
      case 'templates':
        return 'Biblioteca / Modelos de Mensagens';
      case 'contact-lists':
        return 'Contatos / Listas e Importação CSV';
      case 'settings':
        return 'Sistema / Configurações Chatwoot e OpenAI';
      default:
        return 'Campanhas';
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 shrink-0">
      {/* Zone 1: Contextual Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
        <span className="text-slate-900 font-semibold">{getBreadcrumbs().split(' / ')[0]}</span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-600">{getBreadcrumbs().split(' / ')[1]}</span>
      </div>

      {/* Zone 2: Status Indicator & Primary Action */}
      <div className="flex items-center gap-4">
        {activeCampaignCount > 0 && (
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-md">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-600" />
            <span>{activeCampaignCount} campanha em andamento</span>
          </div>
        )}

        {currentTab !== 'new-campaign' && onNewCampaignClick && (
          <button
            onClick={onNewCampaignClick}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Nova Campanha</span>
          </button>
        )}
      </div>
    </header>
  );
};
