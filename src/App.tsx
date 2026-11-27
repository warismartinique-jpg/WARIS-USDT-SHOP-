import { useCallback, useEffect, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OrderRecord, PublicConfig } from './types/platform';
import { Logo } from './components/Logo';
import { LandingPage } from './components/LandingPage';
import { BuyUsdtForm } from './components/BuyUsdtForm';
import { AuthView } from './components/AuthView';
import { ClientDashboard } from './components/ClientDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { SupportModal } from './components/SupportModal';
import { LegalModal } from './components/LegalModal';

type ViewMode = 'home' | 'buy' | 'client' | 'admin' | 'auth';

function MainShell() {
  const { firebaseUser, profile, unreadNotifications, signOut, loading: authLoading } = useAuth();
  const [view, setView] = useState<ViewMode>('home');
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [prefillCountry, setPrefillCountry] = useState<string | undefined>(undefined);
  const [prefillUsdt, setPrefillUsdt] = useState<number | undefined>(undefined);
  const [selectedOrderRef, setSelectedOrderRef] = useState<string | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      setConfigError(null);
      const resp = await fetch('/api/public/config');
      if (!resp.ok) throw new Error('Erreur de chargement de la configuration.');
      const data = (await resp.json()) as PublicConfig;
      setConfig(data);
    } catch (err) {
      setConfigError(
        err instanceof Error ? err.message : 'Impossible de contacter le serveur.'
      );
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleStartBuy = (countryCode?: string, usdtAmount?: number) => {
    setPrefillCountry(countryCode);
    setPrefillUsdt(usdtAmount);
    setView('buy');
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOrderCreated = (order: OrderRecord) => {
    setSelectedOrderRef(order.reference);
    setView('client');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigate = (next: ViewMode) => {
    setView(next);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => navigate('home')}
            className="cursor-pointer focus:outline-none whitespace-nowrap shrink-0"
          >
            <Logo />
          </button>

          {/* Zone 2: Concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => navigate('home')}
              className={`hover:text-[#0B1528] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'home' ? 'text-[#0B1528] font-semibold' : ''
              }`}
            >
              Accueil
            </button>
            <button
              type="button"
              onClick={() => handleStartBuy()}
              className={`hover:text-[#0B1528] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'buy' ? 'text-[#0B1528] font-semibold' : ''
              }`}
            >
              Acheter
            </button>
            <button
              type="button"
              onClick={() => navigate(firebaseUser ? 'client' : 'auth')}
              className={`hover:text-[#0B1528] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'client' || view === 'auth' ? 'text-[#0B1528] font-semibold' : ''
              }`}
            >
              Espace client{unreadNotifications > 0 ? ` (${unreadNotifications})` : ''}
            </button>
            {profile?.role === 'admin' ? (
              <button
                type="button"
                onClick={() => navigate('admin')}
                className={`hover:text-[#0B1528] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  view === 'admin' ? 'text-emerald-700 font-semibold' : ''
                }`}
              >
                Administration
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowSupport(true)}
                className="hover:text-[#0B1528] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Assistance
              </button>
            )}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            {firebaseUser ? (
              <div className="hidden md:flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStartBuy()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Acheter des USDT
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    navigate('home');
                  }}
                  title="Se déconnecter"
                  className="p-2 text-slate-500 hover:text-[#0B1528] rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate('auth')}
                className="hidden md:inline-flex px-4 py-2 text-xs font-semibold text-white bg-[#0B1528] rounded-lg hover:bg-[#152645] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Connexion
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-2">
            <button
              type="button"
              onClick={() => navigate('home')}
              className="block w-full text-left py-2.5 text-sm font-medium text-slate-800"
            >
              Accueil
            </button>
            <button
              type="button"
              onClick={() => handleStartBuy()}
              className="block w-full text-left py-2.5 text-sm font-medium text-slate-800"
            >
              Acheter des USDT
            </button>
            <button
              type="button"
              onClick={() => navigate(firebaseUser ? 'client' : 'auth')}
              className="block w-full text-left py-2.5 text-sm font-medium text-slate-800"
            >
              {firebaseUser ? 'Mon espace client' : 'Connexion / Inscription'}
            </button>
            {profile?.role === 'admin' && (
              <button
                type="button"
                onClick={() => navigate('admin')}
                className="block w-full text-left py-2.5 text-sm font-semibold text-emerald-700"
              >
                Administration
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setShowSupport(true);
              }}
              className="block w-full text-left py-2.5 text-sm font-medium text-slate-800"
            >
              Assistance
            </button>
            {firebaseUser && (
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate('home');
                }}
                className="block w-full text-left py-2.5 text-sm font-medium text-rose-700"
              >
                Se déconnecter
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {configError && (
          <div className="max-w-3xl mx-auto mt-10 p-6 bg-white border border-rose-200 rounded-xl text-center space-y-3">
            <p className="text-sm font-semibold text-rose-800">{configError}</p>
            <button
              type="button"
              onClick={loadConfig}
              className="px-4 py-2 rounded-lg bg-[#0B1528] text-white text-xs font-semibold cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        )}

        {!config && !configError && (
          <div className="max-w-7xl mx-auto px-4 py-24 text-center text-sm text-slate-500">
            Chargement de WARIS USDT SHOP...
          </div>
        )}

        {config && view === 'home' && (
          <LandingPage
            config={config}
            onStartBuy={handleStartBuy}
            onOpenSupport={() => setShowSupport(true)}
            onOpenLegal={() => setShowLegal(true)}
          />
        )}

        {config && view === 'buy' && (
          <div className="py-10 px-4 sm:px-6 lg:px-8">
            <BuyUsdtForm
              config={config}
              initialCountryCode={prefillCountry}
              initialUsdtAmount={prefillUsdt}
              onOrderCreated={handleOrderCreated}
              onBack={() => navigate('home')}
            />
          </div>
        )}

        {config && view === 'auth' && (
          <div className="py-14 px-4">
            <AuthView onSuccess={() => navigate('client')} />
          </div>
        )}

        {config && view === 'client' && (
          <>
            {authLoading ? (
              <div className="py-20 text-center text-sm text-slate-500">
                Vérification de votre session...
              </div>
            ) : firebaseUser ? (
              <ClientDashboard
                config={config}
                initialSelectedRef={selectedOrderRef}
                onNewOrder={() => handleStartBuy()}
              />
            ) : (
              <div className="py-14 px-4">
                <AuthView onSuccess={() => navigate('client')} />
              </div>
            )}
          </>
        )}

        {config && view === 'admin' && (
          <>
            {profile?.role === 'admin' ? (
              <AdminDashboard onConfigUpdated={loadConfig} />
            ) : (
              <div className="max-w-lg mx-auto my-16 p-8 bg-white border border-slate-200 rounded-xl text-center space-y-3">
                <h2 className="font-display text-lg font-bold text-[#0B1528]">
                  Accès administrateur restreint
                </h2>
                <p className="text-sm text-slate-600">
                  Cette section est réservée aux comptes administrateurs vérifiés côté serveur.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('home')}
                  className="px-4 py-2 rounded-lg bg-[#0B1528] text-white text-xs font-semibold cursor-pointer"
                >
                  Retour à l’accueil
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {showSupport && config && (
        <SupportModal config={config} onClose={() => setShowSupport(false)} />
      )}
      {showLegal && <LegalModal onClose={() => setShowLegal(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainShell />
    </AuthProvider>
  );
}
