'use client';
import { useState } from 'react';
import Link from 'next/link';
import { User, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export interface AppLayoutProps {
  user: User | null;
  children: React.ReactNode;
  activeRoute: '/dashboard' | '/settings';
  actions?: React.ReactNode;
  topbarCenter?: React.ReactNode;
}

export function AppLayout({ user, children, activeRoute, actions, topbarCenter }: AppLayoutProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    signOut(auth).then(() => router.push('/'));
  };

  return (
    <div className="app-wrapper">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-content">
          <div className="sidebar-header">
            <div className="navbar-brand">
              <div className="navbar-dot" />
              <span className="brand-text" style={{ fontSize: '0.9rem' }}>QUOTA MONITOR</span>
            </div>
            <button className="sidebar-close" onClick={() => setMobileOpen(false)}>✕</button>
          </div>

          <nav className="sidebar-nav">
            <Link href="/dashboard" className={`sidebar-link ${activeRoute === '/dashboard' ? 'active' : ''}`} onClick={() => setMobileOpen(false)}>
              <span className="sidebar-icon">📊</span> <span className="link-text">DASHBOARD</span>
            </Link>
            <Link href="/settings" className={`sidebar-link ${activeRoute === '/settings' ? 'active' : ''}`} onClick={() => setMobileOpen(false)}>
              <span className="sidebar-icon">⚙️</span> <span className="link-text">SETTINGS</span>
            </Link>
          </nav>

          {actions && (
            <div className="sidebar-actions">
              {actions}
            </div>
          )}

          <div style={{ marginTop: 'auto', padding: 20 }}>
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', border: '2px solid var(--black)' }} onClick={handleLogout}>
              <span className="sidebar-icon" style={{ display: collapsed ? 'block' : 'none' }}>🚪</span>
              <span className="logout-text">LOGOUT</span>
            </button>
          </div>
        </div>
        <button className="collapse-toggle" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '▶' : '◀'}
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="main-content">
        <header className="topbar" style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <button className="hamburger-btn" onClick={() => setMobileOpen(true)}>
              ☰
            </button>
            <div className="topbar-brand mobile-only">
              <div className="navbar-dot" /> QUOTA MONITOR
            </div>
          </div>
          
          {topbarCenter && (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {topbarCenter}
            </div>
          )}

          <div className="topbar-actions" style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            {user?.photoURL && (
              <div className="user-chip">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={user.photoURL} alt="" />
                <span>{user.displayName?.split(' ')[0] || user.email?.split('@')[0]}</span>
              </div>
            )}
          </div>
        </header>

        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
