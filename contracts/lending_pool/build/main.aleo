program zerolend_lending_pool.aleo;

record Token:
    owner as address.private;
    token_id as field.private;
    amount as u128.private;

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

record LoanRecord:
    owner as address.private;
    loan_id as field.private;
    token_id as field.private;
    principal as u128.private;
    interest_rate as u64.private;
    borrowed_block as u32.private;
    due_block as u32.private;
    tier_at_borrow as u8.private;
    nonce as field.private;

record LenderDeposit:
    owner as address.private;
    token_id as field.private;
    deposited_amount as u128.private;
    deposit_block as u32.private;
    nonce as field.private;

record OracleAttestation:
    owner as address.private;
    attester as address.private;
    wallet_age_days as u32.private;
    repayments_made as u32.private;
    defaults as u32.private;
    total_volume as u128.private;
    valid_until as u32.private;
    attestation_id as field.private;

mapping protocol_admin:
    key as u8.public;
    value as address.public;

mapping approved_oracles:
    key as address.public;
    value as boolean.public;

mapping total_supply:
    key as field.public;
    value as u128.public;

mapping pool_liquidity:
    key as field.public;
    value as u128.public;

mapping pool_borrowed:
    key as field.public;
    value as u128.public;

mapping pool_interest_earned:
    key as field.public;
    value as u128.public;

mapping active_loan_count:
    key as u8.public;
    value as u32.public;

mapping loan_term_blocks:
    key as u8.public;
    value as u32.public;

mapping loan_nullifiers:
    key as field.public;
    value as boolean.public;

mapping used_attestations:
    key as field.public;
    value as boolean.public;

mapping aggregate_tier_count:
    key as u8.public;
    value as u32.public;

function initialize:
    input r0 as u128.private;
    cast self.caller into r1 as address;
    cast r1 1field r0 into r2 as Token.record;
    async initialize self.caller r0 into r3;
    output r2 as Token.record;
    output r3 as zerolend_lending_pool.aleo/initialize.future;

finalize initialize:
    input r0 as address.public;
    input r1 as u128.public;
    get.or_use total_supply[1field] 0u128 into r2;
    assert.eq r2 0u128;
    set r0 into protocol_admin[0u8];
    set true into approved_oracles[r0];
    set r1 into total_supply[1field];
    set 0u128 into pool_liquidity[1field];
    set 0u128 into pool_borrowed[1field];
    set 0u128 into pool_interest_earned[1field];
    set 0u32 into active_loan_count[0u8];
    set 17280u32 into loan_term_blocks[1u8];
    set 43200u32 into loan_term_blocks[2u8];
    set 86400u32 into loan_term_blocks[3u8];
    set 172800u32 into loan_term_blocks[4u8];
    set 259200u32 into loan_term_blocks[5u8];

function mint:
    input r0 as address.private;
    input r1 as u128.private;
    cast r0 1field r1 into r2 as Token.record;
    async mint self.caller r1 into r3;
    output r2 as Token.record;
    output r3 as zerolend_lending_pool.aleo/mint.future;

finalize mint:
    input r0 as address.public;
    input r1 as u128.public;
    get protocol_admin[0u8] into r2;
    assert.eq r2 r0;
    get.or_use total_supply[1field] 0u128 into r3;
    add r3 r1 into r4;
    set r4 into total_supply[1field];

function transfer:
    input r0 as Token.record;
    input r1 as address.private;
    input r2 as u128.private;
    gte r0.amount r2 into r3;
    assert.eq r3 true;
    sub r0.amount r2 into r4;
    cast r0.owner r0.token_id r4 into r5 as Token.record;
    cast r1 r0.token_id r2 into r6 as Token.record;
    output r5 as Token.record;
    output r6 as Token.record;

function combine:
    input r0 as Token.record;
    input r1 as Token.record;
    assert.eq r0.token_id r1.token_id;
    assert.eq r0.owner r1.owner;
    add r0.amount r1.amount into r2;
    cast r0.owner r0.token_id r2 into r3 as Token.record;
    output r3 as Token.record;

function split:
    input r0 as Token.record;
    input r1 as u128.private;
    gte r0.amount r1 into r2;
    assert.eq r2 true;
    cast r0.owner r0.token_id r1 into r3 as Token.record;
    sub r0.amount r1 into r4;
    cast r0.owner r0.token_id r4 into r5 as Token.record;
    output r3 as Token.record;
    output r5 as Token.record;

