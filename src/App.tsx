/**
 * v3 App-Shell. Routing/Layout kommen sukzessive (M3+).
 *
 * Aktueller Stand: AuthWall sitzt davor. Wer eingeloggt ist und
 * Personal Key hat, sieht den Splash. Sobald M3 startet, wandert hier
 * die TimerView rein.
 */

import { useAuthStore } from '@/stores/authStore';
import AuthWall from '@/components/AuthWall';

export default function App() {
  return (
    <AuthWall>
      <Splash />
    </AuthWall>
  );
}

function Splash() {
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100 p-6">
      <div className="max-w-md text-center space-y-3">
        <div
          className="text-xs tracking-widest uppercase"
          style={{ color: '#C9A962' }}
        >
          Zeiterfassung
        </div>
        <h1 className="text-3xl font-bold">v3 — alpha</h1>
        <p className="text-sm text-neutral-400">
          Eingeloggt als <span className="font-mono">{profile?.codename}</span>.
        </p>
        <p className="text-sm text-neutral-500">
          M1 ist durch. Als nächstes kommt M2 (Server-First Sync-Layer).
        </p>
        <div className="pt-4">
          <button
            type="button"
            onClick={signOut}
            className="text-xs underline text-neutral-500 hover:text-neutral-300"
          >
            Abmelden
          </button>
        </div>
      </div>
    </main>
  );
}
