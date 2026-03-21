/**
 * @zerolend/credit-sdk — Express.js Integration Example
 *
 * Shows how to use Credit Passport as API route middleware.
 * Run: npx tsx examples/express-middleware.ts
 */

import { ZeroLendClient, CreditTier, isValidAleoAddress } from '../src/index';

// ── Middleware factory ─────────────────────────────────────────

const client = new ZeroLendClient();

interface MockRequest  { headers: Record<string, string>; path: string }
interface MockResponse { status: (n: number) => MockResponse; json: (d: any) => void }
type NextFn = () => void;

/**
 * Express-compatible middleware to require a minimum credit tier.
 * Reads the wallet address from the X-Aleo-Address header.
 */
function requireCreditTier(minTier: CreditTier) {
  return async (req: MockRequest, res: MockResponse, next: NextFn) => {
    const address = req.headers['x-aleo-address'];

    if (!address) {
      res.status(401).json({ error: 'Missing X-Aleo-Address header' });
      return;
    }

    if (!isValidAleoAddress(address)) {
      res.status(400).json({ error: 'Invalid Aleo address format' });
      return;
    }

    const result = await client.requireTier(address, minTier);

    if (!result.passes) {
      res.status(403).json({
        error:        'Insufficient credit tier',
        reason:       result.reason,
        requiredTier: result.requiredTier,
        actualTier:   result.actualTier,
        passportUrl:  `https://zero-lend-delta.vercel.app/passport?address=${address}`,
      });
      return;
    }

    // Attach passport info to request for downstream handlers
    (req as any).creditTier = result.actualTier;
    next();
  };
}

// ── Simulated route handlers ───────────────────────────────────

async function simulateRequest(
  path: string,
  address: string,
  handler: (req: MockRequest, res: MockResponse, next: NextFn) => Promise<void>,
  middleware: (req: MockRequest, res: MockResponse, next: NextFn) => Promise<void>
) {
  const req: MockRequest = { headers: { 'x-aleo-address': address }, path };
  let statusCode = 200;
  let responseBody: any = null;

  const res: MockResponse = {
    status: (n: number) => { statusCode = n; return res; },
    json:   (d: any)    => { responseBody = d; },
  };

  let nextCalled = false;
  const next: NextFn = () => { nextCalled = true; };

  await middleware(req, res, next);

  if (nextCalled) {
    await handler(req, res, next);
  }

  return { statusCode, body: responseBody, nextCalled };
}

// ── Demo ──────────────────────────────────────────────────────

async function main() {
  console.log('\n=== ZeroLend Credit SDK — Express Middleware Example ===\n');

  const TEST_ADDRESSES = {
    gold:    'aleo1kgzar3t6sp9ml6yfxw6v2hla320wz5fcrl48fl7eamq7wutqnc8qnhgngy',
    noPassport: 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc',
  };

  // Route: require Gold (3) to access premium lending rates
  const premiumRatesMiddleware = requireCreditTier(3);
  const premiumRatesHandler = async (_req: MockRequest, res: MockResponse, _next: NextFn) => {
    res.status(200).json({ rates: { apr: 4, maxLoan: '1000 ALEO' } });
  };

  console.log('Testing /api/premium-rates (requires Gold tier 3+):');

  const r1 = await simulateRequest(
    '/api/premium-rates',
    TEST_ADDRESSES.gold,
    premiumRatesHandler,
    premiumRatesMiddleware
  );
  console.log(`  Gold wallet:       HTTP ${r1.statusCode}`, r1.body);

  const r2 = await simulateRequest(
    '/api/premium-rates',
    TEST_ADDRESSES.noPassport,
    premiumRatesHandler,
    premiumRatesMiddleware
  );
  console.log(`  No-passport wallet: HTTP ${r2.statusCode}`, r2.body);

  console.log('\n// Real Express usage:');
  console.log(`
  import express from 'express';
  import { requireCreditTier } from './middleware';
  
  const app = express();
  
  // Public route — anyone
  app.get('/api/rates', getRatesHandler);
  
  // Gated route — Silver+
  app.post('/api/borrow', requireCreditTier(2), borrowHandler);
  
  // Premium route — Gold+
  app.get('/api/premium', requireCreditTier(3), premiumHandler);
  
  // Elite route — Diamond
  app.post('/api/whale-loan', requireCreditTier(5), whaleLoanHandler);
  `);
}

main().catch(console.error);