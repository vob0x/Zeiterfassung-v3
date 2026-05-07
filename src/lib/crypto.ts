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
const TEAM_SESSION_KEY = 'ze_team_key';
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
  return importB64Key(sessionStorage.getItem(SESSION_KEY));
}

/** Liest den Team Key aus sessionStorage zurück als CryptoKey. */
async function getTeamKey(): Promise<CryptoKey | null> {
  return importB64Key(sessionStorage.getItem(TEAM_SESSION_KEY));
}

/** Helper: Base64-Key in CryptoKey importieren, oder null bei Fehler. */
async function importB64Key(b64: string | null): Promise<CryptoKey | null> {
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
 * Aktiver Verschlüsselungs-Schlüssel: Team Key wenn verfügbar (User in
 * einem Team), sonst Personal Key. v2 macht es genauso — wer in einem
 * Team ist, dessen Daten werden Team-Key-encrypted, damit andere
 * Mitglieder sie lesen können. v3 muss kompatibel bleiben.
 */
async function getActiveKey(): Promise<CryptoKey | null> {
  const team = await getTeamKey();
  if (team) return team;
  return getKey();
}

// ─────────────────────────────────────────────────────────────────────────
// Team Key Storage + Restore
// ─────────────────────────────────────────────────────────────────────────

/** True wenn der Team Key in sessionStorage liegt. */
export function hasTeamKey(): boolean {
  return sessionStorage.getItem(TEAM_SESSION_KEY) !== null;
}

/** Team Key in sessionStorage legen (nach Restore aus DB). */
export function setTeamKey(teamKeyB64: string): void {
  sessionStorage.setItem(TEAM_SESSION_KEY, teamKeyB64);
}

/** Team Key räumen (Logout, Team-Leave). */
export function clearTeamKey(): void {
  sessionStorage.removeItem(TEAM_SESSION_KEY);
}

/**
 * Decrypted den Team Key, der mit dem Personal Key gewrapt im DB-Feld
 * `team_members.encrypted_team_key` liegt. Returns base64-encoded Team
 * Key, der dann mit setTeamKey() in die Session wandert.
 *
 * Format des Inputs: `<base64(iv|ciphertext)>` (KEIN `enc:`-Prefix —
 * der Wert wird direkt in der DB gespeichert ohne Marker).
 */
export async function decryptTeamKeyWithPersonalKey(
  personalEncryptedB64: string
): Promise<string> {
  const personalKey = await getKey();
  if (!personalKey) throw new Error('Personal Key fehlt');
  const combined = Uint8Array.from(
    atob(personalEncryptedB64),
    (c) => c.charCodeAt(0)
  );
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    personalKey,
    encrypted
  );
  return btoa(String.fromCharCode(...new Uint8Array(decrypted)));
}

const TEAM_TRANSPORT_SALT = 'zeiterfassung_team_transport_';

/**
 * Leitet einen "Transport Key" aus Invite-Code + Team-ID via PBKDF2 ab.
 * Identisch zu v2 — wird benutzt um den Team Key beim Erstellen/Joinen
 * eines Teams in die DB zu wrappen, bevor jemand der Members einen
 * Personal Key hat. v3 nutzt das hier als Read-only-Fallback wenn die
 * personal-key-encrypted Kopie auf team_members fehlt.
 */
async function deriveTransportKey(
  inviteCode: string,
  teamId: string
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(inviteCode.toUpperCase()),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(TEAM_TRANSPORT_SALT + teamId),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Decrypted den Team Key, der mit dem Transport Key (= Invite-Code-
 * derived) auf der `teams.encrypted_team_key`-Spalte liegt. Fallback-
 * Pfad wenn `team_members.encrypted_team_key` leer ist (z.B. Teams die
 * VOR dem Personal-Key-Wrap-Feature angelegt wurden).
 */
export async function decryptTeamKeyFromTransport(
  transportEncryptedB64: string,
  inviteCode: string,
  teamId: string
): Promise<string> {
  const transportKey = await deriveTransportKey(inviteCode, teamId);
  const combined = Uint8Array.from(
    atob(transportEncryptedB64),
    (c) => c.charCodeAt(0)
  );
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    transportKey,
    encrypted
  );
  return btoa(String.fromCharCode(...new Uint8Array(decrypted)));
}

/**
 * Wrap des Team Keys mit dem Personal Key — für Session-Persistenz auf
 * dem team_members-Row. Wird gebraucht wenn v3 den Team Key über den
 * Transport-Pfad geholt hat (Fallback) und das auf den team_members-
 * Row nachzieht, damit künftige Logins direkt Pfad 1 nutzen können.
 */
export async function encryptTeamKeyWithPersonalKey(
  teamKeyB64: string
): Promise<string> {
  const personalKey = await getKey();
  if (!personalKey) throw new Error('Personal Key fehlt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    personalKey,
    Uint8Array.from(atob(teamKeyB64), (c) => c.charCodeAt(0))
  );
  const combined = new Uint8Array(
    iv.length + new Uint8Array(encrypted).length
  );
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
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
  // Aktiver Key = Team Key falls vorhanden, sonst Personal Key. Wenn der
  // User in einem Team ist, müssen seine Daten Team-Key-encrypted werden,
  // damit andere Mitglieder sie lesen können (v2-kompatibel).
  const key = await getActiveKey();
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

  const b64 = ciphertext.slice(ENC_PREFIX.length);
  let combined: Uint8Array;
  try {
    combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return '';
  }
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  // Erst Team Key probieren (für Team-encrypted Daten — der häufigste
  // Fall wenn der User in einem Team ist), bei Fehler auf Personal Key
  // fallen (für eigene historische Pre-Team-Daten oder Solo-User).
  const teamKey = await getTeamKey();
  if (teamKey) {
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        teamKey,
        encrypted
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      // Team Key passt nicht — auf Personal Key fallen
    }
  }

  const personalKey = await getKey();
  if (!personalKey) return '';
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      personalKey,
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