function add_oracle:
    input r0 as address.private;
    async add_oracle self.caller r0 into r1;
    output r1 as zerolend_lending_pool.aleo/add_oracle.future;

finalize add_oracle:
    input r0 as address.public;
    input r1 as address.public;
    get protocol_admin[0u8] into r2;
    assert.eq r2 r0;
    set true into approved_oracles[r1];

function remove_oracle:
    input r0 as address.private;
    async remove_oracle self.caller r0 into r1;
    output r1 as zerolend_lending_pool.aleo/remove_oracle.future;

finalize remove_oracle:
    input r0 as address.public;
    input r1 as address.public;
    get protocol_admin[0u8] into r2;
    assert.eq r2 r0;
    set false into approved_oracles[r1];

function attest_credit:
    input r0 as address.private;
    input r1 as u32.private;
    input r2 as u32.private;
    input r3 as u32.private;
    input r4 as u128.private;
    input r5 as u32.private;
    input r6 as u32.private;
    input r7 as field.private;
    add r6 r5 into r8;
    cast r0 self.caller r1 r2 r3 r4 r8 r7 into r9 as OracleAttestation.record;
    async attest_credit self.caller r7 into r10;
    output r9 as OracleAttestation.record;
    output r10 as zerolend_lending_pool.aleo/attest_credit.future;

finalize attest_credit:
    input r0 as address.public;
    input r1 as field.public;
    get.or_use approved_oracles[r0] false into r2;
    assert.eq r2 true;
    get.or_use used_attestations[r1] false into r3;
    not r3 into r4;
    assert.eq r4 true;
    set true into used_attestations[r1];

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
    div r3 1000000u128 into r10;
    cast r10 into r11 as u32;
    gt r11 200u32 into r12;
    ternary r12 200u32 r11 into r13;
    add 200u32 r6 into r14;
    add r14 r9 into r15;
    add r15 r13 into r16;
    mul r2 100u32 into r17;
    gt r16 r17 into r18;
    sub r16 r17 into r19;
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

function redeem_attestation:
    input r0 as OracleAttestation.record;
    input r1 as u32.private;
    input r2 as field.private;
    lte r1 r0.valid_until into r3;
    assert.eq r3 true;
    assert.eq r0.owner self.caller;
    call compute_credit_score r0.wallet_age_days r0.repayments_made r0.defaults r0.total_volume into r4;
    cast r0.owner r0.wallet_age_days r0.repayments_made r0.defaults r0.total_volume r4 r1 r2 into r5 as CreditRecord.record;
    call score_to_tier r4 into r6;
    async redeem_attestation r6 into r7;
    output r5 as CreditRecord.record;
    output r7 as zerolend_lending_pool.aleo/redeem_attestation.future;

finalize redeem_attestation:
    input r0 as u8.public;
    get.or_use aggregate_tier_count[r0] 0u32 into r1;
    add r1 1u32 into r2;
    set r2 into aggregate_tier_count[r0];

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

function deposit:
    input r0 as Token.record;
    input r1 as u128.private;
    input r2 as u32.private;
    input r3 as field.private;
    assert.eq r0.token_id 1field;
    gte r0.amount r1 into r4;
    assert.eq r4 true;
    sub r0.amount r1 into r5;
    cast r0.owner r0.token_id r5 into r6 as Token.record;
    cast r0.owner 1field r1 r2 r3 into r7 as LenderDeposit.record;
    async deposit r1 into r8;
    output r6 as Token.record;
    output r7 as LenderDeposit.record;
    output r8 as zerolend_lending_pool.aleo/deposit.future;

finalize deposit:
    input r0 as u128.public;
    get.or_use pool_liquidity[1field] 0u128 into r1;
    add r1 r0 into r2;
    set r2 into pool_liquidity[1field];

closure compute_interest:
    input r0 as u128;
    input r1 as u64;
    input r2 as u32;
    cast r1 into r3 as u128;
    cast r2 into r4 as u128;
    mul r0 r3 into r5;
    mul r5 r4 into r6;
    div r6 10000000u128 into r7;
    output r7 as u128;

