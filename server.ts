import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import dotenv from 'dotenv';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  adminSettings,
  exchangeRates,
  notifications,
  orders,
  paymentMethods,
  payments,
  profiles,
  supportedCountries,
  supportedNetworks,
  transactionLogs,
} from './src/db/schema.ts';
import { ensureSeeded } from './src/db/seed.ts';
import { AuthRequest, requireAdmin, requireAuth } from './src/middleware/auth.ts';
import { verifyBlockchainTransaction } from './src/server/blockchain.ts';
import {
  PayGateStatusResult,
  initiatePayGatePayment,
  isPayGateConfigured,
  mapOperatorToPayGateNetwork,
  verifyPayGateStatusByIdentifier,
} from './src/server/paygate.ts';
import {
  ORDER_STATUSES,
  calculateOrderQuote,
  validateTogoMobilePhone,
  validateTxHash,
  validateWalletAddress,
} from './src/shared/validation.ts';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

interface PayGateAttemptMeta {
  identifier: string;
  txReference?: string;
  createdAt: string;
}

interface PaymentPayloadMeta {
  currentAttemptIdentifier?: string;
  attempts?: PayGateAttemptMeta[];
  lastVerification?: unknown;
}

function parsePaymentMeta(rawPayload?: string | null): PaymentPayloadMeta {
  if (!rawPayload) return {};
  try {
    const parsed = JSON.parse(rawPayload);
    if (parsed && typeof parsed === 'object') {
      return parsed as PaymentPayloadMeta;
    }
  } catch {
    // ignore malformed legacy JSON
  }
  return {};
}

async function isPayGateMethodForOrder(order: typeof orders.$inferSelect): Promise<boolean> {
  const rows = await db
    .select({ providerType: paymentMethods.providerType })
    .from(paymentMethods)
    .where(
      and(
        eq(paymentMethods.countryCode, order.countryCode),
        eq(paymentMethods.code, order.paymentMethodCode)
      )
    )
    .limit(1);

  if (rows.length > 0) {
    return rows[0].providerType === 'paygate_global';
  }
  return ['TMONEY', 'FLOOZ'].includes(order.paymentMethodCode.toUpperCase());
}

async function confirmPayGateOrderPayment(params: {
  order: typeof orders.$inferSelect;
  check: PayGateStatusResult;
  actorUid: string;
  actorRole: string;
  action: 'PAYGATE_PAYMENT_CONFIRMED' | 'PAYGATE_WEBHOOK_CONFIRMED';
  verifiedByUid: 'paygate_global_api' | 'paygate_webhook';
  meta?: PaymentPayloadMeta;
}): Promise<{ order: typeof orders.$inferSelect; confirmedNow: boolean }> {
  const { order, check, actorUid, actorRole, action, verifiedByUid, meta } = params;

  return db.transaction(async (tx) => {
    const refToSave = check.paymentReference || check.txReference || order.paymentReference;
    const updatedRows = await tx
      .update(orders)
      .set({
        paymentReference: refToSave,
        paymentStatus: 'Paiement confirmé',
        overallStatus: "En attente d'envoi des USDT",
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), ne(orders.paymentStatus, 'Paiement confirmé')))
      .returning();

    if (updatedRows.length === 0) {
      const latest = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
      return { order: latest[0] || order, confirmedNow: false };
    }

    const nextMeta: PaymentPayloadMeta = {
      ...(meta || {}),
      lastVerification: check,
    };

    await tx
      .update(payments)
      .set({
        status: 'confirmed',
        externalReference: refToSave || undefined,
        verifiedByUid,
        verifiedAt: new Date(),
        rawPayload: JSON.stringify(nextMeta),
      })
      .where(eq(payments.orderId, order.id));

    await tx.insert(transactionLogs).values({
      orderId: order.id,
      orderReference: order.reference,
      actorUid,
      actorRole,
      action,
      previousStatus: order.overallStatus,
      newStatus: "En attente d'envoi des USDT",
      details: check.message,
    });

    await tx.insert(notifications).values({
      userId: order.userId,
      orderId: order.id,
      orderReference: order.reference,
      title: `Paiement confirmé (${order.reference})`,
      message: `Votre paiement de ${order.localAmount} ${order.currency} via ${order.paymentMethodName} a été vérifié par PayGate Global. Votre transfert de ${order.usdtAmount} USDT (${order.network}) est en préparation.`,
      type: 'payment_confirmed',
    });

    return { order: updatedRows[0], confirmedNow: true };
  });
}

// Health check (no eager DB startup probes)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'WARIS USDT SHOP' });
});

// Public platform configuration (countries, networks, rates, payment methods, public settings)
app.get('/api/public/config', async (_req, res) => {
  try {
    await ensureSeeded();

    const [countries, networks, rates, methods, settings] = await Promise.all([
      db.select().from(supportedCountries).orderBy(supportedCountries.name),
      db.select().from(supportedNetworks).orderBy(supportedNetworks.code),
      db.select().from(exchangeRates),
      db.select().from(paymentMethods).orderBy(paymentMethods.name),
      db.select().from(adminSettings),
    ]);

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    const paygateReady = isPayGateConfigured();

    res.json({
      countries: countries.filter((c) => c.isActive),
      networks: networks.filter((n) => n.isActive),
      rates,
      paymentMethods: methods
        .filter((m) => m.isActive)
        .map((m) => ({
          ...m,
          isConfigured: m.providerType === 'paygate_global' ? paygateReady : m.isConfigured,
        })),
      settings: settingsMap,
      integrations: {
        paygateConfigured: paygateReady,
        emailConfigured: Boolean(process.env.RESEND_API_KEY),
        whatsappConfigured: Boolean(
          process.env.WHATSAPP_CLOUD_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
        ),
        webhookConfigured: Boolean(process.env.PAYGATE_WEBHOOK_SECRET),
      },
    });
  } catch (error) {
    console.error('Failed to load public config:', error);
    res.status(500).json({ error: 'Impossible de charger la configuration de la plateforme.' });
  }
});

// Client Profile
app.get('/api/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeeded();
    const profile = req.profile!;
    const unreadRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, profile.id), eq(notifications.isRead, false)));

    res.json({
      profile,
      unreadNotifications: unreadRows[0]?.count ?? 0,
    });
  } catch (error) {
    console.error('Failed to fetch profile:', error);
    res.status(500).json({ error: 'Erreur lors du chargement du profil.' });
  }
});

