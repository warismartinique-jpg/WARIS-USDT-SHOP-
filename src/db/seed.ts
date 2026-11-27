import { sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  adminSettings,
  exchangeRates,
  paymentMethods,
  supportedCountries,
  supportedNetworks,
} from './schema.ts';

let seedPromise: Promise<void> | null = null;

// Togo active by default for Phase 1; other West African countries stored inactive for future expansion
const COUNTRIES_SEED = [
  { code: 'TG', name: 'Togo', currency: 'XOF', currencySymbol: 'FCFA', dialCode: '+228', isActive: true },
  { code: 'BJ', name: 'Bénin', currency: 'XOF', currencySymbol: 'FCFA', dialCode: '+229', isActive: false },
  { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', currencySymbol: 'FCFA', dialCode: '+225', isActive: false },
  { code: 'BF', name: 'Burkina Faso', currency: 'XOF', currencySymbol: 'FCFA', dialCode: '+226', isActive: false },
  { code: 'ML', name: 'Mali', currency: 'XOF', currencySymbol: 'FCFA', dialCode: '+223', isActive: false },
  { code: 'NE', name: 'Niger', currency: 'XOF', currencySymbol: 'FCFA', dialCode: '+227', isActive: false },
  { code: 'SN', name: 'Sénégal', currency: 'XOF', currencySymbol: 'FCFA', dialCode: '+221', isActive: false },
  { code: 'GW', name: 'Guinée-Bissau', currency: 'XOF', currencySymbol: 'FCFA', dialCode: '+245', isActive: false },
  { code: 'GN', name: 'Guinée', currency: 'GNF', currencySymbol: 'GNF', dialCode: '+224', isActive: false },
  { code: 'GH', name: 'Ghana', currency: 'GHS', currencySymbol: 'GH₵', dialCode: '+233', isActive: false },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', currencySymbol: '₦', dialCode: '+234', isActive: false },
  { code: 'LR', name: 'Liberia', currency: 'LRD', currencySymbol: 'L$', dialCode: '+231', isActive: false },
  { code: 'SL', name: 'Sierra Leone', currency: 'SLE', currencySymbol: 'Le', dialCode: '+232', isActive: false },
  { code: 'GM', name: 'Gambie', currency: 'GMD', currencySymbol: 'D', dialCode: '+220', isActive: false },
  { code: 'CV', name: 'Cap-Vert', currency: 'CVE', currencySymbol: 'Esc', dialCode: '+238', isActive: false },
  { code: 'MR', name: 'Mauritanie', currency: 'MRU', currencySymbol: 'MRU', dialCode: '+222', isActive: false },
];

const NETWORKS_SEED = [
  {
    code: 'TRC20',
    name: 'TRC20 (TRON)',
    tokenStandard: 'TRON TRC-20',
    addressHint: 'Commence par T (34 caractères, ex: TXYZ...)',
    explorerBaseUrl: 'https://tronscan.org/#/transaction/',
    networkFeeUsdt: '1.0000',
    estimatedTime: '5 à 15 min après paiement',
    isActive: true,
  },
  {
    code: 'BEP20',
    name: 'BEP20 (BNB Smart Chain)',
    tokenStandard: 'BSC BEP-20',
    addressHint: 'Commence par 0x (42 caractères)',
    explorerBaseUrl: 'https://bscscan.com/tx/',
    networkFeeUsdt: '0.8000',
    estimatedTime: '5 à 15 min après paiement',
    isActive: true,
  },
  {
    code: 'ERC20',
    name: 'ERC20 (Ethereum)',
    tokenStandard: 'Ethereum ERC-20',
    addressHint: 'Commence par 0x (42 caractères)',
    explorerBaseUrl: 'https://etherscan.io/tx/',
    networkFeeUsdt: '5.0000',
    estimatedTime: '10 à 25 min après paiement',
    isActive: true,
  },
];

// Phase 1 (Togo only): T-Money / Mixx by Yas and Moov Money / Flooz via PayGate Global
const PAYMENT_METHODS_SEED = [
  {
    code: 'TMONEY',
    name: 'T-Money / Mixx by Yas',
    countryCode: 'TG',
    providerType: 'paygate_global',
    instructions:
      'Paiement sécurisé via la passerelle PayGate Global (Togo). Après validation de la commande, lancez le paiement USSD Push sur votre numéro Togocel / Mixx by Yas ou saisissez votre référence.',
    feePercent: '0.00',
    isActive: true,
    isConfigured: false,
  },
  {
    code: 'FLOOZ',
    name: 'Moov Money / Flooz',
    countryCode: 'TG',
    providerType: 'paygate_global',
    instructions:
      'Paiement sécurisé via la passerelle PayGate Global (Togo). Après validation de la commande, lancez le paiement USSD Push sur votre numéro Moov Africa / Flooz ou saisissez votre référence.',
    feePercent: '0.00',
    isActive: true,
    isConfigured: false,
  },
];

const EXCHANGE_RATES_SEED = [
  { countryCode: 'TG', currency: 'XOF', sellRate: '640.0000', feePercent: '0.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '5000.00' },
  { countryCode: 'BJ', currency: 'XOF', sellRate: '640.0000', feePercent: '0.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '5000.00' },
  { countryCode: 'CI', currency: 'XOF', sellRate: '640.0000', feePercent: '0.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '5000.00' },
  { countryCode: 'BF', currency: 'XOF', sellRate: '640.0000', feePercent: '0.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '5000.00' },
  { countryCode: 'ML', currency: 'XOF', sellRate: '640.0000', feePercent: '0.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '5000.00' },
  { countryCode: 'NE', currency: 'XOF', sellRate: '640.0000', feePercent: '0.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '5000.00' },
  { countryCode: 'SN', currency: 'XOF', sellRate: '640.0000', feePercent: '0.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '5000.00' },
  { countryCode: 'GW', currency: 'XOF', sellRate: '640.0000', feePercent: '0.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '5000.00' },
  { countryCode: 'GN', currency: 'GNF', sellRate: '9100.0000', feePercent: '1.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '3000.00' },
  { countryCode: 'GH', currency: 'GHS', sellRate: '16.5000', feePercent: '1.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '3000.00' },
  { countryCode: 'NG', currency: 'NGN', sellRate: '1680.0000', feePercent: '1.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '3000.00' },
  { countryCode: 'LR', currency: 'LRD', sellRate: '198.0000', feePercent: '1.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '2000.00' },
  { countryCode: 'SL', currency: 'SLE', sellRate: '24.5000', feePercent: '1.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '2000.00' },
  { countryCode: 'GM', currency: 'GMD', sellRate: '73.0000', feePercent: '1.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '2000.00' },
  { countryCode: 'CV', currency: 'CVE', sellRate: '106.0000', feePercent: '1.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '2000.00' },
  { countryCode: 'MR', currency: 'MRU', sellRate: '42.0000', feePercent: '1.00', fixedFeeLocal: '0.00', minUsdt: '10.00', maxUsdt: '2000.00' },
];

const SETTINGS_SEED = [
  { key: 'support_email', value: 'support@warisusdtshop.com', description: 'Adresse e-mail officielle du support client' },
  { key: 'support_whatsapp', value: '+228 90 00 00 00', description: 'Numéro WhatsApp d’assistance (à configurer par l’administrateur)' },
  { key: 'company_legal_name', value: 'WARIS USDT SHOP', description: 'Dénomination commerciale affichée' },
  { key: 'operating_country', value: 'Togo (Lancement Phase 1)', description: 'Zone géographique desservie' },
  { key: 'payment_gateway', value: 'PayGate Global (T-Money / Mixx by Yas & Moov Money / Flooz)', description: 'Passerelle de paiement principale' },
  { key: 'rate_notice', value: 'Taux indicatifs fixés par l’administration (hors flux temps réel de marché).', description: 'Mention légale sur les taux affichés' },
  { key: 'manual_delivery_notice', value: 'Livraison manuelle vérifiée après confirmation serveur du paiement.', description: 'Notice de livraison' },
];

async function runSeed() {
  const existingCountries = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportedCountries);

  if ((existingCountries[0]?.count ?? 0) === 0) {
    await db.insert(supportedCountries).values(COUNTRIES_SEED).onConflictDoNothing();
  }

  const existingNetworks = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportedNetworks);

  if ((existingNetworks[0]?.count ?? 0) === 0) {
    await db.insert(supportedNetworks).values(NETWORKS_SEED).onConflictDoNothing();
  }

  const existingRates = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(exchangeRates);

  if ((existingRates[0]?.count ?? 0) === 0) {
    await db.insert(exchangeRates).values(EXCHANGE_RATES_SEED).onConflictDoNothing();
  }

  const existingMethods = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(paymentMethods);

  if ((existingMethods[0]?.count ?? 0) === 0) {
    await db.insert(paymentMethods).values(PAYMENT_METHODS_SEED).onConflictDoNothing();
  }

  const existingSettings = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adminSettings);

  if ((existingSettings[0]?.count ?? 0) === 0) {
    await db.insert(adminSettings).values(SETTINGS_SEED).onConflictDoNothing();
  }
}

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}
