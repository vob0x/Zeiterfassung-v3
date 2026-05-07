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
 * M2-Scope (jetzt): Personal-Key-Derivation + encryptField/decryptField,
 * kompatibel mit v2-Format `enc:<base64(iv|ciphertext)>`. Team-Key kommt
 * mit Team-Setup in M5.
 */

const SALT_PREFIX = 'zeiterfassung_v6_';
const SESSION_KEY = 'ze_enc_key';
const ENC_PREFIX = 'enc:'; // v2-kompatibel — markiert verschlüsselte Felder

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

// ─────────────────────────────────────────────────────────────────────────
// Encrypt / Decrypt — kompatibel zu v2-Format `enc:<base64(iv|cipher)>`
// ─────────────────────────────────────────────────────────────────────────

/** Liest den Personal Key aus sessionStorage zurück als CryptoKey. */
async function getKey(): Promise<CryptoKey | null> {
  const b64 = sessionStorage.getItem(SESSION_KEY);
  if (!b64) return null;
  try {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch {
    return null;
  }
}

/**
 * Verschlüsselt einen Klartext-String mit dem Personal Key.
 * Format: `enc:<base64(iv|ciphertext)>`. iv ist 12 Byte (AES-GCM-Standard).
 *
 * Ohne Key in sessionStorage: gibt den Klartext unverändert zurück. Das
 * macht es safe, encryptField in nicht-authenticated Pfaden aufzurufen
 * (z.B. defensive Helper) — der Server-Roundtrip in M2-Stores wird das
 * auf einer höheren Ebene gaten.
 *
 * Leerstring/empty: gibt Eingabe unverändert zurück. Damit landen leere
 * Felder als leere Felder in der DB, nicht als verschlüsselte leere
 * Strings (vermeidet unnötige Crypto-Operationen).
 */
export async function encryptField(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;
  const key = await getKey();
  if (!key) return plaintext;
  try {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plaintext)
    );
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return ENC_PREFIX + btoa(String.fromCharCode(...combined));
  } catch {
    // Fail-soft: Klartext zurück. Aufrufer entscheidet ob das ein Bug ist.
    return plaintext;
  }
}

// Rate-limit Decryption-Warnings — ein einzelner Key-Mismatch produziert
// sonst dutzende identische Console-Warnungen pro Pull (jedes Feld eines
// jeden Eintrags).
let _lastDecryptWarn = 0;
let _decryptWarnCount = 0;

/**
 * Entschlüsselt ein `enc:<base64>`-Feld. Wenn die Eingabe nicht mit
 * `enc:` beginnt, wird sie als Klartext betrachtet und unverändert
 * zurückgegeben (Backward-Compat mit alten unverschlüsselten Einträgen
 * aus früheren v2-Iterationen).
 *
 * Bei fehlendem Key oder Decryption-Failure: Leerstring statt Roh-
 * Ciphertext. So landet nie ein `enc:...`-Blob in der UI — schlimmer als
 * leeres Feld wäre nur, dem User Müll zu zeigen.
 */
export async function decryptField(ciphertext: string): Promise<string> {
  if (!ciphertext || !ciphertext.startsWith(ENC_PREFIX)) return ciphertext;
  const key = await getKey();
  if (!key) return '';
  try {
    const b64 = ciphertext.slice(ENC_PREFIX.length);
    const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    _decryptWarnCount++;
    const now = Date.now();
    if (now - _lastDecryptWarn > 60_000) {
      console.warn(
        `[Crypto] Decryption failed for ${_decryptWarnCount} field(s) — Key-Mismatch oder Daten-Korruption`
      );
      _lastDecryptWarn = now;
      _decryptWarnCount = 0;
    }
    return '';
  }
}