app.put('/api/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = req.profile!;
    const {
      fullName,
      phone,
      countryCode,
      defaultNetwork,
      defaultWalletAddress,
      kycDocumentType,
      kycDocumentRef,
    } = req.body ?? {};

    const cleanName = typeof fullName === 'string' ? fullName.trim().slice(0, 120) : profile.fullName;
    const cleanPhone = typeof phone === 'string' ? phone.trim().slice(0, 40) : profile.phone;
    const cleanCountry =
      typeof countryCode === 'string' && countryCode.trim().length === 2
        ? countryCode.trim().toUpperCase()
        : profile.countryCode;
    const cleanNet =
      typeof defaultNetwork === 'string' &&
      ['TRC20', 'ERC20', 'BEP20'].includes(defaultNetwork.toUpperCase())
        ? defaultNetwork.toUpperCase()
        : profile.defaultNetwork;
    const cleanWallet =
      typeof defaultWalletAddress === 'string'
        ? defaultWalletAddress.trim().slice(0, 120)
        : profile.defaultWalletAddress;

    if (cleanWallet) {
      const check = validateWalletAddress(cleanNet, cleanWallet);
      if (!check.valid) {
        return res.status(400).json({ error: check.error });
      }
    }

    const cleanDocType =
      typeof kycDocumentType === 'string' ? kycDocumentType.trim().slice(0, 60) : profile.kycDocumentType;
    const cleanDocRef =
      typeof kycDocumentRef === 'string' ? kycDocumentRef.trim().slice(0, 80) : profile.kycDocumentRef;

    const nextKycStatus =
      cleanDocType && cleanDocRef && profile.kycStatus === 'unverified'
        ? 'pending'
        : profile.kycStatus;

    const updated = await db
      .update(profiles)
      .set({
        fullName: cleanName,
        phone: cleanPhone,
        countryCode: cleanCountry,
        defaultNetwork: cleanNet,
        defaultWalletAddress: cleanWallet,
        kycDocumentType: cleanDocType,
        kycDocumentRef: cleanDocRef,
        kycStatus: nextKycStatus,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profile.id))
      .returning();

    res.json({ profile: updated[0] });
  } catch (error) {
    console.error('Failed to update profile:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour le profil.' });
  }
});

// Client Notifications
app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.profile!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    res.json({ notifications: rows });
  } catch (error) {
    console.error('Failed to load notifications:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des notifications.' });
  }
});

app.post('/api/notifications/mark-read', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, req.profile!.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to mark notifications read:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour des notifications.' });
  }
});

// Client Orders (strict ownership filtering)
app.get('/api/orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = req.profile!;
    const clientOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, profile.id))
      .orderBy(desc(orders.createdAt));

    res.json({ orders: clientOrders });
  } catch (error) {
    console.error('Failed to load client orders:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de vos commandes.' });
  }
});

app.get('/api/orders/:reference', requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = req.profile!;
    const reference = String(req.params.reference || '').trim();
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.reference, reference))
      .limit(1);

    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }

    const order = orderRows[0];
    if (order.userId !== profile.id && profile.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé à cette commande.' });
    }

    const [orderPayments, orderLogs] = await Promise.all([
      db.select().from(payments).where(eq(payments.orderId, order.id)),
      db
        .select()
        .from(transactionLogs)
        .where(eq(transactionLogs.orderId, order.id))
        .orderBy(desc(transactionLogs.createdAt)),
    ]);

    res.json({ order, payments: orderPayments, logs: orderLogs });
  } catch (error) {
    console.error('Failed to load order details:', error);
    res.status(500).json({ error: 'Impossible de récupérer les détails de la commande.' });
  }
});

