/**
 * @zerolend/credit-sdk — Basic Usage Example
 *
 * Run: npx tsx examples/basic.ts
 */

import { ZeroLendClient, getTierInfo, microToAleo } from '../src/index';

const client = new ZeroLendClient();

const TEST_ADDRESS = 'aleo1kgzar3t6sp9ml6yfxw6v2hla320wz5fcrl48fl7eamq7wutqnc8qnhgngy';

async function main() {
  console.log('\n=== ZeroLend Credit SDK — Basic Example ===\n');

  // Fetch a single passport
  console.log('1. Fetching passport for:', TEST_ADDRESS);
  const passport = await client.getPassport(TEST_ADDRESS);
  if (passport.published && passport.tier) {
    const info = getTierInfo(passport.tier);
    console.log(`   ✅ Passport found: ${info.label} (Tier ${passport.tier})`);
    console.log(`   Updated at block: ${passport.updatedAt.toLocaleString()}`);
    console.log(`   Max loan: ${info.maxLoanAleo} ALEO`);
    console.log(`   APR: ${info.rateApr}%`);
  } else {
    console.log('   ❌ No passport published for this address');
  }

  // Require a minimum tier
  console.log('\n2. Checking tier requirement (Gold = 3)...');
  const check = await client.requireTier(TEST_ADDRESS, 3);
  console.log(`   ${check.passes ? '✅' : '❌'} ${check.reason}`);

  //  Pool stats
  console.log('\n3. Fetching pool stats...');
  const stats = await client.getPoolStats();
  console.log(`   Liquidity:   ${microToAleo(stats.totalLiquidity).toLocaleString()} ALEO`);
  console.log(`   Borrowed:    ${microToAleo(stats.totalBorrowed).toLocaleString()} ALEO`);
  console.log(`   Utilization: ${stats.utilizationRate}%`);
  console.log(`   Active loans:${stats.activeLoanCount}`);

  // Flash loan stats
  console.log('\n4. Fetching flash loan stats...');
  const flashStats = await client.getFlashLoanStats();
  console.log(`   Total loans:     ${flashStats.totalLoansCount}`);
  console.log(`   Total fees earned: ${microToAleo(flashStats.totalFeesEarned).toFixed(6)} ALEO`);

  // Tier distribution
  console.log('\n5. Tier distribution across all attested wallets...');
  const dist = await client.getTierDistribution();
  const tierLabels = ['', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
  for (const [tier, count] of Object.entries(dist)) {
    const bar = '█'.repeat(Math.min(count, 20));
    console.log(`   Tier ${tier} (${tierLabels[Number(tier)].padEnd(8)}): ${bar} ${count}`);
  }
}

main().catch(console.error);