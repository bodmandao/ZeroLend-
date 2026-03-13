'use client';

import { useState, useEffect } from 'react';
import {
  ShieldCheck, Shield, Zap,
  Eye, EyeOff, CheckCircle, Loader2, Info
} from 'lucide-react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useStore } from '../../lib/store';
import {
  computeCreditScore, scoreToTier, getTierInfo,
  randomField, executeTransaction, PROGRAM_ID,
  buildOracleAttestation, aleoToMicro, microToAleo,
  getCurrentBlockHeight
} from '../../lib/aleo';
import {
  insertAttestation, markAttestationRedeemed,
  getUserLoanHistory
} from '../../lib/supabase';
import toast from 'react-hot-toast';

// ── Wallet age helper ─────────────────────────────────────────
const PROVABLE_API = 'https://api.provable.com/v2';

// Poll oracle server directly — avoids Next.js/Codespace proxy timeouts on GET

async function fetchWalletAgeDays(address: string): Promise<number> {
  try {
    let cursor: string | null = null;
    let oldestTimestamp: number | null = null;

    for (let page = 0; page < 10; page++) {
      const base = `${PROVABLE_API}/testnet/transactions/address/${address}`;
      const url  = cursor ? `${base}?cursor=${cursor}` : base;

      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) break;

      const data = await res.json();
      const txs: any[] = data?.transactions ?? [];
      if (txs.length === 0) break;

      const lastTx = txs[txs.length - 1];
      const ts = parseInt(lastTx?.block_timestamp ?? '0');
      if (ts > 0) oldestTimestamp = ts;

      const nextCursor = data?.next_cursor;
      if (!nextCursor?.transition_id) break;
      cursor = nextCursor.transition_id;
    }

    if (!oldestTimestamp) return 0;
    const ageMs = Date.now() - oldestTimestamp * 1000;
    return Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
}