// Create USDT Order (server-authoritative calculation, strict wallet & country/operator validation)
app.post('/api/orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeeded();
    const profile = req.profile!;
    const body = req.body ?? {};

    const countryCode = String(body.countryCode || '').trim().toUpperCase();
    const paymentMethodCode = String(body.paymentMethodCode || '').trim().toUpperCase();
    const networkCode = String(body.network || '').trim().toUpperCase();
    const rawWalletAddress = String(body.walletAddress || '').trim();
    const addressConfirmed = body.addressConfirmed === true;
    const usdtAmount = Number(body.usdtAmount);
    const clientName = String(body.clientName || profile.fullName || '').trim();
    const clientEmail = String(body.clientEmail || profile.email || '').trim();
    const clientPhone = String(body.clientPhone || '').trim();
    const mobileMoneyNumber = String(body.mobileMoneyNumber || clientPhone || '').trim();
    const idempotencyKey =
      String(body.idempotencyKey || '').trim() || crypto.randomUUID();

    if (!clientName || clientName.length < 2) {
      return res.status(400).json({ error: 'Veuillez renseigner votre nom et prénom.' });
    }
    if (!clientEmail || !clientEmail.includes('@')) {
      return res.status(400).json({ error: 'Adresse e-mail invalide.' });
    }
    if (!clientPhone || clientPhone.length < 6) {
      return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    }
    if (!mobileMoneyNumber || mobileMoneyNumber.length < 6) {
      return res.status(400).json({ error: 'Numéro Mobile Money invalide.' });
    }
    if (!addressConfirmed) {
      return res.status(400).json({
        error:
          'Vous devez cocher la case confirmant que votre adresse de réception et votre réseau sont corrects.',
      });
    }
    if (!Number.isFinite(usdtAmount) || usdtAmount <= 0) {
      return res.status(400).json({ error: 'Quantité de USDT invalide.' });
    }

    // Validate wallet address strictly against chosen network
    const walletCheck = validateWalletAddress(networkCode, rawWalletAddress);
    if (!walletCheck.valid || !walletCheck.normalized) {
      return res.status(400).json({ error: walletCheck.error });
    }

    // Load authoritative country, network, exchange rate, and payment method
    const [countryRows, networkRows, rateRows, methodRows] = await Promise.all([
      db
        .select()
        .from(supportedCountries)
        .where(and(eq(supportedCountries.code, countryCode), eq(supportedCountries.isActive, true)))
        .limit(1),
      db
        .select()
        .from(supportedNetworks)
        .where(and(eq(supportedNetworks.code, networkCode), eq(supportedNetworks.isActive, true)))
        .limit(1),
      db
        .select()
        .from(exchangeRates)
        .where(eq(exchangeRates.countryCode, countryCode))
        .limit(1),
      db
        .select()
        .from(paymentMethods)
        .where(
          and(
            eq(paymentMethods.countryCode, countryCode),
            eq(paymentMethods.code, paymentMethodCode),
            eq(paymentMethods.isActive, true)
          )
        )
        .limit(1),
    ]);

    if (countryRows.length === 0) {
      return res.status(400).json({ error: 'Pays non pris en charge ou désactivé.' });
    }
    if (networkRows.length === 0) {
      return res.status(400).json({ error: 'Réseau blockchain non pris en charge ou désactivé.' });
    }
    if (rateRows.length === 0) {
      return res.status(400).json({ error: 'Aucun taux configuré pour ce pays.' });
    }
    if (methodRows.length === 0) {
      return res.status(400).json({
        error: "Ce moyen de paiement n'est pas disponible dans le pays sélectionné.",
      });
    }

    const country = countryRows[0];
    const rate = rateRows[0];
    const method = methodRows[0];

    let normalizedMobileMoney = mobileMoneyNumber;
    if (country.code === 'TG' || method.providerType === 'paygate_global') {
      const phoneCheck = validateTogoMobilePhone(mobileMoneyNumber);
      if (!phoneCheck.valid || !phoneCheck.local8) {
        return res.status(400).json({
          error:
            phoneCheck.error ||
            'Numéro Mobile Money togolais invalide (8 chiffres locaux requis).',
        });
      }
      normalizedMobileMoney = phoneCheck.local8;
    }

    const minUsdt = Number(rate.minUsdt);
    const maxUsdt = Number(rate.maxUsdt);

    if (usdtAmount < minUsdt || usdtAmount > maxUsdt) {
      return res.status(400).json({
        error: `Le montant doit être compris entre ${minUsdt} et ${maxUsdt} USDT pour ${country.name}.`,
      });
    }

    // Check idempotency to avoid duplicate order creation on double-click
    const existingPayment = await db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existingPayment.length > 0) {
      const existingOrder = await db
        .select()
        .from(orders)
        .where(eq(orders.id, existingPayment[0].orderId))
        .limit(1);
      if (existingOrder.length > 0) {
        return res.status(200).json({ order: existingOrder[0], duplicate: true });
      }
    }

    const quote = calculateOrderQuote({
      usdtAmount,
      sellRate: Number(rate.sellRate),
      feePercent: Number(rate.feePercent),
      fixedFeeLocal: Number(rate.fixedFeeLocal),
      operatorFeePercent: Number(method.feePercent),
      currency: country.currency,
      currencySymbol: country.currencySymbol,
    });

    const createdOrder = await db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const countRes = await tx
        .select({ maxId: sql<number>`coalesce(max(${orders.id}), 0)::int` })
        .from(orders);
      const nextNum = (countRes[0]?.maxId ?? 0) + 1;
      const reference = `WUS-${year}-${String(nextNum).padStart(6, '0')}`;

      const insertedOrders = await tx
        .insert(orders)
        .values({
          reference,
          userId: profile.id,
          clientName,
          clientEmail,
          clientPhone,
          countryCode: country.code,
          countryName: country.name,
          usdtAmount: quote.usdtAmount.toFixed(6),
          exchangeRate: quote.sellRate.toFixed(4),
          grossLocalAmount: quote.grossLocalAmount.toFixed(2),
          feeAmount: quote.feeAmount.toFixed(2),
          localAmount: quote.totalLocalAmount.toFixed(2),
          currency: country.currency,
          paymentMethodCode: method.code,
          paymentMethodName: method.name,
          mobileMoneyNumber: normalizedMobileMoney,
          network: networkCode,
          walletAddress: walletCheck.normalized!, // Never overwritten!
          addressConfirmed: true,
          paymentStatus: 'En attente de paiement',
          deliveryStatus: "En attente d'envoi des USDT",
          overallStatus: 'En attente de paiement',
        })
        .returning();

      const order = insertedOrders[0];

      await tx.insert(payments).values({
        orderId: order.id,
        orderReference: order.reference,
        userId: profile.id,
        operatorCode: method.code,
        operatorName: method.name,
        payerPhone: normalizedMobileMoney,
        amount: quote.totalLocalAmount.toFixed(2),
        currency: country.currency,
        idempotencyKey,
        status: 'pending',
      });

      await tx.insert(transactionLogs).values({
        orderId: order.id,
        orderReference: order.reference,
        actorUid: profile.uid,
        actorRole: profile.role,
        action: 'ORDER_CREATED',
        previousStatus: null,
        newStatus: 'En attente de paiement',
        details: `Commande de ${quote.usdtAmount} USDT (${networkCode}) vers ${walletCheck.normalized}. Paiement ${method.name} (${quote.totalLocalAmount} ${country.currency}).`,
      });

      await tx.insert(notifications).values({
        userId: profile.id,
        orderId: order.id,
        orderReference: order.reference,
        title: `Commande ${order.reference} créée`,
        message: `Votre commande de ${quote.usdtAmount} USDT (${networkCode}) pour ${quote.totalLocalAmount} ${country.currency} via ${method.name} est enregistrée.`,
        type: 'order_created',
      });

      // Keep profile phone/country updated if blank
      if (!profile.fullName || !profile.phone) {
        await tx
          .update(profiles)
          .set({
            fullName: profile.fullName || clientName,
            phone: profile.phone || clientPhone,
            countryCode: profile.countryCode || country.code,
            updatedAt: new Date(),
          })
          .where(eq(profiles.id, profile.id));
      }

      return order;
    });

    res.status(201).json({ order: createdOrder });
  } catch (error) {
    console.error('Failed to create order:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la commande.' });
  }
});

// Client submits Mobile Money payment reference for manual/API verification
app.post('/api/orders/:id/payment-reference', requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = req.profile!;
    const orderId = Number(req.params.id);
    const paymentReference = String(req.body?.paymentReference || '').trim();

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Identifiant de commande invalide.' });
    }
    if (!paymentReference || paymentReference.length < 4 || paymentReference.length > 80) {
      return res.status(400).json({
        error: 'Veuillez saisir une référence de transaction Mobile Money valide (4 à 80 caractères).',
      });
    }

    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    const order = orderRows[0];
    if (order.userId !== profile.id && profile.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé.' });
    }

    if (
      order.overallStatus !== 'En attente de paiement' &&
      order.overallStatus !== 'Paiement en vérification'
    ) {
      return res.status(400).json({
        error: 'Le paiement de cette commande ne peut plus être modifié.',
      });
    }

    // Prevent reusing the same external reference across orders (anti-double-spend)
    const duplicateRef = await db
      .select()
      .from(payments)
      .where(eq(payments.externalReference, paymentReference))
      .limit(1);

    if (duplicateRef.length > 0 && duplicateRef[0].orderId !== order.id) {
      return res.status(409).json({
        error: 'Cette référence de paiement est déjà associée à une autre commande.',
      });
    }

    const updatedOrder = await db.transaction(async (tx) => {
      const resOrder = await tx
        .update(orders)
        .set({
          paymentReference,
          paymentStatus: 'Paiement en vérification',
          overallStatus: 'Paiement en vérification',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();

      await tx
        .update(payments)
        .set({
          externalReference: paymentReference,
          status: 'verifying',
        })
        .where(eq(payments.orderId, order.id));

      await tx.insert(transactionLogs).values({
        orderId: order.id,
        orderReference: order.reference,
        actorUid: profile.uid,
        actorRole: profile.role,
        action: 'PAYMENT_REFERENCE_SUBMITTED',
        previousStatus: order.overallStatus,
        newStatus: 'Paiement en vérification',
        details: `Référence Mobile Money soumise : ${paymentReference}`,
      });

      return resOrder[0];
    });

    res.json({ order: updatedOrder });
  } catch (error) {
    console.error('Failed to submit payment reference:', error);
    res.status(500).json({ error: 'Impossible d’enregistrer la référence de paiement.' });
  }
});

