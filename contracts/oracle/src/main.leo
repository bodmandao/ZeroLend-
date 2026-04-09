// ================================================================
// ZeroLend — Oracle Attestation Contract
// Program: zerolend_oracle_v2.aleo
//
// 2-of-3 threshold oracle consensus. Three independent oracle bots
// scan on-chain activity and each submit a signed attestation.
// Once 2 oracles agree on the same data hash, any user can claim
// a verified CreditRecord.
//
// verified_inputs mapping stores a block-height-free hash of the
// attested data so zerolend_lending_pool_v4.aleo can verify that
// users call attest_credit with exactly the oracle-approved inputs —
// preventing fabricated credit scores entirely.
// ================================================================

// ================================================================
// STRUCTS (module-level)
// ================================================================

// Full attestation data — includes block_height for consensus uniqueness
struct AttestationData {
    wallet:          address,
    wallet_age_days: u32,
    repayments_made: u32,
    defaults:        u32,
    total_volume:    u64,
    block_height:    u32,
}

// Canonical input hash — block-height-free, used by lending_pool
// to verify attest_credit inputs match what oracles approved
struct AttestationInputs {
    wallet:          address,
    wallet_age_days: u32,
    repayments_made: u32,
    defaults:        u32,
    total_volume:    u64,
}

// ================================================================
// HELPERS
// ================================================================

fn hash_attestation(data: AttestationData) -> field {
    return BHP256::hash_to_field(data);
}

fn hash_inputs(data: AttestationInputs) -> field {
    return BHP256::hash_to_field(data);
}

