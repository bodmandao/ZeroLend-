'use client';

import { useState, useEffect } from 'react';
import { Shield, Users, Zap, AlertTriangle, CheckCircle, RefreshCw, Lock } from 'lucide-react';
import { useStore } from '../../lib/store';
import {
  fetchVouchBoost, fetchVouchesOut, fetchTotalStaked,
  microToAleo, formatAleo, TIERS,
} from '../../lib/aleo';

const TIER_LABELS: Record<number, string> = {
  1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Platinum', 5: 'Diamond',
};
const TIER_COLORS: Record<number, string> = {
  1: '#ef4444', 2: '#f59e0b', 3: '#3b82f6', 4: '#10b981', 5: '#00d4ff',
};

export default function VouchingPage() {
  const { wallet, creditScore } = useStore();

  const [lookupAddr,   setLookupAddr]   = useState('');
  const [lookupBoost,  setLookupBoost]  = useState<number | null>(null);
  const [lookupStaked, setLookupStaked] = useState<number | null>(null);
  const [lookupOut,    setLookupOut]    = useState<number | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const [myBoost,   setMyBoost]   = useState<number | null>(null);
  const [myStaked,  setMyStaked]  = useState<number | null>(null);
  const [myOut,     setMyOut]     = useState<number | null>(null);
  const [myLoading, setMyLoading] = useState(false);

  const [borrower,    setBorrower]    = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [vouchStatus, setVouchStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [vouchMsg,    setVouchMsg]    = useState('');

  const tier = creditScore ? (creditScore >= 850 ? 5 : creditScore >= 700 ? 4 : creditScore >= 500 ? 3 : creditScore >= 300 ? 2 : 1) : 0;
  const canVouch = tier >= 4;

  async function loadMyStats() {
    if (!wallet.address) return;
    setMyLoading(true);
    const [boost, out, staked] = await Promise.all([
      fetchVouchBoost(wallet.address),
      fetchVouchesOut(wallet.address),
      fetchTotalStaked(wallet.address),
    ]);
    setMyBoost(boost);
    setMyOut(out);
    setMyStaked(staked);
    setMyLoading(false);
  }

  async function lookupAddress() {
    if (!lookupAddr) return;
    setLookupLoading(true);
    const [boost, out, staked] = await Promise.all([
      fetchVouchBoost(lookupAddr),
      fetchVouchesOut(lookupAddr),
      fetchTotalStaked(lookupAddr),
    ]);
    setLookupBoost(boost);
    setLookupOut(out);
    setLookupStaked(staked);
    setLookupLoading(false);
  }

  async function submitVouch() {
    if (!wallet.connected || !borrower || !stakeAmount) return;
    setVouchStatus('pending');
    setVouchMsg('Submitting vouch transaction...');
    // Transaction submission via wallet — placeholder for actual wallet integration
    await new Promise(r => setTimeout(r, 1500));
    setVouchStatus('success');
    setVouchMsg(`Vouch submitted! ${borrower.slice(0,10)}... will receive +1 tier boost.`);
  }

  useEffect(() => { loadMyStats(); }, [wallet.address]);

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl p-8" style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(0,212,255,0.06) 100%)',
        border: '1px solid rgba(16,185,129,0.2)',
      }}>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="tag" style={{ background: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)', color: '#10b981' }}>
              <Users size={10} /> Social Trust
            </div>
            <div className="tag" style={{ background: 'rgba(0,212,255,0.08)', borderColor: 'rgba(0,212,255,0.2)', color: '#00d4ff' }}>
              <Lock size={10} /> Platinum+ Only
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
            Credit Vouching
          </h1>
          <p className="text-zero-text-dim max-w-xl">
            Stake ALEO behind a borrower to boost their credit tier. If they default, your stake is slashed.
            Diamond and Platinum holders build the credit graph — privately.
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { icon: Shield, title: 'Stake Reputation', desc: 'Lock ALEO as collateral behind a borrower. They get +1 tier instantly.', color: '#10b981' },
          { icon: Zap,    title: 'Boost Access',     desc: 'Vouched borrowers unlock higher loan limits across all three pools.', color: '#00d4ff' },
          { icon: AlertTriangle, title: 'Slash Risk', desc: 'If the borrower defaults, anyone can slash your staked ALEO to the pool.', color: '#f59e0b' },
        ].map(({ icon: Icon, title, desc, color }) => (
          <div key={title} className="glass rounded-2xl p-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
              style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
              <Icon size={18} style={{ color }} />
            </div>
            <h4 className="text-sm font-semibold text-zero-text mb-1" style={{ fontFamily: "'Syne', sans-serif" }}>{title}</h4>
            <p className="text-xs text-zero-text-dim leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* My vouching stats */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
              My Vouching Stats
            </h2>
            <button onClick={loadMyStats} disabled={myLoading}
              className="flex items-center gap-1.5 text-xs text-zero-text-dim hover:text-zero-cyan transition-colors">
              <RefreshCw size={12} className={myLoading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {!wallet.connected ? (
            <p className="text-sm text-zero-text-dim">Connect your wallet to see your vouching activity.</p>
          ) : (
            <div className="space-y-3">
              {[
                { label: 'My Tier',          value: tier > 0 ? `${tier} — ${TIER_LABELS[tier]}` : 'No passport',  color: tier > 0 ? TIER_COLORS[tier] : '#6b7fa3' },
                { label: 'Active Vouches',   value: myOut    !== null ? `${myOut} / 5`                    : '—', color: '#00d4ff' },
                { label: 'Total Staked',     value: myStaked !== null ? formatAleo(myStaked)              : '—', color: '#a855f7' },
                { label: 'My Vouch Boost',   value: myBoost  !== null && myBoost > 0 ? `+${myBoost} tier` : 'None', color: '#10b981' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-sm text-zero-text-dim">{label}</span>
                  <span className="text-sm font-mono font-semibold" style={{ color }}>{value}</span>
                </div>
              ))}

              {!canVouch && tier > 0 && (
                <div className="rounded-xl p-3 mt-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <p className="text-xs text-amber-400">
                    Vouching requires Platinum tier (4) or above. Your current tier: {tier} ({TIER_LABELS[tier]}).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lookup any address */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
            Lookup Address
          </h2>
          <div className="flex gap-2">
            <input
              value={lookupAddr}
              onChange={e => setLookupAddr(e.target.value)}
              placeholder="aleo1..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zero-text placeholder-zero-text-dim focus:outline-none focus:border-zero-cyan/50"
            />
            <button onClick={lookupAddress} disabled={lookupLoading || !lookupAddr}
              className="btn-primary text-sm px-4 py-2.5">
              {lookupLoading ? '...' : 'Look up'}
            </button>
          </div>

          {lookupBoost !== null && (
            <div className="space-y-3">
              {[
                { label: 'Vouch Boost',    value: lookupBoost > 0 ? `+${lookupBoost} tier` : 'None',             color: '#10b981' },
                { label: 'Vouches Given',  value: lookupOut    !== null ? `${lookupOut}`                  : '—', color: '#00d4ff' },
                { label: 'Total Staked',   value: lookupStaked !== null ? formatAleo(lookupStaked)         : '—', color: '#a855f7' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-sm text-zero-text-dim">{label}</span>
                  <span className="text-sm font-mono font-semibold" style={{ color }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Vouch form */}
      {canVouch && (
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
            Vouch for a Borrower
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zero-text-dim mb-1.5 block">Borrower Address</label>
              <input
                value={borrower}
                onChange={e => setBorrower(e.target.value)}
                placeholder="aleo1..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-zero-text placeholder-zero-text-dim focus:outline-none focus:border-zero-cyan/50"
              />
            </div>
            <div>
              <label className="text-xs text-zero-text-dim mb-1.5 block">Stake Amount (ALEO)</label>
              <input
                value={stakeAmount}
                onChange={e => setStakeAmount(e.target.value)}
                placeholder="min. 1 ALEO"
                type="number"
                min="1"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-zero-text placeholder-zero-text-dim focus:outline-none focus:border-zero-cyan/50"
              />
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <p className="text-xs text-amber-300 leading-relaxed">
              <strong>Warning:</strong> Your staked ALEO will be locked until the borrower repays all loans.
              If they default, your stake is permanently slashed to the lending pool.
              Only vouch for addresses you trust.
            </p>
          </div>

          {vouchStatus === 'success' ? (
            <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <CheckCircle size={18} className="text-zero-green flex-shrink-0" />
              <p className="text-sm text-zero-green">{vouchMsg}</p>
            </div>
          ) : (
            <button
              onClick={submitVouch}
              disabled={vouchStatus === 'pending' || !borrower || !stakeAmount || !wallet.connected}
              className="btn-primary w-full"
            >
              {vouchStatus === 'pending' ? 'Submitting...' : `Stake ${stakeAmount || '?'} ALEO as Vouch`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
