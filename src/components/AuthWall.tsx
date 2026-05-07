/**
 * AuthWall — schaltet zwischen Sign-In, Sign-Up und Unlock-Form, je
 * nachdem in welchem Auth-Zustand der Store ist.
 *
 * Wird in App.tsx VOR der eigentlichen App gerendert. Die App selbst
 * sieht nur authentifizierte User mit gültigem Personal Key.
 *
 * State-Machine:
 *   - !isAuthenticated         → SignIn (default) oder SignUp (Toggle)
 *   - isAuthenticated + needsPassword → Unlock
 *   - isAuthenticated + !needsPassword → return null (App rendert)
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

type Mode = 'signin' | 'signup';

export default function AuthWall({ children }: { children: React.ReactNode }) {
  const initializeAuth = useAuthStore((s) => s.initializeAuth);
  const loading = useAuthStore((s) => s.loading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const needsPassword = useAuthStore((s) => s.needsPassword);

  // Beim Mount einmalig den Auth-Store initialisieren (Session-Restore).
  useEffect(() => {
    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <SplashLoader />;
  if (!isAuthenticated) return <UnauthScreen />;
  if (needsPassword) return <UnlockScreen />;

  return <>{children}</>;
}

function SplashLoader() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100">
      <div className="text-sm tracking-widest uppercase opacity-60">
        wird geladen…
      </div>
    </main>
  );
}

function UnauthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100 p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div
            className="text-xs tracking-widest uppercase mb-1"
            style={{ color: '#C9A962' }}
          >
            Zeiterfassung
          </div>
          <div className="text-xs text-neutral-500">v3 — alpha</div>
        </div>

        {mode === 'signin' ? <SignInForm /> : <SignUpForm />}

        <div className="text-center mt-4 text-xs text-neutral-500">
          {mode === 'signin' ? (
            <>
              Noch kein Konto?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="underline hover:text-neutral-300"
              >
                Registrieren
              </button>
            </>
          ) : (
            <>
              Schon ein Konto?{' '}
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="underline hover:text-neutral-300"
              >
                Anmelden
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function SignInForm() {
  const signIn = useAuthStore((s) => s.signIn);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [codename, setCodename] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!codename || !password) return;
    try {
      await signIn(codename, password);
    } catch {
      // Error ist bereits im Store gesetzt
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-neutral-400 mb-1">Codename</label>
        <input
          type="text"
          value={codename}
          onChange={(e) => setCodename(e.target.value)}
          autoComplete="username"
          required
          className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-400 mb-1">Passwort</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none text-sm"
        />
      </div>
      {error && (
        <div className="text-xs text-red-400 py-1">{error}</div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 rounded font-medium text-sm transition-opacity disabled:opacity-50"
        style={{ background: '#C9A962', color: '#1c1a17' }}
      >
        {loading ? 'wird angemeldet…' : 'Anmelden'}
      </button>
    </form>
  );
}

function SignUpForm() {
  const signUp = useAuthStore((s) => s.signUp);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [codename, setCodename] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);
    if (!codename || !password) return;
    if (password.length < 8) {
      setLocalError('Passwort muss mind. 8 Zeichen haben.');
      return;
    }
    if (password !== passwordConfirm) {
      setLocalError('Passwörter stimmen nicht überein.');
      return;
    }
    try {
      await signUp(codename, password);
    } catch {
      // im Store-Error
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-neutral-400 mb-1">Codename</label>
        <input
          type="text"
          value={codename}
          onChange={(e) => setCodename(e.target.value)}
          autoComplete="username"
          required
          className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none text-sm"
        />
        <div className="text-[10px] text-neutral-500 mt-1">
          Pseudonym, frei wählbar. Wird intern in eine E-Mail umgewandelt.
        </div>
      </div>
      <div>
        <label className="block text-xs text-neutral-400 mb-1">Passwort</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none text-sm"
        />
        <div className="text-[10px] text-neutral-500 mt-1">
          Mind. 8 Zeichen. Aus diesem Passwort wird der Verschlüsselungs-Schlüssel abgeleitet — ohne Passwort kein Zugriff auf deine Daten.
        </div>
      </div>
      <div>
        <label className="block text-xs text-neutral-400 mb-1">
          Passwort wiederholen
        </label>
        <input
          type="password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          autoComplete="new-password"
          required
          className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none text-sm"
        />
      </div>
      {(localError || error) && (
        <div className="text-xs text-red-400 py-1">{localError || error}</div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 rounded font-medium text-sm transition-opacity disabled:opacity-50"
        style={{ background: '#C9A962', color: '#1c1a17' }}
      >
        {loading ? 'wird registriert…' : 'Registrieren'}
      </button>
    </form>
  );
}

function UnlockScreen() {
  const profile = useAuthStore((s) => s.profile);
  const unlock = useAuthStore((s) => s.unlock);
  const signOut = useAuthStore((s) => s.signOut);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [password, setPassword] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!password) return;
    try {
      await unlock(password);
    } catch {
      // Error im Store
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100 p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div
            className="text-xs tracking-widest uppercase mb-1"
            style={{ color: '#C9A962' }}
          >
            Zeiterfassung
          </div>
          <div className="text-sm text-neutral-300">
            Willkommen zurück, {profile?.codename}
          </div>
          <div className="text-[10px] text-neutral-500 mt-2">
            Dein Verschlüsselungs-Schlüssel wurde beim Tab-Schließen
            entfernt. Bitte Passwort eingeben um deine Daten zu entsperren.
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">
              Passwort
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none text-sm"
            />
          </div>
          {error && (
            <div className="text-xs text-red-400 py-1">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded font-medium text-sm transition-opacity disabled:opacity-50"
            style={{ background: '#C9A962', color: '#1c1a17' }}
          >
            {loading ? 'wird entsperrt…' : 'Entsperren'}
          </button>
        </form>
        <div className="text-center mt-4 text-xs text-neutral-500">
          <button
            type="button"
            onClick={signOut}
            className="underline hover:text-neutral-300"
          >
            Abmelden
          </button>
        </div>
      </div>
    </main>
  );
}
