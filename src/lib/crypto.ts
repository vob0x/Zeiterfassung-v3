/**
 * Client-side Encryption für v3.
 *
 * Aus v2 portiert (gleiches AES-256-GCM-Schema, gleicher Salt-Prefix,
 * gleiche PBKDF2-Iterations) — DAS IST ABSICHT, weil v3 dieselbe
 * Supabase-Datenbank liest und schreibt wie v2. Wenn die Encryption-
 * Parameter abweichen würden, könnten die beiden Apps nicht dieselben
 * Daten lesen. Der Salt-Prefix ist also fix `zeiterfassung_v6_` (kommt
 * aus v2, "v6" referenziert die sechste Encryption-Iteration in der
 * Geschichte des Projekts, NICHT die App-Version v3).
 *
 * M1-Scope: Personal-Key-Derivation aus Passwort, plus Storage. Encrypt/
 * Decrypt-Funktionen kommen mit dem Data-Layer in M2. Team-Key kommt mit
 * Team-Setup in M5.
 */

const SALT_PREFIX = 'zeiterfassung_v6_';
const SESSION_KEY = 'ze_enc_key';

/**
 * Leitet einen AES-256-GCM-Schlüssel aus Password + UserId via PBKDF2 ab
 * und legt ihn in sessionStorage. sessionStorage überlebt Page-Reload aber
 * NICHT Tab-Close — das ist der Grund warum bei jedem App-Start nach Tab-
 * Close das Passwort neu eingegeben werden muss (siehe authStore
 * `needsPassword`-Flow).
 */
export async function deriveEncryptionKey(
  password: string,
  userId: string
): Promise<void> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT_PREFIX + userId),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    /* extractable */ true,
    ['encrypt', 'decrypt']
  );

  const exported = await crypto.subtle.exportKey('raw', key);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  sessionStorage.setItem(SESSION_KEY, b64);
}

/**
 * True wenn der Personal Key in sessionStorage liegt. Wird vom authStore
 * benutzt um zu entscheiden ob `needsPassword` gesetzt werden muss.
 */
export function hasEncryptionKey(): boolean {
  return sessionStorage.getItem(SESSION_KEY) !== null;
}

/**
 * Räumt den Personal Key aus sessionStorage. Wird beim Logout aufgerufen.
 */
export function clearEncryptionKey(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