// Client updates Mobile Money number before payment confirmation
app.patch('/api/orders/:id/mobile-money-number', requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = req.profile!;
    const orderId = Number(req.params.id);
    const rawNumber = String(req.body?.mobileMoneyNumber || '').trim();

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Identifiant de commande invalide.' });
    }

    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    const order = orderRows[0];
    if (order.userId !== profile.id && profile.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé.' });
    }
    if (
      order.paymentStatus === 'Paiement confirmé' ||
      order.overallStatus === 'USDT envoyé' ||
      order.overallStatus === 'Commande terminée' ||
      order.overallStatus === 'Commande annulée'
    ) {
      return res.status(400).json({
        error: 'Le numéro Mobile Money ne peut plus être modifié pour cette commande.',
      });
    }

    let nextNumber = rawNumber;
    const isPayGate = await isPayGateMethodForOrder(order);
    if (order.countryCode === 'TG' || isPayGate) {
      const check = validateTogoMobilePhone(rawNumber);
      if (!check.valid || !check.local8) {
        return res.status(400).json({
          error: check.error || 'Numéro Mobile Money togolais invalide.',
        });
      }
      nextNumber = check.local8;
    } else if (rawNumber.length < 6) {
      return res.status(400).json({ error: 'Numéro Mobile Money invalide.' });
    }

    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(orders)
        .set({
          mobileMoneyNumber: nextNumber,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();

      await tx
        .update(payments)
        .set({ payerPhone: nextNumber })
        .where(eq(payments.orderId, order.id));

      await tx.insert(transactionLogs).values({
        orderId: order.id,
        orderReference: order.reference,
        actorUid: profile.uid,
        actorRole: profile.role,
        action: 'MOBILE_MONEY_NUMBER_UPDATED',
        previousStatus: order.overallStatus,
        newStatus: order.overallStatus,
        details: `Numéro Mobile Money mis à jour : ${nextNumber}`,
      });

      return rows[0];
    });

    res.json({ order: updated });
  } catch (error) {
    console.error('Failed to update mobile money number:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour le numéro Mobile Money.' });
  }
});

// PayGate Global: Initiate USSD Push payment (T-Money / Mixx by Yas & Moov Money / Flooz)
app.post('/api/orders/:id/paygate/initiate', requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = req.profile!;
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Identifiant de commande invalide.' });
    }

    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    const order = orderRows[0];
    if (order.userId !== profile.id && profile.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé.' });
    }

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .limit(1);
    const paymentRow = paymentRows[0];

    if (order.paymentStatus === 'Paiement confirmé' || paymentRow?.status === 'confirmed') {
      return res.status(400).json({ error: 'Le paiement de cette commande est déjà confirmé.' });
    }
    if (
      order.overallStatus === 'Commande annulée' ||
      order.overallStatus === 'USDT envoyé' ||
      order.overallStatus === 'Commande terminée'
    ) {
      return res.status(400).json({ error: 'Cette commande ne peut plus être payée.' });
    }

    const network = mapOperatorToPayGateNetwork(order.paymentMethodCode);
    if (!network) {
      return res.status(400).json({
        error: "Cet opérateur n'est pas routé via PayGate Global (TMONEY ou FLOOZ requis).",
      });
    }

    const meta = parsePaymentMeta(paymentRow?.rawPayload);
    const existingAttempts = Array.isArray(meta.attempts) ? meta.attempts : [];

    // Before initiating a new attempt, check if an existing attempt is already paid or still awaiting PIN
    const candidatePrevIdentifier =
      meta.currentAttemptIdentifier ||
      (order.paymentReference ? order.reference : undefined);

    if (candidatePrevIdentifier) {
      const prevCheck = await verifyPayGateStatusByIdentifier(
        candidatePrevIdentifier,
        Number(order.localAmount)
      );
      if (!prevCheck.configured) {
        return res.status(503).json({ error: prevCheck.message, configured: false });
      }
      if (prevCheck.paid) {
        const confirmed = await confirmPayGateOrderPayment({
          order,
          check: prevCheck,
          actorUid: profile.uid,
          actorRole: profile.role,
          action: 'PAYGATE_PAYMENT_CONFIRMED',
          verifiedByUid: 'paygate_global_api',
          meta,
        });
        return res.json({
          order: confirmed.order,
          alreadyPaid: true,
          paygate: {
            configured: true,
            ok: true,
            txReference: prevCheck.txReference,
            identifier: candidatePrevIdentifier,
            message:
              'Un paiement précédent pour cette commande est déjà confirmé par PayGate Global. Aucune double facturation effectuée.',
          },
        });
      }
      if (prevCheck.pending) {
        return res.status(409).json({
          error:
            'Une demande USSD est déjà en cours de validation sur votre téléphone. Saisissez votre code PIN ou attendez son expiration avant de relancer.',
          pending: true,
        });
      }
    }

    // Generate a strictly unique identifier for every PayGate attempt to avoid code 6 duplicate rejection
    const attemptNumber = existingAttempts.length + 1;
    const attemptIdentifier = `${order.reference}-P${attemptNumber}`;

    const result = await initiatePayGatePayment({
      phoneNumber: order.mobileMoneyNumber,
      amountXof: Number(order.localAmount),
      identifier: attemptIdentifier,
      network,
      description: `WARIS USDT SHOP ${order.reference}`,
    });

    if (!result.configured) {
      return res.status(503).json({ error: result.message, configured: false });
    }

    if (!result.ok || !result.txReference) {
      return res.status(400).json({ error: result.message, configured: true });
    }

    const nextMeta: PaymentPayloadMeta = {
      currentAttemptIdentifier: attemptIdentifier,
      attempts: [
        ...existingAttempts,
        {
          identifier: attemptIdentifier,
          txReference: result.txReference,
          createdAt: new Date().toISOString(),
        },
      ],
      lastVerification: meta.lastVerification,
    };

    const updatedOrder = await db.transaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({
          paymentReference: result.txReference,
          paymentStatus: 'Paiement en vérification',
          overallStatus: 'Paiement en vérification',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();

      await tx
        .update(payments)
        .set({
          externalReference: result.txReference,
          status: 'verifying',
          rawPayload: JSON.stringify(nextMeta),
        })
        .where(eq(payments.orderId, order.id));

      await tx.insert(transactionLogs).values({
        orderId: order.id,
        orderReference: order.reference,
        actorUid: profile.uid,
        actorRole: profile.role,
        action: 'PAYGATE_INITIATED',
        previousStatus: order.overallStatus,
        newStatus: 'Paiement en vérification',
        details: `Initiation PayGate Global (${network}) · identifier=${attemptIdentifier} · tx_reference=${result.txReference}`,
      });

      return updated[0];
    });

    res.json({ order: updatedOrder, paygate: result });
  } catch (error) {
    console.error('PayGate initiate failed:', error);
    res.status(500).json({ error: 'Erreur lors de l’initialisation PayGate Global.' });
  }
});

