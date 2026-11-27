import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Globe,
  HelpCircle,
  Lock,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { PublicConfig } from '../types/platform';
import { calculateOrderQuote, formatMoney } from '../shared/validation';

interface LandingPageProps {
  config: PublicConfig;
  onStartBuy: (countryCode?: string, usdtAmount?: number) => void;
  onOpenSupport: () => void;
  onOpenLegal: () => void;
}

const FAQ_ITEMS = [
  {
    q: 'Comment fonctionne l’achat de USDT sur WARIS USDT SHOP ?',
    a: 'Sélectionnez votre pays et votre opérateur Mobile Money, renseignez obligatoirement votre adresse personnelle de portefeuille USDT (TRC20, ERC20 ou BEP20), puis validez la commande. Après vérification effective de votre paiement Mobile Money, l’administrateur transfère vos USDT et publie le hash blockchain vérifiable.',
  },
  {
    q: 'Pourquoi dois-je vérifier attentivement mon adresse et mon réseau USDT ?',
    a: 'Les transactions blockchain sont irréversibles. Une adresse incompatible avec le réseau choisi (par exemple une adresse ERC20 saisie sur TRC20) peut entraîner la perte définitive des fonds. C’est pourquoi nous vérifions le format de l’adresse et exigeons une confirmation explicite avant toute commande.',
  },
  {
    q: 'Combien de temps prend la livraison des USDT ?',
    a: 'Dès que votre paiement Mobile Money est vérifié et confirmé, le transfert manuel vers votre portefeuille est généralement exécuté sous 5 à 25 minutes selon la congestion du réseau blockchain sélectionné.',
  },
  {
    q: 'Quels pays et opérateurs Mobile Money sont disponibles actuellement ?',
    a: 'Pour cette première phase de lancement, le service est ouvert exclusivement au Togo avec T-Money / Mixx by Yas et Moov Money / Flooz via notre passerelle unifiée PayGate Global. L’architecture reste prête pour l’ouverture progressive d’autres pays et opérateurs d’Afrique de l’Ouest.',
  },
  {
    q: 'Comment vérifier que mes USDT ont bien été envoyés ?',
    a: 'Dans votre espace client, chaque commande livrée affiche le hash de transaction blockchain accompagné d’un lien direct vers l’explorateur officiel (TronScan, Etherscan ou BscScan) ainsi que le statut de vérification on-chain.',
  },
];

