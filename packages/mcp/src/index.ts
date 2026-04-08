#!/usr/bin/env node
// ================================================================
// @zerolend-aleo/mcp — ZeroLend MCP Server
//
// Exposes ZeroLend credit infrastructure as MCP tools so AI agents
// (Claude Desktop, Claude Code, etc.) can:
//   - Check any wallet's credit tier
//   - Query pool stats across ALEO / USDCx / USAD pools
//   - Check vouching relationships
//   - Gate access to features by credit tier
//   - Get oracle consensus status
//
// Install: npm install -g @zerolend-aleo/mcp
// Add to claude_desktop_config.json:
//   {
//     "mcpServers": {
//       "zerolend": {
//         "command": "zerolend-mcp"
//       }
//     }
//   }
// ================================================================

import { Server } from '@modelcontextprotocol/sdk/server/index';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types';
import {
  ZeroLendClient,
  TIER_INFO,
  microToAleo,
  baseToUsd,
  isValidAleoAddress,
  type TokenPool,
  type CreditTier,
} from '@zerolend-aleo/credit-sdk';

const client = new ZeroLendClient();

const server = new Server(
  { name: 'zerolend', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ================================================================
// TOOL DEFINITIONS
// ================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_credit_tier',
      description:
        'Get the ZeroLend credit tier (1-5) for an Aleo wallet address. ' +
        'Returns tier name (Bronze/Silver/Gold/Platinum/Diamond), max loan amounts ' +
        'across all pools (ALEO, USDCx, USAD), and interest rates. ' +
        'Returns null if no Credit Passport has been published.',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Aleo wallet address (starts with aleo1)',
          },
        },
        required: ['address'],
      },
    },
    {
      name: 'check_tier_requirement',
      description:
        'Check whether an Aleo wallet meets a minimum credit tier requirement. ' +
        'Use this to determine if a wallet can access a credit-gated feature.',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Aleo wallet address to check',
          },
          min_tier: {
            type: 'number',
            description: 'Minimum required tier (1=Bronze, 2=Silver, 3=Gold, 4=Platinum, 5=Diamond)',
            minimum: 1,
            maximum: 5,
          },
        },
        required: ['address', 'min_tier'],
      },
    },
    {
      name: 'get_pool_stats',
      description:
        'Get live statistics for a ZeroLend lending pool. ' +
        'Returns total liquidity, total borrowed, utilization rate, and active loan count.',
      inputSchema: {
        type: 'object',
        properties: {
          pool: {
            type: 'string',
            description: 'Which pool to query: "aleo", "usdcx", or "usad"',
            enum: ['aleo', 'usdcx', 'usad'],
          },
        },
        required: ['pool'],
      },
    },
    {
      name: 'get_all_pool_stats',
      description:
        'Get live statistics for all three ZeroLend pools (ALEO, USDCx, USAD) at once. ' +
        'Returns liquidity, utilization, and active loans for each.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'get_flash_loan_stats',
      description:
        'Get flash loan statistics for a ZeroLend pool: total fees earned and loan count.',
      inputSchema: {
        type: 'object',
        properties: {
          pool: {
            type: 'string',
            description: 'Which pool: "aleo", "usdcx", or "usad"',
            enum: ['aleo', 'usdcx', 'usad'],
          },
        },
        required: ['pool'],
      },
    },
    {
      name: 'filter_wallets_by_tier',
      description:
        'Given a list of Aleo wallet addresses, return only those that meet a minimum credit tier. ' +
        'Useful for DAO voting eligibility, airdrop distribution, or access control.',
      inputSchema: {
        type: 'object',
        properties: {
          addresses: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of Aleo wallet addresses to filter',
          },
          min_tier: {
            type: 'number',
            description: 'Minimum tier required (1-5)',
            minimum: 1,
            maximum: 5,
          },
        },
        required: ['addresses', 'min_tier'],
      },
    },
    {
      name: 'get_tier_distribution',
      description:
        'Get the distribution of credit tiers across all attested ZeroLend wallets. ' +
        'Returns count of wallets at each tier level.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'get_tier_info',
      description:
        'Get detailed information about a specific credit tier: label, score range, ' +
        'max loan amounts per pool, and interest rates.',
      inputSchema: {
        type: 'object',
        properties: {
          tier: {
            type: 'number',
            description: 'Tier level (1=Bronze, 2=Silver, 3=Gold, 4=Platinum, 5=Diamond)',
            minimum: 1,
            maximum: 5,
          },
        },
        required: ['tier'],
      },
    },
  ],
}));

