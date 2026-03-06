program credit_score.aleo;

record CreditRecord:
    owner as address.private;
    wallet_age_days as u32.private;
    repayments_made as u32.private;
    defaults as u32.private;
    total_volume as u128.private;
    current_score as u32.private;
    last_updated as u32.private;
    nonce as field.private;

record CreditTierProof:
    owner as address.private;
    tier as u8.private;
    org_id as field.private;
    expires_at as u32.private;
    nonce as field.private;

mapping protocol_admin:
    key as u8.public;
    value as address.public;

mapping used_nullifiers:
    key as field.public;
    value as boolean.public;

mapping aggregate_score_count:
    key as u8.public;
    value as u32.public;

function initialize:
    async initialize self.caller into r0;
    output r0 as credit_score.aleo/initialize.future;

finalize initialize:
    input r0 as address.public;
    get.or_use protocol_admin[0u8] aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc into r1;
    assert.eq r1 aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
    set r0 into protocol_admin[0u8];

closure compute_credit_score:
    input r0 as u32;
    input r1 as u32;
    input r2 as u32;
    input r3 as u128;
    mul r0 2u32 into r4;
    gt r4 200u32 into r5;
    ternary r5 200u32 r4 into r6;
    mul r1 10u32 into r7;
    gt r7 400u32 into r8;
    ternary r8 400u32 r7 into r9;
    mul r2 100u32 into r10;
    div r3 1000000u128 into r11;
    cast r11 into r12 as u32;
    gt r12 200u32 into r13;
    ternary r13 200u32 r12 into r14;
    add 200u32 r6 into r15;
    add r15 r9 into r16;
    add r16 r14 into r17;
    gt r17 r10 into r18;
    sub r17 r10 into r19;
    ternary r18 r19 0u32 into r20;
    gt r20 1000u32 into r21;
    ternary r21 1000u32 r20 into r22;
    output r22 as u32;

closure score_to_tier:
    input r0 as u32;
    gte r0 850u32 into r1;
    gte r0 700u32 into r2;
    gte r0 500u32 into r3;
    gte r0 300u32 into r4;
    ternary r4 2u8 1u8 into r5;
    ternary r3 3u8 r5 into r6;
    ternary r2 4u8 r6 into r7;
    ternary r1 5u8 r7 into r8;
    output r8 as u8;

function issue_credit_record:
    input r0 as address.private;
    input r1 as u32.private;
    input r2 as u32.private;
    input r3 as u32.private;
    input r4 as u128.private;
    input r5 as u32.private;
    input r6 as field.private;
    call compute_credit_score r1 r2 r3 r4 into r7;
    cast r0 r1 r2 r3 r4 r7 r5 r6 into r8 as CreditRecord.record;
    call score_to_tier r7 into r9;
    async issue_credit_record self.caller r9 into r10;
    output r8 as CreditRecord.record;
    output r10 as credit_score.aleo/issue_credit_record.future;

finalize issue_credit_record:
    input r0 as address.public;
    input r1 as u8.public;
    get protocol_admin[0u8] into r2;
    assert.eq r2 r0;
    get.or_use aggregate_score_count[r1] 0u32 into r3;
    add r3 1u32 into r4;
    set r4 into aggregate_score_count[r1];

function prove_tier:
    input r0 as CreditRecord.record;
    input r1 as field.private;
    input r2 as u32.private;
    input r3 as u32.private;
    input r4 as field.private;
    call score_to_tier r0.current_score into r5;
    cast r0.owner r0.wallet_age_days r0.repayments_made r0.defaults r0.total_volume r0.current_score r0.last_updated r0.nonce into r6 as CreditRecord.record;
    add r3 r2 into r7;
    cast r0.owner r5 r4 r7 r1 into r8 as CreditTierProof.record;
    output r6 as CreditRecord.record;
    output r8 as CreditTierProof.record;

function update_credit_record:
    input r0 as CreditRecord.record;
    input r1 as boolean.private;
    input r2 as u128.private;
    input r3 as u32.private;
    input r4 as field.private;
    add r0.repayments_made 1u32 into r5;
    ternary r1 r5 r0.repayments_made into r6;
    add r0.defaults 1u32 into r7;
    ternary r1 r0.defaults r7 into r8;
    add r0.total_volume r2 into r9;
    call compute_credit_score r0.wallet_age_days r6 r8 r9 into r10;
    cast r0.owner r0.wallet_age_days r6 r8 r9 r10 r3 r4 into r11 as CreditRecord.record;
    call score_to_tier r0.current_score into r12;
    call score_to_tier r10 into r13;
    async update_credit_record r12 r13 into r14;
    output r11 as CreditRecord.record;
    output r14 as credit_score.aleo/update_credit_record.future;

finalize update_credit_record:
    input r0 as u8.public;
    input r1 as u8.public;
    get.or_use aggregate_score_count[r0] 0u32 into r2;
    gt r2 0u32 into r3;
    branch.eq r3 false to end_then_0_0;
    sub r2 1u32 into r4;
    set r4 into aggregate_score_count[r0];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;
    get.or_use aggregate_score_count[r1] 0u32 into r5;
    add r5 1u32 into r6;
    set r6 into aggregate_score_count[r1];

function assert_tier_meets_minimum:
    input r0 as CreditTierProof.record;
    input r1 as u8.private;
    input r2 as u32.private;
    lte r2 r0.expires_at into r3;
    assert.eq r3 true;
    gte r0.tier r1 into r4;
    assert.eq r4 true;
    cast r0.owner r0.tier r0.org_id r0.expires_at r0.nonce into r5 as CreditTierProof.record;
    output r5 as CreditTierProof.record;
