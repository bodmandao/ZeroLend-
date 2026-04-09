// ZeroLend — USAD Lending Pool
// Token: test_usad_stablecoin.aleo
//   Token record:       { owner: address, amount: u128 }
//   MerkleProof struct: { siblings: [field; 16], leaf_index: u32 }
//
// Identical architecture to zerolend_usdcx_v1.aleo with USAD-
// specific program import and slightly higher rates (Aleo-native
// stablecoin liquidity premium).
//
// Credit tier read from credit_passport in zerolend_lending_pool_v4.aleo.

import test_usad_stablecoin.aleo;
import zerolend_lending_pool_v4.aleo;

// ================================================================
// HELPERS
// ================================================================

fn compute_interest(principal: u128, rate_bps: u128, blocks_held: u32) -> u128 {
    let blocks: u128 = blocks_held as u128;
    return (principal * rate_bps * blocks) / 10_000_000u128;
}

fn rate_for_tier(tier: u8) -> u128 {
    if tier == 5u8 { return 350u128;  }  // RATE_TIER_5
    if tier == 4u8 { return 600u128;  }  // RATE_TIER_4
    if tier == 3u8 { return 950u128;  }  // RATE_TIER_3
    if tier == 2u8 { return 1300u128; }  // RATE_TIER_2
    return 1800u128;                      // RATE_TIER_1
}

fn max_loan_for_tier(tier: u8) -> u128 {
    if tier == 5u8 { return 5_000_000_000u128; }  // MAX_LOAN_TIER_5
    if tier == 4u8 { return 1_000_000_000u128; }  // MAX_LOAN_TIER_4
    if tier == 3u8 { return   200_000_000u128; }  // MAX_LOAN_TIER_3
    if tier == 2u8 { return    50_000_000u128; }  // MAX_LOAN_TIER_2
    return 10_000_000u128;                          // MAX_LOAN_TIER_1
}

