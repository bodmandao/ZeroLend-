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

app.use(cors());
app.use(express.json());

// ── In-memory job store ───────────────────────────────────────
// For production use Redis. For buildathon demo this is fine.
type JobStatus = 'pending' | 'done' | 'error';
interface Job {
  status:    JobStatus;
  result?:   Record<string, any>;
  error?:    string;
  createdAt: number;
}
const jobs = new Map<string, Job>();

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

    jobs.set(jobId, {
      status:    'done',
      createdAt: jobs.get(jobId)!.createdAt,
      result: {
        txId,
        attestationId:    attId,
        validUntil:       currentBlock + validForBlocks,
        recipient,
        walletAgeDays:    age,
        repaymentsMade:   reps,
        defaults:         defs,
        totalVolumeMicro: vol,
      },
    });
  } catch (err: any) {
    console.error(`[oracle][${jobId}] failed:`, err.message);
    jobs.set(jobId, {
      status:    'error',
      error:     err.message ?? 'Attestation failed',
      createdAt: jobs.get(jobId)!.createdAt,
    });
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
  jobs.set(jobId, { status: 'pending', createdAt: Date.now() });

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
    return res.json({ status: 'pending' });
  }
  if (job.status === 'error') {
    return res.status(500).json({ status: 'error', error: job.error });
  }
  // done
  return res.json({ status: 'done', ...job.result });
});

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[oracle] server running on port ${PORT}`);
});