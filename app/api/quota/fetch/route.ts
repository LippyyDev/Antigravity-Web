import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchQuotaFromGoogle } from '@/lib/quota-api';
import { detectProvider, formatModelName } from '@/lib/types';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_at: string } | null> {
  try {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; expires_in: number };
    return {
      access_token: data.access_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { accountId, ownerUid } = await request.json() as { accountId: string; ownerUid: string };

    if (!accountId || !ownerUid) {
      return NextResponse.json({ error: 'accountId and ownerUid required' }, { status: 400 });
    }

    // Get the account + its tokens
    const { data: account, error: accountErr } = await supabase
      .from('antigravity_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('owner_uid', ownerUid)
      .single();

    if (accountErr || !account) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Account not found' }, { status: 404 });
    }

    // Refresh token if expired
    let accessToken: string = account.access_token;
    const isExpired = account.expires_at
      ? Date.now() > new Date(account.expires_at).getTime() - 60000
      : true;

    if (isExpired && account.refresh_token) {
      const refreshed = await refreshAccessToken(account.refresh_token);
      if (refreshed) {
        accessToken = refreshed.access_token;
        await supabase
          .from('antigravity_accounts')
          .update({ access_token: refreshed.access_token, expires_at: refreshed.expires_at })
          .eq('id', accountId);
      } else {
        return NextResponse.json(
          { error: 'TOKEN_EXPIRED', message: 'Token expired. Please reconnect this account.' },
          { status: 401 },
        );
      }
    }

    // Fetch quota
    const quotaData = await fetchQuotaFromGoogle(accessToken);
    const now = new Date().toISOString();

    // Upsert models
    const upserts = Object.entries(quotaData.models).map(([modelId, info]) => ({
      account_id: accountId,
      owner_uid: ownerUid,
      model_id: modelId,
      quota_percentage: info.percentage,
      reset_time: info.resetTime || null,
      provider: detectProvider(modelId),
      display_name: info.display_name || formatModelName(modelId),
      supports_thinking: info.supports_thinking || false,
      last_updated: now,
    }));

    if (upserts.length > 0) {
      await supabase
        .from('account_quota_models')
        .upsert(upserts, { onConflict: 'account_id,model_id', ignoreDuplicates: false });
    }

    // Update account last_synced + subscription_tier
    await supabase
      .from('antigravity_accounts')
      .update({
        last_synced: now,
        subscription_tier: quotaData.subscription_tier || null,
        ai_credits: quotaData.ai_credits || null,
      })
      .eq('id', accountId);

    return NextResponse.json({
      success: true,
      modelCount: upserts.length,
      subscription_tier: quotaData.subscription_tier,
      ai_credits: quotaData.ai_credits,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[fetch-quota] Error:', message);
    if (message === 'FORBIDDEN' || message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'TOKEN_EXPIRED', message: 'Please reconnect this account.' }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
