export const ORDER_STATUSES = [
  'En attente de paiement',
  'Paiement en vérification',
  'Paiement confirmé',
  "En attente d'envoi des USDT",
  'Transfert en cours',
  'USDT envoyé',
  'Commande terminée',
  'Commande annulée',
  'Commande en litige',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'En attente de paiement',
  'Paiement en vérification',
  'Paiement confirmé',
  'Paiement rejeté',
] as const;

export const DELIVERY_STATUSES = [
  "En attente d'envoi des USDT",
  'Transfert en cours',
  'USDT envoyé',
  'Commande terminée',
  'Commande annulée',
  'Commande en litige',
] as const;

export interface WalletValidationResult {
  valid: boolean;
  error?: string;
  normalized?: string;
}

const BASE58_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const EVM_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TRON_TX_REGEX = /^[a-fA-F0-9]{64}$/;
const EVM_TX_REGEX = /^0x[a-fA-F0-9]{64}$/;

export function validateWalletAddress(network: string, rawAddress: string): WalletValidationResult {
  const address = (rawAddress || '').trim();
  if (!address) {
    return { valid: false, error: "L'adresse de réception USDT est obligatoire." };
  }

  const net = network.toUpperCase();
  if (net === 'TRC20') {
    if (!address.startsWith('T')) {
      return {
        valid: false,
        error: 'Une adresse TRC20 (TRON) doit obligatoirement commencer par la lettre « T ».',
      };
    }
    if (!BASE58_REGEX.test(address)) {
      return {
        valid: false,
        error: 'Format TRC20 invalide : exactement 34 caractères Base58 (sans 0, O, I, l).',
      };
    }
    return { valid: true, normalized: address };
  }

  if (net === 'ERC20' || net === 'BEP20') {
    if (!address.startsWith('0x')) {
      return {
        valid: false,
        error: `Une adresse ${net} doit obligatoirement commencer par « 0x ».`,
      };
    }
    if (!EVM_REGEX.test(address)) {
      return {
        valid: false,
        error: `Format ${net} invalide : « 0x » suivi de exactement 40 caractères hexadécimaux.`,
      };
    }
    return { valid: true, normalized: address };
  }

  return { valid: false, error: `Réseau blockchain non pris en charge : ${network}` };
}

export function validateTxHash(network: string, rawHash: string): WalletValidationResult {
  const hash = (rawHash || '').trim();
  if (!hash) {
    return { valid: false, error: 'Le hash de transaction blockchain est requis.' };
  }
  const net = network.toUpperCase();
  if (net === 'TRC20') {
    const cleaned = hash.startsWith('0x') ? hash.slice(2) : hash;
    if (!TRON_TX_REGEX.test(cleaned)) {
      return {
        valid: false,
        error: 'Hash TRC20 invalide : 64 caractères hexadécimaux attendus.',
      };
    }
    return { valid: true, normalized: cleaned.toLowerCase() };
  }

  if (net === 'ERC20' || net === 'BEP20') {
    if (!EVM_TX_REGEX.test(hash)) {
      return {
        valid: false,
        error: `Hash ${net} invalide : « 0x » suivi de 64 caractères hexadécimaux attendus.`,
      };
    }
    return { valid: true, normalized: hash.toLowerCase() };
  }

  return { valid: false, error: `Réseau non supporté : ${network}` };
}

export function getExplorerTxUrl(network: string, txHash: string): string {
  const net = network.toUpperCase();
  if (net === 'TRC20') {
    return `https://tronscan.org/#/transaction/${encodeURIComponent(txHash)}`;
  }
  if (net === 'ERC20') {
    return `https://etherscan.io/tx/${encodeURIComponent(txHash)}`;
  }
  if (net === 'BEP20') {
    return `https://bscscan.com/tx/${encodeURIComponent(txHash)}`;
  }
  return '#';
}

export interface PriceQuote {
  usdtAmount: number;
  sellRate: number;
  grossLocalAmount: number;
  feePercent: number;
  fixedFeeLocal: number;
  operatorFeePercent: number;
  feeAmount: number;
  totalLocalAmount: number;
  currency: string;
  currencySymbol: string;
}

export function calculateOrderQuote(params: {
  usdtAmount: number;
  sellRate: number;
  feePercent: number;
  fixedFeeLocal: number;
  operatorFeePercent?: number;
  currency: string;
  currencySymbol: string;
}): PriceQuote {
  const usdt = Number.isFinite(params.usdtAmount) && params.usdtAmount > 0 ? params.usdtAmount : 0;
  const sellRate = Number(params.sellRate) || 0;
  const feePercent = Number(params.feePercent) || 0;
  const operatorFeePercent = Number(params.operatorFeePercent || 0);
  const fixedFeeLocal = Number(params.fixedFeeLocal) || 0;

  const grossLocalAmount = Math.round(usdt * sellRate * 100) / 100;
  const percentFee = Math.round(grossLocalAmount * ((feePercent + operatorFeePercent) / 100) * 100) / 100;
  const feeAmount = Math.round((percentFee + (usdt > 0 ? fixedFeeLocal : 0)) * 100) / 100;
  const totalLocalAmount = Math.round((grossLocalAmount + feeAmount) * 100) / 100;

  return {
    usdtAmount: usdt,
    sellRate,
    grossLocalAmount,
    feePercent,
    fixedFeeLocal,
    operatorFeePercent,
    feeAmount,
    totalLocalAmount,
    currency: params.currency,
    currencySymbol: params.currencySymbol,
  };
}

export function formatMoney(amount: number | string, currencySymbol: string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(num)) return `0 ${currencySymbol}`;
  return `${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(num)} ${currencySymbol}`;
}

export function normalizeTogoPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('00228') && digits.length >= 13) {
    return digits.slice(5);
  }
  if (digits.startsWith('228') && digits.length >= 11) {
    return digits.slice(3);
  }
  return digits;
}

export function validateTogoMobilePhone(phone: string): {
  valid: boolean;
  local8?: string;
  error?: string;
} {
  const local8 = normalizeTogoPhone(phone);
  if (local8.length !== 8 || !/^\d{8}$/.test(local8)) {
    return {
      valid: false,
      error:
        'Numéro Mobile Money togolais invalide : 8 chiffres locaux requis (ex : 90 12 34 56 ou +228 90 12 34 56).',
    };
  }
  if (!/^[79]\d{7}$/.test(local8)) {
    return {
      valid: false,
      error:
        'Numéro mobile togolais invalide : les numéros T-Money / Mixx by Yas et Moov / Flooz commencent par 9 ou 7.',
    };
  }
  return { valid: true, local8 };
}

