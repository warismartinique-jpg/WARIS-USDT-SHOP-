import { normalizeTogoPhone, validateTogoMobilePhone } from '../shared/validation.ts';

export type PayGateNetwork = 'TMONEY' | 'FLOOZ';

export interface PayGateInitResult {
  configured: boolean;
  ok: boolean;
  txReference?: string;
  identifier?: string;
  gatewayStatus?: number;
  message: string;
}

export interface PayGateStatusResult {
  configured: boolean;
  ok: boolean;
  paid: boolean;
  pending: boolean;
  expired: boolean;
  cancelled: boolean;
  identifier?: string;
  txReference?: string;
  paymentReference?: string;
  paymentMethod?: string;
  amount?: number;
  datetime?: string;
  gatewayStatus?: number;
  message: string;
}

const PAYGATE_PAY_URL = 'https://paygateglobal.com/api/v1/pay';
const PAYGATE_STATUS_V2_URL = 'https://paygateglobal.com/api/v2/status';

export function isPayGateConfigured(): boolean {
  return Boolean(process.env.PAYGATE_AUTH_TOKEN && process.env.PAYGATE_AUTH_TOKEN.trim().length > 0);
}

export function mapOperatorToPayGateNetwork(operatorCode: string): PayGateNetwork | null {
  const code = operatorCode.trim().toUpperCase();
  if (code === 'TMONEY') return 'TMONEY';
  if (code === 'FLOOZ') return 'FLOOZ';
  return null;
}

export function normalizeTogoPhoneForPayGate(phone: string): string {
  return normalizeTogoPhone(phone);
}

async function fetchPayGateJson(url: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await resp.json().catch(() => ({}))) as Record<string, any>;
    return { ok: resp.ok, status: resp.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

export async function initiatePayGatePayment(params: {
  phoneNumber: string;
  amountXof: number;
  identifier: string;
  network: PayGateNetwork;
  description: string;
}): Promise<PayGateInitResult> {
  const authToken = process.env.PAYGATE_AUTH_TOKEN?.trim();
  if (!authToken) {
    return {
      configured: false,
      ok: false,
      message:
        'Passerelle PayGate Global non configurée : la variable serveur PAYGATE_AUTH_TOKEN est manquante.',
    };
  }

  const phoneCheck = validateTogoMobilePhone(params.phoneNumber);
  if (!phoneCheck.valid || !phoneCheck.local8) {
    return {
      configured: true,
      ok: false,
      message:
        phoneCheck.error ||
        'Numéro togolais invalide pour PayGate Global : 8 chiffres requis.',
    };
  }

  const roundedAmount = Math.round(params.amountXof);
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
    return {
      configured: true,
      ok: false,
      message: 'Montant FCFA invalide pour PayGate Global.',
    };
  }

  try {
    const { ok, data } = await fetchPayGateJson(PAYGATE_PAY_URL, {
      auth_token: authToken,
      phone_number: phoneCheck.local8,
      amount: roundedAmount,
      description: params.description,
      identifier: params.identifier,
      network: params.network,
    });

    const gatewayStatus = typeof data.status === 'number' ? data.status : undefined;
    const txReference = data.tx_reference ? String(data.tx_reference) : undefined;

    if (ok && gatewayStatus === 0 && txReference) {
      return {
        configured: true,
        ok: true,
        txReference,
        identifier: params.identifier,
        gatewayStatus,
        message:
          'Demande de paiement USSD envoyée sur votre téléphone. Veuillez valider avec votre code PIN Mobile Money.',
      };
    }

    let friendlyMsg = data.message as string | undefined;
    if (!friendlyMsg) {
      if (gatewayStatus === 2) {
        friendlyMsg = 'Clé API PayGate Global invalide ou non autorisée (code 2).';
      } else if (gatewayStatus === 4) {
        friendlyMsg =
          'Paramètres refusés par PayGate Global (code 4) : vérifiez le numéro et le montant.';
      } else if (gatewayStatus === 6) {
        friendlyMsg =
          'Identifiant de transaction déjà enregistré chez PayGate Global (code 6). Veuillez réessayer.';
      } else {
        friendlyMsg = `PayGate Global a refusé l'initialisation (code ${gatewayStatus ?? 'inconnu'}).`;
      }
    }

    return {
      configured: true,
      ok: false,
      identifier: params.identifier,
      gatewayStatus,
      message: friendlyMsg,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      message:
        err instanceof Error && err.name === 'AbortError'
          ? 'Délai de connexion à PayGate Global dépassé.'
          : 'Impossible de joindre la passerelle PayGate Global.',
    };
  }
}

