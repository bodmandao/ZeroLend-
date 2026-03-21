'use client';

import { useState, useEffect } from 'react';
import { Shield, CheckCircle, Globe, Lock, Eye, EyeOff, ExternalLink, RefreshCw } from 'lucide-react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useStore } from '../../lib/store';
import {
  executeTransaction, PROGRAM_ID, getCurrentBlockHeight,
  fetchMappingValue, getTierInfo, API_URL,
} from '../../lib/aleo';
import toast from 'react-hot-toast';

const TIER_COLORS: Record<number, string> = {
  1: '#ef4444', 2: '#f59e0b', 3: '#3b82f6', 4: '#10b981', 5: '#00d4ff',
};
const TIER_LABELS: Record<number, string> = {
  1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Platinum', 5: 'Diamond',
};

// ── Read a passport from the chain mapping ────────────────────
async function readPassport(address: string): Promise<{ tier: number; updatedAt: number } | null> {
  try {
    const [tierRaw, blockRaw] = await Promise.all([
      fetchMappingValue(PROGRAM_ID, 'credit_passport',     address),
      fetchMappingValue(PROGRAM_ID, 'passport_updated_at', address),
    ]);
    if (!tierRaw) return null;
    // Strip type suffixes: "1u8" → 1, "15179653u32" → 15179653
    const tier = parseInt(tierRaw.replace(/u\d+$/, '')) || 0;
    if (tier === 0) return null;
    const updatedAt = blockRaw ? (parseInt(blockRaw.replace(/u\d+$/, '')) || 0) : 0;
    return { tier, updatedAt };
  } catch {
    return null;
  }
}