// ================================================================
// TOOL HANDLERS
// ================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {

      case 'get_credit_tier': {
        const { address } = args as { address: string };
        if (!isValidAleoAddress(address)) {
          return text(`Invalid Aleo address format: ${address}`);
        }
        const passport = await client.getPassport(address);
        if (!passport.published || passport.tier === null) {
          return text(
            `No Credit Passport found for ${address}. ` +
            `The wallet has not published a credit tier on ZeroLend.`
          );
        }
        const info = TIER_INFO[passport.tier];
        return text(
          `Credit Passport for ${address}:\n` +
          `  Tier: ${passport.tier} (${info.label})\n` +
          `  Last updated: block ${passport.updatedAt}\n` +
          `  Max loan — ALEO: ${info.maxLoanAleo} ALEO, USDCx: $${info.maxLoanUsdcx}, USAD: $${info.maxLoanUsad}\n` +
          `  Interest rates — ALEO: ${info.rateApr}% APR, USDCx: ${info.rateAprUsdcx}% APR, USAD: ${info.rateAprUsad}% APR`
        );
      }

      case 'check_tier_requirement': {
        const { address, min_tier } = args as { address: string; min_tier: number };
        if (!isValidAleoAddress(address)) {
          return text(`Invalid Aleo address format: ${address}`);
        }
        const result = await client.requireTier(address, min_tier as CreditTier);
        return text(
          `Tier check for ${address} (required: ${min_tier}):\n` +
          `  Result: ${result.passes ? 'PASS' : 'FAIL'}\n` +
          `  Actual tier: ${result.actualTier ?? 'none (no passport)'}\n` +
          `  Reason: ${result.reason}`
        );
      }

      case 'get_pool_stats': {
        const { pool } = args as { pool: TokenPool };
        const stats = await client.getPoolStats(pool);
        const isStable = pool !== 'aleo';
        const fmt = (n: number) => isStable ? `$${baseToUsd(n).toLocaleString()}` : `${microToAleo(n).toLocaleString()} ALEO`;
        return text(
          `ZeroLend ${pool.toUpperCase()} Pool Stats:\n` +
          `  Total liquidity: ${fmt(stats.totalLiquidity)}\n` +
          `  Total borrowed:  ${fmt(stats.totalBorrowed)}\n` +
          `  Utilization:     ${stats.utilizationRate}%\n` +
          `  Active loans:    ${stats.activeLoanCount}\n` +
          `  Interest earned: ${fmt(stats.interestEarned)}`
        );
      }

      case 'get_all_pool_stats': {
        const all = await client.getAllPoolStats();
        const lines = (['aleo', 'usdcx', 'usad'] as TokenPool[]).map(pool => {
          const s = all[pool];
          const isStable = pool !== 'aleo';
          const fmt = (n: number) => isStable ? `$${baseToUsd(n).toFixed(2)}` : `${microToAleo(n).toFixed(2)} ALEO`;
          return (
            `${pool.toUpperCase()} Pool:\n` +
            `  Liquidity: ${fmt(s.totalLiquidity)} | Borrowed: ${fmt(s.totalBorrowed)} | ` +
            `Utilization: ${s.utilizationRate}% | Loans: ${s.activeLoanCount}`
          );
        });
        return text('ZeroLend All Pool Stats:\n\n' + lines.join('\n\n'));
      }

      case 'get_flash_loan_stats': {
        const { pool } = args as { pool: TokenPool };
        const stats = await client.getFlashLoanStats(pool);
        const isStable = pool !== 'aleo';
        const feeFmt = isStable
          ? `$${baseToUsd(stats.totalFeesEarned).toFixed(4)}`
          : `${microToAleo(stats.totalFeesEarned).toFixed(4)} ALEO`;
        return text(
          `ZeroLend ${pool.toUpperCase()} Flash Loan Stats:\n` +
          `  Total fees earned: ${feeFmt}\n` +
          `  Total flash loans: ${stats.totalLoansCount}`
        );
      }

      case 'filter_wallets_by_tier': {
        const { addresses, min_tier } = args as { addresses: string[]; min_tier: number };
        const invalid = addresses.filter(a => !isValidAleoAddress(a));
        if (invalid.length > 0) {
          return text(`Invalid Aleo address(es): ${invalid.join(', ')}`);
        }
        const eligible = await client.filterByTier(addresses, min_tier as CreditTier);
        const tierLabel = TIER_INFO[min_tier as CreditTier].label;
        return text(
          `Wallets meeting ${tierLabel}+ (tier ${min_tier}) requirement:\n` +
          `  ${eligible.length} of ${addresses.length} eligible\n` +
          (eligible.length > 0
            ? `  Eligible: ${eligible.join(', ')}`
            : '  No eligible wallets found.')
        );
      }

      case 'get_tier_distribution': {
        const dist = await client.getTierDistribution();
        const lines = ([1, 2, 3, 4, 5] as CreditTier[]).map(t => {
          const info = TIER_INFO[t];
          return `  Tier ${t} (${info.label}): ${dist[t]} wallets`;
        });
        const total = Object.values(dist).reduce((a, b) => a + b, 0);
        return text(
          `ZeroLend Credit Tier Distribution (${total} total attested wallets):\n` +
          lines.join('\n')
        );
      }

      case 'get_tier_info': {
        const { tier } = args as { tier: number };
        const info = TIER_INFO[tier as CreditTier];
        return text(
          `Tier ${tier} — ${info.label}:\n` +
          `  Min score required: ${info.minScore}\n` +
          `  Max loan (ALEO pool): ${info.maxLoanAleo} ALEO\n` +
          `  Max loan (USDCx pool): $${info.maxLoanUsdcx}\n` +
          `  Max loan (USAD pool): $${info.maxLoanUsad}\n` +
          `  Interest rate (ALEO): ${info.rateApr}% APR\n` +
          `  Interest rate (USDCx): ${info.rateAprUsdcx}% APR\n` +
          `  Interest rate (USAD): ${info.rateAprUsad}% APR\n` +
          `  UI color: ${info.color}`
        );
      }

      default:
        return text(`Unknown tool: ${name}`);
    }
  } catch (err: any) {
    return text(`Error: ${err.message ?? String(err)}`);
  }
});

// ================================================================
// HELPERS
// ================================================================

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] };
}

// ================================================================
// START
// ================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until process exits — do not log to stdout (breaks MCP)
}

main().catch(err => {
  process.stderr.write(`ZeroLend MCP fatal error: ${err.message}\n`);
  process.exit(1);
});
