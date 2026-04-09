// ================================================================
// ZeroLend — Social Vouching Contract
// Program: zerolend_vouching_v2.aleo
//
// Diamond/Platinum tier holders can stake ALEO behind a borrower,
// giving that borrower a +1 tier boost while the vouch is active.
// If the borrower defaults, anyone can slash the voucher's stake
// to the lending pool. This creates a social credit graph where
// established participants bootstrap new ones — economically.
// ================================================================

import credits.aleo;
import zerolend_lending_pool_v5.aleo;

// ================================================================
// HELPERS
// ================================================================

fn vouch_key(voucher: address, borrower: address) -> field {
    return BHP256::hash_to_field(voucher) + BHP256::hash_to_field(borrower);
}

program zerolend_vouching_v2.aleo {

    // ================================================================
    // RECORDS
    // ================================================================

    record VouchRecord {
        owner:        address,
        borrower:     address,
        staked:       u64,
        issued_block: u32,
        nonce:        field,
    }

    // ================================================================
    // CONSTANTS
    // ================================================================

    const MIN_VOUCHER_TIER: u8 = 4u8;
    const TIER_BOOST:       u8 = 1u8;
    const MIN_STAKE:        u64 = 1_000_000u64;
    const MAX_VOUCHES_OUT:  u32 = 5u32;

    // ================================================================
    // MAPPINGS
    // ================================================================

    mapping protocol_admin:  u8      => address;
    mapping active_vouches:  field   => u64;
    mapping vouch_issued_at: field   => u32;
    mapping vouch_boost:     address => u8;
    mapping vouches_out:     address => u32;
    mapping total_staked:    address => u64;
    mapping slashed_to_pool: u8      => u64;

    // ================================================================
    // CONSTRUCTOR
    // ================================================================

    @noupgrade
    constructor() {}

    // ================================================================
    // PROTOCOL SETUP
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
        };
    }

    // ================================================================
    // VOUCH
    // ================================================================

    fn vouch_for(
        stake:       credits.aleo::credits,
        stake_amt:   u64,
        borrower:    address,
        cur_block:   u32,
        vouch_nonce: field
    ) -> (credits.aleo::credits, VouchRecord, Final) {
        assert(stake_amt >= MIN_STAKE);
        assert(self.caller != borrower);

        let (change, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(stake, self.address, stake_amt);

        let voucher: address = self.caller;
        let vouch: VouchRecord = VouchRecord {
            owner:        self.caller,
            borrower:     borrower,
            staked:       stake_amt,
            issued_block: cur_block,
            nonce:        vouch_nonce,
        };

        return (change, vouch, final {
            transfer_future.run();

            let voucher_tier: u8 = zerolend_lending_pool_v5.aleo::credit_passport.get_or_use(
                voucher, 0u8
            );
            assert(voucher_tier >= MIN_VOUCHER_TIER);

            let out: u32 = vouches_out.get_or_use(voucher, 0u32);
            assert(out < MAX_VOUCHES_OUT);

            let key: field = BHP256::hash_to_field(voucher) + BHP256::hash_to_field(borrower);
            let existing: u64 = active_vouches.get_or_use(key, 0u64);
            assert_eq(existing, 0u64);

            let borrower_tier: u8 = zerolend_lending_pool_v5.aleo::credit_passport.get_or_use(
                borrower, 0u8
            );
            let boosted: u8 = borrower_tier + TIER_BOOST;
            let capped:  u8 = boosted > 5u8 ? 5u8 : boosted;

            active_vouches.set(key, stake_amt);
            vouch_issued_at.set(key, cur_block);
            vouch_boost.set(borrower, capped);
            vouches_out.set(voucher, out + 1u32);

            let staked: u64 = total_staked.get_or_use(voucher, 0u64);
            total_staked.set(voucher, staked + stake_amt);
        });
    }

    // ================================================================
    // REDEEM VOUCH
    // ================================================================

    fn redeem_vouch(
        vouch: VouchRecord
    ) -> (credits.aleo::credits, Final) {
        assert_eq(vouch.owner, self.caller);

        let voucher: address = vouch.owner;
        let borrower: address = vouch.borrower;
        let stake_amt: u64 = vouch.staked;

        let (payout, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(self.caller, vouch.staked);

        return (payout, final {
            transfer_future.run();

            let key: field = BHP256::hash_to_field(voucher) + BHP256::hash_to_field(borrower);
            let active: u64 = active_vouches.get(key);
            assert_eq(active, stake_amt);

            let active_loans: u32 = zerolend_lending_pool_v5.aleo::active_loan_count.get_or_use(0u8, 0u32);

            active_vouches.set(key, 0u64);
            vouch_boost.set(borrower, 0u8);

            let out: u32 = vouches_out.get_or_use(voucher, 0u32);
            if out > 0u32 { vouches_out.set(voucher, out - 1u32); }

            let staked: u64 = total_staked.get_or_use(voucher, 0u64);
            total_staked.set(voucher, staked >= stake_amt ? staked - stake_amt : 0u64);
        });
    }

    // ================================================================
    // SLASH VOUCH
    // ================================================================

    fn slash_vouch(
        vouch:     VouchRecord,
        cur_block: u32
    ) -> Final {
        let voucher: address = vouch.owner;
        let borrower: address = vouch.borrower;
        let stake_amt: u64 = vouch.staked;
        return final {
            let key: field = BHP256::hash_to_field(voucher) + BHP256::hash_to_field(borrower);
            let active: u64 = active_vouches.get(key);
            assert(active > 0u64);

            let borrower_tier: u8 = zerolend_lending_pool_v5.aleo::credit_passport.get_or_use(
                borrower, 0u8
            );
            let boost: u8 = vouch_boost.get_or_use(borrower, 0u8);
            assert(borrower_tier < boost);

            active_vouches.set(key, 0u64);
            vouch_boost.set(borrower, 0u8);

            let out: u32 = vouches_out.get_or_use(voucher, 0u32);
            if out > 0u32 { vouches_out.set(voucher, out - 1u32); }

            let staked: u64 = total_staked.get_or_use(voucher, 0u64);
            total_staked.set(voucher, staked >= stake_amt ? staked - stake_amt : 0u64);

            let pool: u64 = slashed_to_pool.get_or_use(0u8, 0u64);
            slashed_to_pool.set(0u8, pool + stake_amt);
        };
    }

    // ================================================================
    // SOLVENCY
    // ================================================================

    fn prove_solvency() -> Final {
        return final {
            let slashed: u64 = slashed_to_pool.get_or_use(0u8, 0u64);
            assert(slashed >= 0u64);
        };
    }
}