export async function verifyPayGateStatusByIdentifier(
  identifier: string,
  expectedAmountXof: number
): Promise<PayGateStatusResult> {
  const authToken = process.env.PAYGATE_AUTH_TOKEN?.trim();
  if (!authToken) {
    return {
      configured: false,
      ok: false,
      paid: false,
      pending: false,
      expired: false,
      cancelled: false,
      message:
        'Passerelle PayGate Global non configurée : la variable serveur PAYGATE_AUTH_TOKEN est manquante.',
    };
  }

  try {
    const { ok, data } = await fetchPayGateJson(PAYGATE_STATUS_V2_URL, {
      auth_token: authToken,
      identifier,
    });

    if (!ok || typeof data.status !== 'number') {
      return {
        configured: true,
        ok: false,
        paid: false,
        pending: false,
        expired: false,
        cancelled: false,
        identifier,
        message:
          data.message || 'Impossible de vérifier le statut de la transaction auprès de PayGate.',
      };
    }

    const status = data.status as number;
    const amount = Number(data.amount ?? 0);
    const expectedRounded = Math.round(expectedAmountXof);
    const txReference = data.tx_reference ? String(data.tx_reference) : undefined;
    const paymentReference = data.payment_reference ? String(data.payment_reference) : undefined;
    const paymentMethod = data.payment_method ? String(data.payment_method) : undefined;
    const datetime = data.datetime ? String(data.datetime) : undefined;

    if (status === 0) {
      if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount) < expectedRounded) {
        return {
          configured: true,
          ok: true,
          paid: false,
          pending: false,
          expired: false,
          cancelled: false,
          identifier,
          txReference,
          paymentReference,
          paymentMethod,
          amount,
          datetime,
          gatewayStatus: status,
          message: `Alerte montant : PayGate rapporte ${amount} FCFA alors que ${expectedRounded} FCFA sont attendus.`,
        };
      }

      return {
        configured: true,
        ok: true,
        paid: true,
        pending: false,
        expired: false,
        cancelled: false,
        identifier,
        txReference,
        paymentReference,
        paymentMethod,
        amount,
        datetime,
        gatewayStatus: status,
        message: `Paiement confirmé par PayGate Global (${amount} FCFA · Réf opérateur : ${
          paymentReference || txReference || 'N/A'
        }).`,
      };
    }

    if (status === 2) {
      return {
        configured: true,
        ok: true,
        paid: false,
        pending: true,
        expired: false,
        cancelled: false,
        txReference,
        gatewayStatus: status,
        message: 'Paiement en attente de validation PIN sur le téléphone du client.',
      };
    }

    if (status === 4) {
      return {
        configured: true,
        ok: true,
        paid: false,
        pending: false,
        expired: true,
        cancelled: false,
        txReference,
        gatewayStatus: status,
        message: 'La demande de paiement PayGate a expiré.',
      };
    }

    if (status === 6) {
      return {
        configured: true,
        ok: true,
        paid: false,
        pending: false,
        expired: false,
        cancelled: true,
        txReference,
        gatewayStatus: status,
        message: 'Le paiement a été annulé par le client.',
      };
    }

    return {
      configured: true,
      ok: true,
      paid: false,
      pending: false,
      expired: false,
      cancelled: false,
      txReference,
      gatewayStatus: status,
      message: `Statut PayGate retourné : code ${status}.`,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      paid: false,
      pending: false,
      expired: false,
      cancelled: false,
      message:
        err instanceof Error && err.name === 'AbortError'
          ? 'Délai de vérification PayGate dépassé.'
          : 'Erreur réseau lors de la vérification auprès de PayGate Global.',
    };
  }
}
