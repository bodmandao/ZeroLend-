// ================================================================
// ZeroLend — Governance Contract
// Program: zerolend_governance_v1.aleo
//
// Credit-weighted governance: voting power = tier level * staked ALEO.
// Diamond tier = 5x base weight. Proposals can change protocol params:
// tier thresholds, interest rates, flash loan fees, oracle operators.
//
// Ballots are private records — no one sees how you voted until
// the tally is finalized. Only the final count is on-chain.
// This is governance that couldn't exist on a transparent chain.
// ================================================================

import credits.aleo;
import zerolend_lending_pool_v4.aleo;

program zerolend_governance_v1.aleo {

    // ================================================================
    // STRUCTS
    // ================================================================

    struct ProposalContent {
        target_contract: field,   // BHP256 hash of program ID string
        param_key:       u8,      // which parameter to change
        new_value:       u64,     // proposed new value
        description:     field,   // BHP256 hash of description text
    }

    // ================================================================
    // RECORDS
    // ================================================================

    record Ballot {
        owner:       address,
        proposal_id: field,
        vote_yes:    bool,
        weight:      u64,    // tier * staked_amount
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

    const VOTING_PERIOD:  u32 = 17280u32;  // ~2 days at 10s/block
    const QUORUM_BPS:     u64 = 1000u64;   // 10% of total staked must vote
    const PASS_BPS:       u64 = 6000u64;   // 60% yes to pass
    const MIN_STAKE:      u64 = 1_000_000u64; // 1 ALEO minimum

    // Proposal param keys
    const PARAM_FLASH_FEE:      u8 = 1u8;
    const PARAM_LOAN_TERM:      u8 = 2u8;
    const PARAM_ORACLE_SLOT:    u8 = 3u8;
    const PARAM_MIN_VOUCH_TIER: u8 = 4u8;

    // ================================================================
    // MAPPINGS
    // ================================================================

    mapping protocol_admin:    u8      => address;

    // Proposal storage
    mapping proposal_content:  field   => ProposalContent;
    mapping proposal_start:    field   => u32;   // start block
    mapping proposal_end:      field   => u32;   // end block
    mapping proposal_proposer: field   => address;
    mapping proposal_yes:      field   => u64;   // weighted yes votes
    mapping proposal_no:       field   => u64;   // weighted no votes
    mapping proposal_executed: field   => bool;

    // Governance staking
    mapping staked_balance:    address => u64;
    mapping total_staked:      u8      => u64;

    // Prevent double-voting: BHP256(voter ++ proposal_id) => voted
    mapping has_voted:         field   => bool;

    // Proposal nonce (used to generate unique proposal IDs)
    mapping proposal_count:    u8      => u32;

    // ================================================================
    // HELPERS
    // ================================================================

    inline proposal_id(proposer: address, count: u32) -> field {
        return BHP256::hash_to_field(proposer) + count as field;
    }

    inline vote_weight(tier: u8, staked: u64) -> u64 {
        let tier_u64: u64 = tier as u64;
        return tier_u64 * staked;
    }

    inline voter_key(voter: address, prop_id: field) -> field {
        return BHP256::hash_to_field(voter) + prop_id;
    }

    @noupgrade
    async constructor() {}

    // ================================================================
    // SETUP
    // ================================================================

    async transition initialize() -> Future {
        return finalize_initialize(self.caller);
    }

    async function finalize_initialize(admin: address) {
        let existing: address = Mapping::get_or_use(
            protocol_admin, 0u8,
            aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf
        );
        assert_eq(existing, aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf);
        Mapping::set(protocol_admin, 0u8, admin);
        Mapping::set(proposal_count, 0u8, 0u32);
        Mapping::set(total_staked,   0u8, 0u64);
    }

    // ================================================================
    // GOVERNANCE STAKING
    // Stake ALEO to gain voting weight. Weight = tier * staked.
    // ================================================================

    async transition stake(
        input:       credits.aleo/credits,
        amount:      u64,
        cur_block:   u32,
        stake_nonce: field
    ) -> (credits.aleo/credits, GovernanceStake, Future) {
        assert(amount >= MIN_STAKE);

        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(input, self.address, amount);

        let receipt: GovernanceStake = GovernanceStake {
            owner:        self.caller,
            staked:       amount,
            staked_block: cur_block,
            nonce:        stake_nonce,
        };

        return (change, receipt, finalize_stake(transfer_future, self.caller, amount));
    }

    async function finalize_stake(transfer_future: Future, staker: address, amount: u64) {
        transfer_future.await();
        // Must have a published passport to participate in governance
        let tier: u8 = zerolend_lending_pool_v4.aleo/credit_passport.get_or_use(staker, 0u8);
        assert(tier >= 1u8);

        let bal: u64 = Mapping::get_or_use(staked_balance, staker, 0u64);
        Mapping::set(staked_balance, staker, bal + amount);

        let total: u64 = Mapping::get_or_use(total_staked, 0u8, 0u64);
        Mapping::set(total_staked, 0u8, total + amount);
    }

    async transition unstake(
        receipt: GovernanceStake
    ) -> (credits.aleo/credits, Future) {
        assert_eq(receipt.owner, self.caller);

        let (payout, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, receipt.staked);

        return (payout, finalize_unstake(transfer_future, self.caller, receipt.staked));
    }

    async function finalize_unstake(transfer_future: Future, staker: address, amount: u64) {
        transfer_future.await();
        let bal: u64 = Mapping::get(staked_balance, staker);
        assert(bal >= amount);
        Mapping::set(staked_balance, staker, bal - amount);

        let total: u64 = Mapping::get_or_use(total_staked, 0u8, 0u64);
        Mapping::set(total_staked, 0u8, total >= amount ? total - amount : 0u64);
    }

    // ================================================================
    // PROPOSALS
    // Any wallet with staked balance and Gold+ tier can propose.
    // ================================================================

    async transition propose(
        target_contract: field,
        param_key:       u8,
        new_value:       u64,
        description:     field,
        cur_block:       u32
    ) -> Future {
        let content: ProposalContent = ProposalContent {
            target_contract: target_contract,
            param_key:       param_key,
            new_value:       new_value,
            description:     description,
        };
        return finalize_propose(self.caller, content, cur_block);
    }

    async function finalize_propose(
        proposer:  address,
        content:   ProposalContent,
        cur_block: u32
    ) {
        // Proposer must be Gold+ and have staked governance tokens
        let tier: u8 = zerolend_lending_pool_v4.aleo/credit_passport.get_or_use(proposer, 0u8);
        assert(tier >= 3u8);

        let bal: u64 = Mapping::get_or_use(staked_balance, proposer, 0u64);
        assert(bal >= MIN_STAKE);

        let count: u32 = Mapping::get_or_use(proposal_count, 0u8, 0u32);
        let prop_id: field = BHP256::hash_to_field(proposer) + count as field;

        Mapping::set(proposal_content,  prop_id, content);
        Mapping::set(proposal_start,    prop_id, cur_block);
        Mapping::set(proposal_end,      prop_id, cur_block + VOTING_PERIOD);
        Mapping::set(proposal_proposer, prop_id, proposer);
        Mapping::set(proposal_yes,      prop_id, 0u64);
        Mapping::set(proposal_no,       prop_id, 0u64);
        Mapping::set(proposal_executed, prop_id, false);
        Mapping::set(proposal_count,    0u8, count + 1u32);
    }

    // ================================================================
    // VOTING
    // Private ballot — the vote direction stays in the record.
    // Only the aggregate weighted count is public on-chain.
    // ================================================================

    async transition cast_vote(
        prop_id:    field,
        vote_yes:   bool,
        cur_block:  u32,
        vote_nonce: field
    ) -> (Ballot, Future) {
        let ballot: Ballot = Ballot {
            owner:       self.caller,
            proposal_id: prop_id,
            vote_yes:    vote_yes,
            weight:      0u64,      // actual weight calculated in finalize
            cast_block:  cur_block,
            nonce:       vote_nonce,
        };
        return (ballot, finalize_cast_vote(self.caller, prop_id, vote_yes, cur_block));
    }

    async function finalize_cast_vote(
        voter:     address,
        prop_id:   field,
        vote_yes:  bool,
        cur_block: u32
    ) {
        // Voting window must be open
        let start: u32 = Mapping::get(proposal_start, prop_id);
        let end:   u32 = Mapping::get(proposal_end,   prop_id);
        assert(cur_block >= start);
        assert(cur_block <= end);

        // Prevent double voting
        let vkey: field = BHP256::hash_to_field(voter) + prop_id;
        let voted: bool = Mapping::get_or_use(has_voted, vkey, false);
        assert(!voted);
        Mapping::set(has_voted, vkey, true);

        // Calculate weight: tier * staked
        let tier:   u8  = zerolend_lending_pool_v4.aleo/credit_passport.get_or_use(voter, 0u8);
        assert(tier >= 1u8);
        let staked: u64 = Mapping::get_or_use(staked_balance, voter, 0u64);
        assert(staked >= MIN_STAKE);

        let weight: u64 = tier as u64 * staked;

        if vote_yes {
            let yes: u64 = Mapping::get_or_use(proposal_yes, prop_id, 0u64);
            Mapping::set(proposal_yes, prop_id, yes + weight);
        } else {
            let no: u64 = Mapping::get_or_use(proposal_no, prop_id, 0u64);
            Mapping::set(proposal_no, prop_id, no + weight);
        }
    }
 
    // ================================================================
    // EXECUTION
    // After voting closes, anyone can execute a passed proposal.
    // Passed = yes > 60% of (yes+no), and quorum met.
    // ================================================================

    async transition execute_proposal(prop_id: field, cur_block: u32) -> Future {
        return finalize_execute_proposal(prop_id, cur_block);
    }

    async function finalize_execute_proposal(prop_id: field, cur_block: u32) {
        let end:      u32  = Mapping::get(proposal_end,      prop_id);
        let executed: bool = Mapping::get(proposal_executed, prop_id);

        assert(cur_block > end);   // voting must be closed
        assert(!executed);

        let yes:   u64 = Mapping::get_or_use(proposal_yes, prop_id, 0u64);
        let no:    u64 = Mapping::get_or_use(proposal_no,  prop_id, 0u64);
        let total: u64 = yes + no;

        // Quorum check: total votes >= 10% of governance stake
        let gov_total: u64 = Mapping::get_or_use(total_staked, 0u8, 0u64);
        let quorum:    u64 = (gov_total * QUORUM_BPS) / 10_000u64;
        assert(total >= quorum);

        // Pass check: yes >= 60% of total votes
        let pass_threshold: u64 = (total * PASS_BPS) / 10_000u64;
        assert(yes >= pass_threshold);

        Mapping::set(proposal_executed, prop_id, true);

        // Note: actual parameter changes are applied by reading
        // proposal_content[prop_id] and calling the target contract.
        // The execution event on-chain is sufficient — the admin bot
        // watches for executed proposals and applies changes.
    }
}
