'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Shield, Cpu } from 'lucide-react';
import { useStore } from '../../lib/store';
import { fetchOracleSlots, fetchIsOracleVerified, formatAddress } from '../../lib/aleo';

interface OracleSlot {
  slot:       number;
  address:    string | null;
  slashCount: number;
}

const SLOT_LABELS = ['Oracle Alpha', 'Oracle Beta', 'Oracle Gamma'];

export default function OraclePage() {
  const { wallet } = useStore();

  const [slots,    setSlots]    = useState<OracleSlot[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [checkAddr, setCheckAddr] = useState('');
  const [checking,  setChecking]  = useState(false);

  async function loadSlots() {
    setLoading(true);
    const data = await fetchOracleSlots();
    setSlots(data);
    setLoading(false);
  }

  async function checkVerification() {
    const addr = checkAddr || wallet.address;
    if (!addr) return;
    setChecking(true);
    const result = await fetchIsOracleVerified(addr);
    setVerified(result);
    setChecking(false);
  }

  useEffect(() => { loadSlots(); }, []);

  const activeOracles = slots.filter(s => s.address && s.address.startsWith('aleo1')).length;

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl p-8" style={{
        background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(0,212,255,0.06) 100%)',
        border: '1px solid rgba(124,58,237,0.2)',
      }}>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="tag" style={{ background: 'rgba(124,58,237,0.1)', borderColor: 'rgba(124,58,237,0.3)', color: '#a855f7' }}>
              <Cpu size={10} /> 2-of-3 Threshold
            </div>
            <div className="tag" style={{ background: 'rgba(0,212,255,0.08)', borderColor: 'rgba(0,212,255,0.2)', color: '#00d4ff' }}>
              <Shield size={10} /> Verified Inputs
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
            Oracle Network
          </h1>
          <p className="text-zero-text-dim max-w-xl">
            Three independent oracle bots read on-chain wallet history. Your credit record is only issued
            when 2-of-3 oracles agree — eliminating self-attestation fraud.
          </p>
        </div>
      </div>

      {/* Oracle status grid */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
          Oracle Slots
        </h2>
        <button onClick={loadSlots} disabled={loading}
          className="flex items-center gap-2 text-sm text-zero-text-dim hover:text-zero-cyan transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {loading ? (
          [0, 1, 2].map(i => (
            <div key={i} className="glass rounded-2xl p-5 animate-pulse h-32" />
          ))
        ) : slots.length === 0 ? (
          [0, 1, 2].map(i => (
            <div key={i} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-zero-text">{SLOT_LABELS[i]}</span>
                <span className="text-xs text-zero-text-dim">Slot {i}</span>
              </div>
              <div className="flex items-center gap-2 text-zero-text-dim">
                <AlertTriangle size={14} className="text-amber-400" />
                <span className="text-xs">Not registered</span>
              </div>
            </div>
          ))
        ) : (
          slots.map((slot) => {
            const isActive = !!slot.address && slot.address.startsWith('aleo1');
            const isSlashed = slot.slashCount > 0;
            return (
              <div key={slot.slot} className="glass rounded-2xl p-5" style={{
                border: `1px solid ${isActive ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`,
              }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-zero-text">{SLOT_LABELS[slot.slot]}</span>
                  <div className="flex items-center gap-1.5">
                    {isActive
                      ? <CheckCircle size={14} className="text-zero-green" />
                      : <XCircle   size={14} className="text-red-400" />
                    }
                    <span className="text-xs" style={{ color: isActive ? '#10b981' : '#ef4444' }}>
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {isActive && (
                  <p className="text-xs font-mono text-zero-text-dim mb-3 truncate">
                    {slot.address}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-zero-text-dim">Slash count</span>
                  <span className="text-xs font-mono" style={{ color: isSlashed ? '#ef4444' : '#10b981' }}>
                    {slot.slashCount}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Consensus summary */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-base font-semibold text-zero-text mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>
          Consensus Requirements
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { label: 'Registered Oracles', value: `${activeOracles} / 3`, color: '#00d4ff' },
            { label: 'Threshold (quorum)',  value: '2-of-3',              color: '#a855f7' },
            { label: 'Attestation Model',   value: 'On-Chain Data',       color: '#10b981' },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xl font-bold font-mono mb-1" style={{ color }}>{value}</p>
              <p className="text-xs text-zero-text-dim">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Verify a wallet */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
          Check Oracle Verification
        </h3>
        <p className="text-sm text-zero-text-dim">
          Check whether a wallet has a finalized oracle-verified credit record.
        </p>
        <div className="flex gap-3">
          <input
            value={checkAddr}
            onChange={e => setCheckAddr(e.target.value)}
            placeholder={wallet.address ? `${wallet.address.slice(0, 16)}... (your wallet)` : 'aleo1...'}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-zero-text placeholder-zero-text-dim focus:outline-none focus:border-zero-cyan/50"
          />
          <button onClick={checkVerification} disabled={checking || (!checkAddr && !wallet.address)}
            className="btn-primary px-6">
            {checking ? '...' : 'Check'}
          </button>
        </div>

        {verified !== null && (
          <div className="flex items-center gap-3 rounded-xl p-4"
            style={{
              background: verified ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border:     `1px solid ${verified ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}>
            {verified
              ? <CheckCircle size={18} className="text-zero-green flex-shrink-0" />
              : <XCircle    size={18} className="text-red-400 flex-shrink-0" />
            }
            <div>
              <p className="text-sm font-semibold" style={{ color: verified ? '#10b981' : '#ef4444' }}>
                {verified ? 'Oracle Verified' : 'Not Verified'}
              </p>
              <p className="text-xs text-zero-text-dim mt-0.5">
                {verified
                  ? '2-of-3 oracles reached consensus. Credit record is trustworthy.'
                  : 'No consensus record found. The wallet has not completed oracle attestation.'
                }
              </p>
            </div>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-base font-semibold text-zero-text mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>
          How Oracle Attestation Works
        </h3>
        <ol className="space-y-3">
          {[
            { step: '01', text: 'Each oracle bot independently reads on-chain data: tx count, first tx block, protocol interactions from lending pools.' },
            { step: '02', text: 'Each oracle hashes the attestation data (BHP256) and calls submit_attestation. Raw data is never stored on-chain.' },
            { step: '03', text: 'When 2 oracles submit matching hashes, consensus is reached for that wallet.' },
            { step: '04', text: "The wallet owner calls claim_verified_credit with the matching data. The ZK circuit proves the hash matches — and issues a private VerifiedCreditRecord." },
          ].map(({ step, text }) => (
            <li key={step} className="flex items-start gap-4">
              <span className="text-xs font-mono text-zero-cyan opacity-60 mt-0.5 flex-shrink-0">{step}</span>
              <p className="text-sm text-zero-text-dim leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