export function LandingPage({
  config,
  onStartBuy,
  onOpenSupport,
  onOpenLegal,
}: LandingPageProps) {
  const [calcCountry, setCalcCountry] = useState(config.countries[0]?.code || 'TG');
  const [calcUsdt, setCalcUsdt] = useState('100');
  const [selectedCountryTab, setSelectedCountryTab] = useState(
    config.countries[0]?.code || 'TG'
  );
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [vaultImgFailed, setVaultImgFailed] = useState(false);

  const calcCountryObj = useMemo(
    () => config.countries.find((c) => c.code === calcCountry) || config.countries[0],
    [config.countries, calcCountry]
  );

  const calcRateObj = useMemo(
    () => config.rates.find((r) => r.countryCode === calcCountry),
    [config.rates, calcCountry]
  );

  const quote = useMemo(() => {
    if (!calcCountryObj || !calcRateObj) return null;
    return calculateOrderQuote({
      usdtAmount: parseFloat(calcUsdt) || 0,
      sellRate: Number(calcRateObj.sellRate),
      feePercent: Number(calcRateObj.feePercent),
      fixedFeeLocal: Number(calcRateObj.fixedFeeLocal),
      currency: calcCountryObj.currency,
      currencySymbol: calcCountryObj.currencySymbol,
    });
  }, [calcCountryObj, calcRateObj, calcUsdt]);

  const tabMethods = useMemo(
    () => config.paymentMethods.filter((m) => m.countryCode === selectedCountryTab && m.isActive),
    [config.paymentMethods, selectedCountryTab]
  );

  const defaultRate = config.rates.find((r) => r.countryCode === 'TG') || config.rates[0];

  return (
    <div className="space-y-24 pb-20">
      {/* 1. HERO SPLIT SECTION */}
      <section className="bg-[#0B1528] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between space-y-8">
              <div className="space-y-5">
                <p className="text-xs font-medium text-emerald-400">
                  Togo · T-Money / Mixx by Yas & Moov Money / Flooz vers USDT (TRC20 · BEP20 · ERC20)
                </p>
                <h1
                  className="font-display font-bold tracking-tight text-white leading-[1.1]"
                  style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', textWrap: 'balance' }}
                >
                  Achetez vos USDT simplement, rapidement et en toute sécurité.
                </h1>
                <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                  Payez en FCFA au Togo via T-Money (Mixx by Yas) ou Moov Money (Flooz) grâce à
                  l’intégration PayGate Global et recevez vos USDT directement sur votre
                  portefeuille personnel après vérification côté serveur.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onStartBuy(calcCountry, parseFloat(calcUsdt) || 100)}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>Acheter des USDT</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
                <a
                  href="#calculateur"
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-lg border border-white/20 text-white text-sm font-medium hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
                >
                  Calculer mon achat
                </a>
              </div>

              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/10">
                <div>
                  <p className="text-xs text-slate-400">Taux indicatif (XOF)</p>
                  <p className="font-mono text-lg font-bold text-white tabular-nums mt-1">
                    {defaultRate ? `${Number(defaultRate.sellRate)} FCFA` : '640 FCFA'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Zone active</p>
                  <p className="font-mono text-lg font-bold text-white tabular-nums mt-1">
                    {config.countries.length === 1
                      ? `${config.countries[0].name} (Phase 1)`
                      : `${config.countries.length} États`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Réseaux USDT</p>
                  <p className="font-mono text-lg font-bold text-emerald-400 mt-1">
                    {config.networks.map((n) => n.code).join(' / ')}
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[300px] lg:min-h-[420px] rounded-xl overflow-hidden border border-white/10 bg-[#111F3B] relative">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/hero_fintech_westafrica_1795736926361.jpg"
                    alt="Espace financier WARIS USDT SHOP en Afrique de l'Ouest"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#0F1E3A] to-[#081020]">
                    <ShieldCheck className="w-12 h-12 text-emerald-400 mb-3" />
                    <p className="font-display text-lg font-semibold text-white">
                      WARIS USDT SHOP
                    </p>
                    <p className="text-xs text-slate-300 mt-1">
                      Infrastructure d’achat USDT en Afrique de l’Ouest
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. DYNAMIC CALCULATOR SECTION */}
      <section id="calculateur" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5 space-y-4">
            <p className="text-xs font-medium text-emerald-700">
              Calculateur dynamique · Taux configurables
            </p>
            <h2
              className="font-display text-3xl font-bold text-[#0B1528] tracking-tight"
              style={{ textWrap: 'balance' }}
            >
              Estimez votre montant exact avant de commander
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Exemple illustratif : pour <span className="font-mono font-semibold">100 USDT</span>{' '}
              au taux de <span className="font-mono font-semibold">640 FCFA</span>, le montant
              brut est de <span className="font-mono font-semibold">64 000 FCFA</span>. Le taux,
              les frais éventuels et la devise locale sont enregistrés de façon définitive sur
              chaque commande.
            </p>
            <div className="p-4 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 leading-relaxed">
              Note de transparence : les taux affichés sont des taux de vente définis par
              l’administration de WARIS USDT SHOP. Ils ne constituent pas un flux de cotation
              boursière en temps réel.
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Pays / Devise locale
                </label>
                <select
                  value={calcCountry}
                  onChange={(e) => setCalcCountry(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {config.countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} — {c.currency} ({c.currencySymbol})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Quantité de USDT
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={calcUsdt}
                    onChange={(e) => setCalcUsdt(e.target.value)}
                    className="w-full pl-3.5 pr-16 py-2.5 text-sm font-mono tabular-nums rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-semibold text-slate-500">
                    USDT
                  </span>
                </div>
              </div>
            </div>

            {quote && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg divide-y divide-slate-200">
                <div className="p-4 flex justify-between items-center text-sm">
                  <span className="text-slate-600">Taux de vente appliqué</span>
                  <span className="font-mono font-semibold text-[#0B1528] tabular-nums">
                    1 USDT = {formatMoney(quote.sellRate, quote.currencySymbol)}
                  </span>
                </div>
                <div className="p-4 flex justify-between items-center text-sm">
                  <span className="text-slate-600">Montant brut</span>
                  <span className="font-mono font-medium text-[#0B1528] tabular-nums">
                    {formatMoney(quote.grossLocalAmount, quote.currencySymbol)}
                  </span>
                </div>
                <div className="p-4 flex justify-between items-center text-sm">
                  <span className="text-slate-600">
                    Frais de plateforme ({quote.feePercent}%)
                  </span>
                  <span className="font-mono font-medium text-[#0B1528] tabular-nums">
                    {formatMoney(quote.feeAmount, quote.currencySymbol)}
                  </span>
                </div>
                <div className="p-4 flex justify-between items-center">
                  <span className="text-sm font-semibold text-[#0B1528]">
                    Total estimé à payer
                  </span>
                  <span className="font-display text-2xl font-bold text-emerald-700 tabular-nums">
                    {formatMoney(quote.totalLocalAmount, quote.currencySymbol)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-slate-500 tabular-nums">
                Bornes autorisées : {Number(calcRateObj?.minUsdt || 10)} à{' '}
                {Number(calcRateObj?.maxUsdt || 5000)} USDT
              </p>
              <button
                type="button"
                onClick={() => onStartBuy(calcCountry, parseFloat(calcUsdt) || 100)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0B1528] text-white text-sm font-semibold hover:bg-[#152645] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Commander ce montant</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. MOBILE MONEY COVERAGE BY COUNTRY */}
      <section className="bg-white border-y border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-medium text-emerald-700">
              Passerelle unique PayGate Global · Phase 1 : Togo
            </p>
            <h2 className="font-display text-3xl font-bold text-[#0B1528] tracking-tight">
              Moyens de paiement activés
            </h2>
            <p className="text-sm text-slate-600">
              Pour cette première version, les paiements sont ouverts au Togo via T-Money / Mixx by
              Yas et Moov Money / Flooz sur la passerelle unique PayGate Global, avec vérification
              côté serveur avant tout envoi d’USDT.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {config.countries.map((c) => {
              const active = c.code === selectedCountryTab;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setSelectedCountryTab(c.code)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#0B1528] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {c.name} ({c.currencySymbol})
                </button>
              );
            })}
          </div>

          {tabMethods.length === 0 ? (
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600">
              Aucun opérateur Mobile Money n’est encore configuré pour ce pays dans l’administration.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {tabMethods.map((m) => (
                <div
                  key={m.id}
                  className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Smartphone className="w-4 h-4 text-[#0B1528] shrink-0" />
                    <span className="text-xs font-medium text-slate-500">
                      {m.isConfigured ? 'API connectée' : 'Contrôle manuel'}
                    </span>
                  </div>
                  <h3 className="font-display text-base font-bold text-[#0B1528]">{m.name}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{m.instructions}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. BLOCKCHAIN NETWORKS & SECURITY */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-5 rounded-xl overflow-hidden border border-slate-200 bg-[#0B1528] min-h-[260px]">
            {!vaultImgFailed ? (
              <img
                src="/src/assets/images/custody_security_architecture_1795736925699.jpg"
                alt="Architecture de sécurité et vérification blockchain WARIS USDT SHOP"
                referrerPolicy="no-referrer"
                onError={() => setVaultImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-white">
                <Lock className="w-10 h-10 text-emerald-400 mb-3" />
                <p className="font-display font-semibold">Vérification on-chain</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div>
              <p className="text-xs font-medium text-emerald-700">
                Réseaux pris en charge · Livraison directe
              </p>
              <h2 className="font-display text-3xl font-bold text-[#0B1528] tracking-tight mt-1">
                Trois réseaux blockchain acceptés
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                Vos USDT sont transférés manuellement par l’administrateur vers l’adresse exacte
                que vous renseignez lors de votre commande, puis vérifiés via l’explorateur
                blockchain officiel.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {config.networks.map((net) => (
                <div
                  key={net.code}
                  className="p-5 rounded-xl border border-slate-200 bg-white space-y-2"
                >
                  <p className="font-display text-lg font-bold text-[#0B1528]">{net.code}</p>
                  <p className="text-xs font-medium text-emerald-700">{net.tokenStandard}</p>
                  <p className="text-xs text-slate-600">{net.addressHint}</p>
                  <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                    Délai : {net.estimatedTime}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. HOW IT WORKS (4 NUMBERED STEPS) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-emerald-700">Processus transparent</p>
          <h2 className="font-display text-3xl font-bold text-[#0B1528] tracking-tight mt-1">
            Comment se déroule un achat
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              num: '01.',
              title: 'Pays & montant',
              desc: 'Choisissez votre pays, le montant en USDT et consultez le total exact dans votre devise.',
            },
            {
              num: '02.',
              title: 'Adresse USDT obligatoire',
              desc: 'Sélectionnez TRC20, BEP20 ou ERC20 et collez votre adresse personnelle après vérification.',
            },
            {
              num: '03.',
              title: 'Paiement Mobile Money',
              desc: 'Effectuez le règlement par votre opérateur local et soumettez votre référence de paiement.',
            },
            {
              num: '04.',
              title: 'Livraison & hash on-chain',
              desc: 'Après confirmation du paiement, l’administrateur transfère vos USDT et vérifie le hash blockchain.',
            },
          ].map((step) => (
            <div
              key={step.num}
              className="p-6 rounded-xl border border-slate-200 bg-white space-y-3"
            >
              <span className="font-mono text-sm font-bold text-emerald-700">{step.num}</span>
              <h3 className="font-display text-base font-bold text-[#0B1528]">{step.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 6. FAQ + SUPPORT & REGULATORY */}
      <section id="faq" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-5">
            <p className="text-xs font-medium text-emerald-700">Questions fréquentes</p>
            <h2 className="font-display text-3xl font-bold text-[#0B1528] tracking-tight">
              Foire aux questions
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Vous avez une question sur une transaction, un opérateur Mobile Money ou la
              vérification d’identité (KYC/AML) ? Notre assistance vous répond directement.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onOpenSupport}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0B1528] text-white text-sm font-semibold hover:bg-[#152645] transition-colors cursor-pointer whitespace-nowrap"
              >
                <HelpCircle className="w-4 h-4 shrink-0" />
                <span>Contacter l’assistance</span>
              </button>
              <button
                type="button"
                onClick={onOpenLegal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Globe className="w-4 h-4 shrink-0" />
                <span>Cadre réglementaire & KYC</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q} className="p-5">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-4 text-left cursor-pointer"
                  >
                    <span className="font-display text-sm sm:text-base font-semibold text-[#0B1528]">
                      {item.q}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <p className="text-sm text-slate-600 leading-relaxed mt-3">{item.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* QUIET FOOTER */}
      <footer className="border-t border-slate-200 bg-white pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="space-y-2">
              <p className="font-display text-base font-bold text-[#0B1528]">WARIS USDT SHOP</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Achetez vos USDT simplement, rapidement et en toute sécurité en Afrique de l’Ouest.
              </p>
            </div>
            <div className="space-y-2 text-xs text-slate-600">
              <p className="font-semibold text-[#0B1528]">Conformité & vigilance</p>
              <p>
                Avant toute exploitation commerciale à grande échelle au Togo et dans l’UEMOA /
                CEDEAO, les autorisations locales relatives aux cryptoactifs, services de paiement et
                obligations LBC/FT (KYC/AML) doivent être officiellement vérifiées.
              </p>
            </div>
            <div className="space-y-2 text-xs text-slate-600 md:text-right">
              <p className="font-semibold text-[#0B1528]">Assistance & mentions</p>
              <p>{config.settings.support_email || 'support@warisusdtshop.com'}</p>
              <div className="flex md:justify-end gap-4 pt-1">
                <button
                  type="button"
                  onClick={onOpenLegal}
                  className="text-emerald-700 hover:underline cursor-pointer"
                >
                  Conditions d’utilisation & Mentions légales
                </button>
                <button
                  type="button"
                  onClick={onOpenSupport}
                  className="text-emerald-700 hover:underline cursor-pointer"
                >
                  Assistance
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>© {new Date().getFullYear()} WARIS USDT SHOP. Tous droits réservés.</p>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              <span>Transactions tracées · Vérification blockchain requise</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
