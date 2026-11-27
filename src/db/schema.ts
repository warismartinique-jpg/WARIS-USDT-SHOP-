import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// 1. User Profiles (linked to Firebase Auth UID)
export const profiles = pgTable(
  'profiles',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    countryCode: text('country_code').notNull().default('TG'),
    defaultNetwork: text('default_network').notNull().default('TRC20'),
    defaultWalletAddress: text('default_wallet_address').notNull().default(''),
    role: text('role').notNull().default('client'), // 'client' | 'admin'
    kycStatus: text('kyc_status').notNull().default('unverified'), // 'unverified' | 'pending' | 'verified'
    kycDocumentType: text('kyc_document_type').notNull().default(''),
    kycDocumentRef: text('kyc_document_ref').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('profiles_email_idx').on(table.email),
    index('profiles_role_idx').on(table.role),
  ]
);

// 2. Supported West African Countries
export const supportedCountries = pgTable('supported_countries', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // ISO-2 e.g. TG, BJ, CI...
  name: text('name').notNull(),
  currency: text('currency').notNull(), // XOF, GNF, GHS, NGN...
  currencySymbol: text('currency_symbol').notNull(),
  dialCode: text('dial_code').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Supported Blockchain Networks
export const supportedNetworks = pgTable('supported_networks', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // TRC20, ERC20, BEP20
  name: text('name').notNull(),
  tokenStandard: text('token_standard').notNull(),
  addressHint: text('address_hint').notNull(),
  explorerBaseUrl: text('explorer_base_url').notNull(),
  networkFeeUsdt: numeric('network_fee_usdt', { precision: 12, scale: 4 })
    .notNull()
    .default('1.0000'),
  estimatedTime: text('estimated_time').notNull().default('5-15 min'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. Payment Methods per Country (Mobile Money Operators)
export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull(), // ORANGE_MONEY, WAVE, MTN_MOMO, MOOV_MONEY, TMONEY, FLOOZ
    name: text('name').notNull(),
    countryCode: text('country_code')
      .notNull()
      .references(() => supportedCountries.code),
    providerType: text('provider_type').notNull().default('manual_verification'), // 'manual_verification' | 'aggregator_api'
    merchantAccountNumber: text('merchant_account_number').notNull().default(''),
    merchantAccountName: text('merchant_account_name').notNull().default('WARIS USDT SHOP'),
    instructions: text('instructions').notNull().default(''),
    feePercent: numeric('fee_percent', { precision: 5, scale: 2 }).notNull().default('0.00'),
    isActive: boolean('is_active').notNull().default(true),
    isConfigured: boolean('is_configured').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('payment_methods_country_code_uidx').on(table.countryCode, table.code),
    index('payment_methods_country_idx').on(table.countryCode),
  ]
);

// 5. Exchange Rates per Country/Currency
export const exchangeRates = pgTable('exchange_rates', {
  id: serial('id').primaryKey(),
  countryCode: text('country_code')
    .notNull()
    .unique()
    .references(() => supportedCountries.code),
  currency: text('currency').notNull(),
  sellRate: numeric('sell_rate', { precision: 14, scale: 4 }).notNull(),
  feePercent: numeric('fee_percent', { precision: 5, scale: 2 }).notNull().default('1.50'),
  fixedFeeLocal: numeric('fixed_fee_local', { precision: 14, scale: 2 }).notNull().default('0.00'),
  minUsdt: numeric('min_usdt', { precision: 14, scale: 2 }).notNull().default('10.00'),
  maxUsdt: numeric('max_usdt', { precision: 14, scale: 2 }).notNull().default('5000.00'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 6. Orders (Mandatory columns included)
export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    reference: text('reference').notNull().unique(), // WUS-2026-000001
    userId: integer('user_id')
      .notNull()
      .references(() => profiles.id),
    clientName: text('client_name').notNull(),
    clientEmail: text('client_email').notNull(),
    clientPhone: text('client_phone').notNull(),
    countryCode: text('country_code').notNull(),
    countryName: text('country_name').notNull(),
    usdtAmount: numeric('usdt_amount', { precision: 18, scale: 6 }).notNull(),
    exchangeRate: numeric('exchange_rate', { precision: 14, scale: 4 }).notNull(),
    grossLocalAmount: numeric('gross_local_amount', { precision: 18, scale: 2 }).notNull(),
    feeAmount: numeric('fee_amount', { precision: 18, scale: 2 }).notNull(),
    localAmount: numeric('local_amount', { precision: 18, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    paymentMethodCode: text('payment_method_code').notNull(),
    paymentMethodName: text('payment_method_name').notNull(),
    mobileMoneyNumber: text('mobile_money_number').notNull(),
    network: text('network').notNull(),
    walletAddress: text('wallet_address').notNull(),
    addressConfirmed: boolean('address_confirmed').notNull().default(true),
    paymentStatus: text('payment_status').notNull().default('En attente de paiement'),
    deliveryStatus: text('delivery_status').notNull().default("En attente d'envoi des USDT"),
    overallStatus: text('overall_status').notNull().default('En attente de paiement'),
    paymentReference: text('payment_reference'),
    blockchainTxHash: text('blockchain_tx_hash'),
    blockchainVerified: boolean('blockchain_verified').notNull().default(false),
    blockchainVerifyDetails: text('blockchain_verify_details'),
    blockchainVerifiedAt: timestamp('blockchain_verified_at'),
    adminNotes: text('admin_notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('orders_user_id_idx').on(table.userId),
    index('orders_country_idx').on(table.countryCode),
    index('orders_status_idx').on(table.overallStatus),
    index('orders_created_at_idx').on(table.createdAt),
  ]
);

// 7. Payments (with idempotency & anti-double-payment constraints)
export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id),
    orderReference: text('order_reference').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => profiles.id),
    operatorCode: text('operator_code').notNull(),
    operatorName: text('operator_name').notNull(),
    payerPhone: text('payer_phone').notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    externalReference: text('external_reference').unique(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    status: text('status').notNull().default('pending'), // 'pending' | 'verifying' | 'confirmed' | 'rejected'
    verifiedByUid: text('verified_by_uid'),
    verifiedAt: timestamp('verified_at'),
    rawPayload: text('raw_payload'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('payments_order_id_idx').on(table.orderId),
    index('payments_user_id_idx').on(table.userId),
  ]
);

// 8. Transaction Audit Logs (immutable timeline of status changes & sensitive operations)
export const transactionLogs = pgTable(
  'transaction_logs',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id').references(() => orders.id),
    orderReference: text('order_reference'),
    actorUid: text('actor_uid').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    previousStatus: text('previous_status'),
    newStatus: text('new_status'),
    details: text('details'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('transaction_logs_order_id_idx').on(table.orderId)]
);

// 9. Admin Settings (key-value store for global platform config)
export const adminSettings = pgTable('admin_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 10. Notifications (for clients & order events)
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => profiles.id),
    orderId: integer('order_id').references(() => orders.id),
    orderReference: text('order_reference'),
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type').notNull().default('info'),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('notifications_user_id_idx').on(table.userId),
    index('notifications_read_idx').on(table.isRead),
  ]
);

// Relations
export const profilesRelations = relations(profiles, ({ many }) => ({
  orders: many(orders),
  payments: many(payments),
  notifications: many(notifications),
}));

export const supportedCountriesRelations = relations(supportedCountries, ({ one, many }) => ({
  rate: one(exchangeRates, {
    fields: [supportedCountries.code],
    references: [exchangeRates.countryCode],
  }),
  paymentMethods: many(paymentMethods),
}));

export const paymentMethodsRelations = relations(paymentMethods, ({ one }) => ({
  country: one(supportedCountries, {
    fields: [paymentMethods.countryCode],
    references: [supportedCountries.code],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(profiles, {
    fields: [orders.userId],
    references: [profiles.id],
  }),
  payments: many(payments),
  logs: many(transactionLogs),
  notifications: many(notifications),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  customer: one(profiles, {
    fields: [payments.userId],
    references: [profiles.id],
  }),
}));

export const transactionLogsRelations = relations(transactionLogs, ({ one }) => ({
  order: one(orders, {
    fields: [transactionLogs.orderId],
    references: [orders.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(profiles, {
    fields: [notifications.userId],
    references: [profiles.id],
  }),
  order: one(orders, {
    fields: [notifications.orderId],
    references: [orders.id],
  }),
}));
