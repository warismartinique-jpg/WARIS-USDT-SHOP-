import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  History,
  Plus,
  RefreshCw,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  NotificationItem,
  OrderRecord,
  PaymentRecord,
  PublicConfig,
  TransactionLog,
} from '../types/platform';
import { formatMoney, getExplorerTxUrl, validateWalletAddress } from '../shared/validation';
import { StatusBadge } from './StatusBadge';

interface ClientDashboardProps {
  config: PublicConfig;
  initialSelectedRef?: string | null;
  onNewOrder: () => void;
}

export function ClientDashboard({
  config,
  initialSelectedRef,
  onNewOrder,
}: ClientDashboardProps) {
  const { profile, apiFetch, refreshProfile } = useAuth();
  const [tab, setTab] = useState<'orders' | 'notifications' | 'profile'>('orders');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [orderLogs, setOrderLogs] = useState<TransactionLog[]>([]);
  const [orderPayments, setOrderPayments] = useState<PaymentRecord[]>([]);
  const [payRefInput, setPayRefInput] = useState('');
  const [submittingRef, setSubmittingRef] = useState(false);
  const [paygateBusy, setPaygateBusy] = useState(false);
  const [autoPollingOrderId, setAutoPollingOrderId] = useState<number | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [refMessage, setRefMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Profile form state
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [countryCode, setCountryCode] = useState(profile?.countryCode || 'TG');
  const [defaultNetwork, setDefaultNetwork] = useState(profile?.defaultNetwork || 'TRC20');
  const [defaultWalletAddress, setDefaultWalletAddress] = useState(
    profile?.defaultWalletAddress || ''
  );
  const [kycDocumentType, setKycDocumentType] = useState(profile?.kycDocumentType || '');
  const [kycDocumentRef, setKycDocumentRef] = useState(profile?.kycDocumentRef || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName || '');
      setPhone(profile.phone || '');
      setCountryCode(profile.countryCode || 'TG');
      setDefaultNetwork(profile.defaultNetwork || 'TRC20');
      setDefaultWalletAddress(profile.defaultWalletAddress || '');
      setKycDocumentType(profile.kycDocumentType || '');
      setKycDocumentRef(profile.kycDocumentRef || '');
    }
  }, [profile]);

  const loadOrderDetails = useCallback(
    async (reference: string) => {
      try {
        const detail = await apiFetch<{
          order: OrderRecord;
          payments: PaymentRecord[];
          logs: TransactionLog[];
        }>(`/api/orders/${encodeURIComponent(reference)}`);
        setSelectedOrder(detail.order);
        setOrderPayments(detail.payments);
        setOrderLogs(detail.logs);
        setPayRefInput(detail.order.paymentReference || '');
        setPhoneInput(detail.order.mobileMoneyNumber || '');
        setEditingPhone(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Impossible de charger la commande.');
      }
    },
    [apiFetch]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersResp, notifResp] = await Promise.all([
        apiFetch<{ orders: OrderRecord[] }>('/api/orders'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
      ]);
      setOrders(ordersResp.orders);
      setNotifications(notifResp.notifications);

      const targetRef = initialSelectedRef || selectedOrder?.reference;
      if (targetRef) {
        const match = ordersResp.orders.find((o) => o.reference === targetRef);
        if (match) {
          await loadOrderDetails(match.reference);
        }
      } else if (ordersResp.orders.length > 0 && !selectedOrder) {
        await loadOrderDetails(ordersResp.orders[0].reference);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement de votre espace.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, initialSelectedRef, loadOrderDetails]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmitPaymentRef = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setSubmittingRef(true);
    setRefMessage(null);
    setError(null);
    try {
      const resp = await apiFetch<{ order: OrderRecord }>(
        `/api/orders/${selectedOrder.id}/payment-reference`,
        {
          method: 'POST',
          body: JSON.stringify({ paymentReference: payRefInput.trim() }),
        }
      );
      setRefMessage(
        'Référence enregistrée. Votre paiement est désormais en cours de vérification par notre équipe.'
      );
      setOrders((prev) => prev.map((o) => (o.id === resp.order.id ? resp.order : o)));
      await loadOrderDetails(resp.order.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer la référence.');
    } finally {
      setSubmittingRef(false);
    }
  };

  useEffect(() => {
    if (!autoPollingOrderId || !selectedOrder || selectedOrder.id !== autoPollingOrderId) {
      return;
    }
    if (selectedOrder.paymentStatus === 'Paiement confirmé') {
      setAutoPollingOrderId(null);
      return;
    }

    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const resp = await apiFetch<{
          order: OrderRecord;
          verification: {
            paid: boolean;
            expired?: boolean;
            cancelled?: boolean;
            message: string;
          };
        }>(`/api/orders/${autoPollingOrderId}/paygate/verify`, {
          method: 'POST',
        });
        if (resp.verification.paid) {
          setRefMessage(resp.verification.message);
          setOrders((prev) => prev.map((o) => (o.id === resp.order.id ? resp.order : o)));
          setSelectedOrder(resp.order);
          setAutoPollingOrderId(null);
          await loadOrderDetails(resp.order.reference);
        } else if (resp.verification.expired || resp.verification.cancelled) {
          setRefMessage(resp.verification.message);
          setAutoPollingOrderId(null);
        } else if (attempts >= maxAttempts) {
          setAutoPollingOrderId(null);
        }
      } catch {
        if (attempts >= maxAttempts) {
          setAutoPollingOrderId(null);
        }
      }
    }, 6000);

    return () => clearInterval(interval);
  }, [autoPollingOrderId, selectedOrder?.id, selectedOrder?.paymentStatus, apiFetch, loadOrderDetails]);

  const handleSaveMobileMoneyNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setSavingPhone(true);
    setError(null);
    setRefMessage(null);
    try {
      const resp = await apiFetch<{ order: OrderRecord }>(
        `/api/orders/${selectedOrder.id}/mobile-money-number`,
        {
          method: 'PATCH',
          body: JSON.stringify({ mobileMoneyNumber: phoneInput.trim() }),
        }
      );
      setOrders((prev) => prev.map((o) => (o.id === resp.order.id ? resp.order : o)));
      setEditingPhone(false);
      setRefMessage(`Numéro Mobile Money mis à jour : ${resp.order.mobileMoneyNumber}.`);
      await loadOrderDetails(resp.order.reference);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossible de mettre à jour le numéro Mobile Money.'
      );
    } finally {
      setSavingPhone(false);
    }
  };

  const handlePayGateInitiate = async () => {
    if (!selectedOrder) return;
    setPaygateBusy(true);
    setRefMessage(null);
    setError(null);
    try {
      const resp = await apiFetch<{
        order: OrderRecord;
        alreadyPaid?: boolean;
        paygate: { ok: boolean; message: string };
      }>(`/api/orders/${selectedOrder.id}/paygate/initiate`, {
        method: 'POST',
      });
      setRefMessage(resp.paygate.message);
      setOrders((prev) => prev.map((o) => (o.id === resp.order.id ? resp.order : o)));
      await loadOrderDetails(resp.order.reference);
      if (!resp.alreadyPaid && resp.paygate.ok) {
        setAutoPollingOrderId(resp.order.id);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossible de lancer le paiement PayGate Global.'
      );
    } finally {
      setPaygateBusy(false);
    }
  };

  const handlePayGateVerify = async () => {
    if (!selectedOrder) return;
    setPaygateBusy(true);
    setRefMessage(null);
    setError(null);
    try {
      const resp = await apiFetch<{
        order: OrderRecord;
        verification: { paid: boolean; expired?: boolean; cancelled?: boolean; message: string };
      }>(`/api/orders/${selectedOrder.id}/paygate/verify`, {
        method: 'POST',
      });
      setRefMessage(resp.verification.message);
      setOrders((prev) => prev.map((o) => (o.id === resp.order.id ? resp.order : o)));
      if (resp.verification.paid || resp.verification.expired || resp.verification.cancelled) {
        setAutoPollingOrderId(null);
      }
      await loadOrderDetails(resp.order.reference);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossible de vérifier le paiement PayGate Global.'
      );
    } finally {
      setPaygateBusy(false);
    }
  };

  const handleMarkNotificationsRead = async () => {
    try {
      await apiFetch('/api/notifications/mark-read', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      await refreshProfile();
    } catch {
      // ignore
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setError(null);

    if (defaultWalletAddress.trim()) {
      const check = validateWalletAddress(defaultNetwork, defaultWalletAddress);
      if (!check.valid) {
        setError(check.error || 'Adresse portefeuille invalide.');
        return;
      }
    }

    setSavingProfile(true);
    try {
      await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName,
          phone,
          countryCode,
          defaultNetwork,
          defaultWalletAddress,
          kycDocumentType,
          kycDocumentRef,
        }),
      });
      await refreshProfile();
      setProfileMsg('Profil enregistré avec succès.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de sauvegarder le profil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(label);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const totalUsdtDelivered = orders
    .filter((o) => o.overallStatus === 'USDT envoyé' || o.overallStatus === 'Commande terminée')
    .reduce((acc, o) => acc + Number(o.usdtAmount || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-medium text-emerald-700">
            Espace client · {profile?.email}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1528] tracking-tight mt-1">
            Bonjour, {profile?.fullName || 'Client WARIS USDT SHOP'}
          </h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-100 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Actualiser</span>
          </button>
          <button
            type="button"
            onClick={onNewOrder}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle commande USDT</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500">Total commandes</p>
          <p className="font-display text-2xl font-bold text-[#0B1528] tabular-nums mt-1">
            {orders.length}
          </p>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500">USDT livrés</p>
          <p className="font-display text-2xl font-bold text-emerald-700 tabular-nums mt-1">
            {totalUsdtDelivered.toFixed(2)} USDT
          </p>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500">Statut KYC</p>
          <p className="font-display text-lg font-bold text-[#0B1528] mt-1">
            {profile?.kycStatus === 'verified'
              ? 'Vérifié'
              : profile?.kycStatus === 'pending'
                ? 'En vérification'
                : 'Non vérifié'}
          </p>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500">Notifications non lues</p>
          <p className="font-display text-2xl font-bold text-[#0B1528] tabular-nums mt-1">
            {unreadCount}
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setTab('orders')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            tab === 'orders'
              ? 'bg-white text-[#0B1528] shadow-sm'
              : 'text-slate-600 hover:text-[#0B1528]'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Mes commandes ({orders.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('notifications')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            tab === 'notifications'
              ? 'bg-white text-[#0B1528] shadow-sm'
              : 'text-slate-600 hover:text-[#0B1528]'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('profile')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            tab === 'profile'
              ? 'bg-white text-[#0B1528] shadow-sm'
              : 'text-slate-600 hover:text-[#0B1528]'
          }`}
        >
          <UserIcon className="w-3.5 h-3.5" />
          <span>Mon profil & KYC</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* TAB 1: ORDERS & TRACKING */}
      {tab === 'orders' && (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-[#0B1528]">
                Historique personnel de commandes
              </h2>
              <span className="text-xs text-slate-500">Accès privé client</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Chargement de vos commandes...
              </div>
            ) : orders.length === 0 ? (
              <div className="p-10 text-center space-y-4">
                <p className="text-sm text-slate-600">
                  Vous n’avez pas encore passé de commande d’achat de USDT.
                </p>
                <button
                  type="button"
                  onClick={onNewOrder}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Passer ma première commande</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {orders.map((o) => {
                  const active = selectedOrder?.id === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => loadOrderDetails(o.reference)}
                      className={`w-full text-left p-4 transition-colors cursor-pointer hover:bg-slate-50 ${
                        active ? 'bg-emerald-50/50' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-[#0B1528]">
                          {o.reference}
                        </span>
                        <StatusBadge status={o.overallStatus} />
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-4">
                        <span className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
                          {Number(o.usdtAmount)} USDT ({o.network})
                        </span>
                        <span className="font-mono text-xs text-slate-700 tabular-nums">
                          {formatMoney(o.localAmount, o.currency)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                        <span>{o.paymentMethodName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{o.countryName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {new Date(o.createdAt).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Order Detail */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            {!selectedOrder ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Sélectionnez une commande pour consulter son suivi détaillé, soumettre votre
                référence de paiement ou vérifier le hash blockchain.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs text-slate-500">Référence de commande</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <h3 className="font-mono text-lg font-bold text-[#0B1528]">
                        {selectedOrder.reference}
                      </h3>
                      <button
                        type="button"
                        onClick={() => copyText('ref', selectedOrder.reference)}
                        className="p-1 rounded text-slate-400 hover:text-[#0B1528] cursor-pointer"
                        title="Copier la référence"
                      >
                        {copiedId === 'ref' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  <StatusBadge status={selectedOrder.overallStatus} />
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">Quantité USDT</span>
                    <span className="font-mono text-sm font-bold text-[#0B1528] tabular-nums">
                      {Number(selectedOrder.usdtAmount)} USDT
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Montant à payer</span>
                    <span className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
                      {formatMoney(selectedOrder.localAmount, selectedOrder.currency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Taux verrouillé</span>
                    <span className="font-mono text-[#0B1528] tabular-nums">
                      1 USDT = {Number(selectedOrder.exchangeRate)} {selectedOrder.currency}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Opérateur & numéro</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[#0B1528] font-medium">
                        {selectedOrder.paymentMethodName} ({selectedOrder.mobileMoneyNumber})
                      </span>
                      {(selectedOrder.overallStatus === 'En attente de paiement' ||
                        selectedOrder.overallStatus === 'Paiement en vérification') &&
                        selectedOrder.paymentStatus !== 'Paiement confirmé' && (
                          <button
                            type="button"
                            onClick={() => {
                              setPhoneInput(selectedOrder.mobileMoneyNumber);
                              setEditingPhone((v) => !v);
                            }}
                            className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                          >
                            {editingPhone ? 'Annuler' : 'Modifier'}
                          </button>
                        )}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Statut du paiement</span>
                    <span className="font-medium text-[#0B1528]">
                      {selectedOrder.paymentStatus}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Statut de livraison</span>
                    <span className="font-medium text-[#0B1528]">
                      {selectedOrder.deliveryStatus}
                    </span>
                  </div>
                </div>

                {editingPhone && (
                  <form
                    onSubmit={handleSaveMobileMoneyNumber}
                    className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2"
                  >
                    <input
                      type="tel"
                      required
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="Ex : 90 12 34 56"
                      className="flex-1 min-w-[160px] px-3 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white"
                    />
                    <button
                      type="submit"
                      disabled={savingPhone}
                      className="px-3 py-1.5 rounded bg-[#0B1528] text-white text-xs font-semibold hover:bg-[#152645] disabled:opacity-60 cursor-pointer"
                    >
                      {savingPhone ? 'Enregistrement...' : 'Enregistrer le numéro'}
                    </button>
                  </form>
                )}

                {/* Receiving Wallet */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-600">
                      Adresse de réception ({selectedOrder.network})
                    </span>
                    <button
                      type="button"
                      onClick={() => copyText('wallet', selectedOrder.walletAddress)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                    >
                      {copiedId === 'wallet' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copiée</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copier</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-xs text-[#0B1528] break-all">
                    {selectedOrder.walletAddress}
                  </p>
                </div>

                {/* PayGate Global + Manual Reference when awaiting payment */}
                {(selectedOrder.overallStatus === 'En attente de paiement' ||
                  selectedOrder.overallStatus === 'Paiement en vérification') && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[#0B1528]">
                          Paiement Mobile Money via PayGate Global ({selectedOrder.paymentMethodName})
                        </p>
                        <span className="text-xs text-slate-600">
                          {config.integrations.paygateConfigured
                            ? 'Passerelle prête'
                            : 'Clé serveur à configurer'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {config.integrations.paygateConfigured
                          ? `Déclenchez la demande USSD sur le ${selectedOrder.mobileMoneyNumber}, validez avec votre code PIN puis vérifiez la confirmation côté serveur.`
                          : "La passerelle PayGate Global attend le renseignement de la variable PAYGATE_AUTH_TOKEN côté serveur. Aucune simulation n'est effectuée."}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={paygateBusy || !config.integrations.paygateConfigured}
                          onClick={handlePayGateInitiate}
                          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        >
                          {paygateBusy
                            ? 'Connexion PayGate...'
                            : 'Payer via PayGate Global (USSD)'}
                        </button>
                        <button
                          type="button"
                          disabled={paygateBusy || !config.integrations.paygateConfigured}
                          onClick={handlePayGateVerify}
                          className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-[#0B1528] text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        >
                          Vérifier le paiement côté serveur
                        </button>
                      </div>
                      {autoPollingOrderId === selectedOrder.id && (
                        <p className="text-xs text-emerald-700 font-medium">
                          Vérification automatique auprès de PayGate Global en cours…
                        </p>
                      )}
                    </div>

                    <form
                      onSubmit={handleSubmitPaymentRef}
                      className="p-4 rounded-lg border border-slate-200 space-y-3"
                    >
                      <p className="text-xs font-semibold text-[#0B1528]">
                        Ou soumettre manuellement votre référence de transaction
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          value={payRefInput}
                          onChange={(e) => setPayRefInput(e.target.value)}
                          placeholder="Ex : Référence SMS T-Money ou Flooz"
                          className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        />
                        <button
                          type="submit"
                          disabled={submittingRef}
                          className="px-4 py-2 rounded-lg bg-[#0B1528] text-white text-xs font-semibold hover:bg-[#152645] disabled:opacity-60 cursor-pointer whitespace-nowrap"
                        >
                          {submittingRef ? 'Envoi...' : 'Enregistrer'}
                        </button>
                      </div>
                      {refMessage && (
                        <p className="text-xs text-emerald-700 font-medium">{refMessage}</p>
                      )}
                    </form>
                  </div>
                )}

                {/* Blockchain Hash Box */}
                {selectedOrder.blockchainTxHash && (
                  <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-emerald-900 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                        <span>
                          Hash de transaction blockchain ({selectedOrder.network})
                        </span>
                      </span>
                      <a
                        href={getExplorerTxUrl(
                          selectedOrder.network,
                          selectedOrder.blockchainTxHash
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline whitespace-nowrap"
                      >
                        <span>Voir sur l’explorateur</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <p className="font-mono text-xs text-emerald-950 break-all">
                      {selectedOrder.blockchainTxHash}
                    </p>
                    {selectedOrder.blockchainVerifyDetails && (
                      <p className="text-xs text-emerald-800">
                        {selectedOrder.blockchainVerifyDetails}
                      </p>
                    )}
                  </div>
                )}

                {/* Payment Records */}
                {orderPayments.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-[#0B1528]">
                      Détails du règlement enregistré
                    </h4>
                    <div className="text-xs text-slate-600 space-y-1 border border-slate-200 rounded-lg p-3">
                      {orderPayments.map((p) => (
                        <div key={p.id} className="flex justify-between gap-2">
                          <span>
                            {p.operatorName} ({p.payerPhone})
                          </span>
                          <span className="font-mono">
                            Réf : {p.externalReference || 'En attente'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Audit Timeline */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-[#0B1528]">
                    Historique horodaté de la commande
                  </h4>
                  <div className="space-y-2.5">
                    {orderLogs.map((log) => (
                      <div key={log.id} className="text-xs border-b border-slate-100 pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[#0B1528]">
                            {log.newStatus || log.action}
                          </span>
                          <span className="font-mono text-slate-400 tabular-nums">
                            {new Date(log.createdAt).toLocaleString('fr-FR')}
                          </span>
                        </div>
                        {log.details && <p className="text-slate-600 mt-0.5">{log.details}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: NOTIFICATIONS */}
      {tab === 'notifications' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <h2 className="font-display text-sm font-bold text-[#0B1528]">
              Historique des notifications
            </h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkNotificationsRead}
                className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Aucune notification pour le moment.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 flex items-start justify-between gap-4 ${
                    n.isRead ? 'bg-white' : 'bg-emerald-50/40'
                  }`}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[#0B1528]">{n.title}</p>
                    <p className="text-xs text-slate-600">{n.message}</p>
                  </div>
                  <span className="font-mono text-xs text-slate-400 tabular-nums shrink-0">
                    {new Date(n.createdAt).toLocaleString('fr-FR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PROFILE & KYC */}
      {tab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-2xl space-y-6"
        >
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0B1528]">
                Informations personnelles & portefeuille par défaut
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                E-mail du compte : <span className="font-mono">{profile?.email}</span>
              </p>
            </div>
            <Shield className="w-5 h-5 text-emerald-700 shrink-0" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Nom et prénom
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Pays de résidence
              </label>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {config.countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Téléphone Mobile Money
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Réseau USDT favori
              </label>
              <select
                value={defaultNetwork}
                onChange={(e) => setDefaultNetwork(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {config.networks.map((n) => (
                  <option key={n.code} value={n.code}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Adresse de portefeuille USDT par défaut (optionnel)
              </label>
              <input
                type="text"
                value={defaultWalletAddress}
                onChange={(e) => setDefaultWalletAddress(e.target.value)}
                placeholder="Adresse TRC20 (T...) ou ERC20/BEP20 (0x...)"
                className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div>
              <h3 className="font-display text-sm font-bold text-[#0B1528]">
                Vérification KYC / AML (lutte anti-blanchiment)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Renseignez les références de votre pièce d’identité pour faciliter les contrôles
                réglementaires sur les montants élevés.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Type de document
                </label>
                <select
                  value={kycDocumentType}
                  onChange={(e) => setKycDocumentType(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="">Sélectionner...</option>
                  <option value="CNI">Carte Nationale d’Identité</option>
                  <option value="PASSPORT">Passeport</option>
                  <option value="PERMIS">Permis de conduire</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Numéro de pièce
                </label>
                <input
                  type="text"
                  value={kycDocumentRef}
                  onChange={(e) => setKycDocumentRef(e.target.value)}
                  placeholder="Ex : TG-2026-..."
                  className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
          </div>

          {profileMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              {profileMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={savingProfile}
            className="px-6 py-2.5 rounded-lg bg-[#0B1528] text-white text-sm font-semibold hover:bg-[#152645] disabled:opacity-60 cursor-pointer"
          >
            {savingProfile ? 'Enregistrement...' : 'Enregistrer mon profil'}
          </button>
        </form>
      )}
    </div>
  );
}
