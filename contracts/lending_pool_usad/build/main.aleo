import merkle_tree.aleo;
import test_usad_multisig_core.aleo;
import test_usad_freezelist.aleo;
import test_usad_stablecoin.aleo;
import zerolend_oracle_v2.aleo;
import credits.aleo;
import zerolend_lending_pool_v5.aleo;
program zerolend_usad_v2.aleo;

record UsadDeposit:
    owner as address.private;
    deposited_amount as u128.private;
    deposit_block as u32.private;
    nonce as field.private;

record UsadLoan:
    owner as address.private;
    loan_id as field.private;
    principal as u128.private;
    interest_rate as u128.private;
    borrowed_block as u32.private;
    due_block as u32.private;
    tier_at_borrow as u8.private;
    nonce as field.private;

mapping protocol_admin:
    key as u8.public;
    value as address.public;

mapping pool_liquidity:
    key as u8.public;
    value as u128.public;

mapping pool_borrowed:
    key as u8.public;
    value as u128.public;

mapping pool_interest_earned:
    key as u8.public;
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

mapping flash_loan_fees:
    key as u8.public;
    value as u128.public;

mapping flash_loan_count:
    key as u8.public;
    value as u32.public;

function initialize:
    async initialize self.caller into r0;
    output r0 as zerolend_usad_v2.aleo/initialize.future;

finalize initialize:
    input r0 as address.public;
    get.or_use protocol_admin[0u8] aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf into r1;
    assert.eq r1 aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf;
    set r0 into protocol_admin[0u8];
    set 0u128 into pool_liquidity[0u8];
    set 0u128 into pool_borrowed[0u8];
    set 0u128 into pool_interest_earned[0u8];
    set 0u32 into active_loan_count[0u8];
    set 17280u32 into loan_term_blocks[1u8];
    set 43200u32 into loan_term_blocks[2u8];
    set 86400u32 into loan_term_blocks[3u8];
    set 172800u32 into loan_term_blocks[4u8];
    set 259200u32 into loan_term_blocks[5u8];

function deposit:
    input r0 as test_usad_stablecoin.aleo/Token.record;
    input r1 as u128.private;
    input r2 as [test_usad_stablecoin.aleo/MerkleProof; 2u32].private;
    input r3 as u32.private;
    input r4 as field.private;
    call test_usad_stablecoin.aleo/transfer_private_to_public zerolend_usad_v2.aleo r1 r0 r2 into r5 r6 r7;
    cast self.caller r1 r3 r4 into r8 as UsadDeposit.record;
    async deposit r7 r1 into r9;
    output r5 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r6 as test_usad_stablecoin.aleo/Token.record;
    output r8 as UsadDeposit.record;
    output r9 as zerolend_usad_v2.aleo/deposit.future;

finalize deposit:
    input r0 as test_usad_stablecoin.aleo/transfer_private_to_public.future;
    input r1 as u128.public;
    await r0;
    get.or_use pool_liquidity[0u8] 0u128 into r2;
    add r2 r1 into r3;
    set r3 into pool_liquidity[0u8];

closure compute_interest:
    input r0 as u128;
    input r1 as u128;
    input r2 as u32;
    cast r2 into r3 as u128;
    mul r0 r1 into r4;
    mul r4 r3 into r5;
    div r5 10000000u128 into r6;
    output r6 as u128;

function withdraw:
    input r0 as UsadDeposit.record;
    input r1 as u32.private;
    assert.eq r0.owner self.caller;
    sub r1 r0.deposit_block into r2;
    call compute_interest r0.deposited_amount 950u128 r2 into r3;
    add r0.deposited_amount r3 into r4;
    call test_usad_stablecoin.aleo/transfer_public_to_private self.caller r4 into r5 r6 r7;
    async withdraw r7 r0.deposited_amount r3 into r8;
    output r5 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r6 as test_usad_stablecoin.aleo/Token.record;
    output r8 as zerolend_usad_v2.aleo/withdraw.future;