// PayGate Global: Server-side payment status verification (POST /api/v2/status)
app.post('/api/orders/:id/paygate/verify', requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = req.profile!;
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Identifiant de commande invalide.' });
    }

    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    const order = orderRows[0];
    if (order.userId !== profile.id && profile.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé.' });
    }

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .limit(1);
    const paymentRow = paymentRows[0];
    const meta = parsePaymentMeta(paymentRow?.rawPayload);

    const identifiersToTry: string[] = [];
    if (meta.currentAttemptIdentifier) identifiersToTry.push(meta.currentAttemptIdentifier);
    if (Array.isArray(meta.attempts)) {
      for (let i = meta.attempts.length - 1; i >= 0; i -= 1) {
        const id = meta.attempts[i]?.identifier;
        if (id && !identifiersToTry.includes(id)) identifiersToTry.push(id);
      }
    }
    if (!identifiersToTry.includes(order.reference)) {
      identifiersToTry.push(order.reference);
    }

    let check: PayGateStatusResult | null = null;
    for (const candidateId of identifiersToTry) {
      const currentCheck = await verifyPayGateStatusByIdentifier(
        candidateId,
        Number(order.localAmount)
      );
      if (!currentCheck.configured) {
        return res.status(503).json({ error: currentCheck.message, configured: false });
      }
      if (!check) check = currentCheck;
      if (currentCheck.paid) {
        check = currentCheck;
        break;
      }
    }

    if (!check) {
      return res.status(500).json({ error: 'Impossible de vérifier le statut PayGate.' });
    }

    if (check.paid) {
      const confirmed = await confirmPayGateOrderPayment({
        order,
        check,
        actorUid: profile.uid,
        actorRole: profile.role,
        action: 'PAYGATE_PAYMENT_CONFIRMED',
        verifiedByUid: 'paygate_global_api',
        meta,
      });
      return res.json({ order: confirmed.order, verification: check });
    }

    if (paymentRow) {
      const updatedMeta: PaymentPayloadMeta = { ...meta, lastVerification: check };
      await db
        .update(payments)
        .set({ rawPayload: JSON.stringify(updatedMeta) })
        .where(eq(payments.id, paymentRow.id));
    }

    res.json({ order, verification: check });
  } catch (error) {
    console.error('PayGate verify failed:', error);
    res.status(500).json({ error: 'Erreur lors de la vérification du paiement PayGate.' });
  }
});

// ================= ADMIN ROUTES =================

app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    await ensureSeeded();

    const [
      allOrders,
      allClients,
      countries,
      networks,
      rates,
      methods,
      settings,
      recentLogs,
    ] = await Promise.all([
      db.select().from(orders).orderBy(desc(orders.createdAt)),
      db.select().from(profiles).orderBy(desc(profiles.createdAt)),
      db.select().from(supportedCountries).orderBy(supportedCountries.name),
      db.select().from(supportedNetworks).orderBy(supportedNetworks.code),
      db.select().from(exchangeRates),
      db.select().from(paymentMethods).orderBy(paymentMethods.countryCode, paymentMethods.name),
      db.select().from(adminSettings),
      db.select().from(transactionLogs).orderBy(desc(transactionLogs.createdAt)).limit(60),
    ]);

    const pendingCount = allOrders.filter(
      (o) =>
        o.overallStatus === 'En attente de paiement' ||
        o.overallStatus === 'Paiement en vérification'
    ).length;

    const paidCount = allOrders.filter(
      (o) =>
        o.paymentStatus === 'Paiement confirmé' &&
        o.overallStatus !== 'Commande terminée' &&
        o.overallStatus !== 'Commande annulée'
    ).length;

    const processingCount = allOrders.filter(
      (o) =>
        o.overallStatus === 'Paiement confirmé' ||
        o.overallStatus === "En attente d'envoi des USDT" ||
        o.overallStatus === 'Transfert en cours'
    ).length;

    const completedCount = allOrders.filter(
      (o) => o.overallStatus === 'USDT envoyé' || o.overallStatus === 'Commande terminée'
    ).length;

    const totalUsdtSold = allOrders
      .filter((o) => o.overallStatus === 'USDT envoyé' || o.overallStatus === 'Commande terminée')
      .reduce((acc, o) => acc + Number(o.usdtAmount || 0), 0);

    const revenueByCurrency: Record<string, number> = {};
    for (const o of allOrders) {
      if (o.paymentStatus === 'Paiement confirmé') {
        revenueByCurrency[o.currency] =
          (revenueByCurrency[o.currency] || 0) + Number(o.localAmount || 0);
      }
    }

    // Daily & Monthly aggregations
    const dailyMap: Record<string, { date: string; orders: number; usdt: number }> = {};
    const monthlyMap: Record<string, { month: string; orders: number; usdt: number }> = {};
    for (const o of allOrders) {
      const d = new Date(o.createdAt);
      const dayKey = d.toISOString().slice(0, 10);
      const monthKey = d.toISOString().slice(0, 7);
      if (!dailyMap[dayKey]) dailyMap[dayKey] = { date: dayKey, orders: 0, usdt: 0 };
      dailyMap[dayKey].orders += 1;
      if (o.overallStatus === 'USDT envoyé' || o.overallStatus === 'Commande terminée') {
        dailyMap[dayKey].usdt += Number(o.usdtAmount || 0);
      }

      if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { month: monthKey, orders: 0, usdt: 0 };
      monthlyMap[monthKey].orders += 1;
      if (o.overallStatus === 'USDT envoyé' || o.overallStatus === 'Commande terminée') {
        monthlyMap[monthKey].usdt += Number(o.usdtAmount || 0);
      }
    }

    res.json({
      stats: {
        totalClients: allClients.length,
        totalOrders: allOrders.length,
        pendingOrders: pendingCount,
        paidOrders: paidCount,
        processingOrders: processingCount,
        completedOrders: completedCount,
        totalUsdtSold: Math.round(totalUsdtSold * 100) / 100,
        revenueByCurrency,
        dailyStats: Object.values(dailyMap).slice(0, 14),
        monthlyStats: Object.values(monthlyMap).slice(0, 12),
      },
      orders: allOrders,
      clients: allClients,
      countries,
      networks,
      rates,
      paymentMethods: methods,
      settings,
      recentLogs,
    });
  } catch (error) {
    console.error('Admin overview failed:', error);
    res.status(500).json({ error: 'Erreur lors du chargement du tableau de bord administrateur.' });
  }
});

