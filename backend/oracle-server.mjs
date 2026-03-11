// oracle-server.mjs
// ─────────────────────────────────────────────────────────────
// Standalone Node.js oracle server.
// Run with: node oracle-server.mjs
//
// Required env vars (create a .env file or export them):
//   ORACLE_PRIVATE_KEY=APrivateKey1zkp...
//   PROGRAM_ID=zerolend_lending_pool_v1.aleo  (optional, has default)
//   PORT=3001                                  (optional, default 3001)
//
// In Next.js, set: NEXT_PUBLIC_ORACLE_URL=http://localhost:3001
// ─────────────────────────────────────────────────────────────

import { createServer }    from 'http';
import { readFileSync }    from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath }   from 'url';

// Load .env manually (no dotenv dependency needed)
try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '.env.local');
  const lines   = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const [k, ...rest] = line.split('=');
    if (k && rest.length) process.env[k.trim()] = rest.join('=').trim();
  }
} catch { /* .env.local not found — rely on exported env vars */ }

const PROGRAM_ID  = process.env.PROGRAM_ID  ?? 'zerolend_lending_pool_v1.aleo';
const ORACLE_KEY  = process.env.ORACLE_PRIVATE_KEY;
const NETWORK_URL = 'https://api.explorer.provable.com/v2';
const PORT        = parseInt(process.env.PORT ?? '3001');

if (!ORACLE_KEY) {
  console.error('❌  ORACLE_PRIVATE_KEY is not set. Exiting.');
  process.exit(1);
}

// Lazy-load SDK — imported once, reused across all requests
let sdk = null;
let keyProvider = null;
let programManager = null;
let threadPoolReady = false;

async function getSDK() {
  if (sdk) return { sdk, keyProvider, programManager };

  console.log('[oracle] Loading @provablehq/sdk...');
  sdk = await import('@provablehq/sdk');

  const { Account, AleoKeyProvider, AleoNetworkClient,
          NetworkRecordProvider, ProgramManager, initThreadPool } = sdk;

  if (!threadPoolReady) {
    console.log('[oracle] Initialising thread pool...');
    await initThreadPool();
    threadPoolReady = true;
    console.log('[oracle] Thread pool ready.');
  }

  // Module-level singletons — cache persists for the process lifetime
  keyProvider = new AleoKeyProvider();
  keyProvider.useCache(true);

  const oracleAccount  = new Account({ privateKey: ORACLE_KEY });
  const networkClient  = new AleoNetworkClient(NETWORK_URL);
  const recordProvider = new NetworkRecordProvider(oracleAccount, networkClient);

  programManager = new ProgramManager(NETWORK_URL, keyProvider, recordProvider);
  programManager.setAccount(oracleAccount);

  console.log('[oracle] ProgramManager ready. Oracle address:', oracleAccount.address().to_string());
  return { sdk, keyProvider, programManager };
}

// ── Validation helpers ────────────────────────────────────────
function isValidAleoAddress(addr) {
  return /^aleo1[a-z0-9]{58}$/.test(addr);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Math.floor(val ?? 0)));
}

// ── CORS headers ──────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── HTTP server ───────────────────────────────────────────────
const server = createServer(async (req, res) => {
  setCors(res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', program: PROGRAM_ID }));
    return;
  }

  // Attest endpoint
  if (req.method === 'POST' && req.url === '/attest') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const {
          recipient,
          walletAgeDays,
          repaymentsMade,
          defaults,
          totalVolumeMicro,
          currentBlock,
        } = JSON.parse(body);

        // Validate
        if (!recipient || !isValidAleoAddress(recipient)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid recipient address' }));
          return;
        }
        if (!currentBlock || currentBlock < 1) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid block height' }));
          return;
        }

        // Sanitize
        const age  = clamp(walletAgeDays,    0, 4_294_967_295);
        const reps = clamp(repaymentsMade,   0, 4_294_967_295);
        const defs = clamp(defaults,         0, 4_294_967_295);
        const vol  = Math.max(0, Math.floor(totalVolumeMicro ?? 0));

        const validForBlocks = 360;
        const validUntil     = currentBlock + validForBlocks;
        const attId          = `${BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))}field`;

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

        console.log('[oracle] attest_credit inputs:', inputs);

        const { programManager } = await getSDK();

        const keySearchParams = { cacheKey: `${PROGRAM_ID}:attest_credit` };

        const txId = await programManager.execute({
          programName:     PROGRAM_ID,
          functionName:    'attest_credit',
          inputs,
          priorityFee:     0.3,
          privateFee:      false,
          keySearchParams,
        });

        console.log('[oracle] ✅ txId:', txId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success:          true,
          txId,
          attestationId:    attId,
          validUntil,
          recipient,
          walletAgeDays:    age,
          repaymentsMade:   reps,
          defaults:         defs,
          totalVolumeMicro: vol,
        }));

      } catch (err) {
        console.error('[oracle] ❌ error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err?.message ?? 'Attestation failed' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`\n🔐 ZeroLend Oracle Server`);
  console.log(`   Listening on http://localhost:${PORT}`);
  console.log(`   Program:  ${PROGRAM_ID}`);
  console.log(`   Network:  ${NETWORK_URL}\n`);
});
