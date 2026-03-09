'use client';

import { useState } from 'react';
import {
  Settings, Shield, Plus, Trash2, Terminal,
  CheckCircle, Zap, RefreshCw, Database
} from 'lucide-react';
import { useStore } from '../../lib/store';
import {
  executeTransaction, PROGRAM_ID, fetchPoolStats,
  randomField, formatUsdc
} from '../../lib/aleo';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const { wallet, poolStats, setPoolStats } = useStore();

  const [initSupply, setInitSupply]       = useState('1000000000000');
  const [oracleAddr, setOracleAddr]       = useState('');
  const [mintAddress, setMintAddress]     = useState('');
  const [mintAmount, setMintAmount]       = useState('');
  const [loading, setLoading]             = useState<string | null>(null);
  const [cliOutput, setCliOutput]         = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<string>('init');

  function log(msg: string) {
    setCliOutput((prev) => [`> ${msg}`, ...prev.slice(0, 29)]);
  }

  async function run(
    label: string,
    fn: string,
    inputs: string[],
    fee = 1_000_000
  ) {
    if (!wallet.connected) { toast.error('Connect wallet first'); return; }
    setLoading(label);
    log(`Running ${fn}(${inputs.join(', ')})…`);
    try {
      const txId = await executeTransaction({
        programId:    PROGRAM_ID,
        functionName: fn,
        inputs,
        fee,
      });
      log(`✓ ${fn} → tx: ${txId}`);
      toast.success(`${label} successful!`);
    } catch (e: any) {
      log(`✗ ${fn} failed: ${e.message}`);
      toast.error(e.message ?? `${label} failed`);
    } finally {
      setLoading(null);
    }
  }

  async function refreshStats() {
    setLoading('stats');
    const stats = await fetchPoolStats();
    if (stats) {
      setPoolStats(stats);
      log('✓ Pool stats refreshed from chain');
      toast.success('Stats refreshed');
    } else {
      log('✗ Failed to fetch pool stats');
    }
    setLoading(null);
  }

  const SECTIONS = [
    { id: 'init',    label: 'Initialize', icon: Zap     },
    { id: 'oracle',  label: 'Oracle',     icon: Shield  },
    { id: 'token',   label: 'Tokens',     icon: Database },
    { id: 'pool',    label: 'Pool',       icon: Settings },
    { id: 'cli',     label: 'CLI Logs',   icon: Terminal },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold text-zero-text mb-2"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Admin Panel
          </h1>
          <p className="text-zero-text-dim">
            Protocol initialization, oracle management, and pool controls.
          </p>
        </div>
        <button
          onClick={refreshStats}
          disabled={loading === 'stats'}
          className="btn-ghost flex items-center gap-2"
        >
          <RefreshCw size={14} className={loading === 'stats' ? 'animate-spin' : ''} />
          Refresh Stats
        </button>
      </div>

      {/* Pool stats bar */}
      {poolStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Liquidity', value: formatUsdc(poolStats.totalLiquidity) },
            { label: 'Borrowed',  value: formatUsdc(poolStats.totalBorrowed)  },
            { label: 'Loans',     value: poolStats.activeLoanCount             },
            { label: 'Util.',     value: `${poolStats.utilizationRate}%`       },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl px-4 py-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1a2540' }}
            >
              <p className="text-xs text-zero-text-dim">{label}</p>
              <p className="text-base font-bold text-zero-text mt-0.5" style={{ fontFamily: "'Syne', sans-serif" }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0"
            style={{
              fontFamily: "'Syne', sans-serif",
              background: activeSection === id ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)',
              border:     `1px solid ${activeSection === id ? 'rgba(0,212,255,0.3)' : '#1a2540'}`,
              color:      activeSection === id ? '#00d4ff' : '#6b7fa3',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Section: Initialize */}
      {activeSection === 'init' && (
        <div className="glass rounded-2xl p-6">
          <h2
            className="text-base font-semibold text-zero-text mb-1"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Initialize Protocol
          </h2>
          <p className="text-xs text-zero-text-dim mb-5">
            Deploy the lending pool with initial USDC liquidity. Call once after deployment.
          </p>
          <div className="mb-4">
            <label className="block text-xs text-zero-text-dim mb-1">
              Initial Supply (micro-USDC)
            </label>
            <input
              className="zero-input"
              value={initSupply}
              onChange={(e) => setInitSupply(e.target.value)}
              placeholder="1000000000000"
            />
            <p className="text-xs text-zero-muted mt-1">
              = ${(parseInt(initSupply || '0') / 1_000_000).toLocaleString()} USDC
            </p>
          </div>
          <div className="p-3 rounded-xl mb-4 font-mono text-xs text-zero-text-dim"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #1a2540' }}>
            leo run initialize {initSupply}u128
          </div>
          <button
            onClick={() => run('Initialize', 'initialize', [`${initSupply}u128`])}
            disabled={loading === 'Initialize'}
            className="btn-primary flex items-center gap-2"
          >
            {loading === 'Initialize' ? (
              <><div className="zk-loader" style={{ width: 14, height: 14 }} />Initializing…</>
            ) : (
              <><Zap size={14} />Initialize Protocol</>
            )}
          </button>
        </div>
      )}

      {/* Section: Oracle */}
      {activeSection === 'oracle' && (
        <div className="space-y-5">
          <div className="glass rounded-2xl p-6">
            <h2
              className="text-base font-semibold text-zero-text mb-1"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Add Oracle
            </h2>
            <p className="text-xs text-zero-text-dim mb-4">
              Whitelist an address to submit credit attestations.
            </p>
            <div className="mb-4">
              <label className="block text-xs text-zero-text-dim mb-1">Oracle Address</label>
              <input
                className="zero-input font-mono"
                value={oracleAddr}
                onChange={(e) => setOracleAddr(e.target.value)}
                placeholder="aleo1..."
              />
            </div>
            <div className="p-3 rounded-xl mb-4 font-mono text-xs text-zero-text-dim"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #1a2540' }}>
              leo run add_oracle {oracleAddr || 'aleo1...'}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => run('Add Oracle', 'add_oracle', [oracleAddr])}
                disabled={!oracleAddr || loading === 'Add Oracle'}
                className="btn-primary flex items-center gap-2"
              >
                {loading === 'Add Oracle'
                  ? <><div className="zk-loader" style={{ width: 14, height: 14 }} />Adding…</>
                  : <><Plus size={14} />Add Oracle</>
                }
              </button>
              <button
                onClick={() => run('Remove Oracle', 'remove_oracle', [oracleAddr])}
                disabled={!oracleAddr || loading === 'Remove Oracle'}
                className="btn-ghost flex items-center gap-2 text-zero-red hover:text-zero-red"
              >
                <Trash2 size={14} />Remove
              </button>
            </div>
          </div>

          {/* Attest credit */}
          <AtTestCreditSection loading={loading} setLoading={setLoading} log={log} walletAddr={wallet.address} />
        </div>
      )}

      {/* Section: Tokens */}
      {activeSection === 'token' && (
        <div className="glass rounded-2xl p-6">
          <h2
            className="text-base font-semibold text-zero-text mb-1"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Mint Tokens
          </h2>
          <p className="text-xs text-zero-text-dim mb-5">
            Mint USDC test tokens to any address (admin only).
          </p>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-zero-text-dim mb-1">Recipient Address</label>
              <input
                className="zero-input font-mono"
                value={mintAddress}
                onChange={(e) => setMintAddress(e.target.value)}
                placeholder="aleo1..."
              />
            </div>
            <div>
              <label className="block text-xs text-zero-text-dim mb-1">Amount (micro-USDC)</label>
              <input
                className="zero-input"
                value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value)}
                placeholder="10000000000"
              />
              {mintAmount && (
                <p className="text-xs text-zero-muted mt-1">
                  = ${(parseInt(mintAmount) / 1_000_000).toLocaleString()} USDC
                </p>
              )}
            </div>
          </div>
          <div className="p-3 rounded-xl mb-4 font-mono text-xs text-zero-text-dim"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #1a2540' }}>
            leo run mint {mintAddress || 'aleo1...'} {mintAmount || '10000000000'}u128
          </div>
          <button
            onClick={() => run('Mint', 'mint', [mintAddress, `${mintAmount}u128`])}
            disabled={!mintAddress || !mintAmount || loading === 'Mint'}
            className="btn-primary flex items-center gap-2"
          >
            {loading === 'Mint'
              ? <><div className="zk-loader" style={{ width: 14, height: 14 }} />Minting…</>
              : <><Plus size={14} />Mint Tokens</>
            }
          </button>
        </div>
      )}

      {/* Section: Pool */}
      {activeSection === 'pool' && (
        <div className="glass rounded-2xl p-6">
          <h2
            className="text-base font-semibold text-zero-text mb-1"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Pool Controls
          </h2>
          <p className="text-xs text-zero-text-dim mb-5">
            Verify pool solvency and manage pool state.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1a2540' }}
            >
              <h3 className="text-sm font-semibold text-zero-text mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
                Prove Solvency
              </h3>
              <p className="text-xs text-zero-text-dim mb-3">
                Publicly verify that borrowed ≤ liquidity on-chain.
              </p>
              <div className="p-2 rounded-lg mb-3 font-mono text-xs text-zero-text-dim"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #1a2540' }}>
                leo run prove_solvency
              </div>
              <button
                onClick={() => run('Prove Solvency', 'prove_solvency', [])}
                disabled={loading === 'Prove Solvency'}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading === 'Prove Solvency'
                  ? <><div className="zk-loader" style={{ width: 14, height: 14 }} />Proving…</>
                  : <><Shield size={14} />Prove Solvency</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section: CLI Logs */}
      {activeSection === 'cli' && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-zero-border/50">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-zero-cyan" />
              <span className="text-sm font-semibold text-zero-text" style={{ fontFamily: "'Syne', sans-serif" }}>
                Transaction Log
              </span>
            </div>
            <button
              onClick={() => setCliOutput([])}
              className="text-xs text-zero-text-dim hover:text-zero-text"
            >
              Clear
            </button>
          </div>
          <div
            className="p-4 min-h-64 font-mono text-xs space-y-1 overflow-y-auto max-h-96"
            style={{ background: 'rgba(0,0,0,0.4)' }}
          >
            {cliOutput.length === 0 ? (
              <p className="text-zero-muted">No transactions yet. Run a function above.</p>
            ) : (
              cliOutput.map((line, i) => (
                <p
                  key={i}
                  className={
                    line.startsWith('> ✓') ? 'text-zero-teal' :
                    line.startsWith('> ✗') ? 'text-zero-red'  :
                    'text-zero-text-dim'
                  }
                >
                  {line}
                </p>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-component: Attest Credit ──────────────────────────────
function AtTestCreditSection({ loading, setLoading, log, walletAddr }: any) {
  const [form, setForm] = useState({
    recipient: '', walletAge: '', repayments: '', defaults: '', volume: '',
  });

  async function handleAttest() {
    if (!walletAddr) { toast.error('Connect wallet'); return; }
    setLoading('Attest');
    const attId = randomField();
    log(`Running attest_credit(${form.recipient}, ...)...`);
    try {
      const txId = await executeTransaction({
        programId:    PROGRAM_ID,
        functionName: 'attest_credit',
        inputs: [
          form.recipient,
          `${form.walletAge}u32`,
          `${form.repayments}u32`,
          `${form.defaults}u32`,
          `${form.volume}u128`,
          '500u32',
          '100u32',
          attId,
        ],
      });
      log(`✓ attest_credit → tx: ${txId} | id: ${attId}`);
      toast.success('Attestation submitted!');
    } catch (e: any) {
      log(`✗ attest_credit: ${e.message}`);
      toast.error(e.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="text-base font-semibold text-zero-text mb-1" style={{ fontFamily: "'Syne', sans-serif" }}>
        Attest Credit Data
      </h2>
      <p className="text-xs text-zero-text-dim mb-4">
        Oracle submits off-chain credit data for a user on-chain.
      </p>
      <div className="grid md:grid-cols-2 gap-3 mb-4">
        {[
          { key: 'recipient',   label: 'Recipient Address', placeholder: 'aleo1...' },
          { key: 'walletAge',   label: 'Wallet Age (days)', placeholder: '365'      },
          { key: 'repayments',  label: 'Repayments Made',   placeholder: '5'        },
          { key: 'defaults',    label: 'Defaults',          placeholder: '0'        },
          { key: 'volume',      label: 'Volume (micro-USDC)', placeholder: '10000000000' },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-xs text-zero-text-dim mb-1">{label}</label>
            <input
              className="zero-input"
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleAttest}
        disabled={!form.recipient || loading === 'Attest'}
        className="btn-primary flex items-center gap-2"
      >
        {loading === 'Attest'
          ? <><div className="zk-loader" style={{ width: 14, height: 14 }} />Attesting…</>
          : <><Shield size={14} />Attest Credit</>
        }
      </button>
    </div>
  );
}
