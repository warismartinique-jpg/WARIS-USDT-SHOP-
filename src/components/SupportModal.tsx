import { Mail, MessageSquare, X } from 'lucide-react';
import { PublicConfig } from '../types/platform';

interface SupportModalProps {
  config: PublicConfig;
  onClose: () => void;
}

export function SupportModal({ config, onClose }: SupportModalProps) {
  const email = config.settings.support_email || 'support@warisusdtshop.com';
  const whatsapp = config.settings.support_whatsapp || '+228 90 00 00 00';
  const whatsappDigits = whatsapp.replace(/[^\d]/g, '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-emerald-700">Assistance client</p>
            <h3 className="font-display text-xl font-bold text-[#0B1528] mt-0.5">
              Contacter WARIS USDT SHOP
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">
          Indiquez toujours votre référence de commande (exemple :{' '}
          <span className="font-mono font-medium text-[#0B1528]">WUS-2026-000001</span>) lors de
          vos échanges avec le support.
        </p>

        <div className="space-y-3">
          <a
            href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
              'Assistance WARIS USDT SHOP'
            )}`}
            className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-emerald-600 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-[#0B1528]" />
              <div>
                <p className="text-sm font-semibold text-[#0B1528]">Assistance par e-mail</p>
                <p className="text-xs text-slate-600">{email}</p>
              </div>
            </div>
            <span className="text-xs font-medium text-emerald-700">Écrire</span>
          </a>

          <a
            href={`https://wa.me/${whatsappDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-emerald-600 transition-colors"
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-emerald-700" />
              <div>
                <p className="text-sm font-semibold text-[#0B1528]">WhatsApp Business</p>
                <p className="text-xs text-slate-600 font-mono">{whatsapp}</p>
              </div>
            </div>
            <span className="text-xs font-medium text-emerald-700">Ouvrir</span>
          </a>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
          <p className="font-medium text-[#0B1528]">État des intégrations serveur</p>
          <p>
            Passerelle PayGate Global (Togo) :{' '}
            {config.integrations.paygateConfigured ? 'Configurée' : 'Clé API serveur non configurée'}
          </p>
          <p>
            E-mail automatisé (Resend) :{' '}
            {config.integrations.emailConfigured ? 'Configuré' : 'Clé API non configurée'}
          </p>
          <p>
            WhatsApp Cloud API :{' '}
            {config.integrations.whatsappConfigured ? 'Configuré' : 'Identifiants non configurés'}
          </p>
        </div>
      </div>
    </div>
  );
}
