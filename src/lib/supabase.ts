/**
 * Supabase-Client für v3.
 *
 * Bewusst schlanker als v2: keine 503-Backoff-Circuit-Breaker, keine
 * Health-Tracking-Helfer. Server-First-Modell (siehe ARCHITECTURE.md S4)
 * heißt: Wenn Supabase nicht antwortet, bekommt der User einen Fehler.
 * Die App tut sich weder so, als wäre alles OK noch versucht sie clever
 * zu Recoveren — Klarheit über Komplexität.
 *
 * Credentials kommen aus VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY.
 * Beide MÜSSEN gesetzt sein (lokal in .env.local, in CI als
 * GitHub-Actions-Secrets) — sonst läuft die App nicht. Im Gegensatz zu
 * v2 gibt es keinen "Offline-Mode": kein Server, keine App.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Hard-fail with a clear message — bessere als ein "warum geht nichts"
  // Stille-Mode wie in v2.
  console.error(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set them in .env.local or in your deployment environment.'
  );
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Eigener Storage-Key, damit v2 und v3 nebeneinander auf demselben
      // Browser laufen können ohne sich gegenseitig auszuloggen.
      storageKey: 'zeiterfassung_v3_auth',
    },
  }
);

/**
 * Stellt sicher, dass die Supabase-Session valide ist (refresht falls
 * Token kurz vor Ablauf). Gibt true zurück wenn authentifiziert.
 *
 * Wird vor jedem schreibenden Server-Roundtrip aufgerufen, damit ein
 * abgelaufener Token nicht erst beim Schreiben mit 401 quittiert wird.
 */
export async function ensureValidSession(): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return false;
    // Token läuft in <60s ab? Proaktiv refreshen.
    const expiresAt = session.expires_at || 0;
    if (expiresAt * 1000 - Date.now() < 60_000) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) return false;
    }
    return true;
  } catch {
    return false;
  }
}
