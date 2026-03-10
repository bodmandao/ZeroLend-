'use client';

import { useState } from 'react';
import {
  Wallet, TrendingUp, Plus, Minus,
  CheckCircle, Lock, BarChart2, ArrowUpRight
} from 'lucide-react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useStore } from '../../lib/store';
import {
  formatAleo, aleoToMicro, microToAleo, randomField,
  computeInterest, executeTransaction, PROGRAM_ID,
  buildCreditsRecord, buildLenderDeposit
} from '../../lib/aleo';
import { insertDeposit } from '../../lib/supabase';
import toast from 'react-hot-toast';

// Lenders earn at Tier 3 rate (10% APR)
const LENDER_RATE_BPS = 1000;

export default function LendPage() {
  const { wallet: walletAdapter } = useWallet();
  const { wallet, deposits, addDeposit, poolStats } = useStore();

  const [depositAmt, setDepositAmt] = useState('');
  const [tab, setTab]               = useState<'deposit' | 'withdraw'>('deposit');
  const [step, setStep]             = useState<'idle' | 'processing' | 'done'>('idle');

  const amtNum   = parseFloat(depositAmt) || 0;  // ALEO
  const amtMicro = aleoToMicro(amtNum);           // microcredits u64

  // Estimate annual yield (ALEO)
  const estYearlyYield = microToAleo(
    computeInterest(amtMicro, LENDER_RATE_BPS, 3_153_600) // ~1yr in blocks
  );

  const utilization    = poolStats?.utilizationRate ?? 0;
  const totalLiquidity = poolStats ? microToAleo(poolStats.totalLiquidity) : 0;
  const totalBorrowed  = poolStats ? microToAleo(poolStats.totalBorrowed)  : 0;

  // ── Deposit ──────────────────────────────────────────────────
  async function handleDeposit() {
    if (!wallet.connected || !wallet.address) {
      toast.error('Connect your wallet first');
      return;
    }
    if (amtNum <= 0) {
      toast.error('Enter a deposit amount');
      return;
    }
    if (!wallet.creditsRecord) {
      toast.error('No credits record found in wallet');
      return;
    }
    setStep('processing');
    try {
      const nonce      = randomField();
      const currentBlk = 100; // replace with live block in prod

      const txId = await executeTransaction({
        programId:    PROGRAM_ID,
        functionName: 'deposit',
        inputs: [
          wallet.creditsRecord,   // credits.aleo/credits from user wallet
          `${amtMicro}u64`,      
          `${currentBlk}u32`,
          nonce,
        ],
      }, walletAdapter);

      const depositRecord: any = {
        owner:            wallet.address,
        deposited_amount: `${amtMicro}u64`,
        deposit_block:    `${currentBlk}u32`,
        nonce,
      };

      await insertDeposit({
        lender_address: wallet.address,
        amount:         amtMicro,
        deposit_block:  currentBlk,
        deposit_nonce:  nonce,
        tx_id:          txId,
      });

      addDeposit(depositRecord);
      toast.success(`Deposited ${formatAleo(amtMicro)} to the pool!`);
      setDepositAmt('');
      setStep('done');
      setTimeout(() => setStep('idle'), 2000);
    } catch (e: any) {
      toast.error(e.message ?? 'Deposit failed');
      setStep('idle');
    }
  }

  // ── Withdraw ─────────────────────────────────────────────────
  async function handleWithdraw(deposit: any) {
    if (!wallet.address) return;
    if (!wallet.poolCreditsRecord) {
      toast.error('Pool credits record not available');
      return;
    }
    setStep('processing');
    try {
      // Parse u64 string — strip suffix if present
      const depAmt     = parseInt(String(deposit.deposited_amount));
      const depBlock   = parseInt(String(deposit.deposit_block));
      const currentBlk = 10100; // replace with live block in prod

      const txId = await executeTransaction({
        programId:    PROGRAM_ID,
        functionName: 'withdraw',
        inputs: [
          wallet.poolCreditsRecord,   // pool's credits.aleo/credits record
          buildLenderDeposit(wallet.address, depAmt, depBlock, deposit.nonce),
          `${currentBlk}u32`,
        ],
      }, walletAdapter);

      toast.success(`Withdrawn ${formatAleo(depAmt)} + yield!`);
      setStep('idle');
    } catch (e: any) {
      toast.error(e.message ?? 'Withdrawal failed');
      setStep('idle');
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zero-text mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
          Lend & Earn
        </h1>
        <p className="text-zero-text-dim">
          Deposit ALEO to earn yield from borrower interest. Pool solvency is always publicly provable.
        </p>
      </div>

      {/* Pool overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Pool Liquidity',
            value: `${totalLiquidity.toLocaleString()} ALEO`,
            icon:  Wallet,
            color: '#00d4ff',
          },
          {
            label: 'Total Borrowed',
            value: `${totalBorrowed.toLocaleString()} ALEO`,
            icon:  TrendingUp,
            color: '#a855f7',
          },
          {
            label: 'Utilization',
            value: `${utilization}%`,
            icon:  BarChart2,
            color: utilization > 80 ? '#ef4444' : '#10b981',
          },
          {
            label: 'Est. APY',
            value: `${(LENDER_RATE_BPS / 100).toFixed(1)}%`,
            icon:  ArrowUpRight,
            color: '#00ffcc',
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                <Icon size={14} style={{ color }} />
              </div>
              <p className="text-xs text-zero-text-dim">{label}</p>
            </div>
            <p className="text-xl font-bold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">

        {/* Form */}
        <div className="lg:col-span-3">
          <div className="glass rounded-2xl overflow-hidden">

            {/* Tabs */}
            <div className="flex border-b border-zero-border/50">
              {(['deposit', 'withdraw'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 py-4 text-sm font-semibold capitalize transition-all"
                  style={{
                    fontFamily:   "'Syne', sans-serif",
                    color:        tab === t ? '#00d4ff' : '#6b7fa3',
                    background:   tab === t ? 'rgba(0,212,255,0.06)' : 'transparent',
                    borderBottom: tab === t ? '2px solid #00d4ff' : '2px solid transparent',
                  }}
                >
                  {t === 'deposit'
                    ? <><Plus size={14} className="inline mr-1" />deposit</>
                    : <><Minus size={14} className="inline mr-1" />withdraw</>
                  }
                </button>
              ))}
            </div>

            <div className="p-6">
              {tab === 'deposit' ? (
                <>
                  <div className="mb-5">
                    <label className="block text-xs text-zero-text-dim mb-2">
                      Deposit Amount (ALEO)
                    </label>
                    <div className="relative">
                      <input
                        className="zero-input pr-16"
                        type="number"
                        placeholder="0.00"
                        value={depositAmt}
                        onChange={(e) => setDepositAmt(e.target.value)}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zero-text-dim text-xs font-semibold">
                        ALEO
                      </span>
                    </div>
                  </div>

                  {/* Quick amounts */}
                  <div className="flex gap-2 mb-5">
                    {[10, 50, 100, 500].map((v) => (
                      <button
                        key={v}
                        onClick={() => setDepositAmt(String(v))}
                        className="flex-1 py-1.5 rounded-lg text-xs text-zero-text-dim hover:text-zero-cyan transition-all"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1a2540' }}
                      >
                        {v} ALEO
                      </button>
                    ))}
                  </div>

                  {/* Yield preview */}
                  {amtNum > 0 && (
                    <div className="mb-5 p-4 rounded-xl" style={{
                      background: 'rgba(0,255,204,0.06)',
                      border:     '1px solid rgba(0,255,204,0.15)',
                    }}>
                      <p className="text-xs text-zero-text-dim mb-2">Estimated Returns</p>
                      <div className="space-y-1.5 text-xs">
                        {[
                          { label: 'Daily yield',   val: (amtNum * (LENDER_RATE_BPS / 100 / 100) / 365).toFixed(6) },
                          { label: 'Monthly yield', val: (amtNum * (LENDER_RATE_BPS / 100 / 100) / 12).toFixed(4)  },
                        ].map(({ label, val }) => (
                          <div key={label} className="flex justify-between">
                            <span className="text-zero-text-dim">{label}</span>
                            <span className="font-mono text-zero-teal">{val} ALEO</span>
                          </div>
                        ))}
                        <div className="flex justify-between border-t border-zero-border/30 pt-1.5">
                          <span className="text-zero-text-dim">Annual yield</span>
                          <span className="font-mono text-zero-teal font-bold">
                            {estYearlyYield.toFixed(4)} ALEO
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleDeposit}
                    disabled={!wallet.connected || amtNum <= 0 || step === 'processing'}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {step === 'processing' ? (
                      <><div className="zk-loader" style={{ width: 14, height: 14 }} />Processing…</>
                    ) : step === 'done' ? (
                      <><CheckCircle size={14} className="text-zero-green" />Deposited!</>
                    ) : (
                      <><Plus size={14} />Deposit ALEO</>
                    )}
                  </button>
                </>
              ) : (
                /* Withdraw tab */
                <div>
                  {deposits.length === 0 ? (
                    <div className="text-center py-12 text-zero-text-dim">
                      <Wallet size={32} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No active deposits</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {deposits.map((dep, i) => {
                        const principal = parseInt(String(dep.deposited_amount)) || 0;
                        const estYield  = microToAleo(computeInterest(principal, LENDER_RATE_BPS, 10000));
                        return (
                          <div key={i} className="rounded-xl p-4 flex items-center justify-between"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1a2540' }}>
                            <div>
                              <p className="text-sm font-bold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
                                {formatAleo(principal)}
                              </p>
                              <p className="text-xs text-zero-text-dim mt-0.5">
                                Est. yield: {estYield.toFixed(6)} ALEO
                              </p>
                            </div>
                            <button
                              onClick={() => handleWithdraw(dep)}
                              disabled={step === 'processing'}
                              className="btn-ghost text-xs px-4 py-2"
                            >
                              Withdraw
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info panel */}
        <div className="lg:col-span-2 space-y-4">

          {/* How it works */}
          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zero-text mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>
              How Lending Works
            </h3>
            <div className="space-y-3">
              {[
                { s: '1', text: 'Deposit ALEO credits to the private lending pool' },
                { s: '2', text: 'Borrowers draw from the pool using ZK credit proofs' },
                { s: '3', text: 'Interest accumulates in the pool over time' },
                { s: '4', text: 'Withdraw your principal + pro-rata yield anytime' },
              ].map(({ s, text }) => (
                <div key={s} className="flex items-start gap-3 text-xs">
                  <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                    style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff', fontFamily: "'Syne', sans-serif" }}>
                    {s}
                  </span>
                  <span className="text-zero-text-dim leading-relaxed">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Private deposits note */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.12)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Lock size={12} className="text-zero-cyan" />
              <span className="text-xs font-semibold text-zero-cyan" style={{ fontFamily: "'Syne', sans-serif" }}>
                Private Deposits
              </span>
            </div>
            <p className="text-xs text-zero-text-dim leading-relaxed">
              Your deposit is stored as a private <code className="text-zero-cyan/70">credits.aleo/credits</code> record.
              Only you can see your balance. Pool solvency is publicly verifiable on-chain at any time.
            </p>
          </div>

          {/* Solvency */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zero-green" style={{ fontFamily: "'Syne', sans-serif" }}>
                Solvency Status
              </span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-zero-green animate-pulse" />
                <span className="text-xs text-zero-green">Verified</span>
              </div>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-zero-text-dim">Utilization</span>
                <span className={`font-mono ${utilization > 80 ? 'text-zero-red' : 'text-zero-green'}`}>
                  {utilization}%
                </span>
              </div>
              <div className="progress-bar mt-1">
                <div className="progress-fill" style={{
                  width: `${utilization}%`,
                  background: utilization > 80
                    ? 'linear-gradient(90deg, #ef4444, #f97316)'
                    : 'linear-gradient(90deg, #10b981, #00ffcc)',
                }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}