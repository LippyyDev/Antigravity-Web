import { NextRequest, NextResponse } from 'next/server';

// Antigravity's own OAuth client credentials (from AntigravityManager source)
// These are the only credentials that have access to restricted Google scopes:
// aicode, cclog, experimentsandconfigs
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;

const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
  'https://www.googleapis.com/auth/aicode',
].join(' ');

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const redirectBase = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  // Build Google OAuth URL using Antigravity's CLIENT_ID
  // This client is an "installed app" type, which allows localhost redirect URIs
  const params = new URLSearchParams({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: `${redirectBase}/api/auth/callback`,
    include_granted_scopes: 'true',
    state: userId, // Pass userId through the OAuth state param
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
