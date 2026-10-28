import React, { useState, useEffect } from 'react';
import { Sidebar, NavTab } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { CampaignsPage } from './pages/CampaignsPage.tsx';
import { CampaignWizardPage } from './pages/CampaignWizardPage.tsx';
import { CampaignDetailPage } from './pages/CampaignDetailPage.tsx';
import { TemplatesPage } from './pages/TemplatesPage.tsx';
import { ContactListsPage } from './pages/ContactListsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { api, authStorage } from './services/api.ts';
import { testFirestoreConnection } from './services/firebase.ts';
import type { Campaign, User } from './types/index.ts';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignToClone, setCampaignToClone] = useState<Partial<Campaign> | null>(null);
  const [activeCampaignCount, setActiveCampaignCount] = useState(0);

  // Check existing session and test Firestore connectivity
  useEffect(() => {
    testFirestoreConnection();
    async function verifyAuth() {
      const token = authStorage.getToken();
      if (!token) {
        setAuthChecked(true);
        return;
      }
      try {
        const { user } = await api.getMe();
        setCurrentUser(user);
      } catch {
        authStorage.clear();
        setCurrentUser(null);
      } finally {
        setAuthChecked(true);
      }
    }
    verifyAuth();

    // Listen to expiration
    const handleExpired = () => {
      setCurrentUser(null);
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  // Poll active campaigns count for top bar
  useEffect(() => {
    if (!currentUser) return;
    async function checkActive() {
      try {
        const dash = await api.getDashboard();
        setActiveCampaignCount(dash.activeCampaigns || 0);
      } catch {
        // ignore
      }
    }
    checkActive();
    const interval = setInterval(checkActive, 10000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setCurrentTab('dashboard');
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
  };

  const handleSelectCampaign = (id: string) => {
    setSelectedCampaignId(id);
  };

  const handleCloneCampaign = (camp: Campaign) => {
    setCampaignToClone(camp);
    setSelectedCampaignId(null);
    setCurrentTab('new-campaign');
  };

  const handleCampaignCreated = (campaignId: string) => {
    setCampaignToClone(null);
    setSelectedCampaignId(campaignId);
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 text-xs">
        Carregando SendFlow...
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={selectedCampaignId ? 'campaigns' : currentTab}
        onSelectTab={(tab) => {
          setSelectedCampaignId(null);
          setCampaignToClone(null);
          setCurrentTab(tab);
        }}
        username={currentUser.username}
        onLogout={handleLogout}
      />

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <Header
          currentTab={selectedCampaignId ? 'campaigns' : currentTab}
          onNewCampaignClick={() => {
            setSelectedCampaignId(null);
            setCampaignToClone(null);
            setCurrentTab('new-campaign');
          }}
          activeCampaignCount={activeCampaignCount}
        />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto">
          {selectedCampaignId ? (
            <CampaignDetailPage
              campaignId={selectedCampaignId}
              onBack={() => setSelectedCampaignId(null)}
              onCloneCampaign={handleCloneCampaign}
            />
          ) : currentTab === 'dashboard' ? (
            <DashboardPage
              onNavigateToNewCampaign={() => {
                setCampaignToClone(null);
                setCurrentTab('new-campaign');
              }}
              onNavigateToCampaigns={() => setCurrentTab('campaigns')}
              onNavigateToContacts={() => setCurrentTab('contact-lists')}
              onSelectCampaign={handleSelectCampaign}
            />
          ) : currentTab === 'campaigns' ? (
            <CampaignsPage
              onSelectCampaign={handleSelectCampaign}
              onNewCampaign={() => {
                setCampaignToClone(null);
                setCurrentTab('new-campaign');
              }}
              onCloneCampaign={handleCloneCampaign}
            />
          ) : currentTab === 'new-campaign' ? (
            <CampaignWizardPage
              initialCloneData={campaignToClone}
              onCampaignCreated={handleCampaignCreated}
              onCancel={() => {
                setCampaignToClone(null);
                setCurrentTab('campaigns');
              }}
            />
          ) : currentTab === 'templates' ? (
            <TemplatesPage />
          ) : currentTab === 'contact-lists' ? (
            <ContactListsPage />
          ) : currentTab === 'settings' ? (
            <SettingsPage
              currentUsername={currentUser.username}
              onProfileUpdated={(name) => {
                setCurrentUser((prev) => (prev ? { ...prev, username: name } : null));
              }}
            />
          ) : null}
        </main>

        {/* Global Application Footer */}
        <footer className="py-2.5 px-6 bg-white border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">SendFlow</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500 text-[11px]">Plataforma de Disparos via Chatwoot</span>
          </div>
          <div className="text-[11px] font-medium text-slate-600">
            Desenvolvido por Edgard Mendes | (91) 99168-7851
          </div>
        </footer>
      </div>
    </div>
  );
}