export default function CreditPage() {
  const { transactionStatus, requestRecords, decrypt, connected, address, executeTransaction: executeHandler } = useWallet();
  const {
    wallet, creditScore, creditTier, creditRecord,
    setCreditRecord, setTierProof
  } = useStore();

  const [form, setForm] = useState({
    walletAgeDays:  '',
    repaymentsMade: '',
    defaults:       '',
    totalVolume:    '',
  });

  const [prefilling, setPrefilling]       = useState(false);
  const [prefillDone, setPrefillDone]     = useState(false);
  const [prefillSource, setPrefillSource] = useState<Record<string, 'chain' | 'supabase' | 'new'>>({});
  const [step, setStep]                   = useState<'idle' | 'attesting' | 'proving' | 'done'>('idle');
  const [showRawData, setShowRawData]     = useState(false);
  const [attestation, setAttestation]     = useState<any>(null);
  const [proofExpiry, setProofExpiry]     = useState('200');

  // ── Auto-prefill when wallet connects ────────────────────────
  useEffect(() => {
    if (!connected || !address || prefillDone) return;
    prefillForm(address);
  }, [connected, address]);

  // Auto-detect existing CreditRecord in wallet — skip Step 1 for returning users
  useEffect(() => {
    if (!connected || !requestRecords || !decrypt || creditScore !== null) return;
    (async () => {
      try {
        const records = await requestRecords(PROGRAM_ID, false);
        const existing = records?.find((r: any) => {
          const isOwner  = r.owner === address || r.sender === address;
          return isOwner && r.recordName === 'CreditRecord' && !r.spent;
        });
        if (!existing) return;
        const decrypted = await decrypt((existing as any).recordCiphertext);
        if (!decrypted) return;
        const parseField = (str: string, key: string) =>
          str.match(new RegExp(`${key}:\\s*([^,}]+)`))?.[1]?.trim() ?? '';
        const score = parseInt(parseField(decrypted, 'current_score')) || 0;
        const tier  = scoreToTier(score);
        setCreditRecord({
          owner:           address!,
          wallet_age_days: parseField(decrypted, 'wallet_age_days'),
          repayments_made: parseField(decrypted, 'repayments_made'),
          defaults:        parseField(decrypted, 'defaults'),
          total_volume:    parseField(decrypted, 'total_volume'),
          current_score:   parseField(decrypted, 'current_score'),
          last_updated:    parseField(decrypted, 'last_updated'),
          nonce:           parseField(decrypted, 'nonce'),
        }, score, tier);
        setStep('done');
        toast('Existing credit record found in your wallet.', { icon: '✅' });
      } catch { /* wallet not ready yet */ }
    })();
  }, [connected, requestRecords, decrypt]);

  async function prefillForm(addr: string) {
    setPrefilling(true);
    try {
      const [ageDays, history] = await Promise.all([
        fetchWalletAgeDays(addr),
        getUserLoanHistory(addr),
      ]);

      const sources: Record<string, 'chain' | 'supabase' | 'new'> = {
        walletAgeDays:  ageDays > 0                          ? 'chain'    : 'new',
        repaymentsMade: history.repaidCount > 0              ? 'supabase' : 'new',
        defaults:       history.liquidatedCount > 0          ? 'supabase' : 'new',
        totalVolume:    history.totalRepaidVolumeMicro > 0   ? 'supabase' : 'new',
      };

      setForm({
        walletAgeDays:  String(ageDays),
        repaymentsMade: String(history.repaidCount),
        defaults:       String(history.liquidatedCount),
        totalVolume:    String(microToAleo(history.totalRepaidVolumeMicro)),
      });

      setPrefillSource(sources);
      setPrefillDone(true);

      const isNew = history.repaidCount === 0 && ageDays === 0;
      if (isNew) {
        toast('New wallet detected — starting with a clean slate.', { icon: '👋' });
      } else {
        toast.success('Credit history loaded from chain + ZeroLend records.');
      }
    } catch {
      setForm({ walletAgeDays: '0', repaymentsMade: '0', defaults: '0', totalVolume: '0' });
      setPrefillDone(true);
    } finally {
      setPrefilling(false);
    }
  }

  // ── Live score preview ────────────────────────────────────────
  const volMicro    = aleoToMicro(parseFloat(form.totalVolume) || 0);
  const score       = form.walletAgeDays !== ''
    ? computeCreditScore(
        parseInt(form.walletAgeDays)  || 0,
        parseInt(form.repaymentsMade) || 0,
        parseInt(form.defaults)       || 0,
        volMicro
      )
    : null;
  const previewTier = score !== null ? scoreToTier(score) : null;
  const tierInfo    = creditTier ? getTierInfo(creditTier) : null;

  // ── Step 1: Oracle Attestation ────────────────────────────────
  // Fetch, validate, and decrypt the unspent CreditRecord from the user's wallet
  async function fetchCreditRecord(): Promise<string | null> {
    const records = await requestRecords?.(PROGRAM_ID, true);
    console.log('Fetched wallet records for credit record lookup:', records);
    const rec = records?.find((r: any) => {
      const isOwner  = r.owner === address || r.sender === address;
      const isRecord = r.recordName === 'CreditRecord';
      return isOwner && isRecord && !r.spent;
    });
    if (!rec) return null;
    const decrypted = await decrypt?.((rec as any).recordCiphertext);
    return decrypted ?? null;
  }

  // ── Step 1: Attest — user wallet calls attest_credit directly ─
  // Data is pre-filled from chain/DB. Inputs are read-only.
  // User wallet proves the ZK circuit and the CreditRecord lands in their wallet.
  async function handleAttest() {
    if (!connected || !address) { toast.error('Connect your wallet first'); return; }
    setStep('attesting');
    try {
      const age  = parseInt(form.walletAgeDays)  || 0;
      const reps = parseInt(form.repaymentsMade) || 0;
      const defs = parseInt(form.defaults)       || 0;
      const vol  = aleoToMicro(parseFloat(form.totalVolume) || 0);
      const currentBlock = await getCurrentBlockHeight();
      if (!currentBlock) { toast.error('Could not fetch block height'); setStep('idle'); return; }
      const nonce = randomField();

      await executeTransaction({
        programId:    PROGRAM_ID,
        functionName: 'attest_credit',
        inputs: [
          `${age}u32`,
          `${reps}u32`,
          `${defs}u32`,
          `${vol}u64`,
          `${currentBlock}u32`,
          nonce,
        ],
      }, executeHandler, transactionStatus);

      const computedScore = computeCreditScore(age, reps, defs, vol);
      const tier          = scoreToTier(computedScore);

      await insertAttestation({
        user_address:    address,
        attestation_id:  nonce,
        wallet_age_days: age,
        repayments_made: reps,
        defaults:        defs,
        total_volume:    vol,
        computed_score:  computedScore,
        tier,
      });

      // Fetch the real decrypted record from wallet — has actual VM _nonce
      const decryptedRec = await fetchCreditRecord();
      if (decryptedRec) {
        // Parse fields from decrypted record string for Zustand store
        const parseField = (str: string, key: string) =>
          str.match(new RegExp(`${key}:\\s*([^,}]+)`))?.[1]?.trim() ?? '';
        setCreditRecord({
          owner:           address,
          wallet_age_days: parseField(decryptedRec, 'wallet_age_days'),
          repayments_made: parseField(decryptedRec, 'repayments_made'),
          defaults:        parseField(decryptedRec, 'defaults'),
          total_volume:    parseField(decryptedRec, 'total_volume'),
          current_score:   parseField(decryptedRec, 'current_score'),
          last_updated:    parseField(decryptedRec, 'last_updated'),
          nonce:           parseField(decryptedRec, 'nonce'),
        }, computedScore, tier);
      } else {
        // Fallback if wallet indexing is slow — prove_tier will re-fetch
        setCreditRecord({
          owner: address, wallet_age_days: `${age}u32`, repayments_made: `${reps}u32`,
          defaults: `${defs}u32`, total_volume: `${vol}u64`,
          current_score: `${computedScore}u32`, last_updated: `${currentBlock}u32`, nonce,
        }, computedScore, tier);
      }

      toast.success('Credit record minted to your wallet!');
      setStep('done');
    } catch (e: any) {
      toast.error(e.message ?? 'Attestation failed');
      setStep('idle');
    }
  }

  async function handleProveTier() {
    if (!address) return;
    setStep('proving');
    try {
      const pNonce       = randomField();
      const expiry       = parseInt(proofExpiry) || 200;
      const currentBlock = await getCurrentBlockHeight();

      // Fetch and decrypt the real unspent CreditRecord from wallet
      const decryptedRec = await fetchCreditRecord();
      if (!decryptedRec) {
        toast.error('No unspent CreditRecord found in your wallet — complete Step 1 first.');
        setStep('done');
        return;
      }

      await executeTransaction({
        programId:    PROGRAM_ID,
        functionName: 'prove_tier',
        inputs:       [decryptedRec, pNonce, `${expiry}u32`, `${currentBlock}u32`, '1field'],
      }, executeHandler, transactionStatus);

      const proofStr = `{owner: ${address}, tier: ${creditTier}u8, org_id: 1field, expires_at: ${currentBlock + expiry}u32, nonce: ${pNonce}}`;
      setTierProof(proofStr);
      toast.success('Tier proof generated! Ready to borrow.');
      setStep('done');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to generate proof');
      setStep('done');
    }
  }

  // ── Source badge ──────────────────────────────────────────────
  function SourceBadge({ field }: { field: string }) {
    const src = prefillSource[field];
    if (!src) return null;
    const config = {
      chain:    { label: 'from chain',   color: '#00d4ff' },
      supabase: { label: 'from history', color: '#00ffcc' },
      new:      { label: 'new wallet',   color: '#6b7fa3' },
    }[src];
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-mono"
        style={{ background: `${config.color}15`, color: config.color, border: `1px solid ${config.color}30` }}>
        {config.label}
      </span>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zero-text mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
          Credit Score
        </h1>
        <p className="text-zero-text-dim">
          Your creditworthiness proven by ZK — your data never leaves your wallet.
        </p>
      </div>

      {/* Current score card */}
      {creditScore !== null && tierInfo && (
        <div className="rounded-3xl p-8 relative overflow-hidden" style={{
          background: `linear-gradient(135deg, ${tierInfo.color}15, ${tierInfo.color}05)`,
          border:     `1px solid ${tierInfo.color}30`,
        }}>
          <div className="absolute top-0 right-0 w-64 h-64 opacity-10"
            style={{ background: `radial-gradient(circle, ${tierInfo.color} 0%, transparent 70%)` }} />
          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-zero-text-dim mb-2">Your Credit Score</p>
                <div className="flex items-end gap-3 mb-1">
                  <span className="text-6xl font-bold" style={{ fontFamily: "'Syne', sans-serif", color: tierInfo.color }}>
                    {creditScore}
                  </span>
                  <span className="text-zero-text-dim text-xl mb-2">/1000</span>
                </div>
                <div className="tag" style={{ background: `${tierInfo.color}18`, borderColor: `${tierInfo.color}40`, color: tierInfo.color }}>
                  <ShieldCheck size={10} />
                  Tier {creditTier} — {tierInfo.label}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-zero-text-dim mb-1">Max Loan</p>
                <p className="text-2xl font-bold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
                  {tierInfo.maxLoan.toLocaleString()} ALEO
                </p>
                <p className="text-xs text-zero-text-dim mt-1">{tierInfo.rate}% APR</p>
              </div>
            </div>

            <div className="mt-6">
              <div className="progress-bar h-2">
                <div className="progress-fill" style={{
                  width:      `${(creditScore / 1000) * 100}%`,
                  background: `linear-gradient(90deg, ${tierInfo.color}, ${tierInfo.color}99)`,
                }} />
              </div>
              <div className="flex justify-between text-xs text-zero-text-dim mt-1">
                {['0', '300', '500', '700', '850', '1000'].map(n => <span key={n}>{n}</span>)}
              </div>
            </div>

            <button onClick={() => setShowRawData(!showRawData)}
              className="flex items-center gap-2 mt-4 text-xs text-zero-text-dim hover:text-zero-text transition-colors">
              {showRawData ? <EyeOff size={12} /> : <Eye size={12} />}
              {showRawData ? 'Hide private data' : 'Show private inputs (you only)'}
            </button>

            {showRawData && creditRecord && (
              <div className="mt-3 p-4 rounded-xl text-xs font-mono text-zero-text-dim space-y-1"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid #1a2540' }}>
                <p>wallet_age_days: <span className="text-zero-cyan">{creditRecord.wallet_age_days}</span></p>
                <p>repayments_made: <span className="text-zero-teal">{creditRecord.repayments_made}</span></p>
                <p>defaults:        <span className="text-zero-red">{creditRecord.defaults}</span></p>
                <p>total_volume:    <span className="text-zero-violet-bright">{creditRecord.total_volume}</span></p>
                <p className="text-zero-muted text-[10px] mt-2">
                  ↑ Visible only via your view key. The lending pool sees none of this.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step flow */}
      <div className="grid md:grid-cols-2 gap-6">

        {/* Step 1 */}
        <div className="glass rounded-2xl p-6"
          style={creditScore !== null ? { opacity: 0.5, pointerEvents: 'none' } : {}}>

          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)', fontFamily: "'Syne', sans-serif", color: '#00d4ff' }}>
              1
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
                Oracle Attestation
              </h3>
              <p className="text-xs text-zero-text-dim">Submit credit data for ZK attestation</p>
            </div>
            {prefilling && (
              <div className="flex items-center gap-1.5 text-xs text-zero-text-dim">
                <Loader2 size={12} className="animate-spin" />Loading…
              </div>
            )}
            {prefillDone && !prefilling && (
              <div className="flex items-center gap-1.5 text-xs text-zero-teal">
                <CheckCircle size={12} />Auto-filled
              </div>
            )}
          </div>

          {prefillDone && !prefilling && (
            <div className="mb-4 p-3 rounded-xl flex items-start gap-2 text-xs"
              style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.12)' }}>
              <Info size={12} className="text-zero-cyan mt-0.5 flex-shrink-0" />
              <span className="text-zero-text-dim leading-relaxed">
                Pre-filled from your on-chain wallet age and ZeroLend history. You can edit before attesting.
              </span>
            </div>
          )}

          {!connected && (
            <div className="mb-4 p-3 rounded-xl text-xs text-center text-zero-text-dim"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1a2540' }}>
              Connect your wallet to auto-load your credit history
            </div>
          )}

          <div className="space-y-3">
            {[
              { key: 'walletAgeDays',  label: 'Wallet Age (days)',   hint: 'Age of your Aleo wallet'        },
              { key: 'repaymentsMade', label: 'Repayments Made',     hint: 'Loans repaid on ZeroLend'       },
              { key: 'defaults',       label: 'Defaults / Missed',   hint: 'Loans liquidated on ZeroLend'   },
              { key: 'totalVolume',    label: 'Total Volume (ALEO)', hint: 'Total ALEO borrowed and repaid' },
            ].map(({ key, label, hint }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-zero-text-dim">{label}</label>
                  <SourceBadge field={key} />
                </div>
                <div className="relative">
                  <input
                    className={`zero-input ${key === 'totalVolume' ? 'pr-14' : ''} ${(prefilling || prefillDone) ? 'opacity-60 cursor-not-allowed' : ''}`}
                    type="number"
                    placeholder={prefilling ? 'Loading…' : '0'}
                    disabled={prefilling || prefillDone || step !== 'idle'}
                    readOnly={prefillDone}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                  {key === 'totalVolume' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zero-text-dim text-xs">ALEO</span>
                  )}
                </div>
                <p className="text-[10px] text-zero-muted mt-0.5">{hint}</p>
              </div>
            ))}
          </div>

          {score !== null && previewTier && (
            <div className="mt-4 p-3 rounded-xl flex items-center justify-between" style={{
              background: `${getTierInfo(previewTier).color}10`,
              border:     `1px solid ${getTierInfo(previewTier).color}25`,
            }}>
              <span className="text-xs text-zero-text-dim">Preview Score</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold" style={{ fontFamily: "'Syne', sans-serif", color: getTierInfo(previewTier).color }}>
                  {score}
                </span>
                <span className="tag" style={{
                  background: `${getTierInfo(previewTier).color}18`, borderColor: `${getTierInfo(previewTier).color}40`,
                  color: getTierInfo(previewTier).color, fontSize: 10,
                }}>T{previewTier}</span>
              </div>
            </div>
          )}

          <button
            onClick={handleAttest}
            disabled={step === 'attesting' || prefilling || !connected || form.walletAgeDays === ''}
            className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
          >
            {step === 'attesting' ? (
              <><div className="zk-loader" style={{ width: 14, height: 14 }} />Attesting…</>
            ) : prefilling ? (
              <><Loader2 size={14} className="animate-spin" />Loading history…</>
            ) : (
              <><Shield size={14} />Attest Credit Data</>
            )}
          </button>
        </div>

        {/* Steps 2 & 3 */}
        <div className="space-y-4">

          {/* Step 3 */}
          <div className="glass rounded-2xl p-5"
            style={creditScore === null ? { opacity: 0.4, pointerEvents: 'none' } : {}}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  background: creditScore !== null ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${creditScore !== null ? 'rgba(124,58,237,0.4)' : '#1a2540'}`,
                  fontFamily: "'Syne', sans-serif",
                  color: creditScore !== null ? '#a855f7' : '#4a5878',
                }}>2</div>
              <div>
                <h3 className="text-sm font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Generate Tier Proof
                </h3>
                <p className="text-xs text-zero-text-dim">Create ZK proof for lending pool</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-zero-text-dim mb-1">Proof valid for (blocks)</label>
              <input
                className="zero-input"
                type="number"
                value={proofExpiry}
                onChange={(e) => setProofExpiry(e.target.value)}
                placeholder="200"
              />
              <p className="text-xs text-zero-muted mt-1">
                ~{Math.round((parseInt(proofExpiry) || 200) * 10 / 60)} minutes
              </p>
            </div>

            <button
              onClick={handleProveTier}
              disabled={creditScore === null || step === 'proving'}
              className="btn-violet w-full flex items-center justify-center gap-2"
            >
              {step === 'proving' ? (
                <><div className="zk-loader" style={{ width: 14, height: 14 }} />Generating Proof…</>
              ) : (
                <><Zap size={14} />Generate Tier Proof</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tier table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zero-border/50">
          <h3 className="text-base font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
            Credit Tiers
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zero-border/30">
                {['Tier', 'Label', 'Score Range', 'Max Loan', 'APR', 'Term'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs text-zero-text-dim font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { tier: 1, label: 'Poor',     range: '0–299',    max: '10 ALEO',    rate: '20%', term: '2 days'  },
                { tier: 2, label: 'Fair',      range: '300–499',  max: '50 ALEO',    rate: '15%', term: '5 days'  },
                { tier: 3, label: 'Good',      range: '500–699',  max: '200 ALEO',   rate: '10%', term: '10 days' },
                { tier: 4, label: 'Great',     range: '700–849',  max: '1,000 ALEO', rate: '7%',  term: '20 days' },
                { tier: 5, label: 'Excellent', range: '850–1000', max: '5,000 ALEO', rate: '4%',  term: '30 days' },
              ].map(({ tier, label, range, max, rate, term }) => (
                <tr key={tier}
                  className="border-b border-zero-border/20 hover:bg-white/[0.02] transition-colors"
                  style={creditTier === tier ? { background: `${getTierInfo(tier).color}08` } : {}}>
                  <td className="px-6 py-4">
                    <span className={`tag tier-${tier}`} style={{ fontFamily: "'Syne', sans-serif" }}>T{tier}</span>
                  </td>
                  <td className="px-6 py-4 font-medium text-zero-text">{label}</td>
                  <td className="px-6 py-4 font-mono text-zero-text-dim">{range}</td>
                  <td className="px-6 py-4 text-zero-text">{max}</td>
                  <td className="px-6 py-4 text-zero-text-dim">{rate}</td>
                  <td className="px-6 py-4 text-zero-text-dim">{term}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}