finalize withdraw:
    input r0 as test_usad_stablecoin.aleo/transfer_public_to_private.future;
    input r1 as u128.public;
    input r2 as u128.public;
    await r0;
    get pool_liquidity[0u8] into r3;
    add r1 r2 into r4;
    gte r3 r4 into r5;
    assert.eq r5 true;
    sub r3 r1 into r6;
    sub r6 r2 into r7;
    set r7 into pool_liquidity[0u8];

function request_loan:
    input r0 as u128.private;
    input r1 as u32.private;
    input r2 as field.private;
    input r3 as field.private;
    gt r0 0u128 into r4;
    assert.eq r4 true;
    call test_usad_stablecoin.aleo/transfer_public_to_private self.caller r0 into r5 r6 r7;
    add r1 86400u32 into r8;
    cast self.caller r3 r0 0u128 r1 r8 0u8 r2 into r9 as UsadLoan.record;
    async request_loan r7 self.caller r0 r3 into r10;
    output r9 as UsadLoan.record;
    output r5 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r6 as test_usad_stablecoin.aleo/Token.record;
    output r10 as zerolend_usad_v2.aleo/request_loan.future;

finalize request_loan:
    input r0 as test_usad_stablecoin.aleo/transfer_public_to_private.future;
    input r1 as address.public;
    input r2 as u128.public;
    input r3 as field.public;
    await r0;
    get.or_use zerolend_lending_pool_v5.aleo/credit_passport[r1] 0u8 into r4;
    gte r4 1u8 into r5;
    assert.eq r5 true;
    is.eq r4 5u8 into r6;
    is.eq r4 4u8 into r7;
    is.eq r4 3u8 into r8;
    is.eq r4 2u8 into r9;
    ternary r9 50000000u128 10000000u128 into r10;
    ternary r8 200000000u128 r10 into r11;
    ternary r7 1000000000u128 r11 into r12;
    ternary r6 5000000000u128 r12 into r13;
    lte r2 r13 into r14;
    assert.eq r14 true;
    get.or_use loan_nullifiers[r3] false into r15;
    not r15 into r16;
    assert.eq r16 true;
    set true into loan_nullifiers[r3];
    get.or_use pool_liquidity[0u8] 0u128 into r17;
    get.or_use pool_borrowed[0u8] 0u128 into r18;
    add r18 r2 into r19;
    gte r17 r19 into r20;
    assert.eq r20 true;
    set r19 into pool_borrowed[0u8];
    get.or_use active_loan_count[0u8] 0u32 into r21;
    add r21 1u32 into r22;
    set r22 into active_loan_count[0u8];

function repay_loan:
    input r0 as UsadLoan.record;
    input r1 as test_usad_stablecoin.aleo/Token.record;
    input r2 as [test_usad_stablecoin.aleo/MerkleProof; 2u32].private;
    input r3 as u32.private;
    assert.eq r0.owner self.caller;
    sub r3 r0.borrowed_block into r4;
    call compute_interest r0.principal r0.interest_rate r4 into r5;
    add r0.principal r5 into r6;
    gte r1.amount r6 into r7;
    assert.eq r7 true;
    call test_usad_stablecoin.aleo/transfer_private_to_public zerolend_usad_v2.aleo r6 r1 r2 into r8 r9 r10;
    async repay_loan r10 r0.principal r5 into r11;
    output r8 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r9 as test_usad_stablecoin.aleo/Token.record;
    output r11 as zerolend_usad_v2.aleo/repay_loan.future;

finalize repay_loan:
    input r0 as test_usad_stablecoin.aleo/transfer_private_to_public.future;
    input r1 as u128.public;
    input r2 as u128.public;
    await r0;
    get pool_borrowed[0u8] into r3;
    gte r3 r1 into r4;
    assert.eq r4 true;
    sub r3 r1 into r5;
    set r5 into pool_borrowed[0u8];
    get.or_use pool_interest_earned[0u8] 0u128 into r6;
    add r6 r2 into r7;
    set r7 into pool_interest_earned[0u8];
    get.or_use active_loan_count[0u8] 0u32 into r8;
    gt r8 0u32 into r9;
    branch.eq r9 false to end_then_0_0;
    sub r8 1u32 into r10;
    set r10 into active_loan_count[0u8];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;

