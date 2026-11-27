import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  AdminOverview,
  ExchangeRateConfig,
  OrderRecord,
  PaymentMethodConfig,
} from '../types/platform';
import { ORDER_STATUSES, formatMoney, getExplorerTxUrl } from '../shared/validation';
import { StatusBadge } from './StatusBadge';

interface AdminDashboardProps {
  onConfigUpdated: () => Promise<void>;
}

export function AdminDashboard({ onConfigUpdated }: AdminDashboardProps) {
  const { apiFetch } = useAuth();
  const [tab, setTab] = useState<'stats' | 'orders' | 'clients' | 'settings'>('orders');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Order filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCountry, setFilterCountry] = useState('ALL');
  const [filterOperator, setFilterOperator] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [copiedAddr, setCopiedAddr] = useState(false);

  // Order action inputs
  const [txHashInput, setTxHashInput] = useState('');
  const [paymentRefInput, setPaymentRefInput] = useState('');
  const [adminNotesInput, setAdminNotesInput] = useState('');
  const [verifyingTx, setVerifyingTx] = useState(false);
  const [verifyingPaygate, setVerifyingPaygate] = useState(false);
  const [updatingOrder, setUpdatingOrder] = useState(false);

  // Editable rate state
  const [editingRate, setEditingRate] = useState<Record<string, ExchangeRateConfig>>({});
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});

  // New payment method form
  const [newOpCountry, setNewOpCountry] = useState('TG');
  const [newOpCode, setNewOpCode] = useState('');
  const [newOpName, setNewOpName] = useState('');
  const [newOpNumber, setNewOpNumber] = useState('');

  // New country form
  const [newCountryCode, setNewCountryCode] = useState('');
  const [newCountryName, setNewCountryName] = useState('');
  const [newCountryCurr, setNewCountryCurr] = useState('');
  const [newCountrySym, setNewCountrySym] = useState('');
  const [newCountryDial, setNewCountryDial] = useState('');
  const [newCountryRate, setNewCountryRate] = useState('640');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch<AdminOverview>('/api/admin/overview');
      setData(resp);

      const rateMap: Record<string, ExchangeRateConfig> = {};
      for (const r of resp.rates) {
        rateMap[r.countryCode] = r;
      }
      setEditingRate(rateMap);

      const setMap: Record<string, string> = {};
      for (const s of resp.settings) {
        setMap[s.key] = s.value;
      }
      setSettingsForm(setMap);

      if (selectedOrder) {
        const refreshed = resp.orders.find((o) => o.id === selectedOrder.id);
        if (refreshed) {
          setSelectedOrder(refreshed);
          setTxHashInput(refreshed.blockchainTxHash || '');
          setPaymentRefInput(refreshed.paymentReference || '');
          setAdminNotesInput(refreshed.adminNotes || '');
        }
      } else if (resp.orders.length > 0) {
        const first = resp.orders[0];
        setSelectedOrder(first);
        setTxHashInput(first.blockchainTxHash || '');
        setPaymentRefInput(first.paymentReference || '');
        setAdminNotesInput(first.adminNotes || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement administrateur.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const filteredOrders = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.orders.filter((o) => {
      if (filterCountry !== 'ALL' && o.countryCode !== filterCountry) return false;
      if (filterOperator !== 'ALL' && o.paymentMethodCode !== filterOperator) return false;
      if (filterStatus !== 'ALL' && o.overallStatus !== filterStatus) return false;
      if (q) {
        const hay = `${o.reference} ${o.clientName} ${o.clientEmail} ${o.clientPhone} ${o.walletAddress}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, searchQuery, filterCountry, filterOperator, filterStatus]);

  const selectOrder = (o: OrderRecord) => {
    setSelectedOrder(o);
    setTxHashInput(o.blockchainTxHash || '');
    setPaymentRefInput(o.paymentReference || '');
    setAdminNotesInput(o.adminNotes || '');
    setFeedback(null);
    setError(null);
  };

  const handleCopyAddress = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleUpdateOrderStatus = async (overallStatus: string, paymentStatus?: string) => {
    if (!selectedOrder) return;
    setUpdatingOrder(true);
    setError(null);
    setFeedback(null);
    try {
      const resp = await apiFetch<{ order: OrderRecord }>(
        `/api/admin/orders/${selectedOrder.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            overallStatus,
            paymentStatus,
            paymentReference: paymentRefInput.trim(),
            adminNotes: adminNotesInput.trim(),
          }),
        }
      );
      setSelectedOrder(resp.order);
      setFeedback(`Commande ${resp.order.reference} mise à jour : ${resp.order.overallStatus}`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour.');
    } finally {
      setUpdatingOrder(false);
    }
  };

  const handleVerifyTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setVerifyingTx(true);
    setError(null);
    setFeedback(null);
    try {
      const resp = await apiFetch<{
        order: OrderRecord;
        verification: { verified: boolean; message: string };
      }>(`/api/admin/orders/${selectedOrder.id}/verify-tx`, {
        method: 'POST',
        body: JSON.stringify({ txHash: txHashInput.trim() }),
      });
      setSelectedOrder(resp.order);
      setFeedback(resp.verification.message);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la vérification blockchain.');
    } finally {
      setVerifyingTx(false);
    }
  };

  const handleVerifyPayGate = async () => {
    if (!selectedOrder) return;
    setVerifyingPaygate(true);
    setError(null);
    setFeedback(null);
    try {
      const resp = await apiFetch<{
        order: OrderRecord;
        verification: { paid: boolean; message: string };
      }>(`/api/orders/${selectedOrder.id}/paygate/verify`, {
        method: 'POST',
      });
      setSelectedOrder(resp.order);
      setFeedback(resp.verification.message);
      await loadOverview();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de vérifier la transaction auprès de PayGate Global.'
      );
    } finally {
      setVerifyingPaygate(false);
    }
  };

  const handleSaveRate = async (countryCode: string) => {
    const r = editingRate[countryCode];
    if (!r) return;
    setError(null);
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/rates/${countryCode}`, {
        method: 'PUT',
        body: JSON.stringify({
          sellRate: Number(r.sellRate),
          feePercent: Number(r.feePercent),
          fixedFeeLocal: Number(r.fixedFeeLocal),
          minUsdt: Number(r.minUsdt),
          maxUsdt: Number(r.maxUsdt),
        }),
      });
      setFeedback(`Taux mis à jour pour ${countryCode}.`);
      await Promise.all([loadOverview(), onConfigUpdated()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de mise à jour du taux.');
    }
  };

  const handleToggleMethod = async (
    m: PaymentMethodConfig,
    field: 'isActive' | 'isConfigured'
  ) => {
    setError(null);
    try {
      await apiFetch(`/api/admin/payment-methods/${m.id}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: !m[field] }),
      });
      await Promise.all([loadOverview(), onConfigUpdated()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur opérateur.');
    }
  };

  const handleUpdateMethodMerchant = async (m: PaymentMethodConfig, account: string) => {
    try {
      await apiFetch(`/api/admin/payment-methods/${m.id}`, {
        method: 'PUT',
        body: JSON.stringify({ merchantAccountNumber: account }),
      });
      setFeedback(`Coordonnées mises à jour pour ${m.name} (${m.countryCode}).`);
      await Promise.all([loadOverview(), onConfigUpdated()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur opérateur.');
    }
  };

  const handleAddOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/payment-methods', {
        method: 'POST',
        body: JSON.stringify({
          countryCode: newOpCountry,
          code: newOpCode,
          name: newOpName,
          merchantAccountNumber: newOpNumber,
          instructions: `Paiement ${newOpName} soumis à vérification.`,
        }),
      });
      setNewOpCode('');
      setNewOpName('');
      setNewOpNumber('');
      setFeedback('Nouvel opérateur ajouté.');
      await Promise.all([loadOverview(), onConfigUpdated()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’ajouter l’opérateur.');
    }
  };

  const handleAddCountry = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/countries', {
        method: 'POST',
        body: JSON.stringify({
          code: newCountryCode,
          name: newCountryName,
          currency: newCountryCurr,
          currencySymbol: newCountrySym,
          dialCode: newCountryDial,
          sellRate: Number(newCountryRate),
        }),
      });
      setNewCountryCode('');
      setNewCountryName('');
      setNewCountryCurr('');
      setNewCountrySym('');
      setNewCountryDial('');
      setFeedback('Nouveau pays et devise ajoutés.');
      await Promise.all([loadOverview(), onConfigUpdated()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’ajouter le pays.');
    }
  };

  const handleToggleCountry = async (code: string, current: boolean) => {
    try {
      await apiFetch(`/api/admin/countries/${code}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !current }),
      });
      await Promise.all([loadOverview(), onConfigUpdated()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur pays.');
    }
  };

  const handleToggleNetwork = async (code: string, current: boolean) => {
    try {
      await apiFetch(`/api/admin/networks/${code}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !current }),
      });
      await Promise.all([loadOverview(), onConfigUpdated()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau.');
    }
  };

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: settingsForm }),
      });
      setFeedback('Paramètres globaux enregistrés.');
      await Promise.all([loadOverview(), onConfigUpdated()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
    }
  };

  const handleUpdateClientKyc = async (clientId: number, kycStatus: string) => {
    try {
      await apiFetch(`/api/admin/clients/${clientId}/kyc`, {
        method: 'PATCH',
        body: JSON.stringify({ kycStatus }),
      });
      setFeedback('Statut KYC client mis à jour.');
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur KYC.');
    }
  };

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-sm text-slate-500">
        Chargement de la console d’administration...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-medium text-emerald-700">
            Administration sécurisée · Contrôle côté serveur
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1528] tracking-tight mt-1">
            Console de gestion WARIS USDT SHOP
          </h1>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-100 cursor-pointer whitespace-nowrap self-start"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualiser les données</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setTab('orders')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
            tab === 'orders'
              ? 'bg-white text-[#0B1528] shadow-sm'
              : 'text-slate-600 hover:text-[#0B1528]'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Commandes & Transferts ({data?.orders.length || 0})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('stats')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
            tab === 'stats'
              ? 'bg-white text-[#0B1528] shadow-sm'
              : 'text-slate-600 hover:text-[#0B1528]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Statistiques</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('clients')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
            tab === 'clients'
              ? 'bg-white text-[#0B1528] shadow-sm'
              : 'text-slate-600 hover:text-[#0B1528]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Clients & KYC ({data?.clients.length || 0})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('settings')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
            tab === 'settings'
              ? 'bg-white text-[#0B1528] shadow-sm'
              : 'text-slate-600 hover:text-[#0B1528]'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Taux, Opérateurs & Paramètres</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {error}
        </div>
      )}
      {feedback && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
          {feedback}
        </div>
      )}

      {/* TAB 1: ORDERS & MANUAL USDT TRANSFERS */}
      {tab === 'orders' && data && (
        <div className="space-y-6">
          {/* Search & Filters */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Référence, client, téléphone, adresse..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
            >
              <option value="ALL">Tous les pays</option>
              {data.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={filterOperator}
              onChange={(e) => setFilterOperator(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
            >
              <option value="ALL">Tous les opérateurs</option>
              <option value="TMONEY">T-Money / Mixx by Yas</option>
              <option value="FLOOZ">Moov Money / Flooz</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
            >
              <option value="ALL">Tous les statuts</option>
              {ORDER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div className="grid lg:grid-cols-12 gap-6 items-start">
            {/* Orders List */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                <h2 className="font-display text-sm font-bold text-[#0B1528]">
                  Commandes ({filteredOrders.length})
                </h2>
              </div>
              {filteredOrders.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Aucune commande ne correspond aux filtres sélectionnés.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[700px] overflow-y-auto">
                  {filteredOrders.map((o) => {
                    const active = selectedOrder?.id === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => selectOrder(o)}
                        className={`w-full text-left p-4 transition-colors cursor-pointer hover:bg-slate-50 ${
                          active ? 'bg-emerald-50/60' : 'bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-[#0B1528]">
                            {o.reference}
                          </span>
                          <StatusBadge status={o.overallStatus} />
                        </div>
                        <p className="text-xs font-medium text-slate-800 mt-1.5">
                          {o.clientName} · {o.clientPhone}
                        </p>
                        <div className="mt-1 flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-emerald-700 tabular-nums">
                            {Number(o.usdtAmount)} USDT ({o.network})
                          </span>
                          <span className="font-mono text-slate-700 tabular-nums">
                            {formatMoney(o.localAmount, o.currency)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {o.paymentMethodName} · {o.countryName}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected Order Processing Panel */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              {!selectedOrder ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Sélectionnez une commande à gauche pour vérifier le paiement, copier l’adresse
                  du client et exécuter le transfert USDT.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <p className="text-xs text-slate-500">Traitement de commande</p>
                      <h3 className="font-mono text-xl font-bold text-[#0B1528]">
                        {selectedOrder.reference}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        Créée le {new Date(selectedOrder.createdAt).toLocaleString('fr-FR')}
                      </p>
                    </div>
                    <StatusBadge status={selectedOrder.overallStatus} />
                  </div>

                  {/* Full Client & Transfer Summary */}
                  <div className="grid sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-slate-500 block">Client</span>
                      <span className="font-semibold text-[#0B1528]">
                        {selectedOrder.clientName}
                      </span>
                      <span className="block text-slate-600">{selectedOrder.clientEmail}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Téléphone & Mobile Money</span>
                      <span className="font-mono font-semibold text-[#0B1528]">
                        {selectedOrder.mobileMoneyNumber}
                      </span>
                      <span className="block text-slate-600">
                        {selectedOrder.paymentMethodName} ({selectedOrder.countryName})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Quantité de USDT à envoyer</span>
                      <span className="font-mono text-base font-bold text-emerald-700 tabular-nums">
                        {Number(selectedOrder.usdtAmount)} USDT
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Montant payé en devise locale</span>
                      <span className="font-mono text-base font-bold text-[#0B1528] tabular-nums">
                        {formatMoney(selectedOrder.localAmount, selectedOrder.currency)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Statut du paiement</span>
                      <span className="font-semibold text-[#0B1528]">
                        {selectedOrder.paymentStatus}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Statut de livraison</span>
                      <span className="font-semibold text-[#0B1528]">
                        {selectedOrder.deliveryStatus}
                      </span>
                    </div>
                  </div>

                  {/* Receiving Wallet Address with prominent COPIER L'ADRESSE button */}
                  <div className="p-4 rounded-xl border border-[#0B1528]/20 bg-[#0B1528] text-white space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-xs text-emerald-400 font-medium block">
                          Adresse du portefeuille de réception du client
                        </span>
                        <span className="font-mono text-xs text-slate-300">
                          Réseau sélectionné : {selectedOrder.network}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyAddress(selectedOrder.walletAddress)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {copiedAddr ? (
                          <>
                            <Check className="w-4 h-4" />
                            <span>ADRESSE COPIÉE</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>COPIER L’ADRESSE</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="font-mono text-xs sm:text-sm bg-white/10 p-3 rounded-lg break-all select-all">
                      {selectedOrder.walletAddress}
                    </p>
                  </div>

                  {/* Step A: Verify Mobile Money Payment */}
                  {(() => {
                    const matchedMethod = data.paymentMethods.find(
                      (m) =>
                        m.countryCode === selectedOrder.countryCode &&
                        m.code === selectedOrder.paymentMethodCode
                    );
                    const isPayGateOrder =
                      matchedMethod?.providerType === 'paygate_global' ||
                      ['TMONEY', 'FLOOZ'].includes(selectedOrder.paymentMethodCode.toUpperCase());
                    const isPaymentConfirmed =
                      selectedOrder.paymentStatus === 'Paiement confirmé';

                    return (
                      <div className="p-4 rounded-lg border border-slate-200 space-y-3">
                        <h4 className="font-display text-sm font-bold text-[#0B1528]">
                          1. Vérification du paiement Mobile Money
                        </h4>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-slate-600 mb-1">
                              Référence de transaction opérateur
                            </label>
                            <input
                              type="text"
                              value={paymentRefInput}
                              onChange={(e) => setPaymentRefInput(e.target.value)}
                              placeholder="ID transaction opérateur"
                              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-600 mb-1">
                              Notes internes administrateur
                            </label>
                            <input
                              type="text"
                              value={adminNotesInput}
                              onChange={(e) => setAdminNotesInput(e.target.value)}
                              placeholder="Note de vérification..."
                              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                            />
                          </div>
                        </div>

                        {isPayGateOrder && !isPaymentConfirmed && (
                          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                            Commande PayGate Global : la confirmation manuelle est désactivée.
                            Utilisez obligatoirement « Vérifier via PayGate Global (API v2) » pour
                            valider le paiement avant toute livraison USDT.
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          {isPayGateOrder && (
                            <button
                              type="button"
                              disabled={verifyingPaygate}
                              onClick={handleVerifyPayGate}
                              className="px-3.5 py-2 rounded-lg border border-emerald-600 bg-emerald-50 text-emerald-900 text-xs font-semibold hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
                            >
                              {verifyingPaygate
                                ? 'Interrogation PayGate...'
                                : 'Vérifier via PayGate Global (API v2)'}
                            </button>
                          )}
                          {!isPayGateOrder && (
                            <button
                              type="button"
                              disabled={updatingOrder}
                              onClick={() =>
                                handleUpdateOrderStatus('Paiement confirmé', 'Paiement confirmé')
                              }
                              className="px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer whitespace-nowrap"
                            >
                              Confirmer le paiement
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={updatingOrder || !isPaymentConfirmed}
                            onClick={() => handleUpdateOrderStatus('Transfert en cours')}
                            className="px-3.5 py-2 rounded-lg bg-[#0B1528] text-white text-xs font-semibold hover:bg-[#152645] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                          >
                            Marquer « Transfert en cours »
                          </button>
                          <button
                            type="button"
                            disabled={updatingOrder}
                            onClick={() => handleUpdateOrderStatus('Commande en litige')}
                            className="px-3.5 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100 cursor-pointer whitespace-nowrap"
                          >
                            Mettre en litige
                          </button>
                          <button
                            type="button"
                            disabled={updatingOrder}
                            onClick={() =>
                              handleUpdateOrderStatus('Commande annulée', 'Paiement rejeté')
                            }
                            className="px-3.5 py-2 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs font-semibold hover:bg-rose-100 cursor-pointer whitespace-nowrap"
                          >
                            Rejeter / Annuler
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Step B: Blockchain TX Hash Verification */}
                  <form
                    onSubmit={handleVerifyTx}
                    className="p-4 rounded-lg border border-slate-200 space-y-3"
                  >
                    <h4 className="font-display text-sm font-bold text-[#0B1528]">
                      2. Enregistrement et vérification du hash blockchain ({selectedOrder.network})
                    </h4>
                    <p className="text-xs text-slate-600">
                      Après avoir envoyé les {Number(selectedOrder.usdtAmount)} USDT depuis votre
                      portefeuille vers l’adresse du client, collez le hash de transaction. Le
                      système interroge l’explorateur {selectedOrder.network} avant de valider la
                      livraison.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        required
                        value={txHashInput}
                        onChange={(e) => setTxHashInput(e.target.value)}
                        placeholder={
                          selectedOrder.network === 'TRC20'
                            ? 'Hash TRON (64 caractères hex)'
                            : 'Hash EVM (0x... 66 caractères)'
                        }
                        className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                      />
                      <button
                        type="submit"
                        disabled={verifyingTx}
                        className="px-4 py-2 rounded-lg bg-[#0B1528] text-white text-xs font-semibold hover:bg-[#152645] disabled:opacity-60 cursor-pointer whitespace-nowrap"
                      >
                        {verifyingTx
                          ? 'Vérification on-chain...'
                          : 'Vérifier sur la blockchain'}
                      </button>
                    </div>

                    {selectedOrder.blockchainTxHash && (
                      <div
                        className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                          selectedOrder.blockchainVerified
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                            : 'bg-amber-50 border-amber-200 text-amber-950'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4" />
                            <span>
                              {selectedOrder.blockchainVerified
                                ? 'Vérifié on-chain (destinataire & montant conformes)'
                                : 'Hash enregistré mais non confirmé automatiquement'}
                            </span>
                          </span>
                          <a
                            href={getExplorerTxUrl(
                              selectedOrder.network,
                              selectedOrder.blockchainTxHash
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold underline"
                          >
                            <span>Explorateur</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        {selectedOrder.blockchainVerifyDetails && (
                          <p>{selectedOrder.blockchainVerifyDetails}</p>
                        )}
                        {selectedOrder.blockchainVerified &&
                          selectedOrder.overallStatus !== 'Commande terminée' && (
                            <button
                              type="button"
                              disabled={updatingOrder}
                              onClick={() =>
                                handleUpdateOrderStatus('Commande terminée', 'Paiement confirmé')
                              }
                              className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Clôturer : Commande terminée</span>
                            </button>
                          )}
                      </div>
                    )}
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STATISTICS */}
      {tab === 'stats' && data && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Clients inscrits', val: data.stats.totalClients },
              { label: 'Total commandes', val: data.stats.totalOrders },
              { label: 'En attente', val: data.stats.pendingOrders },
              { label: 'Payées', val: data.stats.paidOrders },
              { label: 'En traitement', val: data.stats.processingOrders },
              { label: 'Terminées / Livrées', val: data.stats.completedOrders },
            ].map((item) => (
              <div key={item.label} className="p-4 bg-white border border-slate-200 rounded-xl">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="font-display text-2xl font-bold text-[#0B1528] tabular-nums mt-1">
                  {item.val}
                </p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4">
              <h3 className="font-display text-base font-bold text-[#0B1528]">
                Volume total vendu & Chiffre d’affaires
              </h3>
              <p className="font-display text-3xl font-bold text-emerald-700 tabular-nums">
                {data.stats.totalUsdtSold.toFixed(2)} USDT
              </p>
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <p className="text-xs font-medium text-slate-500">
                  Chiffre d’affaires confirmé par devise
                </p>
                {Object.keys(data.stats.revenueByCurrency).length === 0 ? (
                  <p className="text-xs text-slate-500">Aucun paiement confirmé pour l’instant.</p>
                ) : (
                  <div className="space-y-1.5">
                    {Object.entries(data.stats.revenueByCurrency).map(([curr, amt]) => (
                      <div key={curr} className="flex justify-between text-sm">
                        <span className="text-slate-600">{curr}</span>
                        <span className="font-mono font-bold text-[#0B1528] tabular-nums">
                          {formatMoney(amt, curr)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4">
              <h3 className="font-display text-base font-bold text-[#0B1528]">
                Statistiques quotidiennes et mensuelles
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Par jour</p>
                  {data.stats.dailyStats.length === 0 ? (
                    <p className="text-xs text-slate-400">Aucune donnée</p>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      {data.stats.dailyStats.map((d) => (
                        <div key={d.date} className="flex justify-between tabular-nums">
                          <span className="font-mono text-slate-600">{d.date}</span>
                          <span className="font-mono font-semibold text-[#0B1528]">
                            {d.orders} cmd · {d.usdt} USDT
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Par mois</p>
                  {data.stats.monthlyStats.length === 0 ? (
                    <p className="text-xs text-slate-400">Aucune donnée</p>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      {data.stats.monthlyStats.map((m) => (
                        <div key={m.month} className="flex justify-between tabular-nums">
                          <span className="font-mono text-slate-600">{m.month}</span>
                          <span className="font-mono font-semibold text-[#0B1528]">
                            {m.orders} cmd · {m.usdt} USDT
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CLIENTS & KYC */}
      {tab === 'clients' && data && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 font-semibold">Client</th>
                <th className="py-3 px-4 font-semibold">Téléphone & Pays</th>
                <th className="py-3 px-4 font-semibold">Rôle</th>
                <th className="py-3 px-4 font-semibold">Pièce KYC</th>
                <th className="py-3 px-4 font-semibold">Statut KYC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.clients.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-[#0B1528]">{c.fullName || 'Sans nom'}</p>
                    <p className="text-slate-500 font-mono">{c.email}</p>
                  </td>
                  <td className="py-3 px-4 font-mono">
                    {c.phone || '-'} · {c.countryCode}
                  </td>
                  <td className="py-3 px-4 font-medium">{c.role}</td>
                  <td className="py-3 px-4 font-mono">
                    {c.kycDocumentType ? `${c.kycDocumentType} (${c.kycDocumentRef})` : 'Non soumis'}
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={c.kycStatus}
                      onChange={(e) => handleUpdateClientKyc(c.id, e.target.value)}
                      className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-xs"
                    >
                      <option value="unverified">Non vérifié</option>
                      <option value="pending">En attente</option>
                      <option value="verified">Vérifié</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: RATES, OPERATORS, COUNTRIES, NETWORKS & GLOBAL SETTINGS */}
      {tab === 'settings' && data && (
        <div className="space-y-10">
          {/* Exchange Rates per Country */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-[#0B1528]">
                Taux de vente USDT, frais et limites par pays
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Les modifications s’appliquent immédiatement au calculateur et aux nouvelles
                commandes.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Pays / Devise</th>
                    <th className="py-3 px-4">Taux vente (1 USDT)</th>
                    <th className="py-3 px-4">Frais (%)</th>
                    <th className="py-3 px-4">Min USDT</th>
                    <th className="py-3 px-4">Max USDT</th>
                    <th className="py-3 px-4">Pays actif</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.countries.map((c) => {
                    const r = editingRate[c.code];
                    if (!r) return null;
                    return (
                      <tr key={c.code}>
                        <td className="py-2.5 px-4 font-medium text-[#0B1528]">
                          {c.name} ({c.currency})
                        </td>
                        <td className="py-2.5 px-4">
                          <input
                            type="number"
                            step="0.01"
                            value={r.sellRate}
                            onChange={(e) =>
                              setEditingRate((prev) => ({
                                ...prev,
                                [c.code]: { ...r, sellRate: e.target.value },
                              }))
                            }
                            className="w-28 px-2 py-1.5 font-mono rounded border border-slate-300 tabular-nums"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <input
                            type="number"
                            step="0.1"
                            value={r.feePercent}
                            onChange={(e) =>
                              setEditingRate((prev) => ({
                                ...prev,
                                [c.code]: { ...r, feePercent: e.target.value },
                              }))
                            }
                            className="w-20 px-2 py-1.5 font-mono rounded border border-slate-300 tabular-nums"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <input
                            type="number"
                            value={r.minUsdt}
                            onChange={(e) =>
                              setEditingRate((prev) => ({
                                ...prev,
                                [c.code]: { ...r, minUsdt: e.target.value },
                              }))
                            }
                            className="w-20 px-2 py-1.5 font-mono rounded border border-slate-300 tabular-nums"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <input
                            type="number"
                            value={r.maxUsdt}
                            onChange={(e) =>
                              setEditingRate((prev) => ({
                                ...prev,
                                [c.code]: { ...r, maxUsdt: e.target.value },
                              }))
                            }
                            className="w-24 px-2 py-1.5 font-mono rounded border border-slate-300 tabular-nums"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleCountry(c.code, c.isActive)}
                            className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                              c.isActive
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {c.isActive ? 'Activé' : 'Désactivé'}
                          </button>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleSaveRate(c.code)}
                            className="px-3 py-1.5 rounded bg-[#0B1528] text-white text-xs font-medium hover:bg-[#152645] cursor-pointer"
                          >
                            Enregistrer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Add Country */}
          <form
            onSubmit={handleAddCountry}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <h3 className="font-display text-sm font-bold text-[#0B1528]">
              Ajouter un nouveau pays et une nouvelle devise
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <input
                type="text"
                maxLength={2}
                required
                placeholder="Code (ex: CM)"
                value={newCountryCode}
                onChange={(e) => setNewCountryCode(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 uppercase"
              />
              <input
                type="text"
                required
                placeholder="Pays (ex: Cameroun)"
                value={newCountryName}
                onChange={(e) => setNewCountryName(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300"
              />
              <input
                type="text"
                required
                placeholder="Devise (XAF)"
                value={newCountryCurr}
                onChange={(e) => setNewCountryCurr(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 uppercase"
              />
              <input
                type="text"
                required
                placeholder="Symbole (FCFA)"
                value={newCountrySym}
                onChange={(e) => setNewCountrySym(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300"
              />
              <input
                type="text"
                required
                placeholder="Indicatif (+237)"
                value={newCountryDial}
                onChange={(e) => setNewCountryDial(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300"
              />
              <input
                type="number"
                required
                placeholder="Taux (640)"
                value={newCountryRate}
                onChange={(e) => setNewCountryRate(e.target.value)}
                className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter le pays</span>
            </button>
          </form>

          {/* Networks */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-sm font-bold text-[#0B1528]">
              Réseaux blockchain acceptés
            </h3>
            <div className="grid sm:grid-cols-3 gap-4">
              {data.networks.map((n) => (
                <div
                  key={n.code}
                  className="p-4 rounded-lg border border-slate-200 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-display text-sm font-bold text-[#0B1528]">{n.name}</p>
                    <p className="text-xs text-slate-500">{n.estimatedTime}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleNetwork(n.code, n.isActive)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                      n.isActive
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {n.isActive ? 'Actif' : 'Désactivé'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Mobile Money Operators Management */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 space-y-4">
              <div>
                <h3 className="font-display text-base font-bold text-[#0B1528]">
                  Opérateurs Mobile Money par pays & coordonnées officielles
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Activez uniquement les moyens de paiement disponibles dans chaque pays et
                  renseignez vos numéros marchands officiels.
                </p>
              </div>
              <form onSubmit={handleAddOperator} className="grid sm:grid-cols-5 gap-2">
                <select
                  value={newOpCountry}
                  onChange={(e) => setNewOpCountry(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                >
                  {data.countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  placeholder="Code (ex: AIRTEL_MONEY)"
                  value={newOpCode}
                  onChange={(e) => setNewOpCode(e.target.value)}
                  className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 uppercase"
                />
                <input
                  type="text"
                  required
                  placeholder="Nom (ex: Airtel Money)"
                  value={newOpName}
                  onChange={(e) => setNewOpName(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300"
                />
                <input
                  type="text"
                  placeholder="Numéro marchand officiel"
                  value={newOpNumber}
                  onChange={(e) => setNewOpNumber(e.target.value)}
                  className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-[#0B1528] text-white text-xs font-semibold hover:bg-[#152645] cursor-pointer"
                >
                  Ajouter opérateur
                </button>
              </form>
            </div>

            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4">Pays</th>
                    <th className="py-2.5 px-4">Opérateur</th>
                    <th className="py-2.5 px-4">Numéro marchand officiel</th>
                    <th className="py-2.5 px-4">Statut pays</th>
                    <th className="py-2.5 px-4">API opérateur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.paymentMethods.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 px-4 font-mono font-semibold">{m.countryCode}</td>
                      <td className="py-2.5 px-4 font-medium text-[#0B1528]">{m.name}</td>
                      <td className="py-2.5 px-4">
                        <input
                          type="text"
                          defaultValue={m.merchantAccountNumber}
                          onBlur={(e) => {
                            if (e.target.value !== m.merchantAccountNumber) {
                              handleUpdateMethodMerchant(m, e.target.value);
                            }
                          }}
                          placeholder="Numéro officiel..."
                          className="w-44 px-2 py-1 text-xs font-mono rounded border border-slate-300"
                        />
                      </td>
                      <td className="py-2.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleMethod(m, 'isActive')}
                          className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                            m.isActive
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {m.isActive ? 'Activé' : 'Désactivé'}
                        </button>
                      </td>
                      <td className="py-2.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleMethod(m, 'isConfigured')}
                          className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                            m.isConfigured
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {m.isConfigured ? 'API prête' : 'Manuel'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Global Contact & Platform Settings */}
          <form
            onSubmit={handleSaveGlobalSettings}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <h3 className="font-display text-base font-bold text-[#0B1528]">
              Coordonnées d’assistance et paramètres généraux
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  E-mail du support client
                </label>
                <input
                  type="email"
                  value={settingsForm.support_email || ''}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, support_email: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Numéro WhatsApp d’assistance
                </label>
                <input
                  type="text"
                  value={settingsForm.support_whatsapp || ''}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, support_whatsapp: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-[#0B1528] text-white text-xs font-semibold hover:bg-[#152645] cursor-pointer"
            >
              Enregistrer les paramètres globaux
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
