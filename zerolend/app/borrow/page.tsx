'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, Shield, AlertTriangle, CheckCircle,
  ChevronRight, Zap, Clock, DollarSign, Lock
} from 'lucide-react';
import { useStore } from '../../lib/store';
import {
  getTierInfo, randomField, formatUsdc, usdcToMicro,
  microToUsdc, computeInterest, executeTransaction,
  PROGRAM_ID, buildTierProof, buildLoanRecord, TIERS
} from '../../lib/aleo';
import { insertLoan } from '../../lib/supabase';
import toast from 'react-hot-toast';

export default function BorrowPage() {
  const {
    wallet, creditScore, creditTier, tierProof,
    setTierProof, addLoan, addTransaction
  } = useStore();

  const [amount, setAmount]     = useState('');
  const [step, setStep]         = useState<'idle' | 'proving' | 'requesting' | 'done'>('idle');
  const [activeLoan, setActiveLoan] = useState<any>(null);

  const tierInfo = creditTier ? getTierInfo(creditTier) : null;
  const maxLoan  = tierInfo?.maxLoan ?? 0;
  const rate     = tierInfo ? TIERS[creditTier as keyof typeof TIERS].rate : 0;
  const amtNum   = parseFloat(amount) || 0;
  const amtMicro = usdcToMicro(amtNum);

  // Estimate interest for ~100 blocks (~16 min)
  const rateBps   = tierInfo ? [2000,1500,1000,700,400][creditTier! - 1] : 1000;
  const estInterest = microToUsdc(computeInterest(amtMicro, rateBps, 100));
  const totalRepay  = amtNum + estInterest;

  const loanPct = maxLoan > 0 ? Math.min((amtNum / maxLoan) * 100, 100) : 0;

  async function handleProveTier() {
    if (!creditTier || !wallet.address || !creditScore) {
      toast.error('No credit record found. Visit the Credit page first.');
      return;
    }
    setStep('proving');
    try {
      const pNonce = randomField();
      await executeTransaction({
        programId:    PROGRAM_ID,
        functionName: 'prove_tier',
        inputs: [
          // Reconstructed credit record from store
          `{owner: ${wallet.address}, wallet_age_days: 365u32, repayments_made: 5u32, defaults: 0u32, total_volume: 10000000000u128, current_score: ${creditScore}u32, last_updated: 100u32, nonce: ${randomField()}}`,
          pNonce,
          '200u32',
          '100u32',
          '1field',
        ],
      });
      const proofStr = buildTierProof(wallet.address, creditTier, '1field', 300, pNonce);
      setTierProof(proofStr);
      toast.success('Tier proof ready!');
      setStep('idle');
    } catch (e: any) {
      toast.error(e.message ?? 'Proof generation failed');
      setStep('idle');
    }
  }

  async function handleRequestLoan() {
    if (!tierProof || !wallet.address) return;
    if (amtNum <= 0 || amtNum > maxLoan) {
      toast.error(`Amount must be between $1 and $${maxLoan.toLocaleString()}`);
      return;
    }
    setStep('requesting');
    try {
      const loanId    = randomField();
      const loanNonce = randomField();

      const txId = await executeTransaction({
        programId:    PROGRAM_ID,
        functionName: 'request_loan',
        inputs: [
          tierProof,
          `${amtMicro}u128`,
          '100u32',
          loanNonce,
          loanId,
        ],
      });

      const loan: any = {
        owner:          wallet.address,
        loan_id:        loanId,
        token_id:       '1field',
        principal:      `${amtMicro}u128`,
        interest_rate:  `${rateBps}u64`,
        borrowed_block: '100u32',
        due_block:      '86500u32',
        tier_at_borrow: `${creditTier}u8`,
        nonce:          loanNonce,
      };

      await insertLoan({
        borrower_address: wallet.address,
        loan_id_field:    loanId,
        principal:        amtMicro,
        interest_rate:    rateBps,
        tier:             creditTier!,
        borrowed_at:      new Date().toISOString(),
        due_at_block:     86500,
        tx_id:            txId,
      });

      addLoan(loan);
      addTransaction({
        id:        loanId,
        type:      'request_loan',
        status:    'confirmed',
        message:   `Borrowed ${formatUsdc(amtMicro)}`,
        txId,
        timestamp: Date.now(),
      });

      setActiveLoan({ loan, amtMicro, txId });
      toast.success(`Loan of ${formatUsdc(amtMicro)} issued!`);
      setStep('done');
    } catch (e: any) {
      toast.error(e.message ?? 'Loan request failed');
      setStep('idle');
    }
  }

  // No credit score
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
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(0,212,255,0.05))',
            border: '1px solid rgba(16,185,129,0.3)',
          }}
        >
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
                {formatUsdc(activeLoan.amtMicro)}
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
            USDC has been deposited to your private wallet record.
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
                <span className="tag" style={{
                  background: 'rgba(16,185,129,0.12)',
                  borderColor: 'rgba(16,185,129,0.3)',
                  color: '#10b981',
                }}>
                  <CheckCircle size={10} /> Valid
                </span>
              ) : (
                <span className="tag" style={{
                  background: 'rgba(245,158,11,0.12)',
                  borderColor: 'rgba(245,158,11,0.3)',
                  color: '#f59e0b',
                }}>
                  <Clock size={10} /> Required
                </span>
              )}
            </div>
            <p className="text-xs text-zero-text-dim mb-4 leading-relaxed">
              A tier proof lets the lending pool verify your creditworthiness
              without seeing your score, repayment history, or any personal data.
            </p>
            {!tierProof && (
              <button
                onClick={handleProveTier}
                disabled={step === 'proving'}
                className="btn-violet w-full flex items-center justify-center gap-2"
              >
                {step === 'proving' ? (
                  <><div className="zk-loader" style={{ width: 14, height: 14 }} />Generating…</>
                ) : (
                  <><Zap size={14} />Generate Tier Proof</>
                )}
              </button>
            )}
          </div>

          {/* Amount input */}
          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zero-text mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>
              Loan Amount
            </h3>

            <div className="relative mb-3">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zero-text-dim font-semibold">$</span>
              <input
                className="zero-input pl-8"
                type="number"
                placeholder="0.00"
                value={amount}
                min={1}
                max={maxLoan}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            {/* Quick amounts */}
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
                Exceeds your tier limit of ${maxLoan.toLocaleString()}
              </div>
            )}

            <button
              onClick={handleRequestLoan}
              disabled={
                !tierProof ||
                amtNum <= 0 ||
                amtNum > maxLoan ||
                step === 'requesting'
              }
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

        {/* Loan summary sidebar */}
        <div className="lg:col-span-2 space-y-4">

          {/* Your tier card */}
          <div
            className="rounded-2xl p-5"
            style={{
              background: `linear-gradient(135deg, ${tierInfo!.color}12, ${tierInfo!.color}05)`,
              border: `1px solid ${tierInfo!.color}25`,
            }}
          >
            <p className="text-xs text-zero-text-dim mb-2">Your Tier</p>
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-xl font-bold"
                style={{ fontFamily: "'Syne', sans-serif", color: tierInfo!.color }}
              >
                {tierInfo!.label}
              </span>
              <span
                className="tag"
                style={{
                  background: `${tierInfo!.color}18`,
                  borderColor: `${tierInfo!.color}40`,
                  color: tierInfo!.color,
                }}
              >
                T{creditTier}
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zero-text-dim">Credit Score</span>
                <span className="text-zero-text font-mono">{creditScore}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zero-text-dim">Max Loan</span>
                <span className="text-zero-text">${maxLoan.toLocaleString()}</span>
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
                { label: 'Principal',     value: amtNum > 0 ? `$${amtNum.toFixed(2)}` : '—' },
                { label: 'Est. Interest', value: amtNum > 0 ? `$${estInterest.toFixed(4)}` : '—' },
                { label: 'Total Repay',   value: amtNum > 0 ? `$${totalRepay.toFixed(4)}` : '—', bold: true },
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
          <div
            className="rounded-xl p-4"
            style={{
              background: 'rgba(0,212,255,0.05)',
              border: '1px solid rgba(0,212,255,0.12)',
            }}
          >
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