function withdraw:
    input r0 as LenderDeposit.record;
    input r1 as u32.private;
    sub r1 r0.deposit_block into r2;
    call compute_interest r0.deposited_amount 1000u64 r2 into r3;
    add r0.deposited_amount r3 into r4;
    cast r0.owner 1field r4 into r5 as Token.record;
    async withdraw r0.deposited_amount r3 into r6;
    output r5 as Token.record;
    output r6 as zerolend_lending_pool.aleo/withdraw.future;

finalize withdraw:
    input r0 as u128.public;
    input r1 as u128.public;
    get pool_liquidity[1field] into r2;
    add r0 r1 into r3;
    gte r2 r3 into r4;
    assert.eq r4 true;
    sub r2 r0 into r5;
    sub r5 r1 into r6;
    set r6 into pool_liquidity[1field];
    get.or_use pool_interest_earned[1field] 0u128 into r7;
    gte r7 r1 into r8;
    branch.eq r8 false to end_then_0_0;
    sub r7 r1 into r9;
    set r9 into pool_interest_earned[1field];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;

closure max_loan_for_tier:
    input r0 as u8;
    is.eq r0 5u8 into r1;
    is.eq r0 4u8 into r2;
    is.eq r0 3u8 into r3;
    is.eq r0 2u8 into r4;
    ternary r4 500000000u128 100000000u128 into r5;
    ternary r3 2000000000u128 r5 into r6;
    ternary r2 10000000000u128 r6 into r7;
    ternary r1 50000000000u128 r7 into r8;
    output r8 as u128;

closure rate_for_tier:
    input r0 as u8;
    is.eq r0 5u8 into r1;
    is.eq r0 4u8 into r2;
    is.eq r0 3u8 into r3;
    is.eq r0 2u8 into r4;
    ternary r4 1500u64 2000u64 into r5;
    ternary r3 1000u64 r5 into r6;
    ternary r2 700u64 r6 into r7;
    ternary r1 400u64 r7 into r8;
    output r8 as u64;

function request_loan:
    input r0 as CreditTierProof.record;
    input r1 as u128.private;
    input r2 as u32.private;
    input r3 as field.private;
    input r4 as field.private;
    lte r2 r0.expires_at into r5;
    assert.eq r5 true;
    call max_loan_for_tier r0.tier into r6;
    lte r1 r6 into r7;
    assert.eq r7 true;
    gt r1 0u128 into r8;
    assert.eq r8 true;
    call rate_for_tier r0.tier into r9;
    cast r0.owner r0.tier r0.org_id r0.expires_at r0.nonce into r10 as CreditTierProof.record;
    add r2 86400u32 into r11;
    cast r0.owner r4 1field r1 r9 r2 r11 r0.tier r3 into r12 as LoanRecord.record;
    cast r0.owner 1field r1 into r13 as Token.record;
    async request_loan r1 r4 r0.tier into r14;
    output r10 as CreditTierProof.record;
    output r12 as LoanRecord.record;
    output r13 as Token.record;
    output r14 as zerolend_lending_pool.aleo/request_loan.future;

finalize request_loan:
    input r0 as u128.public;
    input r1 as field.public;
    input r2 as u8.public;
    get.or_use loan_nullifiers[r1] false into r3;
    not r3 into r4;
    assert.eq r4 true;
    set true into loan_nullifiers[r1];
    get.or_use pool_liquidity[1field] 0u128 into r5;
    get.or_use pool_borrowed[1field] 0u128 into r6;
    sub r5 r6 into r7;
    gte r7 r0 into r8;
    assert.eq r8 true;
    add r6 r0 into r9;
    set r9 into pool_borrowed[1field];
    get.or_use active_loan_count[0u8] 0u32 into r10;
    add r10 1u32 into r11;
    set r11 into active_loan_count[0u8];

function repay_loan:
    input r0 as LoanRecord.record;
    input r1 as Token.record;
    input r2 as CreditRecord.record;
    input r3 as u32.private;
    input r4 as field.private;
    assert.eq r0.token_id r1.token_id;
    assert.eq r0.owner r2.owner;
    assert.eq r0.owner self.caller;
    sub r3 r0.borrowed_block into r5;
    call compute_interest r0.principal r0.interest_rate r5 into r6;
    add r0.principal r6 into r7;
    gte r1.amount r7 into r8;
    assert.eq r8 true;
    sub r1.amount r7 into r9;
    cast r1.owner r1.token_id r9 into r10 as Token.record;
    add r2.repayments_made 1u32 into r11;
    add r2.total_volume r0.principal into r12;
    call compute_credit_score r2.wallet_age_days r11 r2.defaults r12 into r13;
    call score_to_tier r2.current_score into r14;
    call score_to_tier r13 into r15;
    cast r2.owner r2.wallet_age_days r11 r2.defaults r12 r13 r3 r4 into r16 as CreditRecord.record;
    async repay_loan r0.principal r6 r14 r15 into r17;
    output r10 as Token.record;
    output r16 as CreditRecord.record;
    output r17 as zerolend_lending_pool.aleo/repay_loan.future;

