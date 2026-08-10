// Quota API constants - mirrored from AntigravityManager GoogleAPIService
const QUOTA_API_ENDPOINTS = [
  'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels',
  'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
  'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
] as const;

const LOAD_PROJECT_URL = 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';
const FETCH_CREDITS_URL = 'https://cloudcode-pa.googleapis.com/v1internal:fetchCredits';
const DAILY_LOAD_PROJECT_URL = 'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';

// These match what AntigravityManager uses for its "Antigravity Enterprise" OAuth client
// The desktop app uses these to authenticate with the Antigravity backend
const ANTIGRAVITY_USER_AGENT = 'antigravity/0.17.0 (linux; node/22.15.0)';

export interface ModelQuotaInfo {
  percentage: number;
  resetTime: string;
  display_name?: string;
  supports_images?: boolean;
  supports_thinking?: boolean;
  thinking_budget?: number;
  recommended?: boolean;
  max_tokens?: number;
  max_output_tokens?: number;
  supported_mime_types?: Record<string, boolean>;
}

export interface QuotaData {
  models: Record<string, ModelQuotaInfo>;
  model_forwarding_rules?: Record<string, string>;
  subscription_tier?: string;
  is_forbidden?: boolean;
  ai_credits?: { credits: number; expiryDate: string };
}

interface ModelInfoRaw {
  quotaInfo?: {
    remainingFraction?: number;
    resetTime?: string;
  };
  displayName?: string;
  supportsImages?: boolean;
  supportsThinking?: boolean;
  thinkingBudget?: number;
  recommended?: boolean;
  maxTokens?: number;
  maxOutputTokens?: number;
  supportedMimeTypes?: Record<string, boolean>;
}

interface TierRaw {
  is_default?: boolean;
  id?: string;
  name?: string;
  slug?: string;
  availableCredits?: { creditType?: string; creditAmount?: string | number }[];
}

interface LoadProjectResponse {
  cloudaicompanionProject?: string;
  currentTier?: TierRaw;
  paidTier?: TierRaw;
  allowedTiers?: TierRaw[];
  ineligibleTiers?: { reasonCode?: string }[];
}

interface FetchModelsResponse {
  models?: Record<string, ModelInfoRaw>;
  deprecatedModelIds?: Record<string, { newModelId?: string }>;
}

function buildHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': ANTIGRAVITY_USER_AGENT,
  };
}

function isTrackedModel(modelName: string): boolean {
  return /^(gemini|claude|gpt|image|imagen)/i.test(modelName);
}

function toModelQuotaInfo(modelName: string, info: ModelInfoRaw): ModelQuotaInfo | null {
  if (!isTrackedModel(modelName) || !info.quotaInfo) return null;
  const fraction = info.quotaInfo.remainingFraction ?? 0;
  return {
    percentage: Math.floor(fraction * 100),
    resetTime: info.quotaInfo.resetTime || '',
    display_name: info.displayName,
    supports_images: info.supportsImages,
    supports_thinking: info.supportsThinking,
    thinking_budget: info.thinkingBudget,
    recommended: info.recommended,
    max_tokens: info.maxTokens,
    max_output_tokens: info.maxOutputTokens,
    supported_mime_types: info.supportedMimeTypes,
  };
}

function resolveSubscriptionTier(payload: LoadProjectResponse): string | undefined {
  if (payload.paidTier?.name) return payload.paidTier.name;
  if (payload.paidTier?.id) return payload.paidTier.id;
  const ineligible = Array.isArray(payload.ineligibleTiers) && payload.ineligibleTiers.length > 0;
  if (!ineligible) {
    if (payload.currentTier?.name) return payload.currentTier.name;
    if (payload.currentTier?.id) return payload.currentTier.id;
  }
  if (Array.isArray(payload.allowedTiers) && payload.allowedTiers.length > 0) {
    const tier = payload.allowedTiers.find((t) => t.is_default) ?? payload.allowedTiers[0];
    const name = tier.name || tier.id;
    return name ? (ineligible ? `${name} (Restricted)` : name) : undefined;
  }
  return undefined;
}

async function fetchProjectContext(
  accessToken: string,
): Promise<{ projectId?: string; subscriptionTier?: string }> {
  const body = { metadata: { ideType: 'ANTIGRAVITY' } };

  const response = await fetch(LOAD_PROJECT_URL, {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`loadCodeAssist failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as LoadProjectResponse;
  return {
    projectId: data.cloudaicompanionProject,
    subscriptionTier: resolveSubscriptionTier(data),
  };
}

async function fetchAICredits(
  accessToken: string,
): Promise<{ credits: number; expiryDate: string } | null> {
  try {
    const response = await fetch(DAILY_LOAD_PROJECT_URL, {
      method: 'POST',
      headers: buildHeaders(accessToken),
      body: JSON.stringify({
        metadata: { ide_type: 'ANTIGRAVITY', ide_version: '0.17.0', ide_name: 'antigravity' },
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as LoadProjectResponse;
    const credit = data.paidTier?.availableCredits?.[0];
    if (!credit) return null;
    const credits = typeof credit.creditAmount === 'number'
      ? credit.creditAmount
      : parseInt(String(credit.creditAmount ?? '0'), 10);
    return { credits: isNaN(credits) ? 0 : credits, expiryDate: '' };
  } catch {
    return null;
  }
}

export async function fetchQuotaFromGoogle(accessToken: string): Promise<QuotaData> {
  const { projectId, subscriptionTier } = await fetchProjectContext(accessToken);
  const payload: Record<string, unknown> = projectId ? { project: projectId } : {};

  for (let i = 0; i < QUOTA_API_ENDPOINTS.length; i++) {
    const endpoint = QUOTA_API_ENDPOINTS[i];
    let currentPayload = { ...payload };
    let retriedWithoutProject = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: buildHeaders(accessToken),
          body: JSON.stringify(currentPayload),
        });

        if (!response.ok) {
          const status = response.status;
          if (status === 403 && 'project' in currentPayload && !retriedWithoutProject) {
            currentPayload = {};
            retriedWithoutProject = true;
            continue;
          }
          if (status === 403) throw new Error('FORBIDDEN');
          if (status === 401) throw new Error('UNAUTHORIZED');

          const hasNext = i + 1 < QUOTA_API_ENDPOINTS.length;
          if (hasNext && (status === 429 || status >= 500)) break;
          throw new Error(`HTTP ${status}: ${await response.text()}`);
        }

        const data = (await response.json()) as FetchModelsResponse;
        const models: Record<string, ModelQuotaInfo> = {};

        for (const [modelName, modelInfoRaw] of Object.entries(data.models || {})) {
          const info = toModelQuotaInfo(modelName, modelInfoRaw);
          if (info) models[modelName] = info;
        }

        const model_forwarding_rules: Record<string, string> = {};
        for (const [oldId, dep] of Object.entries(data.deprecatedModelIds || {})) {
          if (dep.newModelId) model_forwarding_rules[oldId] = dep.newModelId;
        }

        const ai_credits = await fetchAICredits(accessToken);

        return {
          models,
          model_forwarding_rules: Object.keys(model_forwarding_rules).length > 0
            ? model_forwarding_rules
            : undefined,
          subscription_tier: subscriptionTier,
          is_forbidden: false,
          ai_credits: ai_credits ?? undefined,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'FORBIDDEN' || msg === 'UNAUTHORIZED') throw err;
        const hasNext = i + 1 < QUOTA_API_ENDPOINTS.length;
        if (hasNext) break;
        throw err;
      }
    }
  }

  throw new Error('Quota fetch failed on all endpoints');
}
