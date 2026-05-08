/**
 * TeamView — Team-Tab.
 *
 * M5a-Scope:
 *   - Wenn nicht in einem Team: Setup-Forms (Create / Join)
 *   - Wenn in einem Team: Team-Info-Card mit Mitgliedern + Invite-Code
 *     + Leave-Button
 *
 * Rollen-Management (Admin/Mitarbeiter mit Edit-Rights) kommt M5b.
 * Member-Removal als Admin auch M5b.
 */

import { useEffect, useState } from 'react';
import { Copy, LogOut, Users } from 'lucide-react';
import { useTeamStore } from '@/stores/teamStore';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/i18n';

export default function TeamView() {
  const { t } = useI18n();
  const connected = useTeamStore((s) => s.connected);
  const loading = useTeamStore((s) => s.loading);
  const error = useTeamStore((s) => s.error);
  const syncTeamData = useTeamStore((s) => s.syncTeamData);
  const clearError = useTeamStore((s) => s.clearError);

  // Bei Mount + Tab-Wechsel auf Team einmal syncen.
  useEffect(() => {
    syncTeamData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2
          className="text-xs uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('team.title')}
        </h2>
        {loading && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('app.loading')}
          </span>
        )}
      </div>

      {error && (
        <div
          className="rounded p-3 text-xs flex items-center justify-between gap-2"
          style={{
            background: 'rgba(212,112,110,0.10)',
            border: '1px solid rgba(212,112,110,0.45)',
            color: '#D4706E',
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="underline hover:opacity-70"
          >
            ×
          </button>
        </div>
      )}

      {connected ? <ConnectedView /> : <SetupView />}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Setup: nicht in einem Team — User kann eines erstellen oder beitreten
   ───────────────────────────────────────────────────────────────────── */

function SetupView() {
  const { t } = useI18n();
  const [mode, setMode] = useState<'create' | 'join'>('create');

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg p-4"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(201,169,98,0.18)',
        }}
      >
        <div
          className="text-xs mb-3"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('team.setupHint')}
        </div>

        <div className="flex gap-1.5 mb-3" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'create'}
            onClick={() => setMode('create')}
            className="text-xs px-3 py-1 rounded-full"
            style={{
              background:
                mode === 'create' ? '#C9A962' : 'rgba(255,255,255,0.04)',
              color: mode === 'create' ? '#1c1a17' : 'var(--text)',
              border: `1px solid ${mode === 'create' ? '#C9A962' : 'var(--border)'}`,
              fontWeight: mode === 'create' ? 600 : 400,
            }}
          >
            {t('team.create')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'join'}
            onClick={() => setMode('join')}
            className="text-xs px-3 py-1 rounded-full"
            style={{
              background: mode === 'join' ? '#C9A962' : 'rgba(255,255,255,0.04)',
              color: mode === 'join' ? '#1c1a17' : 'var(--text)',
              border: `1px solid ${mode === 'join' ? '#C9A962' : 'var(--border)'}`,
              fontWeight: mode === 'join' ? 600 : 400,
            }}
          >
            {t('team.join')}
          </button>
        </div>

        {mode === 'create' ? <CreateForm /> : <JoinForm />}
      </div>
    </div>
  );
}

function CreateForm() {
  const { t } = useI18n();
  const createTeam = useTeamStore((s) => s.createTeam);
  const loading = useTeamStore((s) => s.loading);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy || loading) return;
    setBusy(true);
    try {
      await createTeam(name.trim());
      setName('');
    } catch {
      // Error im Store
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label className="block text-xs" style={{ color: 'var(--text-muted)' }}>
        {t('team.nameLabel')}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('team.namePlaceholder')}
          required
          className="w-full mt-1 px-2 py-1.5 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none text-sm"
          style={{ color: 'var(--text)' }}
        />
      </label>
      <button
        type="submit"
        disabled={busy || loading || !name.trim()}
        className="text-xs py-1.5 px-3 rounded font-medium disabled:opacity-50"
        style={{ background: '#C9A962', color: '#1c1a17' }}
      >
        {busy ? t('team.creating') : t('team.createButton')}
      </button>
    </form>
  );
}

