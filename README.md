# ZeroLend

> **Private undercollateralized lending on Aleo.**
> Prove your creditworthiness with zero-knowledge proofs. Borrow without collateral. Keep every data point private.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Credit Score Model](#credit-score-model)
- [Tier System](#tier-system)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Pages & Features](#pages--features)
- [SDK](#sdk)
- [Tech Stack](#tech-stack)

---

## Overview

ZeroLend is an undercollateralized lending protocol built on the Aleo blockchain. Unlike traditional DeFi where you must lock up more than you borrow, ZeroLend uses **zero-knowledge proofs** to verify a borrower's credit history without revealing any raw data on-chain.

The entire credit history — wallet age, repayment count, defaults, volume — stays in a private record in the user's wallet. The lending pool only ever sees a single number: your **tier (1–5)**. Nothing else.

Wave 4 additions: privacy-preserving flash loans, an on-chain Credit Passport registry, and a published TypeScript SDK (`@zerolend-aleo/credit-sdk`) so any Aleo protocol can integrate credit verification in one line.

---

## How It Works

### For Borrowers

```
1. Connect wallet (Leo Wallet or Puzzle Wallet)
2. Credit data is auto-filled from:
   - On-chain: wallet age derived from first transaction timestamp
   - ZeroLend DB: past repayments and defaults on this protocol
3. Click "Attest Credit" → wallet generates ZK proof → CreditRecord minted to your wallet
4. Click "Generate Tier Proof" → wallet produces a CreditTierProof (reveals tier only)
5. Use the tier proof to request an undercollateralized loan
6. Repay before deadline — your score improves automatically on-chain
```

### For Lenders

```
1. Connect wallet
2. Deposit ALEO into the lending pool
3. Earn yield from borrower interest
4. Withdraw principal + earnings any time (subject to pool liquidity)
```

### For Flash Loan Users

```
1. Connect wallet
2. Specify borrow amount (no credit score required)
3. Receive funds as a private credits record
4. Use funds atomically — arbitrage, liquidations, collateral swaps
5. Repay principal + 1% fee in the same transaction bundle
6. If repayment is missing, the Aleo VM reverts everything
```

### Privacy Guarantee

| What the chain sees | What stays private |
|---|---|
| Tier number (1–5) | Wallet age in days |
| Loan amount | Repayment count |
| Repayment / liquidation event | Default count |
| Pool utilization rate | Total borrowing volume |
| Flash loan fee earned | Flash loan amount and purpose |
| Your wallet address | Your raw credit score |

---

## Credit Score Model

The score is computed entirely inside the ZK circuit — no server, no oracle.

```
score = (age_component + repayment_component − default_penalty + volume_component)
        clamped to [0, 1000]
```

| Component | Formula | Max pts |
|---|---|---|
| Wallet age | `min(age_days, 100) * 2` | 200 |
| Repayments | `min(repayments, 40) * 10` | 400 |
| Defaults | `defaults * 100` (subtracted) | −1000 |
| Volume | `min(volume_aleo, 200)` | 200 |

Payment history dominates. A single default costs 100 pts. Ten defaults wipe a perfect score.

---

## Tier System

| Tier | Score range | Max loan | APR | Term |
|---|---|---|---|---|
| 1 — Bronze | 0–299 | 10 ALEO | 20% | ~2 days |
| 2 — Silver | 300–499 | 50 ALEO | 15% | ~5 days |
| 3 — Gold | 500–699 | 200 ALEO | 10% | ~10 days |
| 4 — Platinum | 700–849 | 1,000 ALEO | 7% | ~20 days |
| 5 — Diamond | 850–1000 | 5,000 ALEO | 4% | ~30 days |

Loan terms are in blocks. Aleo produces roughly one block per 10 seconds.

---


## Project Structure

```
zerolend/
├── contracts/
│   └── main.leo                  # Single Leo program (all 12 transitions)
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Dashboard — pool stats, portfolio
│   │   ├── credit/page.tsx       # Attest credit, generate tier proof
│   │   ├── borrow/page.tsx       # Request loans, repayment UI
│   │   ├── lend/page.tsx         # Deposit and withdraw
│   │   ├── flash/page.tsx        # Flash loan UI
│   │   └── passport/page.tsx     # Credit Passport publish/lookup
│   ├── components/
│   │   └── Navbar.tsx            # Wallet connect, navigation
│   └── lib/
│       ├── aleo.ts               # Contract helpers, executeTransaction
│       ├── store.ts              # Zustand global state
│       ├── supabase.ts           # DB queries
│       └── index.ts              # TypeScript types
└── packages/
    └── credit-sdk/               # @zerolend-aleo/credit-sdk npm package
        ├── src/
        │   ├── index.ts          # ZeroLendClient, utilities, types
        │   ├── react.ts          # React hooks
        │   └── leo.ts            # Leo snippet generators
        └── examples/
            ├── basic.ts
            ├── express-middleware.ts
            └── batch-verification.ts
```

---

## Prerequisites

- Node.js 18+
- [Leo CLI](https://developer.aleo.org/leo/installation) for contract deployment
- [Shield Wallet](https://chromewebstore.google.com/detail/shield/hhddpjpacfjaakjioinajgmhlbhfchao) browser extension
- Supabase account (free tier is sufficient)
- Aleo testnet credits — get them at https://faucet.aleo.org

---

## Environment Variables

Create `.env.local` in the `frontend/` folder:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Contract
NEXT_PUBLIC_PROGRAM_ID=zerolend_lending_pool_v4.aleo
```

> Never commit private keys to version control.

---

## Local Development

```bash
# Install dependencies
cd frontend
npm install

# Start dev server
npm run dev
# → http://localhost:3000
```

---

## Pages & Features

### `/credit` — Credit Score

Three states depending on DB and wallet:

**Returning user** — on connect, the page queries the database for an existing attestation. If found, score and tier are restored from DB fields with no wallet decrypt prompt. The user goes straight to Generate Tier Proof.

**New user** — credit data is fetched automatically from two trustless sources: wallet age from the Aleo blockchain API, repayment history from the ZeroLend database. All fields are read-only once populated. Clicking **Attest Credit** generates the ZK proof locally and mints a `CreditRecord` to the wallet.

**After attestation** — Generate Tier Proof fetches the live `CreditRecord` from the wallet by block height (most recent unspent record), calls `prove_tier`, and stores the tier proof status in the database. The button disables permanently after generation so the same proof cannot be duplicated.

### `/borrow` — Borrow

- DB-first: checks for active loan on connect, blocks new borrowing if one exists
- Fetches `CreditTierProof` from wallet by block height (latest unspent)
- Single decrypt prompt — no pre-checks that trigger multiple prompts
- Repayment UI built into the page — fetches LoanRecord, CreditRecord, and credits from wallet in sequence
- Repayment marks loan as repaid in DB immediately

### `/lend` — Lend

- Fetches unspent credits records sorted by block height descending — picks the most recent (highest balance) with a single decrypt prompt
- `LenderDeposit` receipt fetched by outputIndex 0 (external_record outputs skipped by the ciphertext fetcher)
- Withdrawal removes deposit from list and refreshes pool stats immediately
- Per-row loading state on withdrawal buttons

### `/flash` — Flash Loans

- Borrow any amount atomically with no credit score required
- 1% fee calculated and shown before execution
- Pool liquidity cap enforced in UI
- Button disabled after completion — explicit "New Flash Loan" reset required
- Live stats: total fees earned by pool, total loans executed

### `/passport` — Credit Passport

- Publish your credit tier publicly (score stays private)
- Revoke at any time
- Lookup any address — auto-fires on paste when a valid 63-character Aleo address is detected
- Leo integration snippet shown so other developers can copy the mapping read

### `/` — Dashboard

- Real-time pool stats from chain mappings
- Tier distribution across all attested wallets
- Stats hidden when wallet is disconnected

---

## SDK

`@zerolend-aleo/credit-sdk` is published on npm and available to any developer.

```bash
npm install @zerolend-aleo/credit-sdk
```

```typescript
import { ZeroLendClient } from '@zerolend-aleo/credit-sdk';

const client = new ZeroLendClient();

// Check a wallet's published tier
const passport = await client.getPassport('aleo1...');

// Require a minimum tier
const result = await client.requireTier('aleo1...', 3); // Gold+
if (!result.passes) throw new Error(result.reason);

// Filter a list to eligible addresses
const eligible = await client.filterByTier(addresses, 3);
```

React hooks, Leo program snippet generators, and Express middleware examples are included. Full documentation at [npmjs.com/package/@zerolend-aleo/credit-sdk](https://npmjs.com/package/@zerolend-aleo/credit-sdk).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contract | Leo (Aleo) |
| Frontend framework | Next.js 14, TypeScript |
| Styling | Tailwind CSS, custom glassmorphism design system |
| Wallet integration | `@provablehq/aleo-wallet-adaptor-react` |
| Global state | Zustand (DB-first, localStorage as cache) |
| Database | Supabase (PostgreSQL) |
| Aleo network | Testnet via `https://api.explorer.provable.com/v1` |
| npm package | `@zerolend-aleo/credit-sdk` |

---

## License

MIT