function liquidate:
    input r0 as UsadLoan.record;
    input r1 as u32.private;
    add r0.due_block 8640u32 into r2;
    gt r1 r2 into r3;
    assert.eq r3 true;
    async liquidate r0.principal into r4;
    output r4 as zerolend_usad_v2.aleo/liquidate.future;

finalize liquidate:
    input r0 as u128.public;
    get.or_use pool_borrowed[0u8] 0u128 into r1;
    gte r1 r0 into r2;
    sub r1 r0 into r3;
    ternary r2 r3 0u128 into r4;
    set r4 into pool_borrowed[0u8];
    get.or_use active_loan_count[0u8] 0u32 into r5;
    gt r5 0u32 into r6;
    branch.eq r6 false to end_then_0_2;
    sub r5 1u32 into r7;
    set r7 into active_loan_count[0u8];
    branch.eq true true to end_otherwise_0_3;
    position end_then_0_2;
    position end_otherwise_0_3;

function flash_loan:
    input r0 as test_usad_stablecoin.aleo/Token.record;
    input r1 as [test_usad_stablecoin.aleo/MerkleProof; 2u32].private;
    input r2 as u128.private;
    input r3 as field.private;
    gt r2 0u128 into r4;
    assert.eq r4 true;
    mul r2 50u128 into r5;
    div r5 10000u128 into r6;
    gt r6 0u128 into r7;
    ternary r7 r6 1u128 into r8;
    add r2 r8 into r9;
    gte r0.amount r9 into r10;
    assert.eq r10 true;
    call test_usad_stablecoin.aleo/transfer_private_to_public zerolend_usad_v2.aleo r9 r0 r1 into r11 r12 r13;
    call test_usad_stablecoin.aleo/transfer_public_to_private self.caller r2 into r14 r15 r16;
    async flash_loan r13 r16 r3 r2 r8 into r17;
    output r11 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r12 as test_usad_stablecoin.aleo/Token.record;
    output r14 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r15 as test_usad_stablecoin.aleo/Token.record;
    output r17 as zerolend_usad_v2.aleo/flash_loan.future;

finalize flash_loan:
    input r0 as test_usad_stablecoin.aleo/transfer_private_to_public.future;
    input r1 as test_usad_stablecoin.aleo/transfer_public_to_private.future;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u128.public;
    await r0;
    await r1;
    get.or_use loan_nullifiers[r2] false into r5;
    not r5 into r6;
    assert.eq r6 true;
    set true into loan_nullifiers[r2];
    get.or_use pool_liquidity[0u8] 0u128 into r7;
    get.or_use pool_borrowed[0u8] 0u128 into r8;
    add r8 r3 into r9;
    gte r7 r9 into r10;
    assert.eq r10 true;
    add r7 r4 into r11;
    set r11 into pool_liquidity[0u8];
    get.or_use flash_loan_fees[0u8] 0u128 into r12;
    get.or_use flash_loan_count[0u8] 0u32 into r13;
    add r12 r4 into r14;
    set r14 into flash_loan_fees[0u8];
    add r13 1u32 into r15;
    set r15 into flash_loan_count[0u8];

function prove_solvency:
    async prove_solvency into r0;
    output r0 as zerolend_usad_v2.aleo/prove_solvency.future;

finalize prove_solvency:
    get.or_use pool_liquidity[0u8] 0u128 into r0;
    get.or_use pool_borrowed[0u8] 0u128 into r1;
    lte r1 r0 into r2;
    assert.eq r2 true;

constructor:
    assert.eq edition 0u16;
