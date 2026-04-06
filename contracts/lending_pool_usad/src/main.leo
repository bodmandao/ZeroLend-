// ================================================================
// ZeroLend — USAD Lending Pool
// Program: zerolend_usad_v1.aleo
//
// Token: test_usad_stablecoin.aleo
//   Token record:       { owner: address, amount: u128 }
//   MerkleProof struct: { siblings: [field; 16], leaf_index: u32 }
//
// Identical architecture to zerolend_usdcx_v1.aleo with USAD-
// specific program import and slightly higher rates (Aleo-native
// stablecoin liquidity premium).
//
// Credit tier read from credit_passport in zerolend_lending_pool_v4.aleo.
// ================================================================

import test_usad_stablecoin.aleo;
import zerolend_lending_pool_v4.aleo;

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

    const MAX_LOAN_TIER_1: u128 =    10_000_000u128;
    const MAX_LOAN_TIER_2: u128 =    50_000_000u128;
    const MAX_LOAN_TIER_3: u128 =   200_000_000u128;
    const MAX_LOAN_TIER_4: u128 = 1_000_000_000u128;
    const MAX_LOAN_TIER_5: u128 = 5_000_000_000u128;

    const RATE_TIER_1: u128 = 1800u128;
    const RATE_TIER_2: u128 = 1300u128;
    const RATE_TIER_3: u128 =  950u128;
    const RATE_TIER_4: u128 =  600u128;
    const RATE_TIER_5: u128 =  350u128;

    // Flash loan fee: 50 bps = 0.5%
    const FLASH_FEE_BPS: u128 = 50u128;

    const FLASH_EXPIRY_BLOCKS: u32 = 100u32;
    const FLASH_MIN_TIER: u8 = 3u8;
    const GRACE_PERIOD: u32 = 8640u32;

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
    // HELPERS
    // ================================================================

    inline compute_interest(principal: u128, rate_bps: u128, blocks_held: u32) -> u128 {
        let blocks: u128 = blocks_held as u128;
        return (principal * rate_bps * blocks) / 10_000_000u128;
    }

    inline rate_for_tier(tier: u8) -> u128 {
        if tier == 5u8 { return RATE_TIER_5; }
        if tier == 4u8 { return RATE_TIER_4; }
        if tier == 3u8 { return RATE_TIER_3; }
        if tier == 2u8 { return RATE_TIER_2; }
        return RATE_TIER_1;
    }

    inline max_loan_for_tier(tier: u8) -> u128 {
        if tier == 5u8 { return MAX_LOAN_TIER_5; }
        if tier == 4u8 { return MAX_LOAN_TIER_4; }
        if tier == 3u8 { return MAX_LOAN_TIER_3; }
        if tier == 2u8 { return MAX_LOAN_TIER_2; }
        return MAX_LOAN_TIER_1;
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

        Mapping::set(protocol_admin,       0u8, admin);
        Mapping::set(pool_liquidity,       0u8, 0u128);
        Mapping::set(pool_borrowed,        0u8, 0u128);
        Mapping::set(pool_interest_earned, 0u8, 0u128);
        Mapping::set(active_loan_count,    0u8, 0u32);
        Mapping::set(loan_term_blocks, 1u8,  17280u32);
        Mapping::set(loan_term_blocks, 2u8,  43200u32);
        Mapping::set(loan_term_blocks, 3u8,  86400u32);
        Mapping::set(loan_term_blocks, 4u8, 172800u32);
        Mapping::set(loan_term_blocks, 5u8, 259200u32);
    }

    // ================================================================
    // LENDING POOL — DEPOSIT / WITHDRAW
    // ================================================================

    async transition deposit(
        token:     test_usad_stablecoin.aleo/Token,
        amount:    u128,
        proof:     [test_usad_stablecoin.aleo/MerkleProof; 2],
        dep_block: u32,
        dep_nonce: field
    ) -> (
        test_usad_stablecoin.aleo/ComplianceRecord,
        test_usad_stablecoin.aleo/Token,
        UsadDeposit,
        Future
    ) {
        let (compliance, change, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_private_to_public(
            self.address, amount, token, proof
        );

        let receipt: UsadDeposit = UsadDeposit {
            owner:            self.caller,
            deposited_amount: amount,
            deposit_block:    dep_block,
            nonce:            dep_nonce,
        };

        return (compliance, change, receipt, finalize_deposit(transfer_future, amount));
    }

    async function finalize_deposit(transfer_future: Future, amount: u128) {
        transfer_future.await();
        let liq: u128 = Mapping::get_or_use(pool_liquidity, 0u8, 0u128);
        Mapping::set(pool_liquidity, 0u8, liq + amount);
    }

    async transition withdraw(
        receipt:   UsadDeposit,
        cur_block: u32
    ) -> (
        test_usad_stablecoin.aleo/ComplianceRecord,
        test_usad_stablecoin.aleo/Token,
        Future
    ) {
        assert_eq(receipt.owner, self.caller);

        let blocks: u32     = cur_block - receipt.deposit_block;
        let yield_amt: u128 = compute_interest(receipt.deposited_amount, RATE_TIER_3, blocks);
        let total: u128     = receipt.deposited_amount + yield_amt;

        let (compliance, payout, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_public_to_private(self.caller, total);

        return (compliance, payout, finalize_withdraw(transfer_future, receipt.deposited_amount, yield_amt));
    }

    async function finalize_withdraw(transfer_future: Future, principal: u128, yield_paid: u128) {
        transfer_future.await();
        let liq: u128 = Mapping::get(pool_liquidity, 0u8);
        assert(liq >= principal + yield_paid);
        Mapping::set(pool_liquidity, 0u8, liq - principal - yield_paid);
    }

    // ================================================================
    // LOAN LIFECYCLE
    // ================================================================

    async transition request_loan(
        amount:     u128,
        cur_block:  u32,
        loan_nonce: field,
        loan_id:    field
    ) -> (
        UsadLoan,
        test_usad_stablecoin.aleo/ComplianceRecord,
        test_usad_stablecoin.aleo/Token,
        Future
    ) {
        assert(amount > 0u128);

        let (compliance, loan_funds, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_public_to_private(self.caller, amount);

        let loan: UsadLoan = UsadLoan {
            owner:          self.caller,
            loan_id:        loan_id,
            principal:      amount,
            interest_rate:  0u128,
            borrowed_block: cur_block,
            due_block:      cur_block + 86400u32,
            tier_at_borrow: 0u8,
            nonce:          loan_nonce,
        };

        return (loan, compliance, loan_funds, finalize_request_loan(
            transfer_future, self.caller, amount, loan_id
        ));
    }

    async function finalize_request_loan(
        transfer_future: Future,
        borrower:        address,
        amount:          u128,
        loan_id:         field
    ) {
        transfer_future.await();

        let tier: u8 = zerolend_lending_pool_v4.aleo/credit_passport.get_or_use(borrower, 0u8);
        assert(tier >= 1u8);

        let max_loan: u128 = max_loan_for_tier(tier);
        assert(amount <= max_loan);

        let used: bool = Mapping::get_or_use(loan_nullifiers, loan_id, false);
        assert(!used);
        Mapping::set(loan_nullifiers, loan_id, true);

        let liq: u128 = Mapping::get_or_use(pool_liquidity, 0u8, 0u128);
        let bor: u128 = Mapping::get_or_use(pool_borrowed,  0u8, 0u128);
        assert(liq >= bor + amount);

        Mapping::set(pool_borrowed,  0u8, bor + amount);

        let lc: u32 = Mapping::get_or_use(active_loan_count, 0u8, 0u32);
        Mapping::set(active_loan_count, 0u8, lc + 1u32);
    }

    async transition repay_loan(
        loan:      UsadLoan,
        payment:   test_usad_stablecoin.aleo/Token,
        proof:     [test_usad_stablecoin.aleo/MerkleProof; 2],
        cur_block: u32
    ) -> (
        test_usad_stablecoin.aleo/ComplianceRecord,
        test_usad_stablecoin.aleo/Token,
        Future
    ) {
        assert_eq(loan.owner, self.caller);

        let blocks: u32    = cur_block - loan.borrowed_block;
        let interest: u128 = compute_interest(loan.principal, loan.interest_rate, blocks);
        let owed: u128     = loan.principal + interest;

        assert(payment.amount >= owed);

        let (compliance, change, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_private_to_public(
            self.address, owed, payment, proof
        );

        return (compliance, change, finalize_repay_loan(transfer_future, loan.principal, interest));
    }

    async function finalize_repay_loan(transfer_future: Future, principal: u128, interest: u128) {
        transfer_future.await();
        let bor: u128 = Mapping::get(pool_borrowed, 0u8);
        assert(bor >= principal);
        Mapping::set(pool_borrowed, 0u8, bor - principal);

        let earned: u128 = Mapping::get_or_use(pool_interest_earned, 0u8, 0u128);
        Mapping::set(pool_interest_earned, 0u8, earned + interest);

        let lc: u32 = Mapping::get_or_use(active_loan_count, 0u8, 0u32);
        if lc > 0u32 { Mapping::set(active_loan_count, 0u8, lc - 1u32); }
    }

    async transition liquidate(loan: UsadLoan, cur_block: u32) -> Future {
        assert(cur_block > loan.due_block + GRACE_PERIOD);
        return finalize_liquidate(loan.principal);
    }

    async function finalize_liquidate(principal: u128) {
        let bor: u128 = Mapping::get_or_use(pool_borrowed, 0u8, 0u128);
        Mapping::set(pool_borrowed, 0u8, bor >= principal ? bor - principal : 0u128);

        let lc: u32 = Mapping::get_or_use(active_loan_count, 0u8, 0u32);
        if lc > 0u32 { Mapping::set(active_loan_count, 0u8, lc - 1u32); }
    }

    // ================================================================
    // FLASH LOANS — Credit-Bonded
    // ================================================================

    async transition flash_open(
        amount:     u128,
        cur_block:  u32,
        bond_nonce: field
    ) -> (
        UsadFlashBond,
        test_usad_stablecoin.aleo/ComplianceRecord,
        test_usad_stablecoin.aleo/Token,
        Future
    ) {
        assert(amount > 0u128);

        let fee: u128 = (amount * FLASH_FEE_BPS) / 10_000u128;
        let actual_fee: u128 = fee > 0u128 ? fee : 1u128;

        let (compliance, funds, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_public_to_private(self.caller, amount);

        let bond: UsadFlashBond = UsadFlashBond {
            owner:     self.caller,
            amount:    amount,
            fee:       actual_fee,
            issued_at: cur_block,
            expiry:    cur_block + FLASH_EXPIRY_BLOCKS,
            nonce:     bond_nonce,
        };

        return (bond, compliance, funds, finalize_flash_open(
            transfer_future, self.caller, amount, actual_fee, bond_nonce
        ));
    }

    async function finalize_flash_open(
        transfer_future: Future,
        borrower:        address,
        amount:          u128,
        fee:             u128,
        bond_nonce:      field
    ) {
        transfer_future.await();

        let tier: u8 = zerolend_lending_pool_v4.aleo/credit_passport.get_or_use(borrower, 0u8);
        assert(tier >= FLASH_MIN_TIER);

        let used: bool = Mapping::get_or_use(loan_nullifiers, bond_nonce, false);
        assert(!used);
        Mapping::set(loan_nullifiers, bond_nonce, true);

        let liq: u128 = Mapping::get_or_use(pool_liquidity, 0u8, 0u128);
        let bor: u128 = Mapping::get_or_use(pool_borrowed,  0u8, 0u128);
        assert(liq >= bor + amount);

        Mapping::set(pool_borrowed,  0u8, bor + amount);
        Mapping::set(pending_flash, bond_nonce, amount + fee);
    }

    async transition flash_repay(
        bond:    UsadFlashBond,
        payment: test_usad_stablecoin.aleo/Token,
        proof:   [test_usad_stablecoin.aleo/MerkleProof; 2]
    ) -> (
        test_usad_stablecoin.aleo/ComplianceRecord,
        test_usad_stablecoin.aleo/Token,
        Future
    ) {
        assert_eq(bond.owner, self.caller);
        let owed: u128 = bond.amount + bond.fee;
        assert(payment.amount >= owed);

        let (compliance, change, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_private_to_public(
            self.address, owed, payment, proof
        );

        return (compliance, change, finalize_flash_repay(
            transfer_future, bond.nonce, bond.amount, bond.fee
        ));
    }

    async function finalize_flash_repay(
        transfer_future: Future,
        bond_nonce:      field,
        amount:          u128,
        fee:             u128
    ) {
        transfer_future.await();

        let owed: u128 = Mapping::get(pending_flash, bond_nonce);
        assert(owed == amount + fee);
        Mapping::set(pending_flash, bond_nonce, 0u128);

        let bor: u128 = Mapping::get(pool_borrowed, 0u8);
        Mapping::set(pool_borrowed, 0u8, bor >= amount ? bor - amount : 0u128);

        let liq: u128 = Mapping::get(pool_liquidity, 0u8);
        Mapping::set(pool_liquidity, 0u8, liq + fee);

        let fees: u128 = Mapping::get_or_use(flash_loan_fees,  0u8, 0u128);
        let cnt:  u32  = Mapping::get_or_use(flash_loan_count, 0u8, 0u32);
        Mapping::set(flash_loan_fees,  0u8, fees + fee);
        Mapping::set(flash_loan_count, 0u8, cnt  + 1u32);
    }

    async transition flash_default(bond: UsadFlashBond, cur_block: u32) -> Future {
        assert(cur_block > bond.expiry);
        return finalize_flash_default(bond.nonce, bond.amount);
    }

    async function finalize_flash_default(bond_nonce: field, amount: u128) {
        let owed: u128 = Mapping::get_or_use(pending_flash, bond_nonce, 0u128);
        assert(owed > 0u128);
        Mapping::set(pending_flash, bond_nonce, 0u128);
        let bor: u128 = Mapping::get_or_use(pool_borrowed, 0u8, 0u128);
        Mapping::set(pool_borrowed, 0u8, bor >= amount ? bor - amount : 0u128);
    }

    // ================================================================
    // SOLVENCY CHECK
    // ================================================================

    async transition prove_solvency() -> Future {
        return finalize_prove_solvency();
    }

    async function finalize_prove_solvency() {
        let liq: u128 = Mapping::get_or_use(pool_liquidity, 0u8, 0u128);
        let bor: u128 = Mapping::get_or_use(pool_borrowed,  0u8, 0u128);
        assert(bor <= liq);
    }
}
