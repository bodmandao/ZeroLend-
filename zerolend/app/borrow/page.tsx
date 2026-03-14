'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  TrendingUp, Shield, AlertTriangle, CheckCircle,
  ChevronRight, Zap, Clock, DollarSign, Lock, RefreshCw
} from 'lucide-react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useStore } from '../../lib/store';
import {
  getTierInfo, randomField, formatAleo, aleoToMicro,
  microToAleo, computeInterest, executeTransaction,
  PROGRAM_ID, TIERS, getCurrentBlockHeight,
  waitForRecordCiphertext, fetchPoolStats,
} from '../../lib/aleo';
import { insertLoan } from '../../lib/supabase';
import toast from 'react-hot-toast';

export default function BorrowPage() {
  const { transactionStatus, decrypt, requestRecords, connected, address, executeTransaction: executeHandler } = useWallet();
  const {
    wallet, creditScore, creditTier, tierProof,
    addLoan, addTransaction, poolStats, setPoolStats,
  } = useStore();

  const [amount, setAmount]         = useState('');
  const [step, setStep]             = useState<'idle' | 'requesting' | 'done'>('idle');
  const [activeLoan, setActiveLoan] = useState<any>(null);

  // Fetch pool stats when connected so we can cap borrow amount
  useEffect(() => {
    if (!connected) return;
    fetchPoolStats().then(stats => { if (stats) setPoolStats(stats); });
  }, [connected]);

  const tierInfo       = creditTier ? getTierInfo(creditTier) : null;
  const tierMaxLoan    = tierInfo?.maxLoan ?? 0;   // tier-based limit in ALEO
  const poolAvailable  = poolStats
    ? microToAleo(Math.max(0, poolStats.totalLiquidity - poolStats.totalBorrowed))
    : null;
  // Effective max = min(tier limit, available pool liquidity)
  const maxLoan        = poolAvailable !== null
    ? Math.min(tierMaxLoan, poolAvailable)
    : tierMaxLoan;
  const rate      = tierInfo ? TIERS[creditTier as keyof typeof TIERS].rate : 0;
  const amtNum    = parseFloat(amount) || 0;           // in ALEO
  const amtMicro  = aleoToMicro(amtNum);               // microcredits u64

  // Estimate interest for ~100 blocks (~16 min at 10s/block)
  const rateBps     = tierInfo ? [2000, 1500, 1000, 700, 400][creditTier! - 1] : 1000;
  const estInterest = microToAleo(computeInterest(amtMicro, rateBps, 100));
  const totalRepay  = amtNum + estInterest;

  const loanPct = maxLoan > 0 ? Math.min((amtNum / maxLoan) * 100, 100) : 0;


  // ── Request loan ─────────────────────────────────────────────
  async function handleRequestLoan() {
    if (!tierProof || !address) return;
    if (amtNum <= 0 || amtNum > maxLoan) {
      toast.error(`Amount must be between 0.01 and ${maxLoan.toLocaleString()} ALEO`);
      return;
    }
    setStep('requesting');
    try {
      const loanId     = randomField();
      const loanNonce  = randomField();
      const currentBlk = await getCurrentBlockHeight();

      const txId = await executeTransaction({
        programId:   PROGRAM_ID,
        functionName:  'request_loan',
        inputs: [
          tierProof,
          `${amtMicro}u64`,
          `${currentBlk}u32`,
          loanNonce,
          loanId,
        ],
      }, executeHandler, transactionStatus);

      // Build local loan record (no token_id, u64 principal)
      // Fetch decrypted LoanRecord from the tx for store
      const loanCipher = await waitForRecordCiphertext(txId);
      const loanRecord = loanCipher && decrypt ? await decrypt(loanCipher) : null;
      const loan: any = loanRecord ?? {
        owner:          address,
        loan_id:        loanId,
        principal:      `${amtMicro}u64`,
        interest_rate:  `${rateBps}u64`,
        borrowed_block: `${currentBlk}u32`,
        due_block:      `${currentBlk + 86400}u32`,
        tier_at_borrow: `${creditTier}u8`,
        nonce:          loanNonce,
      };

      await insertLoan({
        borrower_address: address,
        loan_id_field:    loanId,
        principal:        amtMicro,
        interest_rate:    rateBps,
        tier:             creditTier!,
        borrowed_at:      new Date().toISOString(),
        due_at_block:     currentBlk + 86400,
        tx_id:            txId,
      });

      addLoan(loan);
      addTransaction({
        id:        loanId,
        type:      'request_loan',
        status:    'confirmed',
        message:   `Borrowed ${formatAleo(amtMicro)}`,
        txId,
        timestamp: Date.now(),
      });

      setActiveLoan({ loan, amtMicro, txId });
      toast.success(`Loan of ${formatAleo(amtMicro)} issued!`);
      setStep('done');
    } catch (e: any) {
      toast.error(e.message ?? 'Loan request failed');
      setStep('idle');
    }
  }

  // ── No credit / not connected guard ─────────────────────────
  if (!connected || !address) {
    return (
      <div className="p-6 max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)' }}>
          <Shield size={28} className="text-zero-cyan" />
        </div>
        <h2 className="text-2xl font-bold text-zero-text mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
          Connect Your Wallet
        </h2>
        <p className="text-zero-text-dim mb-6">Connect your wallet to access borrowing.</p>
      </div>
    );
  }

  if (!creditScore || !creditTier) {
    return (
      <div className="p-6 max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
          <Shield size={28} className="text-violet-400" />
        </div>
        <h2 className="text-2xl font-bold text-zero-text mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
          No Credit Score Found
        </h2>
        <p className="text-zero-text-dim mb-6">You need a ZK credit record before borrowing.</p>
        <Link href="/credit" className="btn-primary flex items-center gap-2">
          Get Credit Score <ChevronRight size={16} />
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zero-text mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
          Borrow
        </h1>
        <p className="text-zero-text-dim">
          No collateral needed. Your ZK proof unlocks credit.
        </p>
      </div>

      {/* Success state */}
      {step === 'done' && activeLoan && (
        <div className="rounded-2xl p-6" style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(0,212,255,0.05))',
          border: '1px solid rgba(16,185,129,0.3)',
        }}>
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle size={24} className="text-zero-green" />
            <h3 className="text-lg font-bold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
              Loan Issued!
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-zero-text-dim text-xs mb-1">Amount</p>
              <p className="text-zero-text font-bold" style={{ fontFamily: "'Syne', sans-serif" }}>
                {formatAleo(activeLoan.amtMicro)}
              </p>
            </div>
            <div>
              <p className="text-zero-text-dim text-xs mb-1">Due Block</p>
              <p className="text-zero-text font-bold font-mono">86,500</p>
            </div>
            <div>
              <p className="text-zero-text-dim text-xs mb-1">Tx ID</p>
              <p className="text-zero-cyan font-mono text-xs truncate">{activeLoan.txId}</p>
            </div>
          </div>
          <p className="text-xs text-zero-text-dim mt-3">
            ALEO credits have been deposited to your private wallet record.
            Your loan details are visible only to you.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">

        {/* Loan form */}
        <div className="lg:col-span-3 space-y-5">

          {/* Tier proof status */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
                ZK Tier Proof
              </h3>
              {tierProof ? (
                <span className="tag" style={{ background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.3)', color: '#10b981' }}>
                  <CheckCircle size={10} /> Valid
                </span>
              ) : (
                <span className="tag" style={{ background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                  <Clock size={10} /> Required
                </span>
              )}
            </div>
            {tierProof ? (
              <p className="text-xs leading-relaxed" style={{ color: '#10b981' }}>
                Tier proof ready — your creditworthiness is verified. No raw data exposed.
              </p>
            ) : (
              <>
                <p className="text-xs text-zero-text-dim mb-3 leading-relaxed">
                  Generate your tier proof on the Credit page first. It proves your
                  creditworthiness to the pool without revealing any personal data.
                </p>
                <Link href="/credit" className="btn-violet w-full flex items-center justify-center gap-2 text-sm">
                  <Zap size={14} />Go to Credit Page
                </Link>
              </>
            )}
          </div>

          {/* Amount input */}
          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zero-text mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>
              Loan Amount
            </h3>

            <div className="relative mb-3">
              <input
                className="zero-input pr-16"
                type="number"
                placeholder="0.00"
                value={amount}
                min={0.01}
                max={maxLoan}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zero-text-dim text-xs font-semibold">
                ALEO
              </span>
            </div>

            {/* Quick % buttons */}
            <div className="flex gap-2 mb-4">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setAmount(String(Math.floor(maxLoan * pct / 100)))}
                  className="flex-1 py-1.5 rounded-lg text-xs text-zero-text-dim hover:text-zero-cyan transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1a2540' }}
                >
                  {pct}%
                </button>
              ))}
            </div>

            {/* Utilization bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-zero-text-dim mb-1">
                <span>Loan utilization</span>
                <span>{loanPct.toFixed(0)}% of limit</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${loanPct}%`,
                    background: loanPct > 90
                      ? 'linear-gradient(90deg, #ef4444, #f97316)'
                      : 'linear-gradient(90deg, #00d4ff, #00ffcc)',
                  }}
                />
              </div>
            </div>

            {amtNum > maxLoan && (
              <div className="flex items-center gap-2 text-xs text-zero-red mb-3 p-2 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertTriangle size={12} />
                {poolAvailable !== null && amtNum > poolAvailable
                  ? `Exceeds available pool liquidity (${poolAvailable.toLocaleString()} ALEO)`
                  : `Exceeds your tier limit of ${tierMaxLoan.toLocaleString()} ALEO`
                }
              </div>
            )}

            {poolAvailable !== null && poolAvailable === 0 && (
              <div className="flex items-center gap-2 text-xs text-yellow-400 mb-3 p-2 rounded-lg"
                style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>
                <AlertTriangle size={12} />
                Pool is currently empty — no funds available to borrow
              </div>
            )}

            <button
              onClick={handleRequestLoan}
              disabled={!tierProof || amtNum <= 0 || amtNum > maxLoan || step === 'requesting'}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {step === 'requesting' ? (
                <><div className="zk-loader" style={{ width: 14, height: 14 }} />Processing…</>
              ) : (
                <><DollarSign size={14} />Request Loan</>
              )}
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-2 space-y-4">

          {/* Tier card */}
          <div className="rounded-2xl p-5" style={{
            background: `linear-gradient(135deg, ${tierInfo!.color}12, ${tierInfo!.color}05)`,
            border: `1px solid ${tierInfo!.color}25`,
          }}>
            <p className="text-xs text-zero-text-dim mb-2">Your Tier</p>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xl font-bold" style={{ fontFamily: "'Syne', sans-serif", color: tierInfo!.color }}>
                {tierInfo!.label}
              </span>
              <span className="tag" style={{ background: `${tierInfo!.color}18`, borderColor: `${tierInfo!.color}40`, color: tierInfo!.color }}>
                T{creditTier}
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zero-text-dim">Credit Score</span>
                <span className="text-zero-text font-mono">{creditScore}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zero-text-dim">Tier Max Loan</span>
                <span className="text-zero-text">{tierMaxLoan.toLocaleString()} ALEO</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zero-text-dim">Pool Available</span>
                <span className={`font-mono ${poolAvailable !== null && poolAvailable < tierMaxLoan ? 'text-yellow-400' : 'text-zero-text'}`}>
                  {poolAvailable !== null ? `${poolAvailable.toLocaleString()} ALEO` : '—'}
                </span>
              </div>
              <div className="flex justify-between border-t border-zero-border/30 pt-2">
                <span className="text-zero-text-dim font-semibold">Your Max</span>
                <span className="text-zero-cyan font-bold font-mono">{maxLoan.toLocaleString()} ALEO</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zero-text-dim">Interest Rate</span>
                <span className="text-zero-text">{rate}% APR</span>
              </div>
            </div>
          </div>

          {/* Repayment estimate */}
          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zero-text mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>
              Repayment Estimate
            </h3>
            <div className="space-y-3 text-xs">
              {[
                { label: 'Principal',     value: amtNum > 0 ? `${amtNum.toFixed(4)} ALEO` : '—' },
                { label: 'Est. Interest', value: amtNum > 0 ? `${estInterest.toFixed(6)} ALEO` : '—' },
                { label: 'Total Repay',   value: amtNum > 0 ? `${totalRepay.toFixed(4)} ALEO` : '—', bold: true },
              ].map(({ label, value, bold }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-zero-text-dim">{label}</span>
                  <span className={`font-mono ${bold ? 'text-zero-cyan font-bold' : 'text-zero-text'}`}>
                    {value}
                  </span>
                </div>
              ))}
              <div className="border-t border-zero-border/30 pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-zero-text-dim">Loan Term</span>
                  <span className="text-zero-text">
                    {[2, 5, 10, 20, 30][(creditTier ?? 1) - 1]} days
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy note */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.12)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Lock size={12} className="text-zero-cyan" />
              <span className="text-xs font-semibold text-zero-cyan" style={{ fontFamily: "'Syne', sans-serif" }}>
                Privacy Guarantee
              </span>
            </div>
            <p className="text-xs text-zero-text-dim leading-relaxed">
              Your loan amount, repayment history, and credit data are never
              visible on-chain. The pool only verifies your tier proof.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}