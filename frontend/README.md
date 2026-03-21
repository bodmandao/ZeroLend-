# ZeroLend — Private Credit on Aleo

> Undercollateralized lending powered by zero-knowledge proofs.
> Prove your creditworthiness. Keep your data private.

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS + custom glassmorphism
- **Animations**: Framer Motion
- **Blockchain**: Aleo testnet via `@provablehq/sdk`
- **Wallet**: Leo Wallet / Puzzle Wallet (browser extension)
- **Database**: Supabase (off-chain indexing)
- **State**: Zustand (persisted)

## Project Structure

```
zerolend/
├── app/
│   ├── page.tsx          # Dashboard / home
│   ├── borrow/page.tsx   # Request loans
│   ├── lend/page.tsx     # Deposit & earn yield
│   ├── credit/page.tsx   # ZK credit score
│   └── admin/page.tsx    # Oracle & pool admin
├── components/
│   └── layout/           # Navbar, Sidebar, Background
├── lib/
│   ├── aleo.ts           # Contract helpers, SDK wrappers
│   ├── store.ts          # Zustand global state
│   └── supabase.ts       # DB helpers
└── types/index.ts        # TypeScript types
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.local.example .env.local
```

Fill in your Supabase URL and anon key.

### 3. Supabase setup

1. Create a new Supabase project
2. Open the SQL editor
3. Run the contents of `supabase_schema.sql`

### 4. Deploy the contract

```bash
cd ../contracts/lending_pool
leo deploy --network testnet
```

Update `PROGRAM_ID` in `lib/aleo.ts` if deploying under a different name.

### 5. Run the frontend

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## User Flow

### Borrower
1. Connect Leo Wallet / Puzzle Wallet
2. Go to **Credit** → fill in credit data → click "Attest Credit Data"
3. Click "Mint Credit Record" to redeem the attestation
4. Click "Generate Tier Proof" — this creates a ZK proof of your tier
5. Go to **Borrow** → enter loan amount → click "Request Loan"
6. Repay before the due block to improve your credit score

### Lender
1. Connect wallet
2. Go to **Lend** → enter deposit amount → click "Deposit USDC"
3. Earn yield from borrower interest
4. Withdraw anytime

### Admin / Oracle
1. Go to **Admin** → Initialize Protocol (once after deploy)
2. Add oracle addresses
3. Use "Attest Credit Data" to submit off-chain credit data for users

## ZK Privacy Model

| Data | Visibility |
|------|-----------|
| Loan amount | Private (record) |
| Borrower identity | Private |
| Credit score | Private (view key only) |
| Repayment history | Private |
| Pool TVL | Public |
| Pool solvency | Publicly provable |
| Tier distribution | Public (aggregate only) |

## Leo CLI Reference

```bash
# Initialize
leo run initialize 1000000000000u128

# Attest credit
leo run attest_credit aleo1... 365u32 5u32 0u32 10000000000u128 500u32 100u32 9999field

# Redeem attestation
leo run redeem_attestation "{...}" 100u32 7777field

# Prove tier
leo run prove_tier "{...}" 5555field 200u32 100u32 1field

# Request loan
leo run request_loan "{...}" 500000000u128 100u32 3333field 42field

# Repay loan
leo run repay_loan "{...}" "{...}" "{...}" 200u32 8888field

# Prove solvency
leo run prove_solvency
```
