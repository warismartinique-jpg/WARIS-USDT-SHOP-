import { getExplorerTxUrl, validateTxHash } from '../shared/validation.ts';

export interface BlockchainVerificationResult {
  formatValid: boolean;
  verified: boolean;
  onChainFound: boolean;
  confirmed: boolean;
  recipientMatches: boolean | null;
  tokenContractMatches: boolean | null;
  observedAmountUsdt: number | null;
  explorerUrl: string;
  message: string;
  checkedAt: string;
}

const USDT_TRON_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_ETH_CONTRACT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const USDT_BSC_CONTRACT = '0x55d398326f99059ff775485246999027b3197955';
const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyBlockchainTransaction(
  network: string,
  rawHash: string,
  expectedWallet: string,
  expectedAmountUsdt: number
): Promise<BlockchainVerificationResult> {
  const checkedAt = new Date().toISOString();
  const formatCheck = validateTxHash(network, rawHash);
  const net = network.toUpperCase();

  if (!formatCheck.valid || !formatCheck.normalized) {
    return {
      formatValid: false,
      verified: false,
      onChainFound: false,
      confirmed: false,
      recipientMatches: null,
      tokenContractMatches: null,
      observedAmountUsdt: null,
      explorerUrl: '#',
      message: formatCheck.error || 'Format de hash invalide.',
      checkedAt,
    };
  }

  const hash = formatCheck.normalized;
  const explorerUrl = getExplorerTxUrl(net, hash);

  try {
    if (net === 'TRC20') {
      const resp = await fetchWithTimeout(
        `https://apilist.tronscanapi.com/api/transaction-info?hash=${encodeURIComponent(hash)}`
      );
      if (!resp.ok) {
        return {
          formatValid: true,
          verified: false,
          onChainFound: false,
          confirmed: false,
          recipientMatches: null,
          tokenContractMatches: null,
          observedAmountUsdt: null,
          explorerUrl,
          message: `Explorateur TRON inaccessible (HTTP ${resp.status}). Vérifiez manuellement sur TronScan.`,
          checkedAt,
        };
      }

      const data = (await resp.json()) as Record<string, any>;
      if (!data || !data.hash) {
        return {
          formatValid: true,
          verified: false,
          onChainFound: false,
          confirmed: false,
          recipientMatches: null,
          tokenContractMatches: null,
          observedAmountUsdt: null,
          explorerUrl,
          message: 'Transaction introuvable sur la blockchain TRON (TRC20).',
          checkedAt,
        };
      }

      const confirmed = Boolean(data.confirmed) && data.contractRet === 'SUCCESS';
      const transfers: any[] = Array.isArray(data.trc20TransferInfo) ? data.trc20TransferInfo : [];
      const matchingTransfer = transfers.find(
        (t) =>
          String(t.contract_address || '').toLowerCase() === USDT_TRON_CONTRACT.toLowerCase() &&
          String(t.to_address || '').toLowerCase() === expectedWallet.trim().toLowerCase()
      );
      const anyUsdtTransfer = transfers.find(
        (t) => String(t.contract_address || '').toLowerCase() === USDT_TRON_CONTRACT.toLowerCase()
      );

      const decimals = Number(matchingTransfer?.decimals ?? anyUsdtTransfer?.decimals ?? 6);
      const rawAmt = Number(matchingTransfer?.amount_str ?? anyUsdtTransfer?.amount_str ?? 0);
      const observedAmountUsdt = rawAmt ? rawAmt / Math.pow(10, decimals) : null;
      const recipientMatches = Boolean(matchingTransfer);
      const tokenContractMatches = Boolean(anyUsdtTransfer);
      const verified =
        confirmed &&
        recipientMatches &&
        tokenContractMatches &&
        observedAmountUsdt !== null &&
        observedAmountUsdt >= expectedAmountUsdt * 0.99;

      return {
        formatValid: true,
        verified,
        onChainFound: true,
        confirmed,
        recipientMatches,
        tokenContractMatches,
        observedAmountUsdt,
        explorerUrl,
        message: verified
          ? `Transfert TRC20 confirmé on-chain (${observedAmountUsdt} USDT reçus par ${expectedWallet}).`
          : `Transaction trouvée sur TRON : confirmée=${confirmed ? 'oui' : 'non'}, destinataire conforme=${recipientMatches ? 'oui' : 'non'}.`,
        checkedAt,
      };
    }

    if (net === 'ERC20' || net === 'BEP20') {
      const rpcUrl =
        net === 'ERC20'
          ? 'https://ethereum-rpc.publicnode.com'
          : 'https://bsc-dataseed.binance.org';
      const usdtContract = net === 'ERC20' ? USDT_ETH_CONTRACT : USDT_BSC_CONTRACT;
      const decimals = net === 'ERC20' ? 6 : 18;

      const resp = await fetchWithTimeout(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionReceipt',
          params: [hash],
        }),
      });

      if (!resp.ok) {
        return {
          formatValid: true,
          verified: false,
          onChainFound: false,
          confirmed: false,
          recipientMatches: null,
          tokenContractMatches: null,
          observedAmountUsdt: null,
          explorerUrl,
          message: `Nœud RPC ${net} indisponible (HTTP ${resp.status}). Vérifiez manuellement sur l'explorateur.`,
          checkedAt,
        };
      }

      const rpcData = (await resp.json()) as { result?: any };
      const receipt = rpcData?.result;
      if (!receipt) {
        return {
          formatValid: true,
          verified: false,
          onChainFound: false,
          confirmed: false,
          recipientMatches: null,
          tokenContractMatches: null,
          observedAmountUsdt: null,
          explorerUrl,
          message: `Transaction introuvable ou en attente de minage sur ${net}.`,
          checkedAt,
        };
      }

      const confirmed = receipt.status === '0x1';
      const logs: any[] = Array.isArray(receipt.logs) ? receipt.logs : [];
      const expectedWalletHex = expectedWallet.trim().toLowerCase().replace(/^0x/, '');

      const usdtLogs = logs.filter(
        (l) =>
          String(l.address || '').toLowerCase() === usdtContract &&
          Array.isArray(l.topics) &&
          String(l.topics[0] || '').toLowerCase() === ERC20_TRANSFER_TOPIC
      );

      const matchingLog = usdtLogs.find((l) => {
        const toTopic = String(l.topics[2] || '').toLowerCase();
        return toTopic.endsWith(expectedWalletHex);
      });

      let observedAmountUsdt: number | null = null;
      const targetLog = matchingLog || usdtLogs[0];
      if (targetLog && targetLog.data) {
        try {
          const valBig = BigInt(targetLog.data);
          observedAmountUsdt = Number(valBig) / Math.pow(10, decimals);
        } catch {
          observedAmountUsdt = null;
        }
      }

      const tokenContractMatches = usdtLogs.length > 0;
      const recipientMatches = Boolean(matchingLog);
      const verified =
        confirmed &&
        tokenContractMatches &&
        recipientMatches &&
        observedAmountUsdt !== null &&
        observedAmountUsdt >= expectedAmountUsdt * 0.99;

      return {
        formatValid: true,
        verified,
        onChainFound: true,
        confirmed,
        recipientMatches,
        tokenContractMatches,
        observedAmountUsdt,
        explorerUrl,
        message: verified
          ? `Transfert ${net} confirmé on-chain (${observedAmountUsdt} USDT reçus par ${expectedWallet}).`
          : `Reçu ${net} trouvé : statut=${confirmed ? 'succès' : 'échec'}, contrat USDT=${tokenContractMatches ? 'oui' : 'non'}, destinataire conforme=${recipientMatches ? 'oui' : 'non'}.`,
        checkedAt,
      };
    }

    return {
      formatValid: false,
      verified: false,
      onChainFound: false,
      confirmed: false,
      recipientMatches: null,
      tokenContractMatches: null,
      observedAmountUsdt: null,
      explorerUrl: '#',
      message: `Réseau non supporté pour la vérification : ${net}`,
      checkedAt,
    };
  } catch (error) {
    return {
      formatValid: true,
      verified: false,
      onChainFound: false,
      confirmed: false,
      recipientMatches: null,
      tokenContractMatches: null,
      observedAmountUsdt: null,
      explorerUrl,
      message:
        error instanceof Error && error.name === 'AbortError'
          ? `Délai d'interrogation de l'explorateur ${net} dépassé. Vérifiez le lien manuellement.`
          : `Vérification réseau ${net} impossible actuellement. Contrôlez manuellement via l'explorateur.`,
      checkedAt,
    };
  }
}
