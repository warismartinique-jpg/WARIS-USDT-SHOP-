export interface CountryConfig {
  id: number;
  code: string;
  name: string;
  currency: string;
  currencySymbol: string;
  dialCode: string;
  isActive: boolean;
}

export interface NetworkConfig {
  id: number;
  code: string;
  name: string;
  tokenStandard: string;
  addressHint: string;
  explorerBaseUrl: string;
  networkFeeUsdt: string;
  estimatedTime: string;
  isActive: boolean;
}

export interface ExchangeRateConfig {
  id: number;
  countryCode: string;
  currency: string;
  sellRate: string;
  feePercent: string;
  fixedFeeLocal: string;
  minUsdt: string;
  maxUsdt: string;
  updatedAt: string;
}

export interface PaymentMethodConfig {
  id: number;
  code: string;
  name: string;
  countryCode: string;
  providerType: string;
  merchantAccountNumber: string;
  merchantAccountName: string;
  instructions: string;
  feePercent: string;
  isActive: boolean;
  isConfigured: boolean;
}

export interface PublicConfig {
  countries: CountryConfig[];
  networks: NetworkConfig[];
  rates: ExchangeRateConfig[];
  paymentMethods: PaymentMethodConfig[];
  settings: Record<string, string>;
  integrations: {
    paygateConfigured: boolean;
    emailConfigured: boolean;
    whatsappConfigured: boolean;
    webhookConfigured: boolean;
  };
}

export interface Profile {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  countryCode: string;
  defaultNetwork: string;
  defaultWalletAddress: string;
  role: 'client' | 'admin';
  kycStatus: 'unverified' | 'pending' | 'verified';
  kycDocumentType: string;
  kycDocumentRef: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderRecord {
  id: number;
  reference: string;
  userId: number;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  countryCode: string;
  countryName: string;
  usdtAmount: string;
  exchangeRate: string;
  grossLocalAmount: string;
  feeAmount: string;
  localAmount: string;
  currency: string;
  paymentMethodCode: string;
  paymentMethodName: string;
  mobileMoneyNumber: string;
  network: string;
  walletAddress: string;
  addressConfirmed: boolean;
  paymentStatus: string;
  deliveryStatus: string;
  overallStatus: string;
  paymentReference: string | null;
  blockchainTxHash: string | null;
  blockchainVerified: boolean;
  blockchainVerifyDetails: string | null;
  blockchainVerifiedAt: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionLog {
  id: number;
  orderId: number | null;
  orderReference: string | null;
  actorUid: string;
  actorRole: string;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  details: string | null;
  createdAt: string;
}

export interface PaymentRecord {
  id: number;
  orderId: number;
  orderReference: string;
  operatorCode: string;
  operatorName: string;
  payerPhone: string;
  amount: string;
  currency: string;
  externalReference: string | null;
  status: string;
  createdAt: string;
}

export interface NotificationItem {
  id: number;
  userId: number;
  orderId: number | null;
  orderReference: string | null;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface AdminOverview {
  stats: {
    totalClients: number;
    totalOrders: number;
    pendingOrders: number;
    paidOrders: number;
    processingOrders: number;
    completedOrders: number;
    totalUsdtSold: number;
    revenueByCurrency: Record<string, number>;
    dailyStats: { date: string; orders: number; usdt: number }[];
    monthlyStats: { month: string; orders: number; usdt: number }[];
  };
  orders: OrderRecord[];
  clients: Profile[];
  countries: CountryConfig[];
  networks: NetworkConfig[];
  rates: ExchangeRateConfig[];
  paymentMethods: PaymentMethodConfig[];
  settings: { id: number; key: string; value: string; description: string | null }[];
  recentLogs: TransactionLog[];
}