// Admin verifies blockchain TX hash against explorer/RPC
app.post('/api/admin/orders/:id/verify-tx', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.id);
    const txHash = String(req.body?.txHash || '').trim();
    const admin = req.profile!;

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'ID de commande invalide.' });
    }

    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    const order = orderRows[0];

    const [isPayGateOrder, paymentRows] = await Promise.all([
      isPayGateMethodForOrder(order),
      db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1),
    ]);
    const paymentRow = paymentRows[0];
    const hasAuthenticPayGateProof =
      order.paymentStatus === 'Paiement confirmé' &&
      paymentRow?.status === 'confirmed' &&
      (paymentRow?.verifiedByUid === 'paygate_global_api' ||
        paymentRow?.verifiedByUid === 'paygate_webhook');

    if (order.paymentStatus !== 'Paiement confirmé' || (isPayGateOrder && !hasAuthenticPayGateProof)) {
      return res.status(403).json({
        error:
          'Blocage sécurité : le paiement doit être vérifié et confirmé authentiquement par PayGate Global (/api/v2/status) avant toute livraison ou validation de hash USDT.',
      });
    }

    const formatCheck = validateTxHash(order.network, txHash);
    if (!formatCheck.valid || !formatCheck.normalized) {
      return res.status(400).json({ error: formatCheck.error });
    }

    const verification = await verifyBlockchainTransaction(
      order.network,
      formatCheck.normalized,
      order.walletAddress,
      Number(order.usdtAmount)
    );

    const updated = await db.transaction(async (tx) => {
      const nextDeliveryStatus = verification.verified ? 'USDT envoyé' : order.deliveryStatus;
      const nextOverallStatus = verification.verified ? 'USDT envoyé' : order.overallStatus;

      const updatedOrder = await tx
        .update(orders)
        .set({
          blockchainTxHash: formatCheck.normalized,
          blockchainVerified: verification.verified,
          blockchainVerifyDetails: verification.message,
          blockchainVerifiedAt: verification.verified ? new Date() : null,
          deliveryStatus: nextDeliveryStatus,
          overallStatus: nextOverallStatus,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();

      await tx.insert(transactionLogs).values({
        orderId: order.id,
        orderReference: order.reference,
        actorUid: admin.uid,
        actorRole: admin.role,
        action: verification.verified ? 'BLOCKCHAIN_TX_VERIFIED' : 'BLOCKCHAIN_TX_CHECKED',
        previousStatus: order.overallStatus,
        newStatus: nextOverallStatus,
        details: `Hash: ${formatCheck.normalized} — ${verification.message}`,
      });

      if (verification.verified) {
        await tx.insert(notifications).values({
          userId: order.userId,
          orderId: order.id,
          orderReference: order.reference,
          title: `USDT envoyés (${order.reference})`,
          message: `Vos ${order.usdtAmount} USDT (${order.network}) ont été envoyés et vérifiés on-chain. Hash : ${formatCheck.normalized}`,
          type: 'usdt_sent',
        });
      }

      return updatedOrder[0];
    });

    res.json({ order: updated, verification });
  } catch (error) {
    console.error('Blockchain verify failed:', error);
    res.status(500).json({ error: 'Erreur lors de la vérification blockchain.' });
  }
});

// Admin updates order status / payment verification / notes
app.patch('/api/admin/orders/:id/status', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.id);
    const admin = req.profile!;
    const { overallStatus, paymentStatus, deliveryStatus, paymentReference, adminNotes } =
      req.body ?? {};

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'ID de commande invalide.' });
    }

    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    const order = orderRows[0];

    if (overallStatus && !ORDER_STATUSES.includes(overallStatus)) {
      return res.status(400).json({ error: 'Statut de commande invalide.' });
    }

    const nextOverall = overallStatus || order.overallStatus;
    let nextPaymentStatus = paymentStatus || order.paymentStatus;
    let nextDeliveryStatus = deliveryStatus || order.deliveryStatus;

    const [isPayGateOrder, paymentRows] = await Promise.all([
      isPayGateMethodForOrder(order),
      db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1),
    ]);
    const paymentRow = paymentRows[0];
    const hasAuthenticPayGateProof =
      order.paymentStatus === 'Paiement confirmé' &&
      paymentRow?.status === 'confirmed' &&
      (paymentRow?.verifiedByUid === 'paygate_global_api' ||
        paymentRow?.verifiedByUid === 'paygate_webhook');

    const targetsPaidOrDeliveryState =
      nextPaymentStatus === 'Paiement confirmé' ||
      nextOverall === 'Paiement confirmé' ||
      nextOverall === "En attente d'envoi des USDT" ||
      nextOverall === 'Transfert en cours' ||
      nextOverall === 'USDT envoyé' ||
      nextOverall === 'Commande terminée';

    // Strict lock for PayGate Global orders: NEVER allow manual payment confirmation without authentic PayGate /api/v2/status proof
    if (isPayGateOrder && targetsPaidOrDeliveryState && !hasAuthenticPayGateProof) {
      return res.status(403).json({
        error:
          "Blocage sécurité PayGate : cette commande utilise PayGate Global. Le paiement doit obligatoirement être confirmé via « Vérifier via PayGate Global (API v2) » avant toute validation ou livraison USDT.",
      });
    }

    // For non-PayGate manual methods (if added later), prevent skipping directly to delivery without prior confirmation
    if (
      !isPayGateOrder &&
      (nextOverall === 'Transfert en cours' ||
        nextOverall === 'USDT envoyé' ||
        nextOverall === 'Commande terminée') &&
      order.paymentStatus !== 'Paiement confirmé'
    ) {
      return res.status(400).json({
        error:
          'Blocage sécurité : le paiement doit être confirmé avant de démarrer ou clôturer une livraison USDT.',
      });
    }

    // Enforce verification discipline: never allow marking as USDT envoyé or Commande terminée without a verified blockchain hash
    if (nextOverall === 'USDT envoyé' || nextOverall === 'Commande terminée') {
      if (!order.blockchainTxHash || !order.blockchainVerified) {
        return res.status(400).json({
          error:
            'Impossible de marquer la commande comme livrée ou terminée sans un hash blockchain vérifié sur l’explorateur.',
        });
      }
    }

    if (nextOverall === 'Paiement confirmé') {
      nextPaymentStatus = 'Paiement confirmé';
    } else if (nextOverall === "En attente d'envoi des USDT") {
      nextPaymentStatus = 'Paiement confirmé';
      nextDeliveryStatus = "En attente d'envoi des USDT";
    } else if (nextOverall === 'Transfert en cours') {
      nextPaymentStatus = 'Paiement confirmé';
      nextDeliveryStatus = 'Transfert en cours';
    } else if (nextOverall === 'USDT envoyé') {
      nextDeliveryStatus = 'USDT envoyé';
    } else if (nextOverall === 'Commande terminée') {
      nextPaymentStatus = 'Paiement confirmé';
      nextDeliveryStatus = 'Commande terminée';
    } else if (nextOverall === 'Commande annulée') {
      nextDeliveryStatus = 'Commande annulée';
    } else if (nextOverall === 'Commande en litige') {
      nextDeliveryStatus = 'Commande en litige';
    }

    const updated = await db.transaction(async (tx) => {
      const nextPayRef =
        typeof paymentReference === 'string' && paymentReference.trim()
          ? paymentReference.trim()
          : order.paymentReference;

      const updatedRows = await tx
        .update(orders)
        .set({
          overallStatus: nextOverall,
          paymentStatus: nextPaymentStatus,
          deliveryStatus: nextDeliveryStatus,
          paymentReference: nextPayRef,
          adminNotes: typeof adminNotes === 'string' ? adminNotes.trim() : order.adminNotes,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();

      if (nextPaymentStatus === 'Paiement confirmé' && !isPayGateOrder) {
        await tx
          .update(payments)
          .set({
            status: 'confirmed',
            externalReference: nextPayRef || undefined,
            verifiedByUid: admin.uid,
            verifiedAt: new Date(),
          })
          .where(eq(payments.orderId, order.id));
      } else if (nextOverall === 'Commande annulée') {
        await tx
          .update(payments)
          .set({
            status: 'rejected',
            verifiedByUid: admin.uid,
            verifiedAt: new Date(),
          })
          .where(eq(payments.orderId, order.id));
      }

      await tx.insert(transactionLogs).values({
        orderId: order.id,
        orderReference: order.reference,
        actorUid: admin.uid,
        actorRole: admin.role,
        action: 'STATUS_UPDATED',
        previousStatus: order.overallStatus,
        newStatus: nextOverall,
        details: `Statut mis à jour par administrateur (${admin.email}). ${
          adminNotes ? `Note: ${adminNotes}` : ''
        }`,
      });

      // Notify client on key transitions
      if (nextOverall !== order.overallStatus) {
        let notifTitle = `Mise à jour ${order.reference}`;
        let notifMsg = `Votre commande est maintenant au statut : ${nextOverall}.`;
        let notifType = 'info';

        if (nextOverall === 'Paiement confirmé' || nextOverall === "En attente d'envoi des USDT") {
          notifTitle = `Paiement confirmé (${order.reference})`;
          notifMsg = `Votre paiement de ${order.localAmount} ${order.currency} est confirmé. Le transfert de ${order.usdtAmount} USDT (${order.network}) va être exécuté.`;
          notifType = 'payment_confirmed';
        } else if (nextOverall === 'Commande terminée') {
          notifTitle = `Commande terminée (${order.reference})`;
          notifMsg = `Votre commande de ${order.usdtAmount} USDT est finalisée et livrée.`;
          notifType = 'usdt_sent';
        } else if (nextOverall === 'Commande annulée') {
          notifTitle = `Commande annulée (${order.reference})`;
          notifMsg = `Votre commande ${order.reference} a été annulée.${adminNotes ? ` Motif : ${adminNotes}` : ''}`;
          notifType = 'order_cancelled';
        }

        await tx.insert(notifications).values({
          userId: order.userId,
          orderId: order.id,
          orderReference: order.reference,
          title: notifTitle,
          message: notifMsg,
          type: notifType,
        });
      }

      return updatedRows[0];
    });

    res.json({ order: updated });
  } catch (error) {
    console.error('Failed to update order status:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour le statut de la commande.' });
  }
});

