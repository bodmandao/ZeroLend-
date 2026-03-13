import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import { randomUUID } from 'crypto';
import {
  Account,
  AleoKeyProvider,
  AleoNetworkClient,
  NetworkRecordProvider,
  ProgramManager,
  initThreadPool,
} from '@provablehq/sdk';

const app        = express();
const PORT       = process.env.PORT ?? 3001;
const PROGRAM_ID = process.env.PROGRAM_ID ?? 'zerolend_lending_pool_v1.aleo';
const ORACLE_KEY = process.env.ORACLE_PRIVATE_KEY!;
const NETWORK_URL = 'https://api.explorer.provable.com/v2';

// Allow requests from any GitHub Codespace origin (both ports 3000 and 3001)
// In production lock this down to your actual domain
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman) or any github.dev / localhost origin
    if (!origin || origin.includes('github.dev') || origin.includes('localhost')) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  methods:     ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));
app.use(express.json());

// ── In-memory job store ───────────────────────────────────────
type JobStatus = 'pending' | 'done' | 'error';
interface Job {
  status:    JobStatus;
  result?:   Record<string, any>;
  error?:    string;
  logs:      string[];
  createdAt: number;
}
const jobs     = new Map<string, Job>();
// SSE subscribers: jobId → array of res objects
const subscribers = new Map<string, any[]>();

function pushLog(jobId: string, message: string) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.logs.push(message);
  // Push to any SSE subscribers for this job
  const subs = subscribers.get(jobId) ?? [];
  for (const res of subs) {
    try { res.write(`data: ${JSON.stringify({ log: message })}

`); } catch {}
  }
  console.log(`[oracle][${jobId}] ${message}`);
}

// Clean up jobs older than 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of jobs.entries()) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 60_000);

// ── Module-level singletons ───────────────────────────────────
// keyProvider is shared — cache persists across all requests
const keyProvider = new AleoKeyProvider();
keyProvider.useCache(true);

let threadPoolReady = false;
async function ensureThreadPool() {
  if (!threadPoolReady) {
    await initThreadPool();
    threadPoolReady = true;
    console.log('[oracle] WASM thread pool ready');
  }
}

// ── Validation ────────────────────────────────────────────────
function isValidAleoAddress(addr: string): boolean {
  return /^aleo1[a-z0-9]{58}$/.test(addr);
}
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(val)));
}

// ── Core attestation logic (long-running, runs in background) ─
async function runAttestation(jobId: string, params: {
  recipient:        string;
  age:              number;
  reps:             number;
  defs:             number;
  vol:              number;
  currentBlock:     number;
  attId:            string;
  validForBlocks:   number;
}) {
  const { recipient, age, reps, defs, vol, currentBlock, attId, validForBlocks } = params;

  try {
    await ensureThreadPool();

    const oracleAccount  = new Account({ privateKey: ORACLE_KEY });
    const networkClient  = new AleoNetworkClient(NETWORK_URL);
    const recordProvider = new NetworkRecordProvider(oracleAccount, networkClient);
    const programManager = new ProgramManager(NETWORK_URL, keyProvider, recordProvider);
    programManager.setAccount(oracleAccount);

    const keySearchParams = { cacheKey: `${PROGRAM_ID}:attest_credit` };

    const inputs = [
      recipient,
      `${age}u32`,
      `${reps}u32`,
      `${defs}u32`,
      `${vol}u64`,
      `${validForBlocks}u32`,
      `${currentBlock}u32`,
      attId,
    ];

    console.log(`[oracle][${jobId}] starting attest_credit`, inputs);

    const txId = await programManager.execute({
      programName:     PROGRAM_ID,
      functionName:    'attest_credit',
      inputs,
      priorityFee:     0.3,
      privateFee:      false,
      keySearchParams,
    });

    console.log(`[oracle][${jobId}] done — txId: ${txId}`);

    // Include oracle's own address so frontend can build the correct attRecord
    const oracleAddress = oracleAccount.address().to_string();

    jobs.set(jobId, {
      status: 'done',
      createdAt: jobs.get(jobId)!.createdAt,
      result: {
        txId,
        attestationId: attId,
        validUntil: currentBlock + validForBlocks,
        oracleAddress, // ← frontend needs this for buildOracleAttestation
        recipient,
        walletAgeDays: age,
        repaymentsMade: reps,
        defaults: defs,
        totalVolumeMicro: vol,
      },
      logs: []
    });
  } catch (err: any) {
    const msg = err.message ?? 'Attestation failed';
    pushLog(jobId, `❌ Error: ${msg}`);
    jobs.set(jobId, {
      status:    'error',
      error:     msg,
      logs:      jobs.get(jobId)?.logs ?? [],
      createdAt: jobs.get(jobId)?.createdAt ?? Date.now(),
    });
    // Notify SSE subscribers of error
    const subs = subscribers.get(jobId) ?? [];
    for (const res of subs) {
      try { res.write(`data: ${JSON.stringify({ error: msg })}

`); res.end(); } catch {}
    }
  }
}

