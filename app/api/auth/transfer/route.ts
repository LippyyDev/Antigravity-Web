import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';
// In-memory store for single-use tokens
// Key: token, Value: { uid, expiresAt }
const tokenStore = new Map<string, { uid: string; expiresAt: number }>();

// Cleanup expired tokens periodically
function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [key, value] of tokenStore.entries()) {
    if (value.expiresAt < now) {
      tokenStore.delete(key);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    // Get the Firebase ID token from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);

    // Verify the ID token to get the user
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Generate a Firebase custom token for the user
    const customToken = await adminAuth.createCustomToken(uid);

    // Generate a short random code (8 chars) to use in the URL
    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();

    // Store: code → { customToken, uid, expiresAt }
    const expirySeconds = parseInt(process.env.TRANSFER_TOKEN_EXPIRY_SECONDS || '300');
    tokenStore.set(code, {
      uid,
      expiresAt: Date.now() + expirySeconds * 1000,
    });

    // Cleanup old tokens
    cleanupExpiredTokens();

    // Build the transfer URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const transferUrl = `${appUrl}/auth/transfer?code=${code}`;

    return NextResponse.json({
      code,
      transferUrl,
      customToken,
      expiresInSeconds: expirySeconds,
    });
  } catch (err) {
    console.error('[generate-transfer] Error:', err);
    return NextResponse.json({ error: 'Failed to generate transfer token' }, { status: 500 });
  }
}

// Also expose GET so the transfer page can redeem the code
export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code');
    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    const entry = tokenStore.get(code);
    if (!entry) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 404 });
    }

    if (entry.expiresAt < Date.now()) {
      tokenStore.delete(code);
      return NextResponse.json({ error: 'Code has expired' }, { status: 410 });
    }

    // Generate a fresh custom token for the UID
    const adminAuth = getAdminAuth();
    const customToken = await adminAuth.createCustomToken(entry.uid);

    // Delete the code immediately (single-use)
    tokenStore.delete(code);

    return NextResponse.json({ customToken });
  } catch (err) {
    console.error('[use-transfer] Error:', err);
    return NextResponse.json({ error: 'Failed to redeem transfer token' }, { status: 500 });
  }
}
