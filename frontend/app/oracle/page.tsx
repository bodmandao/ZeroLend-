'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Shield, Cpu, Send, Users, KeyRound, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useStore } from '../../lib/store';
import {
  fetchOracleSlots, fetchIsOracleVerified,
  executeTransaction, PROGRAM_ID_ORACLE,
  getCurrentBlockHeight, fetchMappingValue,
} from '../../lib/aleo';
import { getAllAttestations } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface OracleSlot {
  slot:       number;
  address:    string | null;
  slashCount: number;
}

interface PendingWallet {
  user_address:    string;
  wallet_age_days: number;
  repayments_made: number;
  defaults:        number;
  total_volume:    number;
  computed_score:  number;
  tier:            number;
  verified:        boolean;
}

const SLOT_LABELS = ['Oracle Alpha', 'Oracle Beta', 'Oracle Gamma'];

const ORACLE_KEYS = [
  { slot: 'Oracle Alpha', key: process.env.NEXT_PUBLIC_ORACLE_KEY_1!, addr: process.env.NEXT_PUBLIC_ORACLE_ADDR_1! },
  { slot: 'Oracle Beta',  key: process.env.NEXT_PUBLIC_ORACLE_KEY_2!, addr: process.env.NEXT_PUBLIC_ORACLE_ADDR_2! },
  { slot: 'Oracle Gamma', key: process.env.NEXT_PUBLIC_ORACLE_KEY_3!, addr: process.env.NEXT_PUBLIC_ORACLE_ADDR_3! },
];

