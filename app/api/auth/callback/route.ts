import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';



interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // "ownerId" or "ownerId|accountId"
  const error = searchParams.get('error');
  const redirectBase = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (error) {
    return NextResponse.redirect(`${redirectBase}/dashboard?error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${redirectBase}/dashboard?error=missing_params`);
  }

  // State = "ownerUid" or "ownerUid|existingAccountId" (for re-auth)
  const [ownerUid, existingAccountId] = state.split('|');

  try {
    // 1. Exchange code for tokens
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: `${redirectBase}/api/auth/callback`,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams,
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[OAuth] Token exchange failed:', err);
      return NextResponse.redirect(`${redirectBase}/dashboard?error=${encodeURIComponent('Token exchange failed')}`);
    }

    const tokenData = (await tokenRes.json()) as TokenResponse;
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // 2. Fetch Google user info with the new token
    const userInfoRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    let email = '';
    let name = '';
    let avatarUrl = '';

    if (userInfoRes.ok) {
      const userInfo = (await userInfoRes.json()) as GoogleUserInfo;
      email = userInfo.email || '';
      name = userInfo.name || '';
      avatarUrl = userInfo.picture || '';
    }

    // 3. Upsert into antigravity_accounts
    const accountPayload = {
      owner_uid: ownerUid,
      email,
      name,
      avatar_url: avatarUrl,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt,
      connected_at: new Date().toISOString(),
      is_active: true,
    };

    let accountId: string | null = existingAccountId || null;

    if (accountId) {
      // Re-auth existing account — update tokens only
      const { error: updateErr } = await supabase
        .from('antigravity_accounts')
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || null,
          expires_at: expiresAt,
          email,
          name,
          avatar_url: avatarUrl,
        })
        .eq('id', accountId)
        .eq('owner_uid', ownerUid);

      if (updateErr) {
        const msg = updateErr.message || updateErr.code || 'Update failed';
        return NextResponse.redirect(`${redirectBase}/dashboard?error=${encodeURIComponent(`Supabase: ${msg}`)}`);
      }
    } else {
      // New account — check if this email is already connected
      const { data: existing } = await supabase
        .from('antigravity_accounts')
        .select('id')
        .eq('owner_uid', ownerUid)
        .eq('email', email)
        .single();

      if (existing) {
        // Update existing account with same email
        accountId = existing.id;
        await supabase
          .from('antigravity_accounts')
          .update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || null,
            expires_at: expiresAt,
            name,
            avatar_url: avatarUrl,
          })
          .eq('id', existing.id);
      } else {
        // Insert brand new account
        const { data: inserted, error: insertErr } = await supabase
          .from('antigravity_accounts')
          .insert([accountPayload])
          .select('id')
          .single();

        if (insertErr || !inserted) {
          const msg = insertErr?.message || 'Insert failed';
          return NextResponse.redirect(`${redirectBase}/dashboard?error=${encodeURIComponent(`Supabase: ${msg}`)}`);
        }
        accountId = inserted.id;
      }
    }

    // 4. Auto-fetch quota for the newly connected account
    if (accountId) {
      // Trigger quota fetch in background (fire and forget)
      fetch(`${redirectBase}/api/quota/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, ownerUid }),
      }).catch(console.error);
    }

    return NextResponse.redirect(`${redirectBase}/dashboard?connected=true`);
  } catch (err) {
    console.error('[OAuth Callback] Error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.redirect(`${redirectBase}/dashboard?error=${encodeURIComponent(msg)}`);
  }
}
