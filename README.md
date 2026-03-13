# ZeroLend

> **Private undercollateralized lending on Aleo.**
> Prove your creditworthiness with zero-knowledge proofs. Borrow without collateral. Keep every data point private.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Credit Score Model](#credit-score-model)
- [Tier System](#tier-system)
- [Smart Contract](#smart-contract)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Deploying the Contract](#deploying-the-contract)
- [Database Setup](#database-setup)
- [Pages & Features](#pages--features)
- [Record Handling](#record-handling)
- [Tech Stack](#tech-stack)

---

## Overview

ZeroLend is an undercollateralized lending protocol built on the Aleo blockchain. Unlike traditional DeFi where you must lock up more than you borrow, ZeroLend uses **zero-knowledge proofs** to verify a borrower's credit history without revealing any raw data on-chain.

The entire credit history — wallet age, repayment count, defaults, volume — stays in a private record in the user's wallet. The lending pool only ever sees a single number: your **tier (1–5)**. Nothing else.

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

### Privacy Guarantee

| What the chain sees | What stays private |
|---|---|
| Tier number (1–5) | Wallet age in days |
| Loan amount | Repayment count |
| Repayment / liquidation event | Default count |
| Pool utilization rate | Total borrowing volume |
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
| Wallet age | `min(age_days, 365) * 100 / 365` | 100 |
| Repayments | `min(repayments, 20) * 35` | 700 |
| Defaults | `min(defaults, 10) * 100` (subtracted) | −1000 |
| Volume | `min(volume_aleo, 10000) * 200 / 10000` | 200 |

Payment history dominates (700 pts). A single default costs 100 pts. Ten defaults wipe out a perfect score.

---

## Tier System

| Tier | Score range | Max loan | APR | Term |
|---|---|---|---|---|
| 1 — Bronze | 0–199 | 10 ALEO | 25% | ~2 days |
| 2 — Silver | 200–399 | 50 ALEO | 18% | ~5 days |
| 3 — Gold | 400–599 | 200 ALEO | 12% | ~10 days |
| 4 — Platinum | 600–799 | 1,000 ALEO | 8% | ~20 days |
| 5 — Diamond | 800–1000 | 5,000 ALEO | 5% | ~30 days |

Loan terms are in blocks. Aleo produces roughly one block per 10 seconds.

---

## Smart Contract

**Program ID:** `zerolend_lending_pool_v2.aleo`

### Records (private — held in user wallets)

| Record | Owner | Purpose |
|---|---|---|
| `CreditRecord` | Borrower | Full credit history, stays private in wallet |
| `CreditTierProof` | Borrower | Reveals only tier + expiry, consumed on borrow |
| `LoanRecord` | Borrower | Private loan details, consumed on repayment |
| `LenderDeposit` | Lender | Proof of deposit amount and block |


---

## Project Structure

```
zerolend/frontend
├── app/
│   ├── page.tsx               # Dashboard — pool stats, portfolio
│   ├── borrow/page.tsx        # Request loans with tier proof
│   ├── lend/page.tsx          # Deposit and withdraw
│   └── credit/page.tsx        # Attest credit, generate tier proof
├── components/
│   └── Navbar.tsx             # Wallet connect, navigation
├── lib/
│   ├── aleo.ts                # Contract helpers, executeTransaction, SDK wrappers
│   ├── store.ts               # Zustand global state (persisted to localStorage)
│   ├── supabase.ts            # DB queries — loan history, attestation checks
│   └── index.ts               # TypeScript types for all records and DB rows
└── contracts/lending_pool
    └── main.leo               # Leo smart contract (single program)
```

---

## Prerequisites

- Node.js 18+
- [Leo CLI](https://developer.aleo.org/leo/installation) for contract deployment
- [Leo Wallet](https://leo.app) or [Sheild Wallet](https://puzzle.online) browser extension
- Supabase account (free tier is sufficient)
- Aleo testnet credits — get them at https://faucet.aleo.org

---

## Environment Variables

Create `.env.local` in the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Contract
NEXT_PUBLIC_PROGRAM_ID=zerolend_lending_pool_v1.aleo

# Admin wallet — only needed to run initialize() once after deploy
ADMIN_PRIVATE_KEY=APrivateKey1zkp...
```

> Remove `ADMIN_PRIVATE_KEY` from `.env.local` after initialization. Never commit private keys.

---

## Local Development

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Pages & Features

### `/credit` — Credit Score

The core of the protocol. Three states:

**Returning user (has existing `CreditRecord` in wallet)**
On connect, the page calls `requestRecords` + `decrypt` to scan for an unspent `CreditRecord`. If found, the score and tier are displayed immediately and the user goes straight to "Generate Tier Proof."

**New user (no record yet)**
Credit data is fetched automatically:
- Wallet age: derived from the oldest transaction timestamp via the Aleo API
- Repayments / defaults: queried from the ZeroLend Supabase database

All form fields are **read-only** once populated. The user cannot modify the inputs — they reflect objective on-chain and protocol history.

Clicking **Attest Credit** triggers a single wallet transaction. The ZK proof is generated locally in the browser. The resulting `CreditRecord` lands directly in the user's wallet.

**After attestation**
Clicking **Generate Tier Proof** fetches the live `CreditRecord` from the wallet (always fresh — never from local state), calls `prove_tier`, and produces a `CreditTierProof` ready for the borrow page.

### `/borrow` — Borrow

- Shows loan options available at the user's current tier
- Fetches `CreditTierProof` from wallet to gate eligibility
- Calls `request_loan` — ALEO arrives directly in the wallet
- Repay on time to improve tier over subsequent attestations

### `/lend` — Lend

- Deposit any amount of ALEO; `LenderDeposit` record minted as receipt
- Withdraw principal + pro-rata interest at any time
- Live pool utilization rate and estimated APY

### `/` — Dashboard

- Real-time pool stats: liquidity, borrowed, utilization, interest earned
- User portfolio: active loans, deposits, net balance
- Tier distribution chart (public aggregate — no individual data)

---


## Tech Stack

| Layer | Technology |
|---|---|
| Smart contract | Leo (Aleo) |
| Frontend framework | Next.js 14 , TypeScript |
| Styling | Tailwind CSS, custom glassmorphism design system |
| Wallet integration | `@provablehq/aleo-wallet-adaptor-react` |
| Global state | Zustand, persisted to localStorage |
| Database | Supabase (PostgreSQL) |
| Animations | Framer Motion |
| Aleo network | Testnet via `https://api.explorer.provable.com/v2` |

---

## License

MIT