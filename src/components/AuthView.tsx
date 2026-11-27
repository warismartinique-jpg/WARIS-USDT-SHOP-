import React, { useState } from 'react';
import { ArrowRight, KeyRound, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthViewProps {
  onSuccess?: () => void;
  compact?: boolean;
}

export function AuthView({ onSuccess, compact = false }: AuthViewProps) {
  const { signInWithGoogle, signInWithEmail, registerWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const mapAuthError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('auth/operation-not-allowed')) {
      return "La connexion par e-mail/mot de passe n'est pas encore activée dans la console Firebase du projet. Utilisez le bouton « Continuer avec Google » ci-dessus pour accéder immédiatement à votre espace.";
    }
    if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
      return 'E-mail ou mot de passe incorrect.';
    }
    if (msg.includes('auth/email-already-in-use')) {
      return 'Un compte existe déjà avec cette adresse e-mail.';
    }
    if (msg.includes('auth/weak-password')) {
      return 'Le mot de passe doit contenir au moins 6 caractères.';
    }
    if (msg.includes('auth/popup-closed-by-user')) {
      return 'Fenêtre de connexion Google fermée avant la fin.';
    }
    return msg;
  };

  const handleGoogle = async () => {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
      onSuccess?.();
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
        onSuccess?.();
      } else if (mode === 'register') {
        await registerWithEmail(fullName, email, password);
        onSuccess?.();
      } else {
        await resetPassword(email);
        setInfo(
          'Si un compte correspond à cette adresse, un e-mail de réinitialisation vient d’être envoyé.'
        );
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl ${
        compact ? 'p-6' : 'max-w-md mx-auto p-8'
      }`}
    >
      <div className="mb-6">
        <p className="text-xs font-medium text-emerald-700 mb-1.5">
          Accès sécurisé · WARIS USDT SHOP
        </p>
        <h2 className="font-display text-2xl font-bold text-[#0B1528] tracking-tight">
          {mode === 'login'
            ? 'Connexion à votre espace'
            : mode === 'register'
              ? 'Créer votre compte client'
              : 'Mot de passe oublié'}
        </h2>
        <p className="text-sm text-slate-600 mt-1.5">
          Suivez vos commandes Mobile Money, enregistrez vos portefeuilles et consultez vos hash
          blockchain.
        </p>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={submitting}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-[#0B1528] text-white text-sm font-semibold hover:bg-[#13223F] transition-colors disabled:opacity-60 cursor-pointer"
      >
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="whitespace-nowrap">Continuer avec Google</span>
      </button>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-3 text-slate-500">ou par adresse e-mail</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg mb-5">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError(null);
            setInfo(null);
          }}
          className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            mode === 'login'
              ? 'bg-white text-[#0B1528] shadow-sm'
              : 'text-slate-600 hover:text-[#0B1528]'
          }`}
        >
          Connexion
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setError(null);
            setInfo(null);
          }}
          className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            mode === 'register'
              ? 'bg-white text-[#0B1528] shadow-sm'
              : 'text-slate-600 hover:text-[#0B1528]'
          }`}
        >
          Inscription
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('reset');
            setError(null);
            setInfo(null);
          }}
          className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            mode === 'reset'
              ? 'bg-white text-[#0B1528] shadow-sm'
              : 'text-slate-600 hover:text-[#0B1528]'
          }`}
        >
          Mot de passe
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Nom et prénom
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex : Kofi Mensah"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Adresse e-mail
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
            />
          </div>
        </div>

        {mode !== 'reset' && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Mot de passe
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6 caractères minimum"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}

        {info && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
            {info}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {mode === 'register' ? (
            <UserPlus className="w-4 h-4 shrink-0" />
          ) : (
            <ArrowRight className="w-4 h-4 shrink-0" />
          )}
          <span className="whitespace-nowrap">
            {submitting
              ? 'Traitement...'
              : mode === 'login'
                ? 'Se connecter'
                : mode === 'register'
                  ? 'Créer mon compte'
                  : 'Envoyer le lien de réinitialisation'}
          </span>
        </button>
      </form>
    </div>
  );
}
