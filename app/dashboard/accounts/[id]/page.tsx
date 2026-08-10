'use client';
import { useEffect, useState, useCallback, use } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import {
  AntigravityAccount, AccountQuotaModel, UserSettings, DEFAULT_SETTINGS,
  getAccountDisplayName, getQuotaStatus, getQuotaColor, formatModelName, formatResetTime,
} from '@/lib/types';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type FilterType = 'all' | 'google' | 'anthropic' | 'low' | 'high';

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = use(params);
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<AntigravityAccount | null>(null);
  const [models, setModels] = useState<AccountQuotaModel[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const load = useCallback(async (uid: string) => {
    const [{ data: acc }, { data: mods }, settingsData] = await Promise.all([
      supabase.from('antigravity_accounts').select('*').eq('id', accountId).eq('owner_uid', uid).single(),
      supabase.from('account_quota_models').select('*').eq('account_id', accountId).order('quota_percentage', { ascending: true }),
      fetch(`/api/settings?ownerUid=${uid}`).then((r) => r.json()).catch(() => null) as Promise<Partial<UserSettings> | null>,
    ]);
    if (!acc) { router.push('/dashboard'); return; }
    setAccount(acc as AntigravityAccount);
    setModels((mods as AccountQuotaModel[]) || []);
    // Always merge with DEFAULT_SETTINGS to ensure all fields are present
    const merged: UserSettings = {
      ...DEFAULT_SETTINGS,
      owner_uid: uid,
      updated_at: '',
      ...(settingsData || {}),
      model_visibility:
        settingsData?.model_visibility && typeof settingsData.model_visibility === 'object'
          ? settingsData.model_visibility
          : {},
    };
    setSettings(merged);
  }, [accountId, router]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push('/'); return; }
      setUser(u);
      await load(u.uid);
      setLoading(false);
    });
    return () => unsub();
  }, [router, load]);

  const handleRefresh = async () => {
    if (!user || !account) return;
    setRefreshing(true);
    setError('');
    try {
      const res = await fetch('/api/quota/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id, ownerUid: user.uid }),
      });
      const json = await res.json() as { error?: string; modelCount?: number };
      if (!res.ok) {
        setError(json.error || 'Refresh failed');
        return;
      }
      await load(user.uid);
      setSuccessMsg(`✓ Synced ${json.modelCount ?? 0} models`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } finally {
      setRefreshing(false);
    }
  };

  // Filter + search
  // Model visibility filter — safe access
  const visibility = settings?.model_visibility ?? {};
  const visibleModels = models.filter((m) => visibility[m.model_id] !== false);

  const filteredModels = visibleModels.filter((m) => {
    const matchFilter =
      filter === 'all' ? true :
      filter === 'google' ? m.provider === 'google' :
      filter === 'anthropic' ? m.provider === 'anthropic' :
      filter === 'low' ? (m.quota_percentage ?? 100) < (settings?.quota_alert_threshold ?? 20) :
      filter === 'high' ? (m.quota_percentage ?? 0) >= 50 : true;
    const matchSearch = search
      ? (m.model_id + (m.display_name || '')).toLowerCase().includes(search.toLowerCase())
      : true;
    return matchFilter && matchSearch;
  });

  const lowCount = visibleModels.filter((m) => (m.quota_percentage ?? 100) < (settings?.quota_alert_threshold ?? 20)).length;
  const googleCount = visibleModels.filter((m) => m.provider === 'google').length;
  const claudeCount = visibleModels.filter((m) => m.provider === 'anthropic').length;
  const avgQuota = visibleModels.length > 0
    ? Math.round(visibleModels.reduce((a, m) => a + (m.quota_percentage ?? 0), 0) / visibleModels.length)
    : 0;

  if (loading) {
    return (
      <div>
        <nav className="navbar"><div className="navbar-brand"><div className="navbar-dot" />⚡ QUOTA MONITOR</div></nav>
        <div className="loading-wrap"><div className="spinner" /></div>
      </div>
    );
  }

  if (!account) return null;

  return (
    <div>
      <nav className="navbar">
        <div className="navbar-brand"><div className="navbar-dot" />⚡ QUOTA MONITOR</div>
        <div className="navbar-actions">
          {user?.photoURL && (
            <div className="user-chip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user.photoURL} alt="" />
              <span>{user.displayName?.split(' ')[0] || user.email?.split('@')[0]}</span>
            </div>
          )}
          <Link href="/settings" className="btn btn-ghost btn-sm">⚙</Link>
        </div>
      </nav>

      <div className="page">
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, fontSize: '0.8rem', fontWeight: 700 }}>
          <Link href="/dashboard" style={{ color: '#666', textDecoration: 'none' }}>← DASHBOARD</Link>
          <span style={{ color: '#ccc' }}>/</span>
          <span>{getAccountDisplayName(account)}</span>
        </div>

        {/* Account Hero */}
        <div className="account-hero">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
            {account.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={account.avatar_url} alt="" className="account-avatar-lg" />
            ) : (
              <div className="account-avatar-lg-fallback">
                {(getAccountDisplayName(account)[0] || '?').toUpperCase()}
              </div>
            )}
            <div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {getAccountDisplayName(account)}
              </h1>
              <div style={{ color: '#666', marginTop: 4, fontSize: '0.9rem' }}>{account.email}</div>
              {account.subscription_tier && (
                <span className="tier-badge" style={{ marginTop: 8, display: 'inline-block' }}>
                  {account.subscription_tier.toUpperCase()}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn-dark"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? '⟳ REFRESHING...' : '⟳ REFRESH QUOTA'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (user) window.location.href = `/api/auth/antigravity-connect?userId=${user.uid}&accountId=${account.id}`;
              }}
            >
              🔗 RECONNECT
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 20 }}>⚠️ {error}</div>
        )}
        {successMsg && (
          <div className="alert alert-success" style={{ marginBottom: 20 }}>{successMsg}</div>
        )}

        {/* Stats */}
        <div className="stats-bar" style={{ marginBottom: 28 }}>
          <div className="stat-item">
            <div className="stat-label">AVG QUOTA</div>
            <div className="stat-value" style={{ color: avgQuota >= 50 ? 'var(--green)' : avgQuota >= 20 ? 'var(--orange)' : 'var(--red)' }}>
              {avgQuota}%
            </div>
            <div className="stat-sub">Across all models</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">GEMINI MODELS</div>
            <div className="stat-value" style={{ color: 'var(--blue)' }}>{googleCount}</div>
            <div className="stat-sub">Google AI</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">CLAUDE MODELS</div>
            <div className="stat-value" style={{ color: 'var(--purple)' }}>{claudeCount}</div>
            <div className="stat-sub">Anthropic</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">LOW QUOTA</div>
            <div className="stat-value" style={{ color: lowCount > 0 ? 'var(--red)' : 'var(--green)' }}>{lowCount}</div>
            <div className="stat-sub">Need attention</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">LAST SYNC</div>
            <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: '0.75rem', fontWeight: 700 }}>
              {account.last_synced ? new Date(account.last_synced).toLocaleTimeString() : 'Never'}
            </div>
            <div className="stat-sub">{account.last_synced ? new Date(account.last_synced).toLocaleDateString() : ''}</div>
          </div>
        </div>

        {/* Filters + Search */}
        <div className="toolbar" style={{ marginBottom: 20 }}>
          <input
            className="input"
            placeholder="🔍 Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220, padding: '6px 12px', fontSize: '0.85rem' }}
          />
          {(['all', 'google', 'anthropic', 'low', 'high'] as FilterType[]).map((f) => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'ALL' :
               f === 'google' ? `GEMINI (${googleCount})` :
               f === 'anthropic' ? `CLAUDE (${claudeCount})` :
               f === 'low' ? `⚠ LOW (${lowCount})` : '✓ HIGH'}
            </button>
          ))}
        </div>

        {/* Model Grid */}
        {filteredModels.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{filter === 'low' ? '✅' : '📡'}</div>
            <h2 className="empty-title">{filter === 'low' ? 'No Low Quota Models!' : 'No Models Found'}</h2>
            <p className="empty-sub">
              {models.length === 0 ? 'Click Refresh Quota to pull data from this account.' : 'Try a different filter.'}
            </p>
            {models.length === 0 && (
              <button className="btn btn-dark" onClick={handleRefresh}>⟳ REFRESH NOW</button>
            )}
          </div>
        ) : (
          <div className="quota-grid stagger">
            {filteredModels.map((model) => (
              <ModelQuotaCard key={model.id} model={model} threshold={settings?.quota_alert_threshold ?? 20} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ModelQuotaCard ──────────────────────────────────────────

function ModelQuotaCard({ model, threshold }: { model: AccountQuotaModel; threshold: number }) {
  const pct = model.quota_percentage ?? null;
  const status = getQuotaStatus(pct);
  const color = getQuotaColor(status);
  const isLow = pct !== null && pct < threshold;

  return (
    <div className="quota-card">
      <div style={{ height: 6, background: color, ...(isLow && pct! < 10 ? { animation: 'blinkLow 1.5s ease-in-out infinite' } : {}) }} />
      <div className="quota-card-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="quota-model-name">{model.model_id}</div>
          <div className="quota-custom-name">{model.display_name || formatModelName(model.model_id)}</div>
        </div>
        <span className={`provider-badge ${model.provider === 'anthropic' ? 'provider-anthropic' : 'provider-google'}`}>
          {model.provider === 'anthropic' ? 'CLAUDE' : 'GEMINI'}
        </span>
      </div>
      <div className="quota-card-body">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
          <span className={`quota-percentage ${status === 'high' ? 'quota-high' : status === 'medium' ? 'quota-medium' : 'quota-low'}`}>
            {pct !== null ? pct : '—'}
          </span>
          {pct !== null && <span style={{ fontSize: '1.2rem', color: '#999', fontWeight: 600 }}>%</span>}
        </div>

        <div className="quota-bar-wrap">
          <div
            className={`quota-bar-fill ${status === 'high' ? 'bar-high' : status === 'medium' ? 'bar-medium' : 'bar-low'}`}
            style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#666', marginBottom: 12 }}>
          <span>
            {pct === 0 ? '🚫 RATE LIMITED' :
             pct !== null ? `${pct}% remaining` : 'No data'}
          </span>
          <span className="mono">⏱ {formatResetTime(model.reset_time)}</span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {model.supports_thinking && (
            <span style={{ padding: '2px 8px', fontSize: '0.65rem', fontWeight: 800, background: '#f0e6ff', border: '2px solid var(--purple)', color: 'var(--purple)' }}>
              THINKING
            </span>
          )}
          {isLow && (
            <span style={{ padding: '2px 8px', fontSize: '0.65rem', fontWeight: 800, background: '#fff0f0', border: '2px solid var(--red)', color: 'var(--red)' }}>
              ⚠ LOW
            </span>
          )}
        </div>

        <div style={{ fontSize: '0.65rem', color: '#aaa', fontFamily: 'var(--mono)' }}>
          UPDATED {new Date(model.last_updated).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
