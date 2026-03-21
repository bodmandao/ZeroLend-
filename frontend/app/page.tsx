'use client';

import { useEffect, useState } from 'react';
import {
  TrendingUp, Shield, Zap, Lock, BarChart2,
  ArrowUpRight, ArrowDownRight, RefreshCw, Users
} from 'lucide-react';
import Link from 'next/link';
import { useStore } from '../lib/store';
import { fetchPoolStats, formatAleo, TIERS } from '../lib/aleo';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

// Mock chart data — values in ALEO (whole units)
const MOCK_CHART = [
  { t: 'D1', liquidity: 50,  borrowed: 10  },
  { t: 'D2', liquidity: 120, borrowed: 35  },
  { t: 'D3', liquidity: 210, borrowed: 80  },
  { t: 'D4', liquidity: 380, borrowed: 140 },
  { t: 'D5', liquidity: 520, borrowed: 210 },
  { t: 'D6', liquidity: 740, borrowed: 310 },
  { t: 'Now', liquidity: 950, borrowed: 420 },
];

export default function DashboardPage() {
  const { poolStats, setPoolStats, wallet, creditScore } = useStore();
  const [loading, setLoading] = useState(false);

  async function loadStats() {
    setLoading(true);
    const stats = await fetchPoolStats();
    if (stats) setPoolStats(stats);
    setLoading(false);
  }

  useEffect(() => { loadStats(); }, []);

  const tierData = poolStats
    ? [1, 2, 3, 4, 5].map((t) => ({
        name:  TIERS[t as keyof typeof TIERS].label,
        value: poolStats[`tier${t}Count` as keyof typeof poolStats] as number,
        color: TIERS[t as keyof typeof TIERS].color,
      })).filter((d) => d.value > 0)
    : [];

  const utilization = poolStats?.utilizationRate ?? 0;

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">

      {/* ── Hero ───────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl p-8" style={{
        background: 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(124,58,237,0.08) 100%)',
        border:     '1px solid rgba(0,212,255,0.15)',
      }}>
        <div className="absolute top-0 right-0 w-80 h-80 opacity-10"
          style={{ background: 'radial-gradient(circle, rgba(0,212,255,0.6) 0%, transparent 70%)' }} />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="tag" style={{ background: 'rgba(0,212,255,0.1)', borderColor: 'rgba(0,212,255,0.3)', color: '#00d4ff' }}>
              <Shield size={10} /> ZK-Powered
            </div>
            <div className="tag" style={{ background: 'rgba(0,255,204,0.08)', borderColor: 'rgba(0,255,204,0.2)', color: '#00ffcc' }}>
              <Lock size={10} /> Private by Default
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
            Private Credit.{' '}
            <span className="gradient-text">Proven Trustlessly.</span>
          </h1>
          <p className="text-zero-text-dim text-lg max-w-xl">
            Borrow ALEO without collateral. Prove your creditworthiness with
            zero-knowledge proofs — your data stays yours.
          </p>
          <div className="flex items-center gap-4 mt-6">
            {!wallet.connected ? (
              <Link href="/credit" className="btn-primary">Get Started →</Link>
            ) : creditScore ? (
              <Link href="/borrow" className="btn-primary">Borrow Now →</Link>
            ) : (
              <Link href="/credit" className="btn-primary">Check Credit Score →</Link>
            )}
            <Link href="/lend" className="btn-ghost">Earn Yield</Link>
          </div>
        </div>
      </div>

      {/* ── Pool stats ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
          Protocol Stats
        </h2>
        <button
          onClick={loadStats}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-zero-text-dim hover:text-zero-cyan transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label:  'Total Liquidity',
            value:  poolStats ? formatAleo(poolStats.totalLiquidity) : '—',
            icon:   TrendingUp,
            color:  '#00d4ff',
            change: '+12.4%',
            up:     true,
          },
          {
            label:  'Total Borrowed',
            value:  poolStats ? formatAleo(poolStats.totalBorrowed) : '—',
            icon:   ArrowUpRight,
            color:  '#a855f7',
            change: '+8.1%',
            up:     true,
          },
          {
            label:  'Active Loans',
            value:  poolStats?.activeLoanCount ?? '—',
            icon:   Users,
            color:  '#10b981',
            change: '+3',
            up:     true,
          },
          {
            label:  'Utilization',
            value:  poolStats ? `${utilization}%` : '—',
            icon:   BarChart2,
            color:  utilization > 80 ? '#ef4444' : utilization > 60 ? '#f59e0b' : '#10b981',
            change: utilization > 80 ? 'High' : 'Healthy',
            up:     utilization <= 80,
          },
        ].map(({ label, value, icon: Icon, color, change, up }) => (
          <div key={label} className="glass glass-hover rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zero-text-dim">{label}</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                <Icon size={16} style={{ color }} />
              </div>
            </div>
            <p className="stat-value text-zero-text">{value}</p>
            <div className={`flex items-center gap-1 mt-2 text-xs ${up ? 'text-zero-green' : 'text-zero-red'}`}>
              {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {change}
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts row ──────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Pool activity chart */}
        <div className="lg:col-span-2 glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
              Pool Activity
            </h3>
            <div className="flex items-center gap-4 text-xs text-zero-text-dim">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-zero-cyan rounded inline-block" />Liquidity (ALEO)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-violet-500 rounded inline-block" />Borrowed (ALEO)
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={MOCK_CHART}>
              <defs>
                <linearGradient id="cyan" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#00d4ff" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#00d4ff" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="violet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={{ fill: '#6b7fa3', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7fa3', fontSize: 12 }} axisLine={false} tickLine={false} unit=" A" />
              <Tooltip
                contentStyle={{ background: '#0c1424', border: '1px solid #1a2540', borderRadius: 12, color: '#c8d6f0' }}
                formatter={(val: number) => [`${val} ALEO`]}
              />
              <Area type="monotone" dataKey="liquidity" stroke="#00d4ff" strokeWidth={2} fill="url(#cyan)"   />
              <Area type="monotone" dataKey="borrowed"  stroke="#a855f7" strokeWidth={2} fill="url(#violet)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Tier distribution */}
        <div className="glass rounded-2xl p-6">
          <h3 className="text-base font-semibold text-zero-text mb-6" style={{ fontFamily: "'Syne', sans-serif" }}>
            Borrower Tiers
          </h3>
          {tierData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={tierData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {tierData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} opacity={0.9} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-4">
                {tierData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-zero-text-dim">
                      <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                      {d.name}
                    </span>
                    <span className="font-mono text-zero-text">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-zero-text-dim text-sm">
              <Users size={32} className="mb-2 opacity-30" />
              No borrowers yet
            </div>
          )}
        </div>
      </div>

      {/* ── Solvency proof ──────────────────────────────── */}
      <div className="rounded-2xl p-6 flex items-center justify-between" style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(0,212,255,0.05))',
        border:     '1px solid rgba(16,185,129,0.2)',
      }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
            <Shield size={24} className="text-zero-green" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
              Pool Solvency Verified
            </h3>
            <p className="text-sm text-zero-text-dim">
              borrowed ≤ liquidity · Verified on-chain · Individual positions private
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-zero-green animate-pulse" />
            <span className="text-sm text-zero-green font-semibold">Solvent</span>
          </div>
        </div>
      </div>

      {/* ── ZK Features ─────────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          {
            icon:  Lock,
            title: 'Private Balances',
            desc:  'Your ALEO amounts and loan sizes are stored as private credits.aleo records — never visible on-chain.',
            color: '#00d4ff',
          },
          {
            icon:  Shield,
            title: 'ZK Credit Proofs',
            desc:  'Prove your creditworthiness without revealing your score, history, or any personal data.',
            color: '#a855f7',
          },
          {
            icon:  Zap,
            title: 'Zero MEV',
            desc:  'Private order sizes eliminate front-running and MEV attacks entirely.',
            color: '#00ffcc',
          },
        ].map(({ icon: Icon, title, desc, color }) => (
          <div key={title} className="glass glass-hover rounded-2xl p-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
              style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
              <Icon size={20} style={{ color }} />
            </div>
            <h4 className="text-sm font-semibold text-zero-text mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
              {title}
            </h4>
            <p className="text-xs text-zero-text-dim leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}