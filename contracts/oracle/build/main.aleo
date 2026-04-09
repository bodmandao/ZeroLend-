import credits.aleo;
import zerolend_lending_pool_v4.aleo;
program zerolend_oracle_v1.aleo;

record VerifiedCreditRecord:
    owner as address.private;
    wallet_age_days as u32.private;
    repayments_made as u32.private;
    defaults as u32.private;
    total_volume as u64.private;
    verified_block as u32.private;
    oracle_hash as field.private;
    nonce as field.private;

struct AttestationData:
    wallet as address;
    wallet_age_days as u32;
    repayments_made as u32;
    defaults as u32;
    total_volume as u64;
    block_height as u32;

mapping protocol_admin:
    key as u8.public;
    value as address.public;

mapping oracle_registry:
    key as u8.public;
    value as address.public;

mapping oracle_bonds:
    key as u8.public;
    value as u64.public;

mapping oracle_submissions:
    key as field.public;
    value as field.public;

mapping submission_blocks:
    key as field.public;
    value as u32.public;

mapping consensus_count:
    key as field.public;
    value as u8.public;

mapping finalized_hash:
    key as address.public;
    value as field.public;

mapping slash_count:
    key as u8.public;
    value as u32.public;

function initialize:
    async initialize self.caller into r0;
    output r0 as zerolend_oracle_v1.aleo/initialize.future;

finalize initialize:
    input r0 as address.public;
    get.or_use protocol_admin[0u8] aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf into r1;
    assert.eq r1 aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf;
    set r0 into protocol_admin[0u8];

function register_oracle:
    input r0 as u8.private;
    input r1 as address.private;
    lt r0 3u8 into r2;
    assert.eq r2 true;
    async register_oracle self.caller r0 r1 into r3;
    output r3 as zerolend_oracle_v1.aleo/register_oracle.future;

finalize register_oracle:
    input r0 as address.public;
    input r1 as u8.public;
    input r2 as address.public;
    get protocol_admin[0u8] into r3;
    assert.eq r0 r3;
    set r2 into oracle_registry[r1];
    set 0u64 into oracle_bonds[r1];

closure hash_attestation:
    input r0 as AttestationData;
    hash.bhp256 r0 into r1 as field;
    output r1 as field;

function submit_attestation:
    input r0 as u8.private;
    input r1 as address.private;
    input r2 as u32.private;
    input r3 as u32.private;
    input r4 as u32.private;
    input r5 as u64.private;
    input r6 as u32.private;
    lt r0 3u8 into r7;
    assert.eq r7 true;
    cast r1 r2 r3 r4 r5 r6 into r8 as AttestationData;
    call hash_attestation r8 into r9;
    async submit_attestation r0 self.caller r1 r9 r6 into r10;
    output r10 as zerolend_oracle_v1.aleo/submit_attestation.future;

finalize submit_attestation:
    input r0 as u8.public;
    input r1 as address.public;
    input r2 as address.public;
    input r3 as field.public;
    input r4 as u32.public;
    get oracle_registry[r0] into r5;
    assert.eq r1 r5;
    get.or_use finalized_hash[r2] 0field into r6;
    assert.eq r6 0field;
    cast r0 into r7 as field;
    mul r7 1000000000field into r8;
    set r3 into oracle_submissions[r8];
    set r4 into submission_blocks[r8];
    get.or_use consensus_count[r3] 0u8 into r9;
    add r9 1u8 into r10;
    set r10 into consensus_count[r3];

function claim_verified_credit:
    input r0 as address.private;
    input r1 as u32.private;
    input r2 as u32.private;
    input r3 as u32.private;
    input r4 as u64.private;
    input r5 as u32.private;
    input r6 as field.private;
    assert.eq self.caller r0;
    cast r0 r1 r2 r3 r4 r5 into r7 as AttestationData;
    call hash_attestation r7 into r8;
    cast r0 r1 r2 r3 r4 r5 r8 r6 into r9 as VerifiedCreditRecord.record;
    async claim_verified_credit r0 r8 into r10;
    output r9 as VerifiedCreditRecord.record;
    output r10 as zerolend_oracle_v1.aleo/claim_verified_credit.future;

finalize claim_verified_credit:
    input r0 as address.public;
    input r1 as field.public;
    get.or_use finalized_hash[r0] 0field into r2;
    assert.eq r2 0field;
    get.or_use consensus_count[r1] 0u8 into r3;
    gte r3 2u8 into r4;
    assert.eq r4 true;
    set r1 into finalized_hash[r0];

function upgrade_credit:
    input r0 as VerifiedCreditRecord.record;
    input r1 as address.private;
    input r2 as u32.private;
    input r3 as u32.private;
    input r4 as u32.private;
    input r5 as u64.private;
    input r6 as u32.private;
    input r7 as field.private;
    assert.eq self.caller r1;
    assert.eq r0.owner r1;
    gte r3 r0.repayments_made into r8;
    assert.eq r8 true;
    lte r4 r0.defaults into r9;
    assert.eq r9 true;
    cast r1 r2 r3 r4 r5 r6 into r10 as AttestationData;
    call hash_attestation r10 into r11;
    cast r1 r2 r3 r4 r5 r6 r11 r7 into r12 as VerifiedCreditRecord.record;
    async upgrade_credit r11 r1 into r13;
    output r12 as VerifiedCreditRecord.record;
    output r13 as zerolend_oracle_v1.aleo/upgrade_credit.future;

finalize upgrade_credit:
    input r0 as field.public;
    input r1 as address.public;
    get.or_use consensus_count[r0] 0u8 into r2;
    gte r2 2u8 into r3;
    assert.eq r3 true;
    set r0 into finalized_hash[r1];

function slash_oracle:
    input r0 as u8.private;
    input r1 as address.private;
    lt r0 3u8 into r2;
    assert.eq r2 true;
    async slash_oracle self.caller r1 r0 into r3;
    output r3 as zerolend_oracle_v1.aleo/slash_oracle.future;

finalize slash_oracle:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as u8.public;
    get protocol_admin[0u8] into r3;
    assert.eq r0 r3;
    get finalized_hash[r1] into r4;
    is.neq r4 0field into r5;
    assert.eq r5 true;
    cast r2 into r6 as field;
    mul r6 1000000000field into r7;
    get.or_use oracle_submissions[r7] 0field into r8;
    is.neq r8 0field into r9;
    assert.eq r9 true;
    is.neq r8 r4 into r10;
    assert.eq r10 true;
    get.or_use slash_count[r2] 0u32 into r11;
    add r11 1u32 into r12;
    set r12 into slash_count[r2];

function get_oracle_stats:
    async get_oracle_stats into r0;
    output r0 as zerolend_oracle_v1.aleo/get_oracle_stats.future;

finalize get_oracle_stats:
    contains protocol_admin[0u8] into r0;
    assert.eq r0 true;

constructor:
    assert.eq edition 0u16;