// ── POST /attest ──────────────────────────────────────────────
// Returns { jobId } immediately — proving runs in background
app.post('/attest', (req, res) => {
  const { recipient, walletAgeDays, repaymentsMade, defaults, totalVolumeMicro, currentBlock } = req.body;

  if (!recipient || !isValidAleoAddress(recipient)) {
    return res.status(400).json({ error: 'Invalid recipient address' });
  }
  if (!currentBlock || currentBlock < 1) {
    return res.status(400).json({ error: 'Invalid block height' });
  }
  if (!ORACLE_KEY) {
    return res.status(500).json({ error: 'Oracle private key not configured' });
  }

  const age  = clamp(walletAgeDays  ?? 0, 0, 4_294_967_295);
  const reps = clamp(repaymentsMade ?? 0, 0, 4_294_967_295);
  const defs = clamp(defaults       ?? 0, 0, 4_294_967_295);
  const vol  = Math.max(0, Math.floor(totalVolumeMicro ?? 0));

  const jobId          = randomUUID();
  const attId          = `${BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))}field`;
  const validForBlocks = 360;

  // Register job as pending
  jobs.set(jobId, { status: 'pending', logs: [], createdAt: Date.now() });

  // Start proving in background — don't await
  runAttestation(jobId, { recipient, age, reps, defs, vol, currentBlock, attId, validForBlocks });

  // Return immediately
  res.json({ jobId });
});

// ── GET /attest/status?jobId=xxx ─────────────────────────────
app.get('/attest/status', (req, res) => {
  const jobId = req.query.jobId as string;
  if (!jobId) return res.status(400).json({ error: 'Missing jobId' });

  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (job.status === 'pending') {
    return res.json({ status: 'pending', logs: job.logs });
  }
  if (job.status === 'error') {
    return res.status(500).json({ status: 'error', error: job.error, logs: job.logs });
  }
  return res.json({ status: 'done', logs: job.logs, ...job.result });
});

// ── GET /attest/stream?jobId=xxx ──────────────────────────────
// Server-Sent Events endpoint for real-time log streaming
app.get('/attest/stream', (req, res) => {
  const jobId = req.query.jobId as string;
  if (!jobId) { res.status(400).end(); return; }

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const job = jobs.get(jobId);
  if (!job) { res.write(`data: ${JSON.stringify({ error: 'Job not found' })}

`); res.end(); return; }

  // Send all existing logs immediately (catch-up for late subscribers)
  for (const log of job.logs) {
    res.write(`data: ${JSON.stringify({ log })}

`);
  }

  // If already done/error, close immediately
  if (job.status !== 'pending') { res.end(); return; }

  // Register as subscriber for future logs
  const subs = subscribers.get(jobId) ?? [];
  subs.push(res);
  subscribers.set(jobId, subs);

  // Clean up on disconnect
  req.on('close', () => {
    const remaining = (subscribers.get(jobId) ?? []).filter(r => r !== res);
    subscribers.set(jobId, remaining);
  });
});

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`[oracle] server running on port ${PORT}`);
  console.log(`[oracle] CORS allowed for: *.github.dev, localhost`);
});

// Prevent the process from dying on unhandled errors
// (ZK proving errors should be caught per-job, not kill the server)
process.on('unhandledRejection', (reason) => {
  console.error('[oracle] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[oracle] uncaughtException:', err);
});