// Admin: Update Exchange Rate & Limits per Country
app.put('/api/admin/rates/:countryCode', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const countryCode = String(req.params.countryCode || '').toUpperCase();
    const { sellRate, feePercent, fixedFeeLocal, minUsdt, maxUsdt } = req.body ?? {};
    const numRate = Number(sellRate);
    if (!Number.isFinite(numRate) || numRate <= 0) {
      return res.status(400).json({ error: 'Taux de vente invalide.' });
    }

    const updated = await db
      .update(exchangeRates)
      .set({
        sellRate: numRate.toFixed(4),
        feePercent: Number(feePercent || 0).toFixed(2),
        fixedFeeLocal: Number(fixedFeeLocal || 0).toFixed(2),
        minUsdt: Number(minUsdt || 10).toFixed(2),
        maxUsdt: Number(maxUsdt || 5000).toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(exchangeRates.countryCode, countryCode))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Pays introuvable.' });
    }

    await db.insert(transactionLogs).values({
      actorUid: req.profile!.uid,
      actorRole: 'admin',
      action: 'RATE_UPDATED',
      details: `Taux ${countryCode} modifié : ${numRate} (${updated[0].currency}), frais ${feePercent}%, min ${minUsdt}, max ${maxUsdt}.`,
    });

    res.json({ rate: updated[0] });
  } catch (error) {
    console.error('Failed to update rate:', error);
    res.status(500).json({ error: 'Impossible de modifier le taux.' });
  }
});

// Admin: Countries management (toggle or add new country + rate)
app.put('/api/admin/countries/:code', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase();
    const { isActive, currency, currencySymbol } = req.body ?? {};

    const existing = await db
      .select()
      .from(supportedCountries)
      .where(eq(supportedCountries.code, code))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Pays introuvable.' });
    }

    const updated = await db
      .update(supportedCountries)
      .set({
        isActive: typeof isActive === 'boolean' ? isActive : existing[0].isActive,
        currency: typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : existing[0].currency,
        currencySymbol:
          typeof currencySymbol === 'string' && currencySymbol.trim()
            ? currencySymbol.trim()
            : existing[0].currencySymbol,
      })
      .where(eq(supportedCountries.code, code))
      .returning();

    res.json({ country: updated[0] });
  } catch (error) {
    console.error('Failed to update country:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du pays.' });
  }
});

app.post('/api/admin/countries', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { code, name, currency, currencySymbol, dialCode, sellRate } = req.body ?? {};
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode || cleanCode.length !== 2 || !name || !currency || !currencySymbol || !dialCode) {
      return res.status(400).json({ error: 'Informations pays incomplètes.' });
    }

    const numRate = Number(sellRate || 640);
    await db.transaction(async (tx) => {
      await tx.insert(supportedCountries).values({
        code: cleanCode,
        name: String(name).trim(),
        currency: String(currency).trim().toUpperCase(),
        currencySymbol: String(currencySymbol).trim(),
        dialCode: String(dialCode).trim(),
        isActive: true,
      });

      await tx.insert(exchangeRates).values({
        countryCode: cleanCode,
        currency: String(currency).trim().toUpperCase(),
        sellRate: numRate.toFixed(4),
        feePercent: '1.00',
        fixedFeeLocal: '0.00',
        minUsdt: '10.00',
        maxUsdt: '5000.00',
      });
    });

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Failed to add country:', error);
    res.status(500).json({ error: 'Impossible d’ajouter ce pays (code déjà existant ?).' });
  }
});

// Admin: Networks toggle & fees
app.put('/api/admin/networks/:code', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase();
    const { isActive, networkFeeUsdt, estimatedTime } = req.body ?? {};
    const existing = await db
      .select()
      .from(supportedNetworks)
      .where(eq(supportedNetworks.code, code))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Réseau introuvable.' });
    }

    const updated = await db
      .update(supportedNetworks)
      .set({
        isActive: typeof isActive === 'boolean' ? isActive : existing[0].isActive,
        networkFeeUsdt:
          networkFeeUsdt !== undefined
            ? Number(networkFeeUsdt).toFixed(4)
            : existing[0].networkFeeUsdt,
        estimatedTime:
          typeof estimatedTime === 'string' && estimatedTime.trim()
            ? estimatedTime.trim()
            : existing[0].estimatedTime,
      })
      .where(eq(supportedNetworks.code, code))
      .returning();

    res.json({ network: updated[0] });
  } catch (error) {
    console.error('Failed to update network:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour le réseau.' });
  }
});

// Admin: Payment Methods (add/edit/toggle)
app.post('/api/admin/payment-methods', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      code,
      name,
      countryCode,
      merchantAccountNumber,
      merchantAccountName,
      instructions,
      feePercent,
      providerType,
      isConfigured,
    } = req.body ?? {};

    if (!code || !name || !countryCode) {
      return res.status(400).json({ error: 'Code, nom et pays sont obligatoires.' });
    }

    const inserted = await db
      .insert(paymentMethods)
      .values({
        code: String(code).trim().toUpperCase().replace(/\s+/g, '_'),
        name: String(name).trim(),
        countryCode: String(countryCode).trim().toUpperCase(),
        merchantAccountNumber: String(merchantAccountNumber || '').trim(),
        merchantAccountName: String(merchantAccountName || 'WARIS USDT SHOP').trim(),
        instructions: String(instructions || '').trim(),
        feePercent: Number(feePercent || 0).toFixed(2),
        providerType: String(providerType || 'manual_verification'),
        isActive: true,
        isConfigured: Boolean(isConfigured),
      })
      .returning();

    res.status(201).json({ paymentMethod: inserted[0] });
  } catch (error) {
    console.error('Failed to add payment method:', error);
    res.status(500).json({ error: 'Impossible d’ajouter ce moyen de paiement.' });
  }
});

