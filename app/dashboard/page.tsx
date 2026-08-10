'use client';
import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import {
  AntigravityAccount, AccountQuotaModel, UserSettings,
  DEFAULT_SETTINGS, getAccountDisplayName, getAccountAvgQuota,
  getQuotaStatus, getQuotaColor, sortAccounts, formatResetTime,
  formatModelName,
} from '@/lib/types';
import { AccountEditModal, formatCountdown, getDeadlineColor } from '@/components/AccountEditModal';
import { AppLayout } from '@/components/AppLayout';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<AntigravityAccount[]>([]);
  const [modelsMap, setModelsMap] = useState<Record<string, AccountQuotaModel[]>>({});
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [nextRefreshTime, setNextRefreshTime] = useState<number | null>(null);
  const [countdownText, setCountdownText] = useState<string>('');
  const [editingAccount, setEditingAccount] = useState<AntigravityAccount | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAccounts = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('antigravity_accounts')
      .select('*')
      .eq('owner_uid', uid)
      .order('connected_at', { ascending: false });
    return (data as AntigravityAccount[]) || [];
  }, []);

  const loadModelsForAccounts = useCallback(async (accs: AntigravityAccount[]) => {
    if (accs.length === 0) return {};
    const ids = accs.map((a) => a.id);
    const { data } = await supabase
      .from('account_quota_models')
      .select('*')
      .in('account_id', ids);
    const map: Record<string, AccountQuotaModel[]> = {};
    for (const model of (data as AccountQuotaModel[]) || []) {
      if (!map[model.account_id]) map[model.account_id] = [];
      map[model.account_id].push(model);
    }
    return map;
  }, []);

  const loadSettings = useCallback(async (uid: string): Promise<UserSettings> => {
    try {
      const res = await fetch(`/api/settings?ownerUid=${uid}`);
      if (!res.ok) return { ...DEFAULT_SETTINGS, owner_uid: uid, updated_at: '' };
      const data = await res.json() as Partial<UserSettings> & { exists?: boolean };
      // Always merge with DEFAULT_SETTINGS so every field is guaranteed to exist
      return {
        ...DEFAULT_SETTINGS,
        owner_uid: uid,
        updated_at: '',
        ...data,
        // Ensure model_visibility is always a plain object, never undefined/null
        model_visibility: data.model_visibility && typeof data.model_visibility === 'object'
          ? data.model_visibility
          : {},
        // Ensure card_display_models is always an array
        card_display_models: Array.isArray(data.card_display_models)
          ? data.card_display_models
          : [],
      };
    } catch {
      return { ...DEFAULT_SETTINGS, owner_uid: uid, updated_at: '' };
    }
  }, []);

  const refreshAccount = useCallback(async (accountId: string, uid: string) => {
    setRefreshingId(accountId);
    setError('');
    try {
      const res = await fetch('/api/quota/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, ownerUid: uid }),
      });
      const json = await res.json() as { error?: string; modelCount?: number };
      if (!res.ok) {
        if (json.error === 'TOKEN_EXPIRED') {
          setError(`Account token expired. Please reconnect this account.`);
        } else {
          setError(json.error || 'Refresh failed');
        }
        return;
      }
      // Reload data
      const accs = await loadAccounts(uid);
      const map = await loadModelsForAccounts(accs);
      setAccounts(accs);
      setModelsMap(map);
      setSuccessMsg(`✓ Synced ${json.modelCount ?? 0} models`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } finally {
      setRefreshingId(null);
    }
  }, [loadAccounts, loadModelsForAccounts]);

  const handleConnect = useCallback((uid: string) => {
    window.location.href = `/api/auth/antigravity-connect?userId=${uid}`;
  }, []);

  const handleDelete = useCallback(async (accountId: string) => {
    if (!confirm('Remove this Antigravity account? All quota data for this account will be deleted.')) return;
    setDeletingId(accountId);
    await supabase.from('antigravity_accounts').delete().eq('id', accountId);
    setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    setModelsMap((prev) => { const copy = { ...prev }; delete copy[accountId]; return copy; });
    setDeletingId(null);
  }, []);

  // ── Refresh ALL accounts ───────────────────────────────────
  const handleRefreshAll = useCallback(async (uid: string, accs: AntigravityAccount[]) => {
    if (accs.length === 0) return;
    setRefreshingAll(true);
    setError('');
    try {
      await Promise.all(accs.map((acc) =>
        fetch('/api/quota/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: acc.id, ownerUid: uid }),
        }).catch(console.error)
      ));
      const fresh = await loadAccounts(uid);
      const map = await loadModelsForAccounts(fresh);
      setAccounts(fresh);
      setModelsMap(map);
      setSuccessMsg(`✓ All ${accs.length} accounts refreshed`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setRefreshingAll(false);
    }
  }, [loadAccounts, loadModelsForAccounts]);

  // ── Edit account metadata ─────────────────────────────────
  const handleSaveEdit = useCallback(async (fields: {
    custom_name: string;
    description: string;
    tags: string[];
    deadline_date: string;
  }) => {
    if (!editingAccount) return;
    const updates = {
      custom_name: fields.custom_name.trim() || null,
      description: fields.description.trim() || null,
      tags: fields.tags,
      // Convert local datetime string to ISO (or null if empty)
      deadline_date: fields.deadline_date ? new Date(fields.deadline_date).toISOString() : null,
    };
    const { error } = await supabase
      .from('antigravity_accounts')
      .update(updates)
      .eq('id', editingAccount.id);
    if (error) {
      setError(`Failed to save: ${error.message}`);
      setTimeout(() => setError(''), 5000);
      return;
    }
    setAccounts((prev) => prev.map((a) =>
      a.id === editingAccount.id ? { ...a, ...updates } : a
    ));
    setEditingAccount(null);
    setSuccessMsg('✓ Account updated');
    setTimeout(() => setSuccessMsg(''), 3000);
  }, [editingAccount]);

  // Setup auto-refresh timer
  const setupAutoRefresh = useCallback((uid: string, s: UserSettings) => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    if (!s.auto_refresh || s.refresh_interval < 1) {
      setNextRefreshTime(null);
      return;
    }
    const ms = Math.min(s.refresh_interval, 35791) * 60 * 1000;
    setNextRefreshTime(Date.now() + ms);
    refreshTimerRef.current = setInterval(async () => {
      setNextRefreshTime(Date.now() + ms);
      const accs = await loadAccounts(uid);
      for (const acc of accs) {
        await fetch('/api/quota/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: acc.id, ownerUid: uid }),
        }).catch(console.error);
      }
      const fresh = await loadAccounts(uid);
      const map = await loadModelsForAccounts(fresh);
      setAccounts(fresh);
      setModelsMap(map);
    }, ms);
  }, [loadAccounts, loadModelsForAccounts]);

  useEffect(() => {
    if (!nextRefreshTime) {
      setCountdownText('');
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, nextRefreshTime - Date.now());
      if (remaining === 0) {
        setCountdownText('SYNCING...');
      } else {
        const m = Math.floor(remaining / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        const ms = remaining % 1000;
        setCountdownText(`AUTO-REFRESH IN ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`);
      }
    };
    tick();
    const t = setInterval(tick, 47);
    return () => clearInterval(t);
  }, [nextRefreshTime]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push('/'); return; }
      setUser(u);

      const [accs, s] = await Promise.all([loadAccounts(u.uid), loadSettings(u.uid)]);
      const map = await loadModelsForAccounts(accs);
      setAccounts(accs);
      setModelsMap(map);
      setSettings(s);
      setLoading(false);
      setupAutoRefresh(u.uid, s);

      // Handle OAuth callback
      const connected = searchParams.get('connected');
      const errParam = searchParams.get('error');
      if (connected === 'true') {
        setSuccessMsg('✓ Antigravity account connected successfully!');
        setTimeout(() => setSuccessMsg(''), 5000);
        router.replace('/dashboard');
        // Reload accounts after connect
        setTimeout(async () => {
          const fresh = await loadAccounts(u.uid);
          const freshMap = await loadModelsForAccounts(fresh);
          setAccounts(fresh);
          setModelsMap(freshMap);
        }, 2000);
      } else if (errParam) {
        setError(decodeURIComponent(errParam));
        router.replace('/dashboard');
      }
    });
    return () => {
      unsub();
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedAccounts = settings
    ? sortAccounts(accounts, modelsMap, settings.account_sort)
    : accounts;

  const gridClass = getGridClass(settings?.grid_layout || 'auto');

  const totalLow = Object.values(modelsMap).flat().filter(
    (m) => (m.quota_percentage ?? 100) < (settings?.quota_alert_threshold ?? 20)
  ).length;

  const layoutActions = (
    <>
      <button 
        className="btn btn-primary" 
        onClick={() => user && handleConnect(user.uid)}
        style={{ width: '100%', justifyContent: 'center', border: '2px solid var(--black)', boxShadow: '4px 4px 0px var(--black)' }}
      >
        <span className="action-icon">+</span>
        <span className="action-text">ADD ACCOUNT</span>
      </button>
      {accounts.length > 0 && (
        <button
          className="btn btn-dark"
          onClick={() => user && handleRefreshAll(user.uid, accounts)}
          disabled={refreshingAll}
          style={{ width: '100%', justifyContent: 'center', gap: 8, border: '2px solid var(--black)', boxShadow: '4px 4px 0px var(--black)' }}
        >
          <span className="action-icon" style={{ display: 'inline-block', animation: refreshingAll ? 'spin 0.8s linear infinite' : 'none' }}>⟳</span>
          <span className="action-text">{refreshingAll ? 'REFRESHING...' : 'REFRESH ALL'}</span>
        </button>
      )}
    </>
  );

  const topbarCenter = countdownText ? (
    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#000000', fontFamily: 'var(--mono)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', letterSpacing: '-0.02em' }}>
      {countdownText}
    </div>
  ) : null;

  if (loading) {
    return (
      <AppLayout user={user} activeRoute="/dashboard" topbarCenter={topbarCenter}>
        <div className="loading-wrap"><div className="spinner" /><p style={{ fontWeight: 700 }}>Loading...</p></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user} activeRoute="/dashboard" actions={layoutActions} topbarCenter={topbarCenter}>
      {/* Low quota alert ticker */}
      {settings?.quota_alert_enabled && totalLow > 0 && (
        <div className="ticker">
          <span className="ticker-inner">
            {Array(4).fill(null).map((_, i) => (
              <span key={i}>⚠️ {totalLow} MODEL{totalLow > 1 ? 'S' : ''} BELOW {settings.quota_alert_threshold}% QUOTA &nbsp;•&nbsp; </span>
            ))}
          </span>
        </div>
      )}


      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">MY ACCOUNTS</h1>
            <p className="page-sub">{accounts.length} Antigravity account{accounts.length !== 1 ? 's' : ''} connected</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {settings?.auto_refresh && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>
                Auto-refresh every {settings.refresh_interval}m
              </span>
            )}
            <button
              className="btn btn-primary btn-lg"
              onClick={() => user && handleConnect(user.uid)}
            >
              ⚡ + CONNECT ACCOUNT
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 20 }}>
            ⚠️ {error}
            <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setError('')}>✕</button>
          </div>
        )}
        {successMsg && (
          <div className="alert alert-success" style={{ marginBottom: 20 }}>{successMsg}</div>
        )}

        {/* Summary Stats */}
        {accounts.length > 0 && (
          <div className="stats-bar" style={{ marginBottom: 32 }}>
            <div className="stat-item">
              <div className="stat-label">ACCOUNTS</div>
              <div className="stat-value">{accounts.length}</div>
              <div className="stat-sub">Connected</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">TOTAL MODELS</div>
              <div className="stat-value">{Object.values(modelsMap).flat().length}</div>
              <div className="stat-sub">Tracked</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">LOW QUOTA</div>
              <div className="stat-value" style={{ color: totalLow > 0 ? 'var(--red)' : 'var(--green)' }}>
                {totalLow}
              </div>
              <div className="stat-sub">Models below {settings?.quota_alert_threshold ?? 20}%</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">HEALTHY</div>
              <div className="stat-value" style={{ color: 'var(--green)' }}>
                {Object.values(modelsMap).flat().filter((m) => (m.quota_percentage ?? 0) >= 50).length}
              </div>
              <div className="stat-sub">Models above 50%</div>
            </div>
          </div>
        )}

        {/* Sort bar */}
        {accounts.length > 0 && settings && (
          <div className="toolbar" style={{ marginBottom: 20 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#666' }}>SORT:</span>
            {(['recently-used', 'quota-overall', 'quota-claude', 'quota-flash'] as UserSettings['account_sort'][]).map((s) => (
              <button
                key={s}
                className={`filter-btn ${settings.account_sort === s ? 'active' : ''}`}
                onClick={async () => {
                  const newSettings = { ...settings, account_sort: s };
                  setSettings(newSettings);
                  if (user) await fetch('/api/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ownerUid: user.uid, account_sort: s }),
                  });
                }}
              >
                {s === 'recently-used' ? '🕐 RECENT' : s === 'quota-overall' ? '📊 OVERALL' : s === 'quota-claude' ? '🤖 CLAUDE' : '⚡ FLASH'}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(['auto', '2-col', '3-col', 'list'] as UserSettings['grid_layout'][]).map((g) => (
                <button
                  key={g}
                  className={`filter-btn ${settings.grid_layout === g ? 'active' : ''}`}
                  onClick={async () => {
                    const newSettings = { ...settings, grid_layout: g };
                    setSettings(newSettings);
                    if (user) await fetch('/api/settings', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ownerUid: user.uid, grid_layout: g }),
                    });
                  }}
                  style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                >
                  {g === 'auto' ? '⊞' : g === '2-col' ? '⊟' : g === '3-col' ? '⊞⊞' : '☰'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Account Grid or Empty State */}
        {sortedAccounts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔌</div>
            <h2 className="empty-title">NO ACCOUNTS YET</h2>
            <p className="empty-sub">Connect your first Antigravity Google account to start monitoring quota.</p>
            <button className="btn btn-primary btn-lg" onClick={() => user && handleConnect(user.uid)}>
              ⚡ CONNECT ANTIGRAVITY ACCOUNT
            </button>
          </div>
        ) : (
          <div className={gridClass + ' stagger'}>
            {sortedAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                models={modelsMap[account.id] || []}
                settings={settings}
                isRefreshing={refreshingId === account.id}
                isDeleting={deletingId === account.id}
                onRefresh={() => user && refreshAccount(account.id, user.uid)}
                onDelete={() => handleDelete(account.id)}
                onEdit={() => setEditingAccount(account)}
                onReconnect={() => {
                  if (user) window.location.href = `/api/auth/antigravity-connect?userId=${user.uid}&accountId=${account.id}`;
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingAccount && user && (
        <AccountEditModal
          account={editingAccount}
          ownerUid={user.uid}
          onSave={handleSaveEdit}
          onClose={() => setEditingAccount(null)}
        />
      )}
    </AppLayout>
  );
}

// ─── Grid layout helper ──────────────────────────────────────

function getGridClass(layout: string): string {
  switch (layout) {
    case '2-col': return 'account-grid-2';
    case '3-col': return 'account-grid-3';
    case 'list': return 'account-list';
    case 'compact': return 'account-grid-compact';
    default: return 'account-grid';
  }
}

// ─── Tier normalization ────────────────────────────────────

type TierKey = 'FREE' | 'PRO' | 'ULTRA' | 'RESTRICTED' | null;

function normalizeTier(raw: string | null | undefined): TierKey {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (s.includes('ultra')) return 'ULTRA';
  if (s.includes('pro'))   return 'PRO';
  if (s.includes('free') || s.includes('starter')) return 'FREE';
  if (s.includes('restricted') || s.includes('forbidden') || s.includes('banned')) return 'RESTRICTED';
  // Unknown string from Google — treat as FREE
  return 'FREE';
}

const TIER_STYLE: Record<NonNullable<TierKey>, { bg: string; color: string; border: string; shadow: string }> = {
  FREE:       { bg: '#f3f4f6', color: '#111827', border: '#111827', shadow: '#111827' },
  PRO:        { bg: '#2563eb', color: '#ffffff', border: '#1e3a8a', shadow: '#1e3a8a' },
  ULTRA:      { bg: '#7c3aed', color: '#ffffff', border: '#4c1d95', shadow: '#4c1d95' },
  RESTRICTED: { bg: '#ef4444', color: '#ffffff', border: '#7f1d1d', shadow: '#7f1d1d' },
};

// ─── AccountCard Component ────────────────────────────────────

function AccountCard({
  account, models, settings, isRefreshing, isDeleting,
  onRefresh, onDelete, onEdit, onReconnect,
}: {
  account: AntigravityAccount;
  models: AccountQuotaModel[];
  settings: UserSettings | null;
  isRefreshing: boolean;
  isDeleting: boolean;
  onRefresh: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onReconnect: () => void;
}) {
  const avgQuota = getAccountAvgQuota(models);
  const status = getQuotaStatus(avgQuota);
  const color = getQuotaColor(status);
  const displayName = getAccountDisplayName(account);

  // Model visibility filter — use optional chaining in case model_visibility is undefined
  const visibility = settings?.model_visibility ?? {};
  const visibleModels = models.filter((m) => visibility[m.model_id] !== false);

  // Pinned models for card display
  const pinnedModelIds = settings?.card_display_models ?? [];
  const pinnedModels = pinnedModelIds.map((modelId) => ({
    modelId,
    model: models.find((m) => m.model_id === modelId) ?? null,
  }));

  const lowCount = visibleModels.filter(
    (m) => (m.quota_percentage ?? 100) < (settings?.quota_alert_threshold ?? 20)
  ).length;
  const googleCount = visibleModels.filter((m) => m.provider === 'google').length;
  const claudeCount = visibleModels.filter((m) => m.provider === 'anthropic').length;

  const isExpired = account.expires_at
    ? Date.now() > new Date(account.expires_at).getTime()
    : false;

  return (
    <div className="account-card">
      {/* Color accent bar */}
      <div style={{ height: 6, background: color }} />

      {/* Header */}
      <div className="account-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          {account.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatar_url} alt="" className="account-avatar" />
          ) : (
            <div className="account-avatar-fallback">
              {(displayName[0] || '?').toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="account-display-name">{displayName}</div>
            <div className="account-email">{account.email || 'No email'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
          {(() => {
            const tier = normalizeTier(account.subscription_tier);
            if (!tier) return null;
            const s = TIER_STYLE[tier];
            return (
              <span style={{
                fontSize: '0.6rem',
                fontWeight: 900,
                fontFamily: 'var(--mono, monospace)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: 0,
                background: s.bg,
                color: s.color,
                border: `2px solid ${s.border}`,
                boxShadow: `2px 2px 0px ${s.shadow}`,
                display: 'inline-block',
              }}>
                {tier}
              </span>
            );
          })()}
          {isExpired && (
            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase' }}>
              ⚠ TOKEN EXPIRED
            </span>
          )}
        </div>
      </div>

      {/* Quota Overview */}
      <div style={{ padding: '16px 16px 0' }}>
        {/* Average quota bar — conditional */}
        {(settings?.show_avg_quota !== false) && avgQuota !== null && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#666' }}>AVG QUOTA</span>
              <span style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--mono)', color, lineHeight: 1 }}>
                {avgQuota}%
              </span>
            </div>
            <div className="quota-bar-wrap" style={{ marginBottom: 8 }}>
              <div
                className={`quota-bar-fill ${status === 'high' ? 'bar-high' : status === 'medium' ? 'bar-medium' : 'bar-low'}`}
                style={{ width: `${avgQuota}%` }}
              />
            </div>
          </>
        )}
        {(settings?.show_avg_quota !== false) && avgQuota === null && (
          <div style={{ padding: '8px 0', fontSize: '0.85rem', color: '#aaa', fontStyle: 'italic' }}>
            No quota data yet — click Refresh
          </div>
        )}

        {/* Pinned model quotas — mini badges */}
        {pinnedModels.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {pinnedModels.map(({ modelId, model }) => {
              const pct = model?.quota_percentage ?? null;
              const s = getQuotaStatus(pct);
              const c = getQuotaColor(s);
              const shortName = modelId.replace('models/', '').split('-').slice(0, 3).join('-');
              const resetLabel = model?.reset_time ? formatResetTime(model.reset_time) : null;
              return (
                <div key={modelId} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase',
                      color: '#777', fontFamily: 'var(--mono)', flexShrink: 0, width: 110,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {shortName}
                    </span>
                    <div style={{ flex: 1, height: 8, background: '#eee', border: '1.5px solid #ccc', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct ?? 0))}%`, background: c, transition: 'width 0.4s ease' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, fontFamily: 'var(--mono)', color: c, flexShrink: 0, minWidth: 36, textAlign: 'right' }}>
                      {pct !== null ? `${pct}%` : '—'}
                    </span>
                  </div>
                  {resetLabel && resetLabel !== '—' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 2 }}>
                      <span style={{ fontSize: '0.58rem', fontFamily: 'var(--mono)', color: '#aaa', fontWeight: 600 }}>
                        ⏱ {resetLabel}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}


        {/* Mini model stats */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: '0.75rem', color: '#666' }}>
          <span>📊 {visibleModels.length} models</span>
          {googleCount > 0 && <span style={{ color: 'var(--blue)' }}>◆ {googleCount} Gemini</span>}
          {claudeCount > 0 && <span style={{ color: 'var(--purple)' }}>◆ {claudeCount} Claude</span>}
          {lowCount > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>⚠ {lowCount} low</span>}
        </div>

        {/* Tags */}
        {account.tags && account.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {account.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
          </div>
        )}
        {/* Description */}
        {account.description && (
          <div style={{ fontSize: '0.78rem', color: '#777', marginBottom: 8, lineHeight: 1.4,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {account.description}
          </div>
        )}

        {/* Deadline countdown */}
        {account.deadline_date && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
            padding: '4px 8px', background: '#fff8f0',
            border: `2px solid ${getDeadlineColor(account.deadline_date)}`,
            fontSize: '0.72rem', fontWeight: 700, color: getDeadlineColor(account.deadline_date),
          }}>
            ⏰ {formatCountdown(account.deadline_date)}
          </div>
        )}

        {/* Last synced */}
        <div style={{ fontSize: '0.65rem', color: '#aaa', fontFamily: 'var(--mono)', marginBottom: 12 }}>
          {account.last_synced ? `SYNCED ${new Date(account.last_synced).toLocaleString()}` : 'NEVER SYNCED'}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="account-card-footer">
        <Link
          href={`/dashboard/accounts/${account.id}`}
          className="btn btn-primary btn-sm"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          VIEW →
        </Link>
        <button
          className="btn btn-dark btn-sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh quota"
        >
          {isRefreshing ? <span style={{ display:'inline-block', animation:'spin 0.8s linear infinite' }}>⟳</span> : '⟳'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onEdit}
          title="Edit account"
          style={{ fontSize: '0.85rem' }}
        >
          ✏️
        </button>
        {isExpired && (
          <button className="btn btn-danger btn-sm" onClick={onReconnect} title="Reconnect">🔗</button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={onDelete}
          disabled={isDeleting}
          title="Remove account"
          style={{ color: 'var(--red)' }}
        >
          🗑
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="loading-wrap"><div className="spinner" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}
