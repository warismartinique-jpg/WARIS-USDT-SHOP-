import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

export function StatusBadge({ status }: { status: string }) {
  const s = status || '';

  if (s === 'Commande terminée' || s === 'USDT envoyé' || s === 'Paiement confirmé') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
        {s === 'Paiement confirmé' ? (
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
        )}
        <span>{s}</span>
      </span>
    );
  }

  if (s === 'Transfert en cours' || s === 'Paiement en vérification') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-sky-50 text-sky-900 border border-sky-200 whitespace-nowrap">
        <Loader2 className="w-3.5 h-3.5 text-sky-700 shrink-0" />
        <span>{s}</span>
      </span>
    );
  }

  if (s === 'Commande annulée' || s === 'Paiement rejeté') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-rose-50 text-rose-800 border border-rose-200 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
        <span>{s}</span>
      </span>
    );
  }

  if (s === 'Commande en litige') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-amber-50 text-amber-900 border border-amber-300 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
        <span>{s}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
      <span>{s}</span>
    </span>
  );
}
