/**
 * i18n-Provider + useI18n-Hook.
 *
 * Aktuell: Sprache hardcoded auf 'de'. Wenn der User später Sprache
 * wechseln können soll, kommt das in M5/M6 mit einem uiStore-State.
 * Bis dahin: einfacher Default, aber die Infrastruktur (Provider, Hook,
 * t-Funktion) steht schon korrekt für später.
 *
 * Verhalten von t():
 *   - Pfad in dot-Notation, z.B. `t('auth.signIn')`
 *   - Falls Key in Aktivsprache fehlt, fällt es auf 'de' zurück
 *   - Falls auch in 'de' fehlt, wird der Pfad als String returned —
 *     so sieht man fehlende Übersetzungen sofort statt leerer Strings.
 */

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { de } from './de';
import { fr } from './fr';

type Lang = 'de' | 'fr';

const ALL = { de, fr } as Record<Lang, any>;

interface I18nContextType {
  language: Lang;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

function lookup(obj: any, parts: string[]): string | undefined {
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function I18nProvider({
  children,
  language = 'de',
}: {
  children: ReactNode;
  language?: Lang;
}) {
  const t = useCallback(
    (key: string): string => {
      const parts = key.split('.');
      const inLang = lookup(ALL[language], parts);
      if (inLang !== undefined) return inLang;
      // Fallback auf de
      const inDe = lookup(ALL.de, parts);
      if (inDe !== undefined) return inDe;
      // Letzter Fallback: Key zurückgeben (dann sieht man fehlende Übersetzungen)
      return key;
    },
    [language]
  );

  return (
    <I18nContext.Provider value={{ language, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
