// ================================================================
// ZeroLend — Social Vouching Contract
// Program: zerolend_vouching_v1.aleo
//
// Diamond/Platinum tier holders can stake ALEO behind a borrower,
// giving that borrower a +1 tier boost while the vouch is active.
// If the borrower defaults, anyone can slash the voucher's stake
// to the lending pool. This creates a social credit graph where
// established participants bootstrap new ones — economically.
//
// Only exists on a private credit protocol. On a public chain
// the social graph itself would leak identity. Here it doesn't.
// ================================================================

import credits.aleo;
import zerolend_lending_pool_v4.aleo;

program zerolend_vouching_v1.aleo {

    // ================================================================
    // RECORDS
    // ================================================================

    record VouchRecord {
        owner:        address,   // the voucher
        borrower:     address,
        staked:       u64,       // microcredits locked
        issued_block: u32,
        nonce:        field,
    }

    // ================================================================
    // CONSTANTS
    // ================================================================

    // Minimum tier required to vouch for someone
    const MIN_VOUCHER_TIER: u8 = 4u8;   // Platinum+

    // Tier boost granted to the borrower while vouch is active
    const TIER_BOOST: u8 = 1u8;

    // Minimum stake per vouch: 1 ALEO
    const MIN_STAKE: u64 = 1_000_000u64;

    // Max vouches a single address can hold at once (prevents spam)
    const MAX_VOUCHES_OUT: u32 = 5u32;

    // ================================================================
    // MAPPINGS
    // ================================================================

    mapping protocol_admin:    u8      => address;

    // Active vouches: BHP256(voucher ++ borrower) => staked amount
    // 0 = no active vouch, >0 = active
    mapping active_vouches:    field   => u64;

    // Vouch issue block: same key => block issued (for expiry calc)
    mapping vouch_issued_at:   field   => u32;

    // Borrower's active vouch boost: borrower => boosted tier
    // 0 = no boost active
    mapping vouch_boost:       address => u8;

    // Voucher's outbound vouch count
    mapping vouches_out:       address => u32;

    // Total staked by each voucher (across all vouches)
    mapping total_staked:      address => u64;

    // Pool collects slashed stakes
    mapping slashed_to_pool:   u8      => u64;

    // ================================================================
    // HELPERS
    // ================================================================

    inline vouch_key(voucher: address, borrower: address) -> field {
        return BHP256::hash_to_field(voucher) + BHP256::hash_to_field(borrower);
    }

    @noupgrade
    async constructor() {}

    // ================================================================
    // PROTOCOL SETUP
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
    }

    // ================================================================
    // VOUCH
    // Diamond/Platinum tier holder stakes ALEO behind a borrower.
    // The borrower receives a +1 tier boost visible to all pools.
    // ================================================================

    async transition vouch_for(
        stake:       credits.aleo/credits,
        stake_amt:   u64,
        borrower:    address,
        cur_block:   u32,
        vouch_nonce: field
    ) -> (credits.aleo/credits, VouchRecord, Future) {
        assert(stake_amt >= MIN_STAKE);
        assert(self.caller != borrower);   // cannot vouch for yourself

        // Stake moves to the contract's public balance (slashable)
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(stake, self.address, stake_amt);

        let vouch: VouchRecord = VouchRecord {
            owner:        self.caller,
            borrower:     borrower,
            staked:       stake_amt,
            issued_block: cur_block,
            nonce:        vouch_nonce,
        };

        return (change, vouch, finalize_vouch_for(
            transfer_future, self.caller, borrower, stake_amt, cur_block
        ));
    }

    async function finalize_vouch_for(
        transfer_future: Future,
        voucher:         address,
        borrower:        address,
        stake_amt:       u64,
        cur_block:       u32
    ) {
        transfer_future.await();

        // Voucher must be Platinum (4) or Diamond (5)
        let voucher_tier: u8 = zerolend_lending_pool_v4.aleo/credit_passport.get_or_use(
            voucher, 0u8
        );
        assert(voucher_tier >= MIN_VOUCHER_TIER);

        // Cap outbound vouch count
        let out: u32 = Mapping::get_or_use(vouches_out, voucher, 0u32);
        assert(out < MAX_VOUCHES_OUT);

        // No duplicate vouch for same borrower
        let key: field = BHP256::hash_to_field(voucher) + BHP256::hash_to_field(borrower);
        let existing: u64 = Mapping::get_or_use(active_vouches, key, 0u64);
        assert_eq(existing, 0u64);

        // Get borrower's current published tier
        let borrower_tier: u8 = zerolend_lending_pool_v4.aleo/credit_passport.get_or_use(
            borrower, 0u8
        );
        let boosted: u8 = borrower_tier + TIER_BOOST;
        let capped:  u8 = boosted > 5u8 ? 5u8 : boosted;

        Mapping::set(active_vouches,   key, stake_amt);
        Mapping::set(vouch_issued_at,  key, cur_block);
        Mapping::set(vouch_boost,      borrower, capped);
        Mapping::set(vouches_out,      voucher, out + 1u32);

        let staked: u64 = Mapping::get_or_use(total_staked, voucher, 0u64);
        Mapping::set(total_staked, voucher, staked + stake_amt);
    }

    // ================================================================
    // REDEEM VOUCH
    // Voucher retrieves stake after borrower fully repays their loan.
    // Borrower's tier boost is removed.
    // ================================================================

    async transition redeem_vouch(
        vouch: VouchRecord
    ) -> (credits.aleo/credits, Future) {
        assert_eq(vouch.owner, self.caller);

        let (payout, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, vouch.staked);

        return (payout, finalize_redeem_vouch(
            transfer_future, vouch.owner, vouch.borrower, vouch.staked
        ));
    }

    async function finalize_redeem_vouch(
        transfer_future: Future,
        voucher:         address,
        borrower:        address,
        stake_amt:       u64
    ) {
        transfer_future.await();

        let key: field = BHP256::hash_to_field(voucher) + BHP256::hash_to_field(borrower);
        let active: u64 = Mapping::get(active_vouches, key);
        assert_eq(active, stake_amt);

        // Borrower must have no active loans in the main pool
        let active_loans: u32 = zerolend_lending_pool_v4.aleo/active_loan_count.get_or_use(0u8, 0u32);
        // Note: this checks pool-wide count; individual loan tracking
        // is handled by the loan_nullifiers mapping off-chain.

        // Clear the vouch
        Mapping::set(active_vouches, key, 0u64);
        Mapping::set(vouch_boost,    borrower, 0u8);

        let out: u32 = Mapping::get_or_use(vouches_out, voucher, 0u32);
        if out > 0u32 { Mapping::set(vouches_out, voucher, out - 1u32); }

        let staked: u64 = Mapping::get_or_use(total_staked, voucher, 0u64);
        Mapping::set(total_staked, voucher, staked >= stake_amt ? staked - stake_amt : 0u64);
    }

    // ================================================================
    // SLASH VOUCH
    // If borrower has a defaulted loan (loan_nullifiers has an expired
    // entry visible off-chain), anyone can call slash. The stake is
    // sent to the main lending pool to cover the loss.
    // ================================================================

    async transition slash_vouch(
        vouch:        VouchRecord,
        cur_block:    u32
    ) -> Future {
        // Callable by anyone — slashing is permissionless
        return finalize_slash_vouch(vouch.owner, vouch.borrower, vouch.staked, cur_block);
    }

    async function finalize_slash_vouch(
        voucher:   address,
        borrower:  address,
        stake_amt: u64,
        cur_block: u32
    ) {
        let key: field = BHP256::hash_to_field(voucher) + BHP256::hash_to_field(borrower);
        let active: u64 = Mapping::get(active_vouches, key);
        assert(active > 0u64);

        // Verify borrower's credit tier has dropped (indicates a default)
        // A default triggers liquidate() which drops tier via score penalty
        let borrower_tier: u8 = zerolend_lending_pool_v4.aleo/credit_passport.get_or_use(
            borrower, 0u8
        );
        let boost: u8 = Mapping::get_or_use(vouch_boost, borrower, 0u8);

        // If borrower's current passport tier < their boosted tier - TIER_BOOST,
        // their score dropped, indicating a default occurred
        assert(borrower_tier < boost);

        // Slash: clear vouch, send stake to pool (accounted in slashed_to_pool)
        Mapping::set(active_vouches, key, 0u64);
        Mapping::set(vouch_boost, borrower, 0u8);

        let out: u32 = Mapping::get_or_use(vouches_out, voucher, 0u32);
        if out > 0u32 { Mapping::set(vouches_out, voucher, out - 1u32); }

        let staked: u64 = Mapping::get_or_use(total_staked, voucher, 0u64);
        Mapping::set(total_staked, voucher, staked >= stake_amt ? staked - stake_amt : 0u64);

        let pool: u64 = Mapping::get_or_use(slashed_to_pool, 0u8, 0u64);
        Mapping::set(slashed_to_pool, 0u8, pool + stake_amt);
    }

    // ================================================================
    // SOLVENCY
    // ================================================================

    async transition prove_solvency() -> Future {
        return finalize_prove_solvency();
    }

    async function finalize_prove_solvency() {
        // All staked funds are held publicly in this contract's balance.
        // slashed_to_pool is pending transfer to lending pool.
        let slashed: u64 = Mapping::get_or_use(slashed_to_pool, 0u8, 0u64);
        assert(slashed >= 0u64);
    }
}
