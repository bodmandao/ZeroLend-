/**
 * @zerolend/credit-sdk — Batch Verification Example
 *
 * Shows airdrop distribution and DAO voting weight by credit tier.
 * Run: npx tsx examples/batch-verification.ts
 */

import { ZeroLendClient, getTierInfo, microToAleo, CreditTier } from '../src/index';

const client = new ZeroLendClient();

// ── Airdrop distribution by tier ──────────────────────────────

interface AirdropAllocation {
  address:    string;
  tier:       CreditTier | null;
  tierLabel:  string;
  tokens:     number;
  multiplier: number;
}

async function calculateAirdrop(
  addresses: string[],
  baseAmount: number,   // base tokens for Tier 1
): Promise<AirdropAllocation[]> {
  const passports = await client.getPassports(addresses);

  return passports.map(p => {
    const tier       = p.tier ?? null;
    const multiplier = tier ?? 0;                 // no passport = 0x
    const tokens     = baseAmount * multiplier;
    const tierLabel  = tier ? getTierInfo(tier).label : 'No passport';

    return { address: p.address, tier, tierLabel, tokens, multiplier };
  });
}

// ── DAO voting weight by tier ─────────────────────────────────

interface VoteWeight {
  address:  string;
  tier:     CreditTier | null;
  weight:   number;
  reasoning: string;
}

async function calculateVotingWeights(addresses: string[]): Promise<VoteWeight[]> {
  const passports = await client.getPassports(addresses);

  return passports.map(p => {
    if (!p.published || !p.tier) {
      return {
        address: p.address,
        tier:    null,
        weight:  1,
        reasoning: 'Base weight (no credit passport)',
      };
    }
    const info = getTierInfo(p.tier);
    return {
      address:   p.address,
      tier:      p.tier,
      weight:    p.tier,  // tier 5 = 5x voting weight
      reasoning: `${info.label} tier: ${p.tier}x base weight`,
    };
  });
}

// ── Demo ──────────────────────────────────────────────────────

async function main() {
  console.log('\n=== ZeroLend Credit SDK — Batch Verification Example ===\n');

  // Simulate addresses with various tiers
  // In production, these would be real wallet addresses
  const addresses = [
    'aleo1v2a4e9vwfca67vf0vwz2g2gk3mhzqgyptya9d8krgj46duxr9g9sspkul2',
    'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc',
  ];

  // 1. Airdrop calculation
  console.log('1. Airdrop Distribution (base: 100 tokens per tier):');
  console.log('   ─'.repeat(30));

  const allocations = await calculateAirdrop(addresses, 100);
  let totalTokens = 0;

  for (const a of allocations) {
    console.log(
      `   ${a.address.slice(0, 20)}...  ` +
      `${(a.tierLabel).padEnd(12)}  ` +
      `${a.multiplier}x  →  ${a.tokens.toLocaleString()} tokens`
    );
    totalTokens += a.tokens;
  }
  console.log(`\n   Total tokens distributed: ${totalTokens.toLocaleString()}`);

  // 2. Voting weight
  console.log('\n2. DAO Voting Weights:');
  console.log('   ─'.repeat(30));

  const weights = await calculateVotingWeights(addresses);
  let totalWeight = 0;

  for (const w of weights) {
    console.log(
      `   ${w.address.slice(0, 20)}...  ` +
      `weight: ${w.weight}x  (${w.reasoning})`
    );
    totalWeight += w.weight;
  }
  console.log(`\n   Total voting power: ${totalWeight}`);

  // 3. Filter eligible addresses
  console.log('\n3. Filter — Gold+ only (tier >= 3):');
  const goldEligible = await client.filterByTier(addresses, 3);
  console.log(`   ${goldEligible.length} of ${addresses.length} addresses qualify`);
  goldEligible.forEach(a => console.log(`   ✅ ${a.slice(0, 30)}...`));

  // 4. Tier distribution of sample
  console.log('\n4. Sample Tier Distribution:');
  const passports = await client.getPassports(addresses);
  const dist: Record<string, number> = { 'None': 0, Bronze: 0, Silver: 0, Gold: 0, Platinum: 0, Diamond: 0 };
  const labels = ['', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
  for (const p of passports) {
    const label = p.tier ? labels[p.tier] : 'None';
    dist[label] = (dist[label] ?? 0) + 1;
  }
  for (const [label, count] of Object.entries(dist)) {
    if (count > 0) {
      const pct = Math.round((count / addresses.length) * 100);
      const bar = '█'.repeat(Math.ceil(pct / 5));
      console.log(`   ${label.padEnd(10)}: ${bar} ${count} (${pct}%)`);
    }
  }
}

main().catch(console.error);