export default function OraclePage() {
  const { wallet } = useStore();
  const { transactionStatus, connected, address, executeTransaction: executeHandler } = useWallet();

  const [slots,          setSlots]          = useState<OracleSlot[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [verified,       setVerified]       = useState<boolean | null>(null);
  const [checkAddr,      setCheckAddr]      = useState('');
  const [checking,       setChecking]       = useState(false);
  const [pendingWallets, setPendingWallets] = useState<PendingWallet[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [submittingFor,  setSubmittingFor]  = useState<string | null>(null);
  const [showKeys,       setShowKeys]       = useState(false);
  const [copiedKey,      setCopiedKey]      = useState<number | null>(null);

  async function loadSlots() {
    setLoading(true);
    const data = await fetchOracleSlots();
    setSlots(data);
    setLoading(false);
  }

  async function loadPendingWallets() {
    setLoadingPending(true);
    try {
      const rows = await getAllAttestations();
      // Cross-check each wallet against on-chain verified_inputs
      const withStatus = await Promise.all(
        rows.map(async (row) => {
          const val = await fetchMappingValue(PROGRAM_ID_ORACLE, 'verified_inputs', row.user_address);
          return {
            ...row,
            verified: val !== null && val !== '0field',
          };
        })
      );
      setPendingWallets(withStatus);
    } catch {
      setPendingWallets([]);
    } finally {
      setLoadingPending(false);
    }
  }

  async function checkVerification() {
    const addr = checkAddr || wallet.address;
    if (!addr) return;
    setChecking(true);
    const result = await fetchIsOracleVerified(addr);
    setVerified(result);
    setChecking(false);
  }

  async function handleAttest(pw: PendingWallet) {
    if (!connected) { toast.error('Connect the oracle wallet first'); return; }
    setSubmittingFor(pw.user_address);
    try {
      const curBlock = await getCurrentBlockHeight();
      if (!curBlock) { toast.error('Could not fetch block height'); return; }

      const commonInputs = [
        pw.user_address,
        `${pw.wallet_age_days}u32`,
        `${pw.repayments_made}u32`,
        `${pw.defaults}u32`,
        `${pw.total_volume}u64`,
        `${curBlock}u32`,
      ];

      toast.loading('Submitting slot 0…', { id: 'oracle-sub' });
      await executeTransaction({
        programId:    PROGRAM_ID_ORACLE,
        functionName: 'submit_attestation',
        inputs:       ['0u8', ...commonInputs],
      }, executeHandler, transactionStatus);

      toast.loading('Submitting slot 1…', { id: 'oracle-sub' });
      await executeTransaction({
        programId:    PROGRAM_ID_ORACLE,
        functionName: 'submit_attestation',
        inputs:       ['1u8', ...commonInputs],
      }, executeHandler, transactionStatus);

      toast.success(`Consensus reached — ${pw.user_address.slice(0, 14)}… can now mint their Credit Record.`, { id: 'oracle-sub' });
      // Mark as verified in local state
      setPendingWallets(prev => prev.map(w =>
        w.user_address === pw.user_address ? { ...w, verified: true } : w
      ));
    } catch (e: any) {
      toast.error(e.message ?? 'Attestation failed', { id: 'oracle-sub' });
    } finally {
      setSubmittingFor(null);
    }
  }

  useEffect(() => { loadSlots(); loadPendingWallets(); }, []);

  const activeOracles    = slots.filter(s => s.address && s.address.startsWith('aleo1')).length;
  const isOracleOperator = connected && slots.some(s => s.address === address);
  const pendingCount     = pendingWallets.filter(w => !w.verified).length;

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
          [0, 1, 2].map(i => <div key={i} className="glass rounded-2xl p-5 animate-pulse h-32" />)
        ) : (
          slots.map((slot) => {
            const isRegistered = !!slot.address && slot.address.startsWith('aleo1');
            const isSlashed    = slot.slashCount > 0;
            return (
              <div key={slot.slot} className="glass rounded-2xl p-5" style={{
                border: `1px solid ${isRegistered ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`,
              }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-zero-text">{SLOT_LABELS[slot.slot]}</span>
                  <div className="flex items-center gap-1.5">
                    {isRegistered
                      ? <CheckCircle   size={14} className="text-zero-green" />
                      : <AlertTriangle size={14} className="text-amber-400" />
                    }
                    <span className="text-xs" style={{ color: isRegistered ? '#10b981' : '#f59e0b' }}>
                      {isRegistered ? 'Active' : 'Not registered'}
                    </span>
                  </div>
                </div>

                {isRegistered && (
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

      
      {/* Judge / Demo Access */}
      <div className="rounded-2xl overflow-hidden" style={{
        border: '1px solid rgba(245,158,11,0.25)',
        background: 'rgba(245,158,11,0.03)',
      }}>
        <button
          onClick={() => setShowKeys(v => !v)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <KeyRound size={15} className="text-amber-400" />
            <div className="text-left">
              <p className="text-sm font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
                Judge / Demo Access
              </p>
              <p className="text-xs text-zero-text-dim">Import any oracle key into Leo Wallet to act as operator</p>
            </div>
          </div>
          {showKeys ? <ChevronUp size={15} className="text-zero-text-dim" /> : <ChevronDown size={15} className="text-zero-text-dim" />}
        </button>

        {showKeys && (
          <div className="px-6 pb-5 space-y-4" style={{ borderTop: '1px solid rgba(245,158,11,0.12)' }}>
            <div className="pt-4 p-3 rounded-xl text-xs text-zero-text-dim space-y-1"
              style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)' }}>
              <p className="font-semibold text-zero-cyan mb-1">How to import in Leo Wallet</p>
              <p>1. Open Leo Wallet → click your account avatar → Import Account</p>
              <p>2. Select "Private Key" and paste any key below</p>
              <p>3. Return here — the Oracle Operator panel unlocks automatically</p>
            </div>

            <div className="space-y-3">
              {ORACLE_KEYS.map(({ slot, key, addr }, i) => (
                <div key={i} className="rounded-xl p-4 space-y-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
                      {slot}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-mono"
                      style={{ background: 'rgba(124,58,237,0.12)', color: '#a855f7', border: '1px solid rgba(124,58,237,0.25)' }}>
                      Slot {i}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-zero-text-dim truncate">{addr}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono text-amber-300 bg-black/30 px-3 py-2 rounded-lg truncate">
                      {key}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(key);
                        setCopiedKey(i);
                        setTimeout(() => setCopiedKey(null), 1500);
                      }}
                      className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
                      style={{
                        background: copiedKey === i ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${copiedKey === i ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        color: copiedKey === i ? '#10b981' : '#94a3b8',
                      }}
                    >
                      {copiedKey === i
                        ? <><CheckCircle size={11} />Copied</>
                        : <><Copy size={11} />Copy</>
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Oracle Operator Panel */}
      <div className="glass rounded-2xl overflow-hidden" style={{
        border: '1px solid rgba(124,58,237,0.25)',
      }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(0,212,255,0.03))',
          borderBottom: '1px solid rgba(124,58,237,0.15)',
        }}>
          <div className="flex items-center gap-3">
            <Users size={16} className="text-violet-400" />
            <div>
              <h3 className="text-sm font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
                Oracle Operator Panel
              </h3>
              <p className="text-xs text-zero-text-dim">
                {isOracleOperator
                  ? 'Connected as oracle operator — you can submit attestations below.'
                  : 'Connect the registered oracle wallet to submit attestations.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                {pendingCount} pending
              </span>
            )}
            <button onClick={loadPendingWallets} disabled={loadingPending}
              className="text-xs text-zero-text-dim hover:text-zero-cyan transition-colors flex items-center gap-1">
              <RefreshCw size={12} className={loadingPending ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {!isOracleOperator && (
          <div className="px-6 py-4 flex items-center gap-3 text-xs text-zero-text-dim"
            style={{ background: 'rgba(245,158,11,0.04)', borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
            Connect the wallet registered in oracle slots (
            <span className="font-mono text-zero-cyan truncate max-w-[200px]">
              {slots.find(s => s.address?.startsWith('aleo1'))?.address ?? 'none registered'}
            </span>
            ) to unlock attestation.
          </div>
        )}

        {loadingPending ? (
          <div className="p-6 space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />)}
          </div>
        ) : pendingWallets.length === 0 ? (
          <div className="p-8 text-center text-zero-text-dim text-sm">
            No wallets have submitted credit data yet. Users must visit the Credit page first.
          </div>
        ) : (
          <div className="divide-y divide-zero-border/30">
            {pendingWallets.map((pw) => (
              <div key={pw.user_address} className="px-6 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-zero-text truncate">{pw.user_address}</p>
                  <p className="text-xs text-zero-text-dim mt-0.5">
                    Score {pw.computed_score} · T{pw.tier} · Age {pw.wallet_age_days}d · {pw.repayments_made} repaid · {pw.defaults} defaults · {(pw.total_volume / 1_000_000).toFixed(2)} ALEO vol
                  </p>
                </div>

                {pw.verified ? (
                  <div className="flex items-center gap-1.5 text-xs text-zero-green flex-shrink-0">
                    <CheckCircle size={13} />
                    Verified
                  </div>
                ) : (
                  <button
                    onClick={() => handleAttest(pw)}
                    disabled={!isOracleOperator || submittingFor === pw.user_address}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-40"
                    style={{
                      background: 'rgba(124,58,237,0.15)',
                      border: '1px solid rgba(124,58,237,0.3)',
                      color: '#a855f7',
                    }}
                  >
                    {submittingFor === pw.user_address
                      ? <><div className="zk-loader" style={{ width: 10, height: 10 }} />Attesting…</>
                      : <><Send size={11} />Attest</>
                    }
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
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
          <div className="flex items-center gap-3 rounded-xl p-4" style={{
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
