// Credit-weighted governance: voting power = tier level * staked ALEO.
// Diamond tier = 5x base weight. Proposals can change protocol params:
// tier thresholds, interest rates, flash loan fees, oracle operators.
//
// Ballots are private records — no one sees how you voted until
// the tally is finalized. Only the final count is on-chain.

import credits.aleo;
import zerolend_lending_pool_v4.aleo;

// ================================================================
// STRUCTS 
// ================================================================

struct ProposalContent {
    target_contract: field,
    param_key:       u8,
    new_value:       u64,
    description:     field,
}

// ================================================================
// HELPERS
// ================================================================

fn proposal_id(proposer: address, count: u32) -> field {
    return BHP256::hash_to_field(proposer) + count as field;
}

fn vote_weight(tier: u8, staked: u64) -> u64 {
    let tier_u64: u64 = tier as u64;
    return tier_u64 * staked;
}

fn voter_key(voter: address, prop_id: field) -> field {
    return BHP256::hash_to_field(voter) + prop_id;
}

program zerolend_governance_v1.aleo {

    // ================================================================
    // RECORDS
    // ================================================================

    record Ballot {
        owner:       address,
        proposal_id: field,
        vote_yes:    bool,
        weight:      u64,
        cast_block:  u32,
        nonce:       field,
    }

    record GovernanceStake {
        owner:        address,
        staked:       u64,
        staked_block: u32,
        nonce:        field,
    }

    // ================================================================
    // CONSTANTS
    // ================================================================

    const VOTING_PERIOD:  u32 = 17280u32;
    const QUORUM_BPS:     u64 = 1000u64;
    const PASS_BPS:       u64 = 6000u64;
    const MIN_STAKE:      u64 = 1_000_000u64;

    const PARAM_FLASH_FEE:      u8 = 1u8;
    const PARAM_LOAN_TERM:      u8 = 2u8;
    const PARAM_ORACLE_SLOT:    u8 = 3u8;
    const PARAM_MIN_VOUCH_TIER: u8 = 4u8;

    // ================================================================
    // MAPPINGS
    // ================================================================

    mapping protocol_admin:    u8      => address;
    mapping proposal_content:  field   => ProposalContent;
    mapping proposal_start:    field   => u32;
    mapping proposal_end:      field   => u32;
    mapping proposal_proposer: field   => address;
    mapping proposal_yes:      field   => u64;
    mapping proposal_no:       field   => u64;
    mapping proposal_executed: field   => bool;
    mapping staked_balance:    address => u64;
    mapping total_staked:      u8      => u64;
    mapping has_voted:         field   => bool;
    mapping proposal_count:    u8      => u32;

    // ================================================================
    // CONSTRUCTOR
    // ================================================================

    @noupgrade
    constructor() {}

    // ================================================================
    // SETUP
    // ================================================================

    fn initialize() -> Final {
        let admin: address = self.caller;
        return final {
            let existing: address = protocol_admin.get_or_use(
                0u8,
                aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf
            );
            assert_eq(existing, aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf);
            protocol_admin.set(0u8, admin);
            proposal_count.set(0u8, 0u32);
            total_staked.set(0u8, 0u64);
        };
    }

    // ================================================================
    // GOVERNANCE STAKING
    // ================================================================

    fn stake(
        input:       credits.aleo::credits,
        amount:      u64,
        cur_block:   u32,
        stake_nonce: field
    ) -> (credits.aleo::credits, GovernanceStake, Final) {
        assert(amount >= MIN_STAKE);

        let (change, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(input, self.address, amount);

        let staker: address = self.caller;
        let receipt: GovernanceStake = GovernanceStake {
            owner:        self.caller,
            staked:       amount,
            staked_block: cur_block,
            nonce:        stake_nonce,
        };

        return (change, receipt, final {
            transfer_future.run();
            let tier: u8 = zerolend_lending_pool_v4.aleo::credit_passport.get_or_use(staker, 0u8);
            assert(tier >= 1u8);

            let bal: u64 = staked_balance.get_or_use(staker, 0u64);
            staked_balance.set(staker, bal + amount);

            let total: u64 = total_staked.get_or_use(0u8, 0u64);
            total_staked.set(0u8, total + amount);
        });
    }

    fn unstake(
        receipt: GovernanceStake
    ) -> (credits.aleo::credits, Final) {
        assert_eq(receipt.owner, self.caller);

        let staker: address  = self.caller;
        let staked_amt: u64  = receipt.staked;

        let (payout, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(self.caller, staked_amt);

        return (payout, final {
            transfer_future.run();
            let bal: u64 = staked_balance.get(staker);
            assert(bal >= staked_amt);
            staked_balance.set(staker, bal - staked_amt);

            let total: u64 = total_staked.get_or_use(0u8, 0u64);
            total_staked.set(0u8, total >= staked_amt ? total - staked_amt : 0u64);
        });
    }

    // ================================================================
    // PROPOSALS
    // ================================================================

    fn propose(
        target_contract: field,
        param_key:       u8,
        new_value:       u64,
        description:     field,
        cur_block:       u32
    ) -> Final {
        let content: ProposalContent = ProposalContent {
            target_contract: target_contract,
            param_key:       param_key,
            new_value:       new_value,
            description:     description,
        };
        let proposer: address = self.caller;
        return final {
            let tier: u8 = zerolend_lending_pool_v4.aleo::credit_passport.get_or_use(proposer, 0u8);
            assert(tier >= 3u8);

            let bal: u64 = staked_balance.get_or_use(proposer, 0u64);
            assert(bal >= MIN_STAKE);

            let count: u32 = proposal_count.get_or_use(0u8, 0u32);
            let prop_id: field = BHP256::hash_to_field(proposer) + count as field;

            proposal_content.set(prop_id, content);
            proposal_start.set(prop_id, cur_block);
            proposal_end.set(prop_id, cur_block + VOTING_PERIOD);
            proposal_proposer.set(prop_id, proposer);
            proposal_yes.set(prop_id, 0u64);
            proposal_no.set(prop_id, 0u64);
            proposal_executed.set(prop_id, false);
            proposal_count.set(0u8, count + 1u32);
        };
    }

    // ================================================================
    // VOTING
    // ================================================================

    fn cast_vote(
        prop_id:    field,
        vote_yes:   bool,
        cur_block:  u32,
        vote_nonce: field
    ) -> (Ballot, Final) {
        let voter: address = self.caller;
        let ballot: Ballot = Ballot {
            owner:       self.caller,
            proposal_id: prop_id,
            vote_yes:    vote_yes,
            weight:      0u64,
            cast_block:  cur_block,
            nonce:       vote_nonce,
        };
        return (ballot, final {
            let start: u32 = proposal_start.get(prop_id);
            let end:   u32 = proposal_end.get(prop_id);
            assert(cur_block >= start);
            assert(cur_block <= end);

            let vkey: field = BHP256::hash_to_field(voter) + prop_id;
            let voted: bool = has_voted.get_or_use(vkey, false);
            assert(!voted);
            has_voted.set(vkey, true);

            let tier:   u8  = zerolend_lending_pool_v4.aleo::credit_passport.get_or_use(voter, 0u8);
            assert(tier >= 1u8);
            let staked: u64 = staked_balance.get_or_use(voter, 0u64);
            assert(staked >= MIN_STAKE);

            let weight: u64 = tier as u64 * staked;

            if vote_yes {
                let yes: u64 = proposal_yes.get_or_use(prop_id, 0u64);
                proposal_yes.set(prop_id, yes + weight);
            } else {
                let no: u64 = proposal_no.get_or_use(prop_id, 0u64);
                proposal_no.set(prop_id, no + weight);
            }
        });
    }

    // ================================================================
    // EXECUTION
    // ================================================================

    fn execute_proposal(prop_id: field, cur_block: u32) -> Final {
        return final {
            let end:      u32  = proposal_end.get(prop_id);
            let executed: bool = proposal_executed.get(prop_id);

            assert(cur_block > end);
            assert(!executed);

            let yes:   u64 = proposal_yes.get_or_use(prop_id, 0u64);
            let no:    u64 = proposal_no.get_or_use(prop_id, 0u64);
            let total: u64 = yes + no;

            let gov_total: u64 = total_staked.get_or_use(0u8, 0u64);
            let quorum:    u64 = (gov_total * QUORUM_BPS) / 10_000u64;
            assert(total >= quorum);

            let pass_threshold: u64 = (total * PASS_BPS) / 10_000u64;
            assert(yes >= pass_threshold);

            proposal_executed.set(prop_id, true);
        };
    }
}