app.put('/api/admin/payment-methods/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide.' });
    }

    const existing = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Opérateur introuvable.' });
    }
    const cur = existing[0];
    const body = req.body ?? {};

    const updated = await db
      .update(paymentMethods)
      .set({
        isActive: typeof body.isActive === 'boolean' ? body.isActive : cur.isActive,
        isConfigured:
          typeof body.isConfigured === 'boolean' ? body.isConfigured : cur.isConfigured,
        merchantAccountNumber:
          typeof body.merchantAccountNumber === 'string'
            ? body.merchantAccountNumber.trim()
            : cur.merchantAccountNumber,
        merchantAccountName:
          typeof body.merchantAccountName === 'string'
            ? body.merchantAccountName.trim()
            : cur.merchantAccountName,
        instructions:
          typeof body.instructions === 'string' ? body.instructions.trim() : cur.instructions,
        feePercent:
          body.feePercent !== undefined ? Number(body.feePercent).toFixed(2) : cur.feePercent,
        providerType:
          typeof body.providerType === 'string' ? body.providerType : cur.providerType,
        updatedAt: new Date(),
      })
      .where(eq(paymentMethods.id, id))
      .returning();

    res.json({ paymentMethod: updated[0] });
  } catch (error) {
    console.error('Failed to update payment method:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour cet opérateur.' });
  }
});

// Admin: Global Settings
app.put('/api/admin/settings', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const updates = req.body?.settings;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Format de paramètres invalide.' });
    }

    for (const [key, val] of Object.entries(updates)) {
      const cleanKey = String(key).trim().slice(0, 80);
      const cleanVal = String(val ?? '').trim().slice(0, 500);
      await db
        .insert(adminSettings)
        .values({ key: cleanKey, value: cleanVal, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: adminSettings.key,
          set: { value: cleanVal, updatedAt: new Date() },
        });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde des paramètres.' });
  }
});

// Admin: Client KYC status update
app.patch('/api/admin/clients/:id/kyc', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const clientId = Number(req.params.id);
    const kycStatus = String(req.body?.kycStatus || '').trim();
    if (!['unverified', 'pending', 'verified'].includes(kycStatus)) {
      return res.status(400).json({ error: 'Statut KYC invalide.' });
    }

    const updated = await db
      .update(profiles)
      .set({ kycStatus, updatedAt: new Date() })
      .where(eq(profiles.id, clientId))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Client introuvable.' });
    }

    await db.insert(transactionLogs).values({
      actorUid: req.profile!.uid,
      actorRole: 'admin',
      action: 'KYC_UPDATED',
      details: `Statut KYC du client ${updated[0].email} défini à ${kycStatus}.`,
    });

    res.json({ client: updated[0] });
  } catch (error) {
    console.error('Failed to update KYC:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour le statut KYC.' });
  }
});

// Secured PayGate Global IPN Webhook (secret check + mandatory server-to-server re-verification + atomic anti-replay)
app.post('/api/webhooks/paygate', async (req, res) => {
  const secret = process.env.PAYGATE_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({
      error:
        'Webhook PayGate non actif : PAYGATE_WEBHOOK_SECRET doit être configuré côté serveur.',
    });
  }

  const providedHeader = String(req.headers['x-paygate-secret'] || '');
  const providedQuery = String(req.query.secret || '');
  const candidate = providedHeader || providedQuery;
  const sigBuf = Buffer.from(candidate);
  const expBuf = Buffer.from(secret);

  if (!candidate || sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ error: 'Secret webhook PayGate invalide.' });
  }

  const identifier = String(req.body?.identifier || '').trim();
  if (!identifier) {
    return res.status(400).json({ error: 'Champ identifier manquant dans le callback.' });
  }

  try {
    // Support both exact order reference (legacy) and attempt identifier (<REF>-P<N>)
    const baseReference = identifier.replace(/-P\d+$/, '');
    let orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.reference, identifier))
      .limit(1);

    if (orderRows.length === 0 && baseReference !== identifier) {
      orderRows = await db
        .select()
        .from(orders)
        .where(eq(orders.reference, baseReference))
        .limit(1);
    }

    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    const order = orderRows[0];

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .limit(1);
    const paymentRow = paymentRows[0];
    const meta = parsePaymentMeta(paymentRow?.rawPayload);

    // If suffixed identifier was used, verify it belongs to recorded attempts for this order
    if (baseReference !== identifier) {
      const knownAttempt =
        meta.currentAttemptIdentifier === identifier ||
        (Array.isArray(meta.attempts) && meta.attempts.some((a) => a.identifier === identifier));
      if (!knownAttempt) {
        return res.status(404).json({ error: 'Tentative de paiement inconnue pour cette commande.' });
      }
    }

    // Sanity check on optional webhook body amount before re-querying PayGate
    if (req.body?.amount !== undefined) {
      const webhookAmount = Number(req.body.amount);
      const expectedRounded = Math.round(Number(order.localAmount));
      if (!Number.isFinite(webhookAmount) || Math.round(webhookAmount) < expectedRounded) {
        return res.status(400).json({
          error: 'Montant webhook inférieur au montant attendu de la commande.',
        });
      }
    }

    // Idempotent fast-path if already confirmed
    if (order.paymentStatus === 'Paiement confirmé') {
      return res.json({ received: true, paid: true, alreadyConfirmed: true });
    }

    // Never trust webhook body alone: re-verify server-to-server via PayGate Global /api/v2/status
    const check = await verifyPayGateStatusByIdentifier(
      identifier,
      Number(order.localAmount)
    );
    if (!check.configured) {
      return res.status(503).json({ error: check.message });
    }

    if (check.paid) {
      const result = await confirmPayGateOrderPayment({
        order,
        check,
        actorUid: 'paygate_webhook',
        actorRole: 'system',
        action: 'PAYGATE_WEBHOOK_CONFIRMED',
        verifiedByUid: 'paygate_webhook',
        meta,
      });
      return res.json({
        received: true,
        paid: true,
        alreadyConfirmed: !result.confirmedNow,
      });
    }

    res.json({ received: true, paid: false, status: check.gatewayStatus });
  } catch (error) {
    console.error('PayGate webhook processing failed:', error);
    res.status(500).json({ error: 'Erreur lors du traitement du webhook PayGate.' });
  }
});

async function startServer() {
  const port = process.env.NODE_ENV === 'production' ? Number(process.env.PORT || 3000) : 3000;
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`WARIS USDT SHOP server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
