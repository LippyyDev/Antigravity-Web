'use client';
import { Suspense, useEffect, useState } from 'react';
import { signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';

function TransferContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Validating transfer link...');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setStatus('error');
      setMessage('Invalid transfer link. No code found.');
      return;
    }

    async function redeemTransfer() {
      try {
        // Redeem the code for a custom token
        const res = await fetch(`/api/auth/transfer?code=${code}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to redeem code');
        }

        const { customToken } = await res.json();

        // Sign in with the custom token
        setMessage('Signing you in...');
        await signInWithCustomToken(auth, customToken);

        setStatus('success');
        setMessage('Login successful! Redirecting...');
        setTimeout(() => router.push('/dashboard'), 1200);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Transfer failed';
        setStatus('error');
        setMessage(msg);
      }
    }

    // Only redeem if not already signed in
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/dashboard');
      } else {
        redeemTransfer();
      }
      unsub();
    });
  }, [router, searchParams]);

  return (
    <div className="login-page">
      <div className="login-grid" />
      <div className="login-box fade-in" style={{ textAlign: 'center' }}>
        <div className="login-logo">
          {status === 'loading' && '⚡'}
          {status === 'success' && '✅'}
          {status === 'error' && '❌'}
        </div>
        <h1 className="login-title" style={{ whiteSpace: 'pre-line' }}>
          {status === 'loading' && 'TRANSFERRING\nSESSION'}
          {status === 'success' && 'LOGIN\nSUCCESSFUL'}
          {status === 'error' && 'TRANSFER\nFAILED'}
        </h1>
        <p className="login-sub" style={{ marginTop: 12 }}>{message}</p>

        {status === 'loading' && (
          <div className="loading-wrap" style={{ marginTop: 24 }}>
            <div className="spinner" style={{ borderTopColor: '#FFE500' }} />
          </div>
        )}

        {status === 'error' && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: '0.8rem', color: '#888' }}>
              The link may have expired (5 min) or already been used.
            </p>
            <button
              className="google-btn"
              onClick={() => router.push('/')}
              style={{ justifyContent: 'center' }}
            >
              GO TO LOGIN PAGE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TransferPage() {
  return (
    <Suspense fallback={
      <div className="login-page">
        <div className="login-grid" />
        <div className="loading-wrap">
          <div className="spinner" style={{ borderTopColor: '#FFE500' }} />
        </div>
      </div>
    }>
      <TransferContent />
    </Suspense>
  );
}
