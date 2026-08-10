'use client';
import { useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import {
  UserSettings, DEFAULT_SETTINGS,
} from '@/lib/types';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppLayout } from '@/components/AppLayout';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings>({ ...DEFAULT_SETTINGS, owner_uid: '', updated_at: '' });
  const [allModels, setAllModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Session Transfer state
  const [transferUrl, setTransferUrl] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferCopied, setTransferCopied] = useState(false);
  const [transferExpiry, setTransferExpiry] = useState(0);
  const [transferTimer, setTransferTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (uid: string) => {
    const [settingsRaw, { data: modelsData }] = await Promise.all([
      fetch(`/api/settings?ownerUid=${uid}`).then((r) => r.json()).catch(() => null) as Promise<Partial<UserSettings> | null>,
      supabase.from('account_quota_models').select('model_id').eq('owner_uid', uid),
    ]);

    // Always merge with DEFAULT_SETTINGS — guarantees every field exists
    setSettings({
      ...DEFAULT_SETTINGS,
      owner_uid: uid,
      updated_at: '',
      ...(settingsRaw || {}),
      // Ensure model_visibility is always a plain object
      model_visibility:
        settingsRaw?.model_visibility && typeof settingsRaw.model_visibility === 'object'
          ? settingsRaw.model_visibility as Record<string, boolean>
          : {},
      // Ensure card_display_models is always an array
      card_display_models: Array.isArray(settingsRaw?.card_display_models)
        ? settingsRaw.card_display_models as string[]
        : [],
      // Ensure show_avg_quota has a default
      show_avg_quota: settingsRaw?.show_avg_quota !== undefined ? settingsRaw.show_avg_quota : true,
    });

    // Unique model IDs sorted
    const modelIds = [...new Set((modelsData as { model_id: string }[] || []).map((m) => m.model_id))].sort();
    setAllModels(modelIds);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push('/'); return; }
      setUser(u);
      await loadData(u.uid);
      setLoading(false);
    });
    return () => unsub();
  }, [router, loadData]);

  const generateTransferLink = async () => {
    if (!user) return;
    setTransferLoading(true);
    setTransferUrl('');
    setTransferCopied(false);
    if (transferTimer) clearInterval(transferTimer);

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/auth/transfer', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error('Failed to generate link');
      const data = await res.json();
      setTransferUrl(data.transferUrl);

      // Start countdown
      let remaining = data.expiresInSeconds as number;
      setTransferExpiry(remaining);
      const t = setInterval(() => {
        remaining -= 1;
        setTransferExpiry(remaining);
        if (remaining <= 0) {
          clearInterval(t);
          setTransferUrl('');
          setTransferExpiry(0);
        }
      }, 1000);
      setTransferTimer(t);
    } catch (err) {
      console.error(err);
    } finally {
      setTransferLoading(false);
    }
  };

  const copyTransferUrl = () => {
    if (!transferUrl) return;
    navigator.clipboard.writeText(transferUrl);
    setTransferCopied(true);
    setTimeout(() => setTransferCopied(false), 2000);
  };

  const save = async (partial: Partial<UserSettings>) => {
    if (!user) return;
    const updated = { ...settings, ...partial };
    setSettings(updated);
    setSaving(true);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerUid: user.uid, ...partial }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleModelVisibility = (modelId: string, visible: boolean) => {
    const newVis = { ...(settings.model_visibility ?? {}), [modelId]: visible };
    save({ model_visibility: newVis });
  };

  if (loading) {
    return (
      <AppLayout user={user} activeRoute="/settings">
        <div className="loading-wrap"><div className="spinner" /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user} activeRoute="/settings">

      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">SETTINGS</h1>
            <p className="page-sub">Configure quota monitoring, display, and notifications</p>
          </div>
          {saved && <span className="refresh-badge">✓ SAVED</span>}
          {saving && <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#888' }}>Saving...</span>}
        </div>

        {/* ── SECTION: AUTO-REFRESH ──────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon">⟳</span>
            <div>
              <div className="settings-title">AUTO REFRESH</div>
              <div className="settings-desc">Automatically sync quota data on a schedule</div>
            </div>
          </div>
          <div className="settings-body">
            <div className="settings-row">
              <div>
                <div className="settings-label">Enable Auto-Refresh</div>
                <div className="settings-sublabel">Periodically fetch quota from all connected accounts</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.auto_refresh}
                  onChange={(e) => save({ auto_refresh: e.target.checked })}
                />
                <span className="toggle-slider" />
              </label>
            </div>
            {settings.auto_refresh && (
              <div className="settings-row">
                <div>
                  <div className="settings-label">Refresh Interval</div>
                  <div className="settings-sublabel">Minutes between auto-refreshes (1 – 35,791)</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={35791}
                    value={settings.refresh_interval}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(35791, parseInt(e.target.value) || 15));
                      save({ refresh_interval: v });
                    }}
                    style={{ width: 90 }}
                  />
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>min</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION: WARMUP ───────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon">🔥</span>
            <div>
              <div className="settings-title">WARMUP</div>
              <div className="settings-desc">Prepare models to prevent cold-start quota consumption</div>
            </div>
          </div>
          <div className="settings-body">
            <div className="settings-row">
              <div>
                <div className="settings-label">Enable Warmup Scheduler</div>
                <div className="settings-sublabel">Automatically warmup models on a schedule</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.warmup_enabled}
                  onChange={(e) => save({ warmup_enabled: e.target.checked })}
                />
                <span className="toggle-slider" />
              </label>
            </div>
            {settings.warmup_enabled && (
              <>
                <div className="settings-row">
                  <div>
                    <div className="settings-label">Warmup Interval</div>
                    <div className="settings-sublabel">Run warmup every N minutes</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={1440}
                      value={settings.warmup_interval}
                      onChange={(e) => save({ warmup_interval: Math.max(1, parseInt(e.target.value) || 10) })}
                      style={{ width: 90 }}
                    />
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>min</span>
                  </div>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-label">Cooldown Period</div>
                    <div className="settings-sublabel">Hours to wait before re-warming the same model</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={24}
                      value={settings.warmup_cooldown_hours}
                      onChange={(e) => save({ warmup_cooldown_hours: Math.max(0, parseInt(e.target.value) || 4) })}
                      style={{ width: 90 }}
                    />
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>hrs</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── SECTION: QUOTA ALERTS ────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon">🔔</span>
            <div>
              <div className="settings-title">QUOTA ALERTS</div>
              <div className="settings-desc">Get visual warnings when quota drops below threshold</div>
            </div>
          </div>
          <div className="settings-body">
            <div className="settings-row">
              <div>
                <div className="settings-label">Enable Quota Alerts</div>
                <div className="settings-sublabel">Show warning ticker and highlight low-quota models</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.quota_alert_enabled}
                  onChange={(e) => save({ quota_alert_enabled: e.target.checked })}
                />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className="settings-row">
              <div>
                <div className="settings-label">Alert Threshold</div>
                <div className="settings-sublabel">Warn when a model drops below this percentage</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={99}
                  value={settings.quota_alert_threshold}
                  onChange={(e) => save({ quota_alert_threshold: Math.max(1, Math.min(99, parseInt(e.target.value) || 20)) })}
                  style={{ width: 90 }}
                />
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION: DISPLAY ─────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon">🖥</span>
            <div>
              <div className="settings-title">DISPLAY</div>
              <div className="settings-desc">Layout and grouping preferences</div>
            </div>
          </div>
          <div className="settings-body">
            <div className="settings-row">
              <div>
                <div className="settings-label">Account Card Layout</div>
                <div className="settings-sublabel">Grid columns for the account list</div>
              </div>
              <select
                className="select"
                value={settings.grid_layout}
                onChange={(e) => save({ grid_layout: e.target.value as UserSettings['grid_layout'] })}
                style={{ width: 160 }}
              >
                <option value="auto">Auto</option>
                <option value="2-col">2 Columns</option>
                <option value="3-col">3 Columns</option>
                <option value="list">List</option>
                <option value="compact">Compact</option>
              </select>
            </div>
            <div className="settings-row">
              <div>
                <div className="settings-label">Account Sort Order</div>
                <div className="settings-sublabel">How to order account cards</div>
              </div>
              <select
                className="select"
                value={settings.account_sort}
                onChange={(e) => save({ account_sort: e.target.value as UserSettings['account_sort'] })}
                style={{ width: 180 }}
              >
                <option value="recently-used">Recently Used</option>
                <option value="quota-overall">Overall Quota (High→Low)</option>
                <option value="quota-claude">Claude Quota (High→Low)</option>
                <option value="quota-flash">Gemini Flash Quota</option>
              </select>
            </div>
            <div className="settings-row">
              <div>
                <div className="settings-label">Provider Groupings</div>
                <div className="settings-sublabel">Group models by provider (Google / Anthropic)</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.provider_groupings}
                  onChange={(e) => save({ provider_groupings: e.target.checked })}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </div>

        {/* ── SECTION: MODEL VISIBILITY ────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon">👁</span>
            <div>
              <div className="settings-title">MODEL VISIBILITY</div>
              <div className="settings-desc">Choose which models to show across all accounts (click to toggle)</div>
            </div>
          </div>
          <div className="settings-body">
            {allModels.length === 0 ? (
              <p style={{ color: '#888', fontSize: '0.85rem', padding: '16px 0' }}>
                No models found yet. Connect an account and refresh quota first.
              </p>
            ) : (
              <div style={{ padding: '16px 0' }}>
                {/* Show All / Hide All */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const vis: Record<string, boolean> = {};
                      allModels.forEach((id) => { vis[id] = true; });
                      save({ model_visibility: vis });
                    }}
                  >
                    SHOW ALL
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const vis: Record<string, boolean> = {};
                      allModels.forEach((id) => { vis[id] = false; });
                      save({ model_visibility: vis });
                    }}
                  >
                    HIDE ALL
                  </button>
                  <span style={{ fontSize: '0.7rem', color: '#aaa', alignSelf: 'center', fontWeight: 600 }}>
                    {allModels.filter((id) => (settings.model_visibility ?? {})[id] !== false).length} / {allModels.length} visible
                  </span>
                </div>
                {/* Chip buttons */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {allModels.map((modelId) => {
                    const visibility = settings.model_visibility ?? {};
                    const isVisible = visibility[modelId] !== false;
                    const isGoogle = !modelId.toLowerCase().includes('claude');
                    return (
                      <button
                        key={modelId}
                        onClick={() => toggleModelVisibility(modelId, !isVisible)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          border: isVisible ? '2px solid var(--black)' : '2px solid #ddd',
                          background: isVisible ? (isGoogle ? 'var(--blue)' : 'var(--purple)') : '#f5f5f5',
                          color: isVisible ? 'white' : '#bbb',
                          fontFamily: 'var(--font)',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          transition: 'all 0.15s',
                          textDecoration: isVisible ? 'none' : 'line-through',
                        }}
                        title={isVisible ? 'Click to hide' : 'Click to show'}
                      >
                        {isVisible && <span>✓</span>}
                        {modelId.replace('models/', '')}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION: CARD DISPLAY ────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon">🃏</span>
            <div>
              <div className="settings-title">CARD DISPLAY</div>
              <div className="settings-desc">Choose what quota info appears on each account card</div>
            </div>
          </div>
          <div className="settings-body">
            {/* Toggle: show avg quota */}
            <div className="settings-row">
              <div>
                <div className="settings-label">Show Average Quota Bar</div>
                <div className="settings-sublabel">Display overall average quota across all visible models</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.show_avg_quota ?? true}
                  onChange={(e) => save({ show_avg_quota: e.target.checked })}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {/* Multi-select: specific models to pin on card */}
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div className="settings-label">Pinned Models on Card</div>
                <div className="settings-sublabel">
                  Select specific models to show individual quota on each account card.
                  These appear as mini badges below the average bar.
                </div>
              </div>
              {allModels.length === 0 ? (
                <p style={{ color: '#aaa', fontSize: '0.8rem', margin: 0 }}>
                  No models found yet. Connect an account and refresh quota first.
                </p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>
                  {allModels.map((modelId) => {
                    const pinnedModels = settings.card_display_models ?? [];
                    const isPinned = pinnedModels.includes(modelId);
                    const isGoogle = !modelId.toLowerCase().includes('claude');
                    return (
                      <button
                        key={modelId}
                        onClick={() => {
                          const current = settings.card_display_models ?? [];
                          const updated = isPinned
                            ? current.filter((id) => id !== modelId)
                            : [...current, modelId];
                          save({ card_display_models: updated });
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          border: isPinned ? '2px solid var(--black)' : '2px solid #ddd',
                          background: isPinned ? (isGoogle ? 'var(--blue)' : 'var(--purple)') : 'transparent',
                          color: isPinned ? 'white' : '#666',
                          fontFamily: 'var(--font)',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          transition: 'all 0.1s',
                        }}
                      >
                        {isPinned && <span>✓</span>}
                        {modelId.replace('models/', '')}
                      </button>
                    );
                  })}
                </div>
              )}
              {(settings.card_display_models?.length ?? 0) > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 4 }}
                  onClick={() => save({ card_display_models: [] })}
                >
                  CLEAR ALL PINS
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION: SHARE TO DEVICE ──────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon">📲</span>
            <div>
              <div className="settings-title">SHARE TO DEVICE</div>
              <div className="settings-desc">Login di komputer lain tanpa perlu masukkan password</div>
            </div>
          </div>
          <div className="settings-body">
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
              <div>
                <div className="settings-label">Transfer Session</div>
                <div className="settings-sublabel">
                  Generate link sekali pakai (berlaku 5 menit). Buka link tersebut di komputer/browser lain untuk login otomatis.
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={generateTransferLink}
                disabled={transferLoading}
                id="btn-generate-transfer"
              >
                {transferLoading ? '⏳ GENERATING...' : '🔗 GENERATE LOGIN LINK'}
              </button>

              {transferUrl && (
                <div style={{ width: '100%' }}>
                  {/* Countdown */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: transferExpiry < 60 ? '#e53e3e' : '#22c55e' }}>
                      ⏱ EXPIRES IN {Math.floor(transferExpiry / 60)}:{String(transferExpiry % 60).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#888' }}>SINGLE USE</span>
                  </div>

                  {/* Link box */}
                  <div style={{
                    background: 'var(--gray)',
                    border: '2px solid var(--black)',
                    padding: '10px 14px',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    marginBottom: 10,
                    color: '#333',
                  }}>
                    {transferUrl}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button
                      className="btn btn-primary"
                      onClick={copyTransferUrl}
                      id="btn-copy-transfer"
                    >
                      {transferCopied ? '✓ COPIED!' : '📋 COPY LINK'}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => window.open(transferUrl, '_blank')}
                      id="btn-open-transfer"
                    >
                      🔗 OPEN IN NEW TAB
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={generateTransferLink}
                      id="btn-regenerate-transfer"
                    >
                      🔄 NEW LINK
                    </button>
                  </div>

                  <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff9e6', border: '2px solid #FFE500', fontSize: '0.75rem', lineHeight: 1.6 }}>
                    <strong>Cara pakai:</strong><br />
                    1. Copy link di atas<br />
                    2. Buka di browser/komputer lain<br />
                    3. Kamu akan otomatis login tanpa perlu masukkan password<br />
                    ⚠️ Link hanya bisa digunakan <strong>1x</strong> dan berlaku <strong>5 menit</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION: ACCOUNT INFO ───────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon">👤</span>
            <div>
              <div className="settings-title">ACCOUNT</div>
              <div className="settings-desc">Your Firebase login account</div>
            </div>
          </div>
          <div className="settings-body">
            <div className="settings-row">
              <div>
                <div className="settings-label">Logged In As</div>
                <div className="settings-sublabel">{user?.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {user?.photoURL && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photoURL} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--black)' }} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