finalize repay_loan:
    input r0 as u128.public;
    input r1 as u128.public;
    input r2 as u8.public;
    input r3 as u8.public;
    get pool_borrowed[1field] into r4;
    gte r4 r0 into r5;
    assert.eq r5 true;
    sub r4 r0 into r6;
    set r6 into pool_borrowed[1field];
    get.or_use pool_interest_earned[1field] 0u128 into r7;
    add r7 r1 into r8;
    set r8 into pool_interest_earned[1field];
    get.or_use active_loan_count[0u8] 0u32 into r9;
    gt r9 0u32 into r10;
    branch.eq r10 false to end_then_0_2;
    sub r9 1u32 into r11;
    set r11 into active_loan_count[0u8];
    branch.eq true true to end_otherwise_0_3;
    position end_then_0_2;
    position end_otherwise_0_3;
    get.or_use aggregate_tier_count[r2] 0u32 into r12;
    gt r12 0u32 into r13;
    branch.eq r13 false to end_then_0_4;
    sub r12 1u32 into r14;
    set r14 into aggregate_tier_count[r2];
    branch.eq true true to end_otherwise_0_5;
    position end_then_0_4;
    position end_otherwise_0_5;
    get.or_use aggregate_tier_count[r3] 0u32 into r15;
    add r15 1u32 into r16;
    set r16 into aggregate_tier_count[r3];

function liquidate:
    input r0 as LoanRecord.record;
    input r1 as CreditRecord.record;
    input r2 as u32.private;
    input r3 as field.private;
    assert.eq r0.owner r1.owner;
    add r0.due_block 8640u32 into r4;
    gt r2 r4 into r5;
    assert.eq r5 true;
    add r1.defaults 1u32 into r6;
    call compute_credit_score r1.wallet_age_days r1.repayments_made r6 r1.total_volume into r7;
    call score_to_tier r1.current_score into r8;
    call score_to_tier r7 into r9;
    cast r1.owner r1.wallet_age_days r1.repayments_made r6 r1.total_volume r7 r2 r3 into r10 as CreditRecord.record;
    async liquidate r0.principal r8 r9 into r11;
    output r10 as CreditRecord.record;
    output r11 as zerolend_lending_pool.aleo/liquidate.future;

finalize liquidate:
    input r0 as u128.public;
    input r1 as u8.public;
    input r2 as u8.public;
    get.or_use pool_borrowed[1field] 0u128 into r3;
    gte r3 r0 into r4;
    sub r3 r0 into r5;
    ternary r4 r5 0u128 into r6;
    set r6 into pool_borrowed[1field];
    get.or_use active_loan_count[0u8] 0u32 into r7;
    gt r7 0u32 into r8;
    branch.eq r8 false to end_then_0_6;
    sub r7 1u32 into r9;
    set r9 into active_loan_count[0u8];
    branch.eq true true to end_otherwise_0_7;
    position end_then_0_6;
    position end_otherwise_0_7;
    get.or_use aggregate_tier_count[r1] 0u32 into r10;
    gt r10 0u32 into r11;
    branch.eq r11 false to end_then_0_8;
    sub r10 1u32 into r12;
    set r12 into aggregate_tier_count[r1];
    branch.eq true true to end_otherwise_0_9;
    position end_then_0_8;
    position end_otherwise_0_9;
    get.or_use aggregate_tier_count[r2] 0u32 into r13;
    add r13 1u32 into r14;
    set r14 into aggregate_tier_count[r2];

function prove_solvency:
    async prove_solvency into r0;
    output r0 as zerolend_lending_pool.aleo/prove_solvency.future;

finalize prove_solvency:
    get.or_use pool_liquidity[1field] 0u128 into r0;
    get.or_use pool_borrowed[1field] 0u128 into r1;
    lte r1 r0 into r2;
    assert.eq r2 true;

constructor:
    assert.eq edition 0u16;