function JoinForm() {
  const { t } = useI18n();
  const joinTeam = useTeamStore((s) => s.joinTeam);
  const loading = useTeamStore((s) => s.loading);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy || loading) return;
    setBusy(true);
    try {
      await joinTeam(code.trim());
      setCode('');
    } catch {
      // Error im Store
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label className="block text-xs" style={{ color: 'var(--text-muted)' }}>
        {t('team.inviteCodeLabel')}
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD23"
          required
          maxLength={12}
          className="w-full mt-1 px-2 py-1.5 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none text-sm font-mono uppercase"
          style={{ color: 'var(--text)', letterSpacing: '0.1em' }}
        />
      </label>
      <button
        type="submit"
        disabled={busy || loading || !code.trim()}
        className="text-xs py-1.5 px-3 rounded font-medium disabled:opacity-50"
        style={{ background: '#C9A962', color: '#1c1a17' }}
      >
        {busy ? t('team.joining') : t('team.joinButton')}
      </button>
    </form>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Connected: User ist in einem Team
   ───────────────────────────────────────────────────────────────────── */

function ConnectedView() {
  const { t } = useI18n();
  const team = useTeamStore((s) => s.team);
  const members = useTeamStore((s) => s.members);
  const leaveTeam = useTeamStore((s) => s.leaveTeam);
  const profile = useAuthStore((s) => s.profile);
  const [copied, setCopied] = useState(false);

  if (!team) return null;

  const onCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(team.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Browser-Fallback nicht implementiert — User kann manuell kopieren
    }
  };

  const onLeave = async () => {
    if (!confirm(t('team.leaveConfirm'))) return;
    try {
      await leaveTeam();
    } catch {
      // Error im Store
    }
  };

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg p-4"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(201,169,98,0.18)',
        }}
      >
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span
            className="text-xs uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('team.nameLabel')}
          </span>
        </div>
        <div className="text-lg font-bold" style={{ color: '#C9A962' }}>
          {team.name}
        </div>

        {/* Invite-Code mit Copy-Button */}
        <div className="mt-3 flex items-center gap-2">
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('team.inviteCodeLabel')}:
          </span>
          <code
            className="font-mono text-sm px-2 py-1 rounded"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text)',
              letterSpacing: '0.15em',
            }}
          >
            {team.invite_code}
          </code>
          <button
            type="button"
            onClick={onCopyInvite}
            className="p-1 rounded hover:bg-neutral-800 text-xs"
            style={{ color: copied ? '#6EC49E' : 'var(--text-muted)' }}
            title={t('team.copyInvite')}
          >
            <Copy size={12} />
          </button>
          {copied && (
            <span className="text-[10px]" style={{ color: '#6EC49E' }}>
              {t('team.copied')}
            </span>
          )}
        </div>
      </div>

      {/* Mitglieder-Liste */}
      <div
        className="rounded-lg p-4"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(201,169,98,0.18)',
        }}
      >
        <div className="flex items-baseline justify-between mb-3">
          <span
            className="text-xs uppercase tracking-widest"
            style={{
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Users size={12} />
            {t('team.members')}
          </span>
          <span
            className="text-xs font-mono"
            style={{ color: 'var(--text-muted)' }}
          >
            {members.length}
          </span>
        </div>

        <ul className="space-y-1.5">
          {members.map((m) => {
            const isYou = m.user_id === profile?.id;
            return (
              <li
                key={m.user_id}
                className="flex items-center justify-between gap-2 py-1"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--text)' }}
                  >
                    {m.codename}
                  </span>
                  {isYou && (
                    <span
                      className="text-[10px] uppercase tracking-widest"
                      style={{ color: '#C9A962' }}
                    >
                      ({t('team.you')})
                    </span>
                  )}
                </span>
                <span
                  className="text-[10px] uppercase tracking-widest"
                  style={{
                    color:
                      m.role === 'admin' ? '#C9A962' : 'var(--text-muted)',
                    fontWeight: m.role === 'admin' ? 600 : 400,
                  }}
                >
                  {t(`team.role.${m.role}`)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Leave-Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onLeave}
          className="text-xs py-1.5 px-3 rounded flex items-center gap-1.5"
          style={{
            background: 'rgba(212,112,110,0.10)',
            border: '1px solid rgba(212,112,110,0.30)',
            color: '#D4706E',
          }}
        >
          <LogOut size={12} />
          {t('team.leave')}
        </button>
      </div>
    </div>
  );
}
