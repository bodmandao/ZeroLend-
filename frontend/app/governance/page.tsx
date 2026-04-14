'use client';

import { useState, useEffect } from 'react';
import { Vote, TrendingUp, Lock, CheckCircle, RefreshCw, Info } from 'lucide-react';
import { useStore } from '../../lib/store';
import { fetchGovernanceStats, fetchGovernanceStake, microToAleo, formatAleo } from '../../lib/aleo';

export default function GovernancePage() {
  const { wallet, creditScore } = useStore();

  const [stats,    setStats]    = useState<{ proposalCount: number; totalStaked: number } | null>(null);
  const [myStake,  setMyStake]  = useState<number | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [stakeAmt, setStakeAmt] = useState('');

  const tier = creditScore ? (creditScore >= 850 ? 5 : creditScore >= 700 ? 4 : creditScore >= 500 ? 3 : creditScore >= 300 ? 2 : 1) : 0;
  const votingPower = tier > 0 && myStake ? tier * myStake : 0;

  async function load() {
    setLoading(true);
    const [s, stake] = await Promise.all([
      fetchGovernanceStats(),
      wallet.address ? fetchGovernanceStake(wallet.address) : Promise.resolve(0),
    ]);
    setStats(s);
    setMyStake(stake);
    setLoading(false);
  }

  useEffect(() => { load(); }, [wallet.address]);

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl p-8" style={{
        background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(0,212,255,0.05) 100%)',
        border: '1px solid rgba(168,85,247,0.2)',
      }}>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="tag" style={{ background: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.3)', color: '#a855f7' }}>
              <Vote size={10} /> Private Ballots
            </div>
            <div className="tag" style={{ background: 'rgba(0,212,255,0.08)', borderColor: 'rgba(0,212,255,0.2)', color: '#00d4ff' }}>
              <Lock size={10} /> Credit-Weighted
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
            Governance
          </h1>
          <p className="text-zero-text-dim max-w-xl">
            Credit-weighted voting: Diamond holders have 5× base power. Ballots are private records —
            vote direction stays off-chain until tally finalization.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
          Protocol Stats
        </h2>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 text-sm text-zero-text-dim hover:text-zero-cyan transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {[
          { label: 'Total Proposals',   value: stats?.proposalCount ?? '—',                           color: '#00d4ff' },
          { label: 'Total Staked',      value: stats ? formatAleo(stats.totalStaked)           : '—', color: '#a855f7' },
          { label: 'My Stake',          value: myStake !== null ? formatAleo(myStake)           : '—', color: '#10b981' },
          { label: 'My Voting Power',   value: votingPower > 0 ? `${(votingPower / 1e6).toFixed(2)}` : '—', color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass rounded-2xl p-5">
            <p className="text-xs text-zero-text-dim mb-2">{label}</p>
            <p className="text-xl font-bold font-mono" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Voting power explainer */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-base font-semibold text-zero-text mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>
          Voting Power Formula
        </h3>
        <div className="flex items-center gap-4 text-sm text-zero-text-dim mb-4">
          <span className="font-mono text-zero-cyan">voting_power = tier × staked_ALEO</span>
        </div>
        <div className="grid md:grid-cols-5 gap-3">
          {[
            { tier: 1, label: 'Bronze',   mult: '1×', color: '#ef4444' },
            { tier: 2, label: 'Silver',   mult: '2×', color: '#f59e0b' },
            { tier: 3, label: 'Gold',     mult: '3×', color: '#3b82f6' },
            { tier: 4, label: 'Platinum', mult: '4×', color: '#10b981' },
            { tier: 5, label: 'Diamond',  mult: '5×', color: '#00d4ff' },
          ].map(({ tier: t, label, mult, color }) => (
            <div key={t} className={`text-center p-3 rounded-xl ${t === tier ? 'ring-1' : ''}`}
              style={{
                background: `${color}10`,
                border: `1px solid ${color}25`,
                ringColor: color,
              }}>
              <p className="text-lg font-bold font-mono" style={{ color }}>{mult}</p>
              <p className="text-xs text-zero-text-dim mt-1">{label}</p>
              {t === tier && <p className="text-xs mt-1" style={{ color }}>You</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Stake / Propose form */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Stake */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
            Governance Stake
          </h3>
          <p className="text-sm text-zero-text-dim">
            Stake ALEO to earn voting power. Minimum 1 ALEO. Unstake anytime (no lockup).
          </p>
          <div>
            <label className="text-xs text-zero-text-dim mb-1.5 block">Amount (ALEO)</label>
            <input
              value={stakeAmt}
              onChange={e => setStakeAmt(e.target.value)}
              placeholder="e.g. 100"
              type="number"
              min="1"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-zero-text placeholder-zero-text-dim focus:outline-none focus:border-zero-cyan/50"
            />
          </div>
          {stakeAmt && tier > 0 && (
            <div className="rounded-xl p-3" style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)' }}>
              <p className="text-xs text-zero-cyan">
                Staking {stakeAmt} ALEO at Tier {tier} = <strong>{(parseFloat(stakeAmt) * tier).toFixed(2)} voting power</strong>
              </p>
            </div>
          )}
          <button
            disabled={!wallet.connected || !stakeAmt || tier === 0}
            className="btn-primary w-full"
          >
            Stake for Voting Power
          </button>
        </div>

        {/* Propose */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
            Submit Proposal
          </h3>
          <p className="text-sm text-zero-text-dim">
            Gold tier+ required to propose. Proposals run for ~2 days (17,280 blocks).
          </p>

          <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
            {[
              { key: 'Flash Loan Fee',      id: '01', example: '30 bps = 0.3%' },
              { key: 'Loan Term (blocks)',   id: '02', example: '86400 = ~10 days' },
              { key: 'Oracle Slot',          id: '03', example: 'Replace oracle address' },
              { key: 'Min Vouch Tier',       id: '04', example: '4 = Platinum' },
            ].map(({ key, id, example }) => (
              <div key={id} className="flex items-center justify-between text-xs">
                <span className="text-zero-text-dim font-mono">{id} — {key}</span>
                <span className="text-zero-text-dim opacity-50">{example}</span>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 text-xs text-zero-text-dim">
            <Info size={12} className="mt-0.5 flex-shrink-0 text-zero-cyan" />
            <span>Quorum: 10% of total governance stake must vote. Pass threshold: 60% yes.</span>
          </div>

          <button
            disabled={!wallet.connected || tier < 3}
            className="btn-primary w-full"
          >
            {tier < 3 ? 'Gold+ Tier Required to Propose' : 'Create Proposal'}
          </button>
        </div>
      </div>
    </div>
  );
}
