# @zerolend-aleo/credit-sdk

**ZeroLend Credit Passport SDK** — verify Aleo wallet credit tiers with zero raw data exposure.

Any protocol on Aleo can gate access by credit tier in three lines of code. No ZK proofs required on your side — ZeroLend handles the cryptography. You just read a public mapping.

[![npm version](https://img.shields.io/npm/v/@zerolend/credit-sdk)](https://www.npmjs.com/package/@zerolend/credit-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## How it works

Users build their credit history on ZeroLend and optionally publish a **Credit Passport** — a single on-chain mapping entry that says "this wallet is Tier X". Their score, transaction history, and all personal data stays private inside a ZK-verified record. Only the tier number (1–5) is ever written to chain.

Your protocol reads that mapping. That's it.

```
ZeroLend contract:
  credit_passport[aleo1user...] = 3u8   ← Gold tier, publicly readable
  
Your contract:
  let tier = credit_passport[user]       ← one mapping read
  assert(tier >= 3u8)                    ← access control done
```

---

## Installation

```bash
npm install @zerolend-aloe/credit-sdk
# or
pnpm add @zerolend-aleo/credit-sdk
# or
yarn add @zerolend-aleo/credit-sdk
```

---

## Quick Start

### JavaScript / TypeScript

```typescript
import { ZeroLendClient } from '@zerolend-aleo/credit-sdk';

const client = new ZeroLendClient();

// Check if a wallet has a published passport
const passport = await client.getPassport('aleo1...');

if (passport.published) {
  console.log(`Tier: ${passport.tier}`);       // e.g. 3
  console.log(`Updated at block: ${passport.updatedAt}`);
} else {
  console.log('No passport published');
}
```

### Require a minimum tier

```typescript
const result = await client.requireTier('aleo1...', 3); // Gold+

if (!result.passes) {
  throw new Error(result.reason);
  // "Tier 2 (Silver) does not meet minimum Tier 3 (Gold)"
}
// proceed with your logic
```

### Filter a list of addresses

```typescript
const addresses = ['aleo1...', 'aleo1...', 'aleo1...'];
const goldAndAbove = await client.filterByTier(addresses, 3);
// Returns only addresses with Tier >= 3
```

---

## React Hooks

```tsx
import { usePassport, useTierCheck, usePoolStats } from '@zerolend-aleo/credit-sdk/react';

// Display a user's credit tier
function CreditBadge({ address }: { address: string }) {
  const { passport, loading } = usePassport(address);

  if (loading) return <Spinner />;
  if (!passport?.published) return <p>No passport</p>;

  return <TierBadge tier={passport.tier} />;
}

// Gate a feature behind a minimum tier
function PremiumFeature({ address }: { address: string }) {
  const { result, loading } = useTierCheck(address, 3); // Gold+

  if (loading) return <Spinner />;
  if (!result?.passes) return <p>{result?.reason}</p>;

  return <PremiumContent />;
}

// Live pool stats with auto-refresh
function PoolDashboard() {
  const { stats } = usePoolStats({ refreshInterval: 30_000 });

  return (
    <div>
      <p>Utilization: {stats?.utilizationRate}%</p>
      <p>Total borrowed: {stats?.totalBorrowed} microcredits</p>
    </div>
  );
}
```

---

## Leo Program Integration

Gate functionality in your own Aleo program by reading ZeroLend's public mapping directly.

### Minimal example

```leo
import zerolend_lending_pool_v3.aleo;

program my_protocol.aleo {

    async transition protected_action() -> Future {
        return finalize_protected_action(self.caller);
    }

    async function finalize_protected_action(user: address) {
        // Read credit tier from ZeroLend's public passport mapping
        let tier: u8 = Mapping::get_or_use(
            zerolend_lending_pool_v3.aleo/credit_passport,
            user,
            0u8   // 0 = no passport published
        );
        assert(tier >= 3u8);  // Require Gold (3) or higher
        
        // Your logic here — only Gold+ wallets reach this point
    }
}
```

### Generate a snippet programmatically

```typescript
import { generateLeoTierCheck } from '@zerolend-aleo/credit-sdk';

const snippet = generateLeoTierCheck(4); // Platinum+
console.log(snippet);
```

### Full Leo program template

```typescript
import { LEO_PROGRAM_TEMPLATE } from '@zerolend-aleo/credit-sdk';
console.log(LEO_PROGRAM_TEMPLATE); // Copy-paste ready template
```

---

## Tier Reference

| Tier | Label    | Min Score | Max Loan   | APR  | Color     |
|------|----------|-----------|------------|------|-----------|
| 1    | Bronze   | 0         | 10 ALEO    | 20%  | `#ef4444` |
| 2    | Silver   | 300       | 50 ALEO    | 15%  | `#f59e0b` |
| 3    | Gold     | 500       | 200 ALEO   | 10%  | `#3b82f6` |
| 4    | Platinum | 700       | 1,000 ALEO | 7%   | `#10b981` |
| 5    | Diamond  | 850       | 5,000 ALEO | 4%   | `#00d4ff` |

```typescript
import { getTierInfo, TIER_INFO } from '@zerolend-aleo/credit-sdk';

const info = getTierInfo(3);
// {
//   tier: 3,
//   label: 'Gold',
//   minScore: 500,
//   maxLoanAleo: 200,
//   rateApr: 10,
//   color: '#3b82f6'
// }
```

---

## API Reference

### `ZeroLendClient`

```typescript
const client = new ZeroLendClient(options?);
```

**Options:**

| Option      | Type                        | Default                                          | Description                    |
|-------------|-----------------------------|-------------------------------------------------|--------------------------------|
| `apiUrl`    | `string`                    | `https://api.explorer.provable.com/v1`          | Aleo API base URL              |
| `network`   | `'testnet' \| 'mainnet'`   | `'testnet'`                                     | Aleo network                   |
| `programId` | `string`                    | `zerolend_lending_pool_v3.aleo`                 | ZeroLend program ID            |

---

#### `client.getPassport(address)`

Fetch the Credit Passport for a single address.

```typescript
const passport: CreditPassport = await client.getPassport('aleo1...');
```

**Returns:** `CreditPassport`

```typescript
interface CreditPassport {
  address:   string;
  tier:      CreditTier | null;  // null if not published
  updatedAt: number;             // block height
  published: boolean;
}
```

---

#### `client.requireTier(address, minTier)`

Check whether an address meets a minimum tier. Use in your access control logic.

```typescript
const result: TierCheckResult = await client.requireTier('aleo1...', 3);
```

**Returns:** `TierCheckResult`

```typescript
interface TierCheckResult {
  passes:       boolean;
  actualTier:   CreditTier | null;
  requiredTier: CreditTier;
  reason:       string;
}
```

---

#### `client.getPassports(addresses)`

Batch fetch passports for multiple addresses in parallel.

```typescript
const passports = await client.getPassports(['aleo1...', 'aleo1...']);
```

---

#### `client.filterByTier(addresses, minTier)`

Return only addresses meeting a minimum tier from a list.

```typescript
const eligible = await client.filterByTier(addresses, 4); // Platinum+
```

---

#### `client.getPoolStats()`

Fetch current ZeroLend pool statistics.

```typescript
const stats: PoolStats = await client.getPoolStats();
```

**Returns:** `PoolStats`

```typescript
interface PoolStats {
  totalLiquidity:  number;  // microcredits
  totalBorrowed:   number;  // microcredits
  interestEarned:  number;  // microcredits
  activeLoanCount: number;
  utilizationRate: number;  // 0-100
}
```

---

#### `client.getFlashLoanStats()`

Fetch flash loan statistics.

```typescript
const stats: FlashLoanStats = await client.getFlashLoanStats();
// { totalFeesEarned: 50000, totalLoansCount: 12 }
```

---

#### `client.getTierDistribution()`

Get the count of wallets in each tier across the entire protocol.

```typescript
const dist = await client.getTierDistribution();
// { 1: 43, 2: 28, 3: 15, 4: 7, 5: 2 }
```

---

### Standalone Utilities

```typescript
import {
  getTierInfo,
  microToAleo,
  aleoToMicro,
  isValidAleoAddress,
  maxLoanForTier,
  aprForTier,
  computeInterest,
  flashLoanFee,
} from '@zerolend-aleo/credit-sdk';

getTierInfo(3)                          // → { label: 'Gold', ... }
microToAleo(5_000_000)                  // → 5
aleoToMicro(5)                          // → 5_000_000
isValidAleoAddress('aleo1abc...')       // → true/false
maxLoanForTier(3)                       // → 200 (ALEO)
aprForTier(5)                           // → 4 (%)
computeInterest(1_000_000, 1000, 8640)  // → interest in microcredits
flashLoanFee(10_000_000)                // → 100_000 (1% of 10 ALEO)
```

---

### React Hooks

Import from `@zerolend-aleo/credit-sdk/react`:

| Hook                 | Description                                    |
|----------------------|------------------------------------------------|
| `usePassport`        | Fetch a single address's passport              |
| `useTierCheck`       | Check if address meets minimum tier            |
| `usePoolStats`       | Live pool statistics with optional auto-refresh|
| `useFlashLoanStats`  | Flash loan stats                               |

---

## Examples

### DAO Governance — weight votes by tier

```typescript
import { ZeroLendClient, microToAleo } from '@zerolend-aleo/credit-sdk';

const client = new ZeroLendClient();

async function getVoteWeight(voterAddress: string): Promise<number> {
  const passport = await client.getPassport(voterAddress);
  if (!passport.published || !passport.tier) return 1; // base weight
  return passport.tier; // tier 5 gets 5x voting weight
}
```

### NFT mint — require Silver tier

```typescript
async function canMint(address: string): Promise<boolean> {
  const result = await client.requireTier(address, 2); // Silver+
  return result.passes;
}
```

### Airdrop — distribute by tier

```typescript
async function calculateAirdrop(
  addresses: string[]
): Promise<{ address: string; amount: number }[]> {
  const passports = await client.getPassports(addresses);
  return passports.map(p => ({
    address: p.address,
    // Tier 5 gets 5x the base airdrop amount
    amount:  (p.tier ?? 0) * 100, // base: 100 tokens per tier
  }));
}
```

### Express.js middleware — protect API routes

```typescript
import { ZeroLendClient, CreditTier } from '@zerolend-aleo/credit-sdk';
import type { Request, Response, NextFunction } from 'express';

const client = new ZeroLendClient();

export function requireCreditTier(minTier: CreditTier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const address = req.headers['x-aleo-address'] as string;
    if (!address) return res.status(401).json({ error: 'No address provided' });

    const result = await client.requireTier(address, minTier);
    if (!result.passes) {
      return res.status(403).json({ error: result.reason, requiredTier: minTier });
    }
    next();
  };
}

// Usage:
// app.post('/api/premium', requireCreditTier(3), handler);
```

---

## Privacy Model

ZeroLend's Credit Passport is built on a selective disclosure principle:

- **What stays private:** credit score (0-1000), wallet age, repayment history, defaults, total volume — all stored as encrypted records in the user's wallet, never published on-chain.
- **What's public (only if user opts in):** the tier number (1-5) and the block it was last updated. That's it.
- **ZK-verified:** the tier is derived from the user's private `CreditRecord` inside a ZK circuit — they can't fake a higher tier. The on-chain value is cryptographically tied to real credit data.
- **User-controlled:** users publish and revoke their passport at any time. It's opt-in. Revocation sets the mapping back to 0 instantly.

---

## Network

| Network | Program ID                            | Status      |
|---------|---------------------------------------|-------------|
| Testnet | `zerolend_lending_pool_v3.aleo`       | ✅ Live      |
| Mainnet | Coming after testnet validation        | 🔜 Planned  |

---

## Contributing

1. Fork the repo
2. `pnpm install`
3. `pnpm dev` — watch mode
4. `pnpm build` — production build
5. Open a PR

---

## License

MIT © ZeroLend