'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, TrendingUp, Wallet, ShieldCheck,
  Settings, BookOpen, Zap, ChevronRight
} from 'lucide-react';
import { useStore } from '../../lib/store';
import clsx from 'clsx';

const NAV = [
  { href: '/',          icon: LayoutDashboard, label: 'Dashboard',  desc: 'Overview & stats'     },
  { href: '/borrow',    icon: TrendingUp,       label: 'Borrow',     desc: 'Request a loan'       },
  { href: '/lend',      icon: Wallet,           label: 'Lend',       desc: 'Earn yield'           },
  { href: '/credit',    icon: ShieldCheck,      label: 'Credit',     desc: 'Your ZK credit score' },
  { href: '/admin',     icon: Settings,         label: 'Admin',      desc: 'Oracle & pool setup'  },
];

export default function Sidebar() {
  const pathname    = usePathname();
  const { sidebarOpen, setSidebarOpen, creditTier, creditScore } = useStore();

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'fixed top-0 left-0 h-full z-40 transition-transform duration-300',
          'lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'w-64 flex flex-col'
        )}
        style={{
          background: 'rgba(8,13,26,0.95)',
          backdropFilter: 'blur(20px)',
          borderRight: '1px solid #1a2540',
        }}
      >
        {/* Logo area */}
        <div className="h-16 flex items-center px-6 border-b border-zero-border/50">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(0,212,255,0.3), rgba(0,255,204,0.15))',
                border: '1px solid rgba(0,212,255,0.4)',
              }}
            >
              <Zap size={16} className="text-zero-cyan" />
            </div>
            <span
              className="font-display font-bold text-lg gradient-text"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              ZeroLend
            </span>
          </div>
        </div>

        {/* Credit score mini-card */}
        {creditScore !== null && (
          <div className="mx-4 mt-4 p-3 rounded-xl"
            style={{
              background: 'rgba(0,212,255,0.06)',
              border: '1px solid rgba(0,212,255,0.15)',
            }}
          >
            <p className="text-xs text-zero-text-dim mb-1">Your Credit Score</p>
            <div className="flex items-center justify-between">
              <span
                className="text-2xl font-bold"
                style={{
                  fontFamily: "'Syne', sans-serif",
                  color: '#00d4ff',
                }}
              >
                {creditScore}
              </span>
              <span
                className={`tag tier-${creditTier}`}
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                T{creditTier}
              </span>
            </div>
            <div className="progress-bar mt-2">
              <div
                className="progress-fill"
                style={{ width: `${(creditScore / 1000) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ href, icon: Icon, label, desc }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group',
                  active
                    ? 'nav-active'
                    : 'text-zero-text-dim hover:text-zero-text hover:bg-white/5'
                )}
              >
                <Icon
                  size={18}
                  className={active ? 'text-zero-cyan' : 'text-zero-muted group-hover:text-zero-text-dim'}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium"
                    style={{ fontFamily: "'Syne', sans-serif" }}
                  >
                    {label}
                  </p>
                  {!active && (
                    <p className="text-xs text-zero-muted truncate">{desc}</p>
                  )}
                </div>
                {active && (
                  <ChevronRight size={14} className="text-zero-cyan opacity-60" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-zero-border/50">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{
              background: 'rgba(0,255,204,0.05)',
              border: '1px solid rgba(0,255,204,0.1)',
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-zero-teal animate-pulse" />
            <span className="text-xs font-mono text-zero-text-dim">
              Aleo Testnet
            </span>
            <span className="ml-auto text-xs text-zero-teal font-mono">Live</span>
          </div>
        </div>
      </aside>
    </>
  );
}