program zerolend_usad_v1.aleo {

    // ================================================================
    // RECORDS
    // ================================================================

    record UsadDeposit {
        owner:            address,
        deposited_amount: u128,
        deposit_block:    u32,
        nonce:            field,
    }

    record UsadLoan {
        owner:          address,
        loan_id:        field,
        principal:      u128,
        interest_rate:  u128,
        borrowed_block: u32,
        due_block:      u32,
        tier_at_borrow: u8,
        nonce:          field,
    }

    record UsadFlashBond {
        owner:     address,
        amount:    u128,
        fee:       u128,
        issued_at: u32,
        expiry:    u32,
        nonce:     field,
    }

    // ================================================================
    // CONSTANTS
    // USAD rates slightly higher than USDCx
    // ================================================================

    // Gold-tier rate used for deposit yield calculation
    const RATE_TIER_3:         u128 = 950u128;

    // Flash loan fee: 50 bps = 0.5%
    const FLASH_FEE_BPS:       u128 = 50u128;

    const FLASH_EXPIRY_BLOCKS: u32  = 100u32;
    const FLASH_MIN_TIER:      u8   = 3u8;
    const GRACE_PERIOD:        u32  = 8640u32;

    // ================================================================
    // MAPPINGS
    // ================================================================

    mapping protocol_admin:       u8    => address;
    mapping pool_liquidity:       u8    => u128;
    mapping pool_borrowed:        u8    => u128;
    mapping pool_interest_earned: u8    => u128;
    mapping active_loan_count:    u8    => u32;
    mapping loan_term_blocks:     u8    => u32;
    mapping loan_nullifiers:      field => bool;
    mapping pending_flash:        field => u128;
    mapping flash_loan_fees:      u8    => u128;
    mapping flash_loan_count:     u8    => u32;

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
            pool_liquidity.set(0u8, 0u128);
            pool_borrowed.set(0u8, 0u128);
            pool_interest_earned.set(0u8, 0u128);
            active_loan_count.set(0u8, 0u32);
            loan_term_blocks.set(1u8, 17280u32);
            loan_term_blocks.set(2u8, 43200u32);
            loan_term_blocks.set(3u8, 86400u32);
            loan_term_blocks.set(4u8, 172800u32);
            loan_term_blocks.set(5u8, 259200u32);
        };
    }

    // ================================================================
    // LENDING POOL — DEPOSIT / WITHDRAW
    // ================================================================

    fn deposit(
        token:     test_usad_stablecoin.aleo::Token,
        amount:    u128,
        proof:     [test_usad_stablecoin.aleo::MerkleProof; 2],
        dep_block: u32,
        dep_nonce: field
    ) -> (
        test_usad_stablecoin.aleo::ComplianceRecord,
        test_usad_stablecoin.aleo::Token,
        UsadDeposit,
        Final
    ) {
        let caller: address = self.caller;

        let (compliance, change, transfer_future): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_private_to_public(
            self.address, amount, token, proof
        );

        let receipt: UsadDeposit = UsadDeposit {
            owner:            caller,
            deposited_amount: amount,
            deposit_block:    dep_block,
            nonce:            dep_nonce,
        };

        return (compliance, change, receipt, final {
            transfer_future.run();
            let liq: u128 = pool_liquidity.get_or_use(0u8, 0u128);
            pool_liquidity.set(0u8, liq + amount);
        });
    }

    fn withdraw(
        receipt:   UsadDeposit,
        cur_block: u32
    ) -> (
        test_usad_stablecoin.aleo::ComplianceRecord,
        test_usad_stablecoin.aleo::Token,
        Final
    ) {
        assert_eq(receipt.owner, self.caller);

        let blocks: u32     = cur_block - receipt.deposit_block;
        let yield_amt: u128 = compute_interest(receipt.deposited_amount, RATE_TIER_3, blocks);
        let total: u128     = receipt.deposited_amount + yield_amt;
        let principal: u128 = receipt.deposited_amount;

        let (compliance, payout, transfer_future): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_public_to_private(self.caller, total);

        return (compliance, payout, final {
            transfer_future.run();
            let liq: u128 = pool_liquidity.get(0u8);
            assert(liq >= principal + yield_amt);
            pool_liquidity.set(0u8, liq - principal - yield_amt);
        });
    }

    // ================================================================
    // LOAN LIFECYCLE
    // ================================================================

    fn request_loan(
        amount:     u128,
        cur_block:  u32,
        loan_nonce: field,
        loan_id:    field
    ) -> (
        UsadLoan,
        test_usad_stablecoin.aleo::ComplianceRecord,
        test_usad_stablecoin.aleo::Token,
        Final
    ) {
        assert(amount > 0u128);
        let caller: address = self.caller;

        let (compliance, loan_funds, transfer_future): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_public_to_private(caller, amount);

        let loan: UsadLoan = UsadLoan {
            owner:          caller,
            loan_id:        loan_id,
            principal:      amount,
            interest_rate:  0u128,      // resolved in final after passport read
            borrowed_block: cur_block,
            due_block:      cur_block + 86400u32,
            tier_at_borrow: 0u8,        // resolved in final
            nonce:          loan_nonce,
        };

        return (loan, compliance, loan_funds, final {
            transfer_future.run();

            let tier: u8 = zerolend_lending_pool_v4.aleo::credit_passport.get_or_use(caller, 0u8);
            assert(tier >= 1u8);

            let max_loan: u128 = max_loan_for_tier(tier);
            assert(amount <= max_loan);

            let used: bool = loan_nullifiers.get_or_use(loan_id, false);
            assert(!used);
            loan_nullifiers.set(loan_id, true);

            let liq: u128 = pool_liquidity.get_or_use(0u8, 0u128);
            let bor: u128 = pool_borrowed.get_or_use(0u8, 0u128);
            assert(liq >= bor + amount);

            pool_borrowed.set(0u8, bor + amount);

            let lc: u32 = active_loan_count.get_or_use(0u8, 0u32);
            active_loan_count.set(0u8, lc + 1u32);
        });
    }

    fn repay_loan(
        loan:      UsadLoan,
        payment:   test_usad_stablecoin.aleo::Token,
        proof:     [test_usad_stablecoin.aleo::MerkleProof; 2],
        cur_block: u32
    ) -> (
        test_usad_stablecoin.aleo::ComplianceRecord,
        test_usad_stablecoin.aleo::Token,
        Final
    ) {
        assert_eq(loan.owner, self.caller);

        let blocks: u32    = cur_block - loan.borrowed_block;
        let interest: u128 = compute_interest(loan.principal, loan.interest_rate, blocks);
        let owed: u128     = loan.principal + interest;
        let principal: u128 = loan.principal;

        assert(payment.amount >= owed);

        let (compliance, change, transfer_future): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_private_to_public(
            self.address, owed, payment, proof
        );

        return (compliance, change, final {
            transfer_future.run();

            let bor: u128 = pool_borrowed.get(0u8);
            assert(bor >= principal);
            pool_borrowed.set(0u8, bor - principal);

            let earned: u128 = pool_interest_earned.get_or_use(0u8, 0u128);
            pool_interest_earned.set(0u8, earned + interest);

            let lc: u32 = active_loan_count.get_or_use(0u8, 0u32);
            if lc > 0u32 { active_loan_count.set(0u8, lc - 1u32); }
        });
    }

    fn liquidate(loan: UsadLoan, cur_block: u32) -> Final {
        assert(cur_block > loan.due_block + GRACE_PERIOD);
        let principal: u128 = loan.principal;
        return final {
            let bor: u128 = pool_borrowed.get_or_use(0u8, 0u128);
            pool_borrowed.set(0u8, bor >= principal ? bor - principal : 0u128);

            let lc: u32 = active_loan_count.get_or_use(0u8, 0u32);
            if lc > 0u32 { active_loan_count.set(0u8, lc - 1u32); }
        };
    }

    // ================================================================
    // FLASH LOANS — Credit-Bonded
    // ================================================================

    fn flash_open(
        amount:     u128,
        cur_block:  u32,
        bond_nonce: field
    ) -> (
        UsadFlashBond,
        test_usad_stablecoin.aleo::ComplianceRecord,
        test_usad_stablecoin.aleo::Token,
        Final
    ) {
        assert(amount > 0u128);

        let fee: u128        = (amount * FLASH_FEE_BPS) / 10_000u128;
        let actual_fee: u128 = fee > 0u128 ? fee : 1u128;
        let caller: address  = self.caller;

        let (compliance, funds, transfer_future): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_public_to_private(caller, amount);

        let bond: UsadFlashBond = UsadFlashBond {
            owner:     caller,
            amount:    amount,
            fee:       actual_fee,
            issued_at: cur_block,
            expiry:    cur_block + FLASH_EXPIRY_BLOCKS,
            nonce:     bond_nonce,
        };

        return (bond, compliance, funds, final {
            transfer_future.run();

            let tier: u8 = zerolend_lending_pool_v4.aleo::credit_passport.get_or_use(caller, 0u8);
            assert(tier >= FLASH_MIN_TIER);

            let used: bool = loan_nullifiers.get_or_use(bond_nonce, false);
            assert(!used);
            loan_nullifiers.set(bond_nonce, true);

            let liq: u128 = pool_liquidity.get_or_use(0u8, 0u128);
            let bor: u128 = pool_borrowed.get_or_use(0u8, 0u128);
            assert(liq >= bor + amount);

            pool_borrowed.set(0u8, bor + amount);
            pending_flash.set(bond_nonce, amount + actual_fee);
        });
    }

    fn flash_repay(
        bond:    UsadFlashBond,
        payment: test_usad_stablecoin.aleo::Token,
        proof:   [test_usad_stablecoin.aleo::MerkleProof; 2]
    ) -> (
        test_usad_stablecoin.aleo::ComplianceRecord,
        test_usad_stablecoin.aleo::Token,
        Final
    ) {
        assert_eq(bond.owner, self.caller);
        let owed: u128   = bond.amount + bond.fee;
        let amount: u128 = bond.amount;
        let fee: u128    = bond.fee;
        let nonce: field = bond.nonce;

        assert(payment.amount >= owed);

        let (compliance, change, transfer_future): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_private_to_public(
            self.address, owed, payment, proof
        );

        return (compliance, change, final {
            transfer_future.run();

            let pending: u128 = pending_flash.get(nonce);
            assert(pending == amount + fee);
            pending_flash.set(nonce, 0u128);

            let bor: u128 = pool_borrowed.get(0u8);
            pool_borrowed.set(0u8, bor >= amount ? bor - amount : 0u128);

            let liq: u128 = pool_liquidity.get(0u8);
            pool_liquidity.set(0u8, liq + fee);

            let fees: u128 = flash_loan_fees.get_or_use(0u8, 0u128);
            let cnt:  u32  = flash_loan_count.get_or_use(0u8, 0u32);
            flash_loan_fees.set(0u8, fees + fee);
            flash_loan_count.set(0u8, cnt + 1u32);
        });
    }

    fn flash_default(bond: UsadFlashBond, cur_block: u32) -> Final {
        assert(cur_block > bond.expiry);
        let nonce: field = bond.nonce;
        let amount: u128 = bond.amount;
        return final {
            let owed: u128 = pending_flash.get_or_use(nonce, 0u128);
            assert(owed > 0u128);
            pending_flash.set(nonce, 0u128);

            let bor: u128 = pool_borrowed.get_or_use(0u8, 0u128);
            pool_borrowed.set(0u8, bor >= amount ? bor - amount : 0u128);
        };
    }

    // ================================================================
    // SOLVENCY CHECK
    // ================================================================

    fn prove_solvency() -> Final {
        return final {
            let liq: u128 = pool_liquidity.get_or_use(0u8, 0u128);
            let bor: u128 = pool_borrowed.get_or_use(0u8, 0u128);
            assert(bor <= liq);
        };
    }
}
