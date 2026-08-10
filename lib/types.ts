// ============================================================
// Shared Types & Utilities — Antigravity Quota Monitor v2
// ============================================================

// ── Supabase row types ────────────────────────────────────────

export interface AntigravityAccount {
  id: string;
  owner_uid: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  custom_name: string | null;
  description: string | null;
  tags: string[];
  deadline_date: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  connected_at: string;
  last_synced: string | null;
  subscription_tier: string | null;
  ai_credits: { credits: number; expiryDate: string } | null;
  is_active: boolean;
}

export interface AccountQuotaModel {
  id: string;
  account_id: string;
  owner_uid: string;
  model_id: string;
  quota_percentage: number | null;
  reset_time: string | null;
  provider: 'google' | 'anthropic' | null;
  display_name: string | null;
  supports_thinking: boolean;
  last_updated: string;
}

export interface UserTag {
  id: string;
  owner_uid: string;
  name: string;       // slug, e.g. "work"
  color: string;      // hex color
  created_at: string;
}

export interface UserSettings {
  owner_uid: string;
  // Refresh
  auto_refresh: boolean;
  refresh_interval: number;         // minutes (1-35791)
  // Quota Alert
  quota_alert_enabled: boolean;
  quota_alert_threshold: number;    // percent
  // Display
  model_visibility: Record<string, boolean>;
  grid_layout: 'auto' | '2-col' | '3-col' | 'list' | 'compact';
  account_sort: 'recently-used' | 'quota-overall' | 'quota-claude' | 'quota-flash';
  provider_groupings: boolean;
  // Warmup
  warmup_enabled: boolean;
  warmup_interval: number;          // minutes
  warmup_cooldown_hours: number;    // hours
  // Card display
  card_display_models: string[];   // model IDs to show on account card
  show_avg_quota: boolean;         // show avg quota bar on card
  updated_at: string;
}

export const DEFAULT_SETTINGS: Omit<UserSettings, 'owner_uid' | 'updated_at'> = {
  auto_refresh: false,
  refresh_interval: 15,
  quota_alert_enabled: false,
  quota_alert_threshold: 20,
  model_visibility: {},
  grid_layout: 'auto',
  account_sort: 'recently-used',
  provider_groupings: false,
  warmup_enabled: false,
  warmup_interval: 10,
  warmup_cooldown_hours: 4,
  card_display_models: [],
  show_avg_quota: true,
};

// ── Quota utilities ──────────────────────────────────────────

export type QuotaStatus = 'high' | 'medium' | 'low' | 'empty' | 'unknown';

export function getQuotaStatus(percentage: number | null): QuotaStatus {
  if (percentage === null || percentage === undefined) return 'unknown';
  if (percentage === 0) return 'empty';
  if (percentage >= 50) return 'high';
  if (percentage >= 20) return 'medium';
  return 'low';
}

export function getQuotaColor(status: QuotaStatus): string {
  switch (status) {
    case 'high': return 'var(--green)';
    case 'medium': return 'var(--orange)';
    case 'low': return 'var(--red)';
    case 'empty': return 'var(--red)';
    default: return '#aaa';
  }
}

// ── Model name utilities ──────────────────────────────────────

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'gemini-3-flash': 'Gemini 3 Flash',
  'gemini-3-pro': 'Gemini 3 Pro',
  'gemini-3-pro-image': 'Gemini 3 Pro Image',
  'gemini-3.1-pro-low': 'Gemini 3.1 Pro Low',
  'gemini-3.1-pro-high': 'Gemini 3.1 Pro High',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
  'claude-sonnet-4-6-thinking': 'Claude Sonnet 4.6 (Thinking)',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-opus-4-6-thinking': 'Claude Opus 4.6 (Thinking)',
  'claude-opus-4-5-thinking': 'Claude Opus 4.5 (Thinking)',
  'claude-sonnet-4-5-thinking': 'Claude Sonnet 4.5 (Thinking)',
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
};

export function formatModelName(modelId: string): string {
  if (MODEL_DISPLAY_NAMES[modelId]) return MODEL_DISPLAY_NAMES[modelId];
  return modelId
    .replace('models/', '')
    .replace(/-/g, ' ')
    .split(' ')
    .map((w) => w.length > 1 ? w.charAt(0).toUpperCase() + w.slice(1) : w)
    .join(' ');
}

export function detectProvider(modelId: string): 'google' | 'anthropic' {
  return modelId.toLowerCase().includes('claude') ? 'anthropic' : 'google';
}

export function formatResetTime(resetTime: string | null): string {
  if (!resetTime) return '—';
  try {
    const date = new Date(resetTime);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    if (diffMs < 0) return 'Resetting...';
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHours > 24) return `${Math.floor(diffHours / 24)}d ${diffHours % 24}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
    return `${diffMins}m`;
  } catch {
    return resetTime;
  }
}

// ── Account utilities ─────────────────────────────────────────

export function getAccountDisplayName(account: AntigravityAccount): string {
  return account.custom_name || account.name || account.email || 'Unknown Account';
}

export function getAccountAvgQuota(models: AccountQuotaModel[]): number | null {
  const valid = models.filter((m) => m.quota_percentage !== null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((sum, m) => sum + (m.quota_percentage ?? 0), 0) / valid.length);
}

export function sortAccounts(
  accounts: AntigravityAccount[],
  modelsMap: Record<string, AccountQuotaModel[]>,
  sort: UserSettings['account_sort'],
): AntigravityAccount[] {
  return [...accounts].sort((a, b) => {
    switch (sort) {
      case 'quota-overall': {
        const avgA = getAccountAvgQuota(modelsMap[a.id] || []) ?? -1;
        const avgB = getAccountAvgQuota(modelsMap[b.id] || []) ?? -1;
        return avgB - avgA;
      }
      case 'quota-claude': {
        const getClaudeQuota = (models: AccountQuotaModel[]) => {
          const claude = models.filter((m) => m.provider === 'anthropic');
          return getAccountAvgQuota(claude) ?? -1;
        };
        return getClaudeQuota(modelsMap[b.id] || []) - getClaudeQuota(modelsMap[a.id] || []);
      }
      case 'quota-flash': {
        const getFlashQuota = (models: AccountQuotaModel[]) => {
          const flash = models.find((m) => m.model_id.includes('flash'));
          return flash?.quota_percentage ?? -1;
        };
        return getFlashQuota(modelsMap[b.id] || []) - getFlashQuota(modelsMap[a.id] || []);
      }
      default: // recently-used
        return new Date(b.last_synced || b.connected_at).getTime() -
               new Date(a.last_synced || a.connected_at).getTime();
    }
  });
}

// ── Old ModelEntry type (kept for backward compat during transition) ──

export interface ModelEntry {
  id: string;
  user_id: string;
  model_id: string;
  custom_name: string | null;
  description: string | null;
  tags: string[];
  quota_percentage: number | null;
  reset_time: string | null;
  provider: 'google' | 'anthropic' | null;
  subscription_tier: string | null;
  supports_thinking: boolean | null;
  display_name: string | null;
  last_updated: string;
  created_at: string;
}
