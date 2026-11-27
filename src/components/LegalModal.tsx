import { ShieldAlert, X } from 'lucide-react';

export function LegalModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <p className="text-xs font-medium text-emerald-700">Informations légales</p>
            <h3 className="font-display text-xl font-bold text-[#0B1528]">
              Conditions d’utilisation & obligations réglementaires
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

        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-700 leading-relaxed">
          <section className="space-y-1.5">
            <h4 className="font-display font-bold text-[#0B1528]">
              1. Objet du service WARIS USDT SHOP
            </h4>
            <p>
              WARIS USDT SHOP est une plateforme permettant l’achat de Tether (USDT) via paiement en
              monnaie locale par Mobile Money. Dans sa version actuelle, la livraison des USDT est
              effectuée manuellement par l’administrateur vers l’adresse de portefeuille personnelle
              renseignée par le client après vérification effective du paiement.
            </p>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-display font-bold text-[#0B1528]">
              2. Responsabilité sur l’adresse de réception
            </h4>
            <p>
              Le client est seul responsable de l’exactitude de son adresse de portefeuille USDT et
              du réseau sélectionné (TRC20, ERC20 ou BEP20). Une erreur d’adresse ou de réseau peut
              entraîner une perte irréversible des actifs numériques. WARIS USDT SHOP enregistre
              l’adresse exacte saisie sans jamais la modifier.
            </p>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-display font-bold text-[#0B1528]">
              3. Cadre réglementaire Togo, UEMOA et Afrique de l’Ouest
            </h4>
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p>
                Avertissement réglementaire : WARIS USDT SHOP ne revendique aucun agrément bancaire
                ou statut d’établissement de monnaie électronique ou de prestataire d’actifs
                numériques sans délivrance officielle préalable par les autorités compétentes
                (BCEAO, CENTIF-Togo, autorités financières nationales).
              </p>
            </div>
            <p>
              Avant toute mise en exploitation commerciale, l’opérateur doit obtenir les
              autorisations requises dans chaque pays desservi (Togo, Bénin, Côte d’Ivoire, Sénégal,
              Burkina Faso, Mali, Niger, Guinée, Ghana, Nigeria, etc.) et appliquer les contrôles
              KYC (vérification d’identité) et AML/LBC-FT (lutte contre le blanchiment de capitaux
              et le financement du terrorisme).
            </p>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-display font-bold text-[#0B1528]">
              4. Preuves de paiement et lutte contre la fraude
            </h4>
            <p>
              Une simple capture d’écran n’est jamais considérée comme une confirmation suffisante de
              paiement. Chaque règlement est contrôlé par référence opérateur unique ou webhook
              signé, et chaque livraison est attestée par un hash blockchain vérifié sur l’explorateur
              public correspondant.
            </p>
          </section>
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-[#0B1528] text-white text-sm font-medium hover:bg-[#152645] cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
