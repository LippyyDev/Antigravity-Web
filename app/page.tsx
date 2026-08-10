'use client';
import { useEffect, useState } from 'react';
import { signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user: User | null) => {
      if (user) {
        router.push('/dashboard');
      } else {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged will handle the redirect
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      setError(message);
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-grid" />
        <div className="loading-wrap">
          <div className="spinner" style={{ borderTopColor: '#FFE500' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-grid" />

      {/* Decorative text elements */}
      <span className="login-deco" style={{ top: '10%', left: '5%', fontSize: '0.75rem' }}>
        {'> QUOTA_MONITOR v1.0'}
      </span>
      <span className="login-deco" style={{ top: '15%', right: '8%', fontSize: '0.75rem' }}>
        {'{ models: [...] }'}
      </span>
      <span className="login-deco" style={{ bottom: '20%', left: '8%', fontSize: '0.75rem' }}>
        {'percentage: 87%'}
      </span>
      <span className="login-deco" style={{ bottom: '15%', right: '5%', fontSize: '0.75rem' }}>
        {'resetTime: 2h 34m'}
      </span>

      <div className="login-box fade-in">
        {/* Logo + Title */}
        <div className="login-logo">⚡</div>
        <h1 className="login-title">
          ANTIGRAVITY<br />QUOTA MONITOR
        </h1>
        <p className="login-sub">
          Monitor your AI model quotas in real-time.<br />
          Sign in with your Google account to get started.
        </p>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 20, textAlign: 'left' }}>
            <span>⚠️</span> {error}
          </div>
        )}

        <button
          className="google-btn"
          onClick={handleGoogleLogin}
          disabled={signingIn}
        >
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {signingIn ? 'SIGNING IN...' : 'SIGN IN WITH GOOGLE'}
        </button>

        <div className="login-divider">Real-time quota data from your account</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { icon: '⚡', label: 'LIVE QUOTA', sub: 'Direct from Google API' },
            { icon: '🏷️', label: 'CUSTOM TAGS', sub: 'Organize your models' },
            { icon: '📊', label: 'MONITOR', sub: 'Track usage trends' },
            { icon: '🔄', label: 'AUTO-REFRESH', sub: 'Always up to date' },
          ].map((f) => (
            <div key={f.label} style={{
              padding: '12px',
              border: '2px solid #ddd',
              textAlign: 'left',
            }}>
              <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>{f.icon}</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</div>
              <div style={{ fontSize: '0.7rem', color: '#777', marginTop: 2 }}>{f.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