program zerolend_oracle_v2.aleo {

    // ================================================================
    // RECORDS
    // ================================================================

    record VerifiedCreditRecord {
        owner:           address,
        wallet_age_days: u32,
        repayments_made: u32,
        defaults:        u32,
        total_volume:    u64,
        verified_block:  u32,
        oracle_hash:     field,
        nonce:           field,
    }

    // ================================================================
    // CONSTANTS
    // ================================================================

    const ORACLE_COUNT: u8 = 3u8;
    const THRESHOLD:    u8 = 2u8;

    // ================================================================
    // MAPPINGS
    // ================================================================

    mapping protocol_admin:     u8      => address;
    mapping oracle_registry:    u8      => address;
    mapping oracle_bonds:       u8      => u64;
    mapping oracle_submissions: field   => field;
    mapping submission_blocks:  field   => u32;
    mapping consensus_count:    field   => u8;
    mapping finalized_hash:     address => field;

    // Block-height-free input hash — readable by zerolend_lending_pool_v4.aleo
    // to verify attest_credit inputs match oracle-approved data exactly
    mapping verified_inputs:    address => field;

    mapping slash_count:        u8      => u32;

    // ================================================================
    // CONSTRUCTOR
    // ================================================================

    @noupgrade
    constructor() {}

    // ================================================================
    // ADMIN
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

    fn register_oracle(slot: u8, oracle_addr: address) -> Final {
        assert(slot < ORACLE_COUNT);
        let caller: address = self.caller;
        return final {
            let admin: address = protocol_admin.get(0u8);
            assert_eq(caller, admin);
            oracle_registry.set(slot, oracle_addr);
            oracle_bonds.set(slot, 0u64);
        };
    }

    // ================================================================
    // ORACLE SUBMISSION
    // ================================================================

    fn submit_attestation(
        slot:            u8,
        wallet:          address,
        wallet_age_days: u32,
        repayments_made: u32,
        defaults:        u32,
        total_volume:    u64,
        cur_block:       u32
    ) -> Final {
        assert(slot < ORACLE_COUNT);

        let data: AttestationData = AttestationData {
            wallet:          wallet,
            wallet_age_days: wallet_age_days,
            repayments_made: repayments_made,
            defaults:        defaults,
            total_volume:    total_volume,
            block_height:    cur_block,
        };

        let data_hash: field = hash_attestation(data);
        let caller: address  = self.caller;

        return final {
            let registered: address = oracle_registry.get(slot);
            assert_eq(caller, registered);

            let existing_hash: field = finalized_hash.get_or_use(wallet, 0field);
            assert_eq(existing_hash, 0field);

            let slot_field: field = slot as field;
            let sub_key: field    = slot_field * 1_000_000_000field;

            oracle_submissions.set(sub_key, data_hash);
            submission_blocks.set(sub_key, cur_block);

            let count: u8 = consensus_count.get_or_use(data_hash, 0u8);
            consensus_count.set(data_hash, count + 1u8);
        };
    }

    // ================================================================
    // CLAIM VERIFIED CREDIT
    // ================================================================

    fn claim_verified_credit(
        wallet:          address,
        wallet_age_days: u32,
        repayments_made: u32,
        defaults:        u32,
        total_volume:    u64,
        cur_block:       u32,
        record_nonce:    field
    ) -> (VerifiedCreditRecord, Final) {
        assert_eq(self.caller, wallet);

        let data: AttestationData = AttestationData {
            wallet:          wallet,
            wallet_age_days: wallet_age_days,
            repayments_made: repayments_made,
            defaults:        defaults,
            total_volume:    total_volume,
            block_height:    cur_block,
        };
        let data_hash: field = hash_attestation(data);

        // Block-height-free canonical hash stored for lending pool verification
        let inputs: AttestationInputs = AttestationInputs {
            wallet:          wallet,
            wallet_age_days: wallet_age_days,
            repayments_made: repayments_made,
            defaults:        defaults,
            total_volume:    total_volume,
        };
        let inputs_hash: field = hash_inputs(inputs);

        let rec: VerifiedCreditRecord = VerifiedCreditRecord {
            owner:           wallet,
            wallet_age_days: wallet_age_days,
            repayments_made: repayments_made,
            defaults:        defaults,
            total_volume:    total_volume,
            verified_block:  cur_block,
            oracle_hash:     data_hash,
            nonce:           record_nonce,
        };

        return (rec, final {
            let existing: field = finalized_hash.get_or_use(wallet, 0field);
            assert_eq(existing, 0field);

            let count: u8 = consensus_count.get_or_use(data_hash, 0u8);
            assert(count >= THRESHOLD);

            finalized_hash.set(wallet, data_hash);
            // Store canonical input hash so lending_pool can verify
            // that attest_credit uses exactly these oracle-approved inputs
            verified_inputs.set(wallet, inputs_hash);
        });
    }

    // ================================================================
    // UPGRADE VERIFIED CREDIT
    // ================================================================

    fn upgrade_credit(
        old_rec:         VerifiedCreditRecord,
        wallet:          address,
        wallet_age_days: u32,
        repayments_made: u32,
        defaults:        u32,
        total_volume:    u64,
        cur_block:       u32,
        new_nonce:       field
    ) -> (VerifiedCreditRecord, Final) {
        assert_eq(self.caller, wallet);
        assert_eq(old_rec.owner, wallet);
        assert(repayments_made >= old_rec.repayments_made);
        assert(defaults <= old_rec.defaults);

        let data: AttestationData = AttestationData {
            wallet:          wallet,
            wallet_age_days: wallet_age_days,
            repayments_made: repayments_made,
            defaults:        defaults,
            total_volume:    total_volume,
            block_height:    cur_block,
        };
        let new_hash: field = hash_attestation(data);

        let inputs: AttestationInputs = AttestationInputs {
            wallet:          wallet,
            wallet_age_days: wallet_age_days,
            repayments_made: repayments_made,
            defaults:        defaults,
            total_volume:    total_volume,
        };
        let inputs_hash: field = hash_inputs(inputs);

        let new_rec: VerifiedCreditRecord = VerifiedCreditRecord {
            owner:           wallet,
            wallet_age_days: wallet_age_days,
            repayments_made: repayments_made,
            defaults:        defaults,
            total_volume:    total_volume,
            verified_block:  cur_block,
            oracle_hash:     new_hash,
            nonce:           new_nonce,
        };

        return (new_rec, final {
            let count: u8 = consensus_count.get_or_use(new_hash, 0u8);
            assert(count >= THRESHOLD);
            finalized_hash.set(wallet, new_hash);
            verified_inputs.set(wallet, inputs_hash);
        });
    }

    // ================================================================
    // SLASHING
    // ================================================================

    fn slash_oracle(slot: u8, wallet: address) -> Final {
        assert(slot < ORACLE_COUNT);
        let caller: address = self.caller;
        return final {
            let admin: address = protocol_admin.get(0u8);
            assert_eq(caller, admin);

            let finalized: field = finalized_hash.get(wallet);
            assert(finalized != 0field);

            let slot_field2: field = slot as field;
            let sub_key: field     = slot_field2 * 1_000_000_000field;
            let submitted: field   = oracle_submissions.get_or_use(sub_key, 0field);
            assert(submitted != 0field);
            assert(submitted != finalized);

            let slashes: u32 = slash_count.get_or_use(slot, 0u32);
            slash_count.set(slot, slashes + 1u32);
        };
    }

    // ================================================================
    // STATUS
    // ================================================================

    fn get_oracle_stats() -> Final {
        return final {
            assert(protocol_admin.contains(0u8));
        };
    }
}