export default function PassportPage() {
  const { transactionStatus, requestRecords, decrypt, connected, address, executeTransaction: executeHandler } = useWallet();
  const { creditScore, creditTier } = useStore();

  const [step, setStep]                   = useState<'idle' | 'publishing' | 'revoking'>('idle');
  const [myPassport, setMyPassport]       = useState<{ tier: number; updatedAt: number } | null>(null);
  const [lookupAddr, setLookupAddr]       = useState('');
  const [lookedUp, setLookedUp]           = useState<{ tier: number; updatedAt: number } | null | 'not-found'>('not-found');
  const [looking, setLooking]             = useState(false);
  const [loadingPassport, setLoadingPassport] = useState(false);

  // Load own passport on connect
  useEffect(() => {
    if (!connected || !address) { setMyPassport(null); return; }
    setLoadingPassport(true);
    readPassport(address)
      .then(p => setMyPassport(p))
      .finally(() => setLoadingPassport(false));
  }, [connected, address]);

  async function handlePublish() {
    if (!connected || !address) { toast.error('Connect wallet first'); return; }
    if (!creditScore || !creditTier) {
      toast.error('You need a credit record first — visit the Credit page');
      return;
    }
    setStep('publishing');
    try {
      const currentBlk = await getCurrentBlockHeight();

      // Fetch CreditRecord from wallet
      const records = await requestRecords?.(PROGRAM_ID, false);
      const creditRec = (records ?? [])
        .filter((r: any) => (r.owner === address || r.sender === address) && r.recordName === 'CreditRecord' && !r.spent)
        .sort((a: any, b: any) => (b.blockHeight ?? 0) - (a.blockHeight ?? 0))[0];

      if (!creditRec) { toast.error('No CreditRecord in wallet — re-attest on the Credit page'); setStep('idle'); return; }
      const decrypted = await decrypt?.((creditRec as any).recordCiphertext);
      if (!decrypted) { toast.error('Could not decrypt credit record'); setStep('idle'); return; }

      await executeTransaction({
        programId:    PROGRAM_ID,
        functionName: 'publish_passport',
        inputs:       [decrypted, `${currentBlk}u32`],
      }, executeHandler, transactionStatus);

      // Refresh own passport
      const updated = await readPassport(address);
      setMyPassport(updated);
      toast.success('Credit passport published! Anyone can now verify your tier.');
      setStep('idle');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to publish passport');
      setStep('idle');
    }
  }

  async function handleRevoke() {
    if (!connected || !address) return;
    setStep('revoking');
    try {
      await executeTransaction({
        programId:    PROGRAM_ID,
        functionName: 'revoke_passport',
        inputs:       [],
      }, executeHandler, transactionStatus);

      setMyPassport(null);
      toast.success('Passport revoked — your tier is no longer public.');
      setStep('idle');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to revoke passport');
      setStep('idle');
    }
  }

  async function handleLookup() {
    if (!lookupAddr.trim()) return;
    setLooking(true);
    try {
      const result = await readPassport(lookupAddr.trim());
      setLookedUp(result ?? 'not-found');
    } catch {
      setLookedUp('not-found');
    } finally {
      setLooking(false);
    }
  }

  const tierInfo = creditTier ? getTierInfo(creditTier) : null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)' }}>
            <Globe size={20} className="text-zero-cyan" />
          </div>
          <h1 className="text-3xl font-bold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
            Credit Passport
          </h1>
        </div>
        <p className="text-zero-text-dim">
          Opt in to publish your credit tier publicly on-chain. Your score stays private.
          Other protocols can verify your tier without any ZK interaction.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* My Passport */}
        <div className="glass rounded-2xl p-6">
          <h2 className="text-base font-semibold text-zero-text mb-5" style={{ fontFamily: "'Syne', sans-serif" }}>
            My Passport
          </h2>

          {!connected ? (
            <div className="text-center py-8 text-zero-text-dim">
              <Shield size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Connect wallet to manage your passport</p>
            </div>
          ) : loadingPassport ? (
            <div className="text-center py-8">
              <div className="zk-loader mx-auto" style={{ width: 24, height: 24 }} />
            </div>
          ) : myPassport ? (
            <>
              {/* Published passport */}
              <div className="rounded-2xl p-5 mb-4 text-center" style={{
                background: `${TIER_COLORS[myPassport.tier]}12`,
                border: `1px solid ${TIER_COLORS[myPassport.tier]}30`,
              }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ background: `${TIER_COLORS[myPassport.tier]}20`, border: `2px solid ${TIER_COLORS[myPassport.tier]}` }}>
                  <span className="text-2xl font-bold" style={{ color: TIER_COLORS[myPassport.tier], fontFamily: "'Syne', sans-serif" }}>
                    T{myPassport.tier}
                  </span>
                </div>
                <p className="text-lg font-bold text-zero-text mb-1" style={{ fontFamily: "'Syne', sans-serif", color: TIER_COLORS[myPassport.tier] }}>
                  {TIER_LABELS[myPassport.tier]}
                </p>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-zero-green animate-pulse" />
                  <span className="text-xs text-zero-green">Publicly Verified</span>
                </div>
                <p className="text-xs text-zero-text-dim">
                  Published at block {myPassport.updatedAt.toLocaleString()}
                </p>
              </div>

              <p className="text-xs text-zero-text-dim mb-4 leading-relaxed">
                Your tier is publicly readable on-chain. Your score, history, and personal data remain completely private.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={handlePublish}
                  disabled={step !== 'idle'}
                  className="flex-1 btn-ghost text-xs flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={12} />Update
                </button>
                <button
                  onClick={handleRevoke}
                  disabled={step !== 'idle'}
                  className="flex-1 text-xs px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
                >
                  {step === 'revoking' ? <><div className="zk-loader" style={{ width: 12, height: 12 }} />Revoking…</> : <><EyeOff size={12} />Revoke</>}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* No passport yet */}
              <div className="rounded-2xl p-5 mb-4 text-center"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed #1a2540' }}>
                <Lock size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm text-zero-text-dim mb-1">Not published</p>
                <p className="text-xs text-zero-text-dim">Your tier is private by default</p>
              </div>

              {creditScore !== null && tierInfo ? (
                <>
                  <div className="rounded-xl p-3 mb-4 flex items-center gap-3"
                    style={{ background: `${tierInfo.color}10`, border: `1px solid ${tierInfo.color}25` }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: `${tierInfo.color}20`, border: `1px solid ${tierInfo.color}` }}>
                      <span className="text-xs font-bold" style={{ color: tierInfo.color }}>T{creditTier}</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zero-text">{tierInfo.label} tier ready to publish</p>
                      <p className="text-xs text-zero-text-dim">Score stays private — only tier is revealed</p>
                    </div>
                  </div>

                  <button
                    onClick={handlePublish}
                    disabled={step !== 'idle'}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {step === 'publishing' ? (
                      <><div className="zk-loader" style={{ width: 14, height: 14 }} />Publishing…</>
                    ) : (
                      <><Eye size={14} />Publish Credit Passport</>
                    )}
                  </button>
                </>
              ) : (
                <div className="text-center">
                  <p className="text-xs text-zero-text-dim mb-3">You need a credit record first</p>
                  <a href="/credit" className="btn-ghost text-xs inline-flex items-center gap-1.5">
                    <Shield size={12} />Get Credit Score
                  </a>
                </div>
              )}
            </>
          )}
        </div>

        {/* Lookup any address */}
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6">
            <h2 className="text-base font-semibold text-zero-text mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>
              Verify Any Wallet
            </h2>
            <p className="text-xs text-zero-text-dim mb-4 leading-relaxed">
              Look up anyone's published credit passport. If they haven't published one, no information is revealed.
            </p>

            <div className="flex gap-2 mb-4">
              <input
                className="zero-input flex-1 font-mono text-xs"
                placeholder="aleo1..."
                value={lookupAddr}
                onChange={e => {
                  const val = e.target.value;
                  setLookupAddr(val);
                  // Auto-lookup when a full aleo address is pasted/typed (63 chars)
                  if (val.startsWith('aleo1') && val.length === 63) {
                    setLooking(true);
                    readPassport(val.trim())
                      .then(result => setLookedUp(result ?? 'not-found'))
                      .finally(() => setLooking(false));
                  }
                }}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
              />
              <button
                onClick={handleLookup}
                disabled={looking || !lookupAddr.trim()}
                className="btn-ghost px-4 text-sm flex items-center gap-1.5"
              >
                {looking ? <div className="zk-loader" style={{ width: 14, height: 14 }} /> : <Eye size={14} />}
              </button>
            </div>

            {lookedUp === 'not-found' && lookupAddr && !looking ? (
              <div className="rounded-xl p-4 text-center"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1a2540' }}>
                <Lock size={20} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs text-zero-text-dim">No passport published for this address</p>
              </div>
            ) : lookedUp && lookedUp !== 'not-found' ? (
              <div className="rounded-2xl p-5 text-center" style={{
                background: `${TIER_COLORS[lookedUp.tier]}12`,
                border: `1px solid ${TIER_COLORS[lookedUp.tier]}30`,
              }}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ background: `${TIER_COLORS[lookedUp.tier]}20`, border: `2px solid ${TIER_COLORS[lookedUp.tier]}` }}>
                  <span className="text-xl font-bold" style={{ color: TIER_COLORS[lookedUp.tier], fontFamily: "'Syne', sans-serif" }}>
                    T{lookedUp.tier}
                  </span>
                </div>
                <p className="font-bold text-zero-text mb-1" style={{ fontFamily: "'Syne', sans-serif", color: TIER_COLORS[lookedUp.tier] }}>
                  {TIER_LABELS[lookedUp.tier]}
                </p>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <CheckCircle size={11} className="text-zero-green" />
                  <span className="text-xs text-zero-green">Verified On-Chain</span>
                </div>
                <p className="text-xs text-zero-text-dim">Block {lookedUp.updatedAt.toLocaleString()}</p>
                <a
                  href={`https://explorer.provable.com/address/${lookupAddr}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-zero-cyan hover:underline mt-2"
                >
                  <ExternalLink size={10} />View on Explorer
                </a>
              </div>
            ) : null}
          </div>

          {/* SDK snippet */}
          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zero-text mb-3" style={{ fontFamily: "'Syne', sans-serif" }}>
              Integrate Credit Passport
            </h3>
            <p className="text-xs text-zero-text-dim mb-3">
              Any Aleo program or dApp can verify a user's tier with a single mapping read:
            </p>
            <pre className="text-xs font-mono p-3 rounded-xl overflow-x-auto"
              style={{ background: 'rgba(0,0,0,0.4)', color: '#00d4ff', border: '1px solid #1a2540' }}>
{`// In your Leo program:
let tier: u8 = Mapping::get_or_use(
  zerolend_lending_pool_v1.aleo/credit_passport,
  user_address,
  0u8  // 0 = no passport
);
assert(tier >= 3u8); // require Gold+`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}