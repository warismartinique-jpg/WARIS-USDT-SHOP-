import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Info,
  Lock,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { OrderRecord, PublicConfig } from '../types/platform';
import {
  calculateOrderQuote,
  formatMoney,
  validateTogoMobilePhone,
  validateWalletAddress,
} from '../shared/validation';
import { AuthView } from './AuthView';

interface BuyUsdtFormProps {
  config: PublicConfig;
  initialCountryCode?: string;
  initialUsdtAmount?: number;
  onOrderCreated: (order: OrderRecord) => void;
  onBack?: () => void;
}

export function BuyUsdtForm({
  config,
  initialCountryCode,
  initialUsdtAmount,
  onOrderCreated,
  onBack,
}: BuyUsdtFormProps) {
  const { firebaseUser, profile, apiFetch } = useAuth();

  const [countryCode, setCountryCode] = useState(
    initialCountryCode || profile?.countryCode || config.countries[0]?.code || 'TG'
  );
  const [usdtInput, setUsdtInput] = useState(String(initialUsdtAmount || 100));
  const [clientName, setClientName] = useState(profile?.fullName || '');
  const [clientEmail, setClientEmail] = useState(profile?.email || '');
  const [clientPhone, setClientPhone] = useState(profile?.phone || '');
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState(profile?.phone || '');
  const [mobileMoneyEditedManually, setMobileMoneyEditedManually] = useState(false);
  const [paymentMethodCode, setPaymentMethodCode] = useState('');
  const [network, setNetwork] = useState(profile?.defaultNetwork || 'TRC20');
  const [walletAddress, setWalletAddress] = useState(profile?.defaultWalletAddress || '');
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [reviewStep, setReviewStep] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  useEffect(() => {
    if (profile) {
      if (!clientName && profile.fullName) setClientName(profile.fullName);
      if (!clientEmail && profile.email) setClientEmail(profile.email);
      if (!clientPhone && profile.phone) setClientPhone(profile.phone);
      if (!mobileMoneyEditedManually && !mobileMoneyNumber && profile.phone) {
        setMobileMoneyNumber(profile.phone);
      }
      if (!walletAddress && profile.defaultWalletAddress) {
        setWalletAddress(profile.defaultWalletAddress);
      }
      if (profile.defaultNetwork) setNetwork(profile.defaultNetwork);
    }
  }, [profile]);

  const selectedCountry = useMemo(
    () => config.countries.find((c) => c.code === countryCode) || config.countries[0],
    [config.countries, countryCode]
  );

  const selectedRate = useMemo(
    () => config.rates.find((r) => r.countryCode === countryCode),
    [config.rates, countryCode]
  );

  const availableMethods = useMemo(
    () => config.paymentMethods.filter((m) => m.countryCode === countryCode && m.isActive),
    [config.paymentMethods, countryCode]
  );

  useEffect(() => {
    if (availableMethods.length === 0) {
      setPaymentMethodCode('');
    } else if (!availableMethods.some((m) => m.code === paymentMethodCode)) {
      setPaymentMethodCode(availableMethods[0].code);
    }
  }, [availableMethods, paymentMethodCode]);

  const selectedMethod = useMemo(
    () => availableMethods.find((m) => m.code === paymentMethodCode),
    [availableMethods, paymentMethodCode]
  );

  const selectedNetworkObj = useMemo(
    () => config.networks.find((n) => n.code === network) || config.networks[0],
    [config.networks, network]
  );

  const usdtAmount = parseFloat(usdtInput) || 0;

  const quote = useMemo(() => {
    if (!selectedCountry || !selectedRate) return null;
    return calculateOrderQuote({
      usdtAmount,
      sellRate: Number(selectedRate.sellRate),
      feePercent: Number(selectedRate.feePercent),
      fixedFeeLocal: Number(selectedRate.fixedFeeLocal),
      operatorFeePercent: Number(selectedMethod?.feePercent || 0),
      currency: selectedCountry.currency,
      currencySymbol: selectedCountry.currencySymbol,
    });
  }, [selectedCountry, selectedRate, selectedMethod, usdtAmount]);

  const walletValidation = useMemo(
    () => validateWalletAddress(network, walletAddress),
    [network, walletAddress]
  );

  const minUsdt = Number(selectedRate?.minUsdt || 10);
  const maxUsdt = Number(selectedRate?.maxUsdt || 5000);

  const handleContinueToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedCountry || !selectedRate) {
      setError('Pays ou taux de change non disponible.');
      return;
    }
    if (availableMethods.length === 0 || !selectedMethod) {
      setError(
        `Aucun opérateur Mobile Money n'est actuellement activé pour ${selectedCountry.name}.`
      );
      return;
    }
    if (usdtAmount < minUsdt || usdtAmount > maxUsdt) {
      setError(`La quantité doit être comprise entre ${minUsdt} et ${maxUsdt} USDT.`);
      return;
    }
    if (!clientName.trim() || !clientEmail.trim() || !clientPhone.trim()) {
      setError('Veuillez compléter vos informations personnelles (nom, e-mail, téléphone).');
      return;
    }
    if (!mobileMoneyNumber.trim()) {
      setError('Veuillez renseigner votre numéro Mobile Money pour le paiement.');
      return;
    }
    if (countryCode === 'TG' || selectedMethod.providerType === 'paygate_global') {
      const phoneCheck = validateTogoMobilePhone(mobileMoneyNumber);
      if (!phoneCheck.valid) {
        setError(
          phoneCheck.error ||
            'Numéro Mobile Money togolais invalide (8 chiffres requis).'
        );
        return;
      }
    }
    if (!walletValidation.valid) {
      setError(walletValidation.error || 'Adresse de réception USDT invalide.');
      return;
    }
    if (!addressConfirmed) {
      setError(
        'Veuillez cocher la case confirmant que votre adresse de réception et votre réseau sont corrects.'
      );
      return;
    }

    if (!firebaseUser) {
      setShowAuthPrompt(true);
      return;
    }

    setReviewStep(true);
  };

  const handleConfirmOrder = async () => {
    if (!firebaseUser) {
      setShowAuthPrompt(true);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const resp = await apiFetch<{ order: OrderRecord }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          countryCode,
          usdtAmount,
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
          clientPhone: clientPhone.trim(),
          paymentMethodCode,
          mobileMoneyNumber: mobileMoneyNumber.trim(),
          network,
          walletAddress: walletAddress.trim(),
          addressConfirmed,
          idempotencyKey,
        }),
      });
      onOrderCreated(resp.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer la commande.');
      setReviewStep(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0B1528] mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour</span>
        </button>
      )}

      {showAuthPrompt && !firebaseUser && (
        <div className="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-display text-lg font-bold text-[#0B1528]">
                Connectez-vous pour finaliser votre commande
              </h3>
              <p className="text-sm text-slate-600">
                Votre compte personnel garantit que vous seul pouvez suivre votre commande et
                recevoir vos justificatifs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAuthPrompt(false)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 self-start cursor-pointer"
            >
              Fermer
            </button>
          </div>
          <AuthView
            compact
            onSuccess={() => {
              setShowAuthPrompt(false);
              setReviewStep(true);
            }}
          />
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Main Form or Confirmation Review */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          {!reviewStep ? (
            <form onSubmit={handleContinueToReview} className="space-y-8">
              <div>
                <p className="text-xs font-medium text-emerald-700 mb-1">
                  Nouvelle transaction · Livraison vers votre portefeuille
                </p>
                <h1 className="font-display text-2xl font-bold text-[#0B1528] tracking-tight">
                  Acheter des USDT par Mobile Money
                </h1>
              </div>

              {/* A. Montant à acheter & Pays */}
              <section className="space-y-4 pt-2 border-t border-slate-100">
                <h2 className="font-display text-base font-bold text-[#0B1528]">
                  01. Pays et montant à acheter
                </h2>

                <div className="grid sm:grid-cols-2 gap-4">
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
                          {c.name} ({c.currencySymbol})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Quantité de USDT souhaitée
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min={minUsdt}
                        max={maxUsdt}
                        required
                        value={usdtInput}
                        onChange={(e) => setUsdtInput(e.target.value)}
                        className="w-full pl-3.5 pr-16 py-2.5 text-sm font-mono tabular-nums rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs font-semibold text-slate-500">
                        USDT
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      Limites : {minUsdt} – {maxUsdt} USDT
                    </p>
                  </div>
                </div>
              </section>

              {/* B. Informations du client */}
              <section className="space-y-4 pt-6 border-t border-slate-100">
                <h2 className="font-display text-base font-bold text-[#0B1528]">
                  02. Informations du client
                </h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Nom et prénom
                    </label>
                    <input
                      type="text"
                      required
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Ex : Kodjo Mensah"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Adresse e-mail
                    </label>
                    <input
                      type="email"
                      required
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="client@exemple.com"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Téléphone ({selectedCountry?.dialCode})
                    </label>
                    <input
                      type="tel"
                      required
                      value={clientPhone}
                      onChange={(e) => {
                        const val = e.target.value;
                        setClientPhone(val);
                        if (!mobileMoneyEditedManually) {
                          setMobileMoneyNumber(val);
                        }
                      }}
                      placeholder={`${selectedCountry?.dialCode || '+228'} 90 00 00 00`}
                      className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
              </section>

              {/* C. Moyen de paiement Mobile Money */}
              <section className="space-y-4 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base font-bold text-[#0B1528]">
                    03. Moyen de paiement Mobile Money ({selectedCountry?.name})
                  </h2>
                </div>

                {availableMethods.length === 0 ? (
                  <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    Aucun opérateur Mobile Money n’est actuellement activé pour {selectedCountry?.name}.
                    Veuillez sélectionner un autre pays ou contacter l’assistance.
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {availableMethods.map((method) => {
                      const active = method.code === paymentMethodCode;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setPaymentMethodCode(method.code)}
                          className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                            active
                              ? 'border-emerald-600 bg-emerald-50/60'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm text-[#0B1528]">
                              {method.name}
                            </span>
                            <CreditCard
                              className={`w-4 h-4 shrink-0 ${
                                active ? 'text-emerald-700' : 'text-slate-400'
                              }`}
                            />
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {method.isConfigured
                              ? 'Passerelle PayGate Global connectée'
                              : 'PayGate Global (clé API serveur requise)'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedMethod && (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-[#0B1528] shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p>{selectedMethod.instructions}</p>
                          {selectedMethod.merchantAccountNumber && (
                            <p className="font-mono text-[#0B1528] font-medium">
                              Compte officiel : {selectedMethod.merchantAccountNumber} (
                              {selectedMethod.merchantAccountName})
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Numéro Mobile Money utilisé pour le paiement
                      </label>
                      <input
                        type="tel"
                        required
                        value={mobileMoneyNumber}
                        onChange={(e) => {
                          setMobileMoneyEditedManually(true);
                          setMobileMoneyNumber(e.target.value);
                        }}
                        placeholder={`${selectedCountry?.dialCode || '+228'} 90 00 00 00`}
                        className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Format attendu au Togo : 8 chiffres (ex. 90 12 34 56 ou +228 90 12 34 56).
                      </p>
                    </div>
                  </div>
                )}
              </section>

              {/* D. Réseau de réception USDT */}
              <section className="space-y-4 pt-6 border-t border-slate-100">
                <h2 className="font-display text-base font-bold text-[#0B1528]">
                  04. Réseau blockchain de réception
                </h2>
                <div className="grid sm:grid-cols-3 gap-3">
                  {config.networks.map((net) => {
                    const active = net.code === network;
                    return (
                      <button
                        key={net.code}
                        type="button"
                        onClick={() => setNetwork(net.code)}
                        className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'border-emerald-600 bg-emerald-50/60'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <p className="font-display text-sm font-bold text-[#0B1528]">
                          {net.code}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">{net.tokenStandard}</p>
                        <p className="text-xs text-slate-500 mt-1">{net.estimatedTime}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* E. Adresse de réception USDT — OBLIGATOIRE */}
              <section className="space-y-4 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="wallet-address-input"
                    className="font-display text-base font-bold text-[#0B1528]"
                  >
                    05. Adresse de réception de vos USDT (obligatoire)
                  </label>
                  <span className="text-xs font-mono font-medium text-[#0B1528]">
                    Réseau : {network}
                  </span>
                </div>

                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p>
                    Vérifiez attentivement votre adresse de réception et le réseau sélectionné. Une
                    erreur peut entraîner la perte irréversible de vos USDT.
                  </p>
                </div>

                <div>
                  <div className="relative">
                    <Wallet className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      id="wallet-address-input"
                      type="text"
                      required
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      placeholder={selectedNetworkObj?.addressHint || 'Collez votre adresse USDT'}
                      className={`w-full pl-10 pr-3.5 py-2.5 text-sm font-mono rounded-lg border focus:outline-none focus:ring-2 ${
                        walletAddress && !walletValidation.valid
                          ? 'border-rose-400 focus:ring-rose-500'
                          : walletAddress && walletValidation.valid
                            ? 'border-emerald-500 focus:ring-emerald-600'
                            : 'border-slate-300 focus:ring-emerald-600'
                      }`}
                    />
                  </div>
                  {selectedNetworkObj && (
                    <p className="text-xs text-slate-500 mt-1.5">
                      Format attendu ({network}) : {selectedNetworkObj.addressHint}
                    </p>
                  )}
                  {walletAddress && !walletValidation.valid && (
                    <p className="text-xs text-rose-700 mt-1.5 font-medium">
                      {walletValidation.error}
                    </p>
                  )}
                  {walletAddress && walletValidation.valid && (
                    <p className="text-xs text-emerald-700 mt-1.5 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Format d’adresse compatible avec le réseau {network}.</span>
                    </p>
                  )}
                </div>

                <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addressConfirmed}
                    onChange={(e) => setAddressConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span className="text-xs font-medium text-slate-800">
                    Je confirme que mon adresse de réception et mon réseau sont corrects.
                  </span>
                </label>
              </section>

              {error && (
                <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={availableMethods.length === 0}
                className="w-full py-3 px-5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                Vérifier et confirmer ma commande
              </button>
            </form>
          ) : (
            /* Pre-confirmation Verification View */
            <div className="space-y-6">
              <div>
                <p className="text-xs font-medium text-emerald-700 mb-1">
                  Étape finale · Vérification avant validation
                </p>
                <h2 className="font-display text-2xl font-bold text-[#0B1528] tracking-tight">
                  Contrôlez vos informations
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Votre adresse personnelle sera enregistrée telle quelle pour l’envoi manuel après
                  confirmation de votre paiement.
                </p>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                <div className="p-4 flex justify-between gap-4 text-sm">
                  <span className="text-slate-500">Quantité achetée</span>
                  <span className="font-mono font-bold text-[#0B1528] tabular-nums">
                    {quote?.usdtAmount} USDT
                  </span>
                </div>
                <div className="p-4 flex justify-between gap-4 text-sm">
                  <span className="text-slate-500">Montant total à payer</span>
                  <span className="font-mono font-bold text-emerald-700 tabular-nums">
                    {quote ? formatMoney(quote.totalLocalAmount, quote.currencySymbol) : '-'}
                  </span>
                </div>
                <div className="p-4 flex justify-between gap-4 text-sm">
                  <span className="text-slate-500">Moyen de paiement</span>
                  <span className="font-medium text-[#0B1528]">
                    {selectedMethod?.name} · {mobileMoneyNumber}
                  </span>
                </div>
                <div className="p-4 flex justify-between gap-4 text-sm">
                  <span className="text-slate-500">Réseau blockchain</span>
                  <span className="font-mono font-semibold text-[#0B1528]">{network}</span>
                </div>
                <div className="p-4 space-y-1.5">
                  <span className="text-xs font-medium text-slate-500 block">
                    Adresse complète de réception de vos USDT
                  </span>
                  <p className="font-mono text-xs sm:text-sm text-[#0B1528] bg-slate-50 p-3 rounded border border-slate-200 break-all">
                    {walletAddress.trim()}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p>
                  Vérifiez attentivement votre adresse de réception et le réseau sélectionné. Une
                  erreur peut entraîner la perte irréversible de vos USDT.
                </p>
              </div>

              {error && (
                <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {error}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setReviewStep(false)}
                  disabled={submitting}
                  className="sm:w-1/3 py-3 px-4 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={handleConfirmOrder}
                  disabled={submitting}
                  className="sm:w-2/3 py-3 px-5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>
                    {submitting ? 'Enregistrement sécurisé...' : 'Confirmer et créer la commande'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Summary Panel */}
        <aside className="lg:col-span-5 bg-[#0B1528] text-white rounded-xl p-6 sm:p-8 space-y-6 lg:sticky lg:top-24">
          <div>
            <p className="text-xs font-medium text-emerald-400">Récapitulatif tarifaire</p>
            <h3 className="font-display text-lg font-bold mt-1">Détail de la transaction</h3>
          </div>

          <div className="space-y-3.5 text-sm border-t border-white/10 pt-5">
            <div className="flex justify-between gap-4">
              <span className="text-slate-300">Pays & devise</span>
              <span className="font-medium text-white">
                {selectedCountry?.name} ({selectedCountry?.currency})
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-300">Taux appliqué (indicatif)</span>
              <span className="font-mono tabular-nums text-white">
                1 USDT ={' '}
                {quote ? formatMoney(quote.sellRate, quote.currencySymbol) : '-'}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-300">Montant brut</span>
              <span className="font-mono tabular-nums text-white">
                {quote ? formatMoney(quote.grossLocalAmount, quote.currencySymbol) : '-'}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-300">Frais de service</span>
              <span className="font-mono tabular-nums text-white">
                {quote ? formatMoney(quote.feeAmount, quote.currencySymbol) : '-'}
              </span>
            </div>
          </div>

          <div className="border-t border-white/15 pt-5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-slate-300">Total à payer</span>
              <span className="font-display text-2xl font-bold text-emerald-400 tabular-nums">
                {quote ? formatMoney(quote.totalLocalAmount, quote.currencySymbol) : '-'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Vous recevrez{' '}
              <span className="font-mono text-white font-semibold tabular-nums">
                {usdtAmount} USDT
              </span>{' '}
              sur le réseau <span className="font-mono text-white">{network}</span> après
              confirmation de votre paiement Mobile Money.
            </p>
          </div>

          <div className="border-t border-white/10 pt-5 text-xs text-slate-300 space-y-2">
            <p className="font-medium text-white">Engagement de transparence</p>
            <p>
              Le taux, les frais et la devise exacte sont verrouillés dans votre commande dès sa
              création. L’administrateur transfère les USDT uniquement vers l’adresse que vous avez
              saisie.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
