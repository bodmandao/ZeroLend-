'use client';

import { useState, useEffect } from 'react';
import { Zap, AlertTriangle, CheckCircle, Info, TrendingUp, Clock, Lock } from 'lucide-react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useStore } from '../../lib/store';
import {
  microToAleo, aleoToMicro, randomField,
  executeTransaction, PROGRAM_ID, getCurrentBlockHeight,
  fetchPoolStats, fetchMappingValue,
} from '../../lib/aleo';
import toast from 'react-hot-toast';

const FLASH_FEE_BPS = 100; // 1%

async function fetchFlashStats() {
  try {
    const [feesRaw, countRaw] = await Promise.all([
      fetchMappingValue(PROGRAM_ID, 'flash_loan_fees',  '0u8'),
      fetchMappingValue(PROGRAM_ID, 'flash_loan_count', '0u8'),
    ]);
    return {
      fees:  parseInt(feesRaw?.replace('u64', '')  ?? '0') || 0,
      count: parseInt(countRaw?.replace('u32', '') ?? '0') || 0,
    };
  } catch { return { fees: 0, count: 0 }; }
}

export default function FlashLoanPage() {
  const { transactionStatus, requestRecords, decrypt, connected, address, executeTransaction: executeHandler } = useWallet();
  const { poolStats, setPoolStats } = useStore();

  const [amount,     setAmount]     = useState('');
  const [step,       setStep]       = useState<'idle' | 'executing' | 'done'>('idle');
  const [lastTxId,   setLastTxId]   = useState<string | null>(null);
  const [flashStats, setFlashStats] = useState({ fees: 0, count: 0 });

  useEffect(() => {
    if (!connected) return;
    Promise.all([
      fetchPoolStats().then(s => { if (s) setPoolStats(s); }),
      fetchFlashStats().then(s => setFlashStats(s)),
    ]);
  }, [connected]);

  const amtNum    = parseFloat(amount) || 0;
  const amtMicro  = aleoToMicro(amtNum);
  const feeMicro  = Math.max(1, Math.floor(amtMicro * FLASH_FEE_BPS / 10_000));
  const totalOwed = amtMicro + feeMicro;

  const poolAvailable = poolStats
    ? microToAleo(Math.max(0, poolStats.totalLiquidity - poolStats.totalBorrowed))
    : null;

  // ── Atomic flash loan ──────────────────────────────────────────
  // Contract: flash_loan(repayment: credits.aleo::credits, amount: u64, loan_nonce: field)
  // The ZK proof covers both repayment (private→pool) and disbursement
  // (pool→private) in the SAME transition. If the caller cannot produce
  // a record ≥ amount+fee, proof generation fails — pool is never at risk.
  async function handleFlashLoan() {
    if (!connected || !address) { toast.error('Connect wallet first'); return; }
    if (amtNum <= 0)             { toast.error('Enter an amount'); return; }
    if (poolAvailable !== null && amtNum > poolAvailable) {
      toast.error(`Exceeds pool liquidity (${poolAvailable.toLocaleString()} ALEO available)`);
      return;
    }
    setStep('executing');
    try {
      // 1. Fetch private credits records
      const creditRecords = await requestRecords?.('credits.aleo', false);
      const unspent = (creditRecords ?? [])
        .filter((r: any) => (r.owner === address || r.sender === address) && !r.spent)
        .sort((a: any, b: any) => {
          const parse = (r: any) => parseInt((r.data?.microcredits ?? '0').replace(/u64.*/, ''));
          return parse(b) - parse(a);
        });

      if (!unspent.length) {
        toast.error('No private credits records in wallet.');
        setStep('idle'); return;
      }

      // Pick smallest record that covers principal + fee
      const repayRecord = unspent.find((r: any) => {
        const bal = parseInt((r.data?.microcredits ?? '0').replace(/u64.*/, ''));
        return bal >= totalOwed;
      }) ?? unspent[0];

      const repayBal = parseInt(((repayRecord as any).data?.microcredits ?? '0').replace(/u64.*/, ''));
      if (repayBal < totalOwed) {
        toast.error(
          `Insufficient private balance. Need ${microToAleo(totalOwed).toFixed(4)} ALEO ` +
          `(loan + ${microToAleo(feeMicro).toFixed(6)} fee). ` +
          `Largest record: ${microToAleo(repayBal).toFixed(4)} ALEO.`
        );
        setStep('idle'); return;
      }

      // 2. Decrypt repayment record
      const decryptedRepayment = await decrypt?.((repayRecord as any).recordCiphertext);
      if (!decryptedRepayment) {
        toast.error('Could not decrypt repayment record');
        setStep('idle'); return;
      }

      // 3. Submit — repayment is input #1, atomically enforced by ZK
      const txId = await executeTransaction({
        programId:    PROGRAM_ID,
        functionName: 'flash_loan',
        inputs: [
          decryptedRepayment,  // credits record covering amount + fee
          `${amtMicro}u64`,    // loan principal
          randomField(),       // replay-prevention nullifier
        ],
        fee: 300_000,
      }, executeHandler, transactionStatus);

      setLastTxId(txId);
      await Promise.all([
        fetchPoolStats().then(s => { if (s) setPoolStats(s); }),
        fetchFlashStats().then(s => setFlashStats(s)),
      ]);
      toast.success(`Flash loan complete! Fee: ${microToAleo(feeMicro).toFixed(6)} ALEO`);
      setStep('done');
    } catch (e: any) {
      toast.error(e.message ?? 'Flash loan failed');
      setStep('idle');
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <Zap size={20} className="text-yellow-400" />
          </div>
          <h1 className="text-3xl font-bold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
            Flash Loans
          </h1>
        </div>
        <p className="text-zero-text-dim">
          Borrow and repay in a single atomic transition. Repayment is enforced by the ZK proof
          itself — the Aleo VM rejects the transaction if principal + fee is not returned.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Available',            value: poolAvailable !== null ? `${poolAvailable.toLocaleString()} ALEO` : '—', color: '#00d4ff' },
          { label: 'Flash Loans Executed', value: flashStats.count.toLocaleString(),                                        color: '#f59e0b' },
          { label: 'Fees Earned by Pool',  value: `${microToAleo(flashStats.fees).toFixed(4)} ALEO`,                       color: '#00ffcc' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass rounded-2xl p-4">
            <p className="text-xs text-zero-text-dim mb-2">{label}</p>
            <p className="text-xl font-bold" style={{ fontFamily: "'Syne', sans-serif", color }}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">

        {/* Form */}
        <div className="lg:col-span-3 space-y-4">

          <div className="rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Info size={13} className="text-yellow-400" />
              <span className="text-xs font-semibold text-yellow-400" style={{ fontFamily: "'Syne', sans-serif" }}>
                How Atomic Flash Loans Work on Aleo
              </span>
            </div>
            <div className="space-y-2 text-xs text-zero-text-dim">
              {[
                'You provide a private credits record covering principal + fee as a ZK proof input',
                'Both repayment (private→pool) and disbursement (pool→private) are in the SAME proof',
                'If your record is too small, proof generation fails — pool funds never leave safely',
                'Net cost to you is the fee only; you receive the loan amount as a new private record',
                'Use the loan in the same block: arbitrage, liquidations, collateral swaps',
              ].map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold mt-0.5"
                    style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}>{i + 1}</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zero-text mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>
              Flash Loan Amount
            </h3>

            <div className="relative mb-4">
              <input className="zero-input pr-16" type="number" placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zero-text-dim text-xs font-semibold">ALEO</span>
            </div>

            <div className="flex gap-2 mb-4">
              {[10, 50, 100, 500].map(v => (
                <button key={v} onClick={() => setAmount(String(v))}
                  className="flex-1 py-1.5 rounded-lg text-xs text-zero-text-dim hover:text-yellow-400 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1a2540' }}>
                  {v} ALEO
                </button>
              ))}
            </div>

            {amtNum > 0 && (
              <div className="mb-4 p-3 rounded-xl space-y-2 text-xs"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid #1a2540' }}>
                {[
                  { label: 'Loan amount',      value: `${amtNum.toFixed(4)} ALEO` },
                  { label: 'Flash fee (1%)',    value: `${microToAleo(feeMicro).toFixed(6)} ALEO`, color: '#f59e0b' as const },
                  { label: 'Wallet must hold', value: `${microToAleo(totalOwed).toFixed(4)} ALEO`, bold: true },
                  { label: 'Net cost to you',  value: `${microToAleo(feeMicro).toFixed(6)} ALEO`, color: '#ef4444' as const },
                ].map(({ label, value, color, bold }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-zero-text-dim">{label}</span>
                    <span className={`font-mono ${bold ? 'text-zero-cyan font-bold' : ''}`}
                      style={color ? { color } : {}}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {amtNum > 0 && (
              <div className="mb-4 flex items-start gap-2 text-xs text-zero-text-dim p-2 rounded-lg"
                style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)' }}>
                <Lock size={11} className="text-zero-cyan mt-0.5 flex-shrink-0" />
                Wallet needs {microToAleo(totalOwed).toFixed(4)} ALEO in a private record.
                The repayment record is consumed atomically in the same ZK proof.
              </div>
            )}

            {poolAvailable !== null && amtNum > poolAvailable && (
              <div className="flex items-center gap-2 text-xs mb-3 p-2 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                <AlertTriangle size={12} />
                Exceeds pool liquidity ({poolAvailable.toLocaleString()} ALEO available)
              </div>
            )}

            <button
              onClick={handleFlashLoan}
              disabled={!connected || amtNum <= 0 || step === 'executing' || step === 'done'
                || (poolAvailable !== null && amtNum > poolAvailable)}
              className="btn-primary w-full flex items-center justify-center gap-2"
              style={{ background: step === 'done' ? undefined : 'linear-gradient(135deg, #f59e0b, #ef4444)' }}
            >
              {step === 'executing' ? (
                <><div className="zk-loader" style={{ width: 14, height: 14 }} />Executing Atomic Flash Loan…</>
              ) : step === 'done' ? (
                <><CheckCircle size={14} className="text-zero-green" />Flash Loan Complete</>
              ) : (
                <><Zap size={14} />Execute Atomic Flash Loan</>
              )}
            </button>

            {lastTxId && (
              <>
                <div className="mt-3 p-3 rounded-xl"
                  style={{ background: 'rgba(0,255,204,0.06)', border: '1px solid rgba(0,255,204,0.15)' }}>
                  <p className="text-xs text-zero-text-dim mb-1">Transaction</p>
                  <a href={`https://explorer.provable.com/transaction/${lastTxId}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-zero-cyan hover:underline break-all">
                    {lastTxId}
                  </a>
                </div>
                <button onClick={() => { setStep('idle'); setAmount(''); setLastTxId(null); }}
                  className="btn-ghost w-full mt-2 text-sm">
                  New Flash Loan
                </button>
              </>
            )}
          </div>
        </div>

        {/* Info panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zero-text mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>
              Use Cases
            </h3>
            <div className="space-y-3">
              {[
                { icon: TrendingUp, title: 'Arbitrage',        desc: 'Exploit price differences across DEXes. No starting capital needed, just the 1% fee.' },
                { icon: Zap,        title: 'Self-Liquidation', desc: 'Repay your own loan and reclaim your position in a single transaction.' },
                { icon: Clock,      title: 'Collateral Swap',  desc: 'Swap between collateral types without closing your position.' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5"
                    style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <Icon size={13} className="text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zero-text mb-0.5">{title}</p>
                    <p className="text-xs text-zero-text-dim leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-4"
            style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
            <p className="text-xs font-semibold text-zero-green mb-2">Soundness Guarantee</p>
            <p className="text-xs text-zero-text-dim leading-relaxed">
              Repayment is a ZK proof input, not an on-chain assertion checked after funds leave.
              If principal + fee is not provided the snark cannot be generated and the transaction
              is rejected before touching the chain. Pool bears zero risk.
            </p>
          </div>

          <div className="rounded-xl p-4"
            style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.12)' }}>
            <p className="text-xs font-semibold text-zero-cyan mb-2">Privacy Guarantee</p>
            <p className="text-xs text-zero-text-dim leading-relaxed">
              Loan amounts and repayment records are private. The pool only observes it gained
              the fee. Your arbitrage strategy stays yours alone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
