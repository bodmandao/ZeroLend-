import credits.aleo;
import zerolend_lending_pool_v4.aleo;
program zerolend_vouching_v1.aleo;

record VouchRecord:
    owner as address.private;
    borrower as address.private;
    staked as u64.private;
    issued_block as u32.private;
    nonce as field.private;

mapping protocol_admin:
    key as u8.public;
    value as address.public;

mapping active_vouches:
    key as field.public;
    value as u64.public;

mapping vouch_issued_at:
    key as field.public;
    value as u32.public;

mapping vouch_boost:
    key as address.public;
    value as u8.public;

mapping vouches_out:
    key as address.public;
    value as u32.public;

mapping total_staked:
    key as address.public;
    value as u64.public;

mapping slashed_to_pool:
    key as u8.public;
    value as u64.public;

function initialize:
    async initialize self.caller into r0;
    output r0 as zerolend_vouching_v1.aleo/initialize.future;

finalize initialize:
    input r0 as address.public;
    get.or_use protocol_admin[0u8] aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf into r1;
    assert.eq r1 aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf;
    set r0 into protocol_admin[0u8];

function vouch_for:
    input r0 as credits.aleo/credits.record;
    input r1 as u64.private;
    input r2 as address.private;
    input r3 as u32.private;
    input r4 as field.private;
    gte r1 1000000u64 into r5;
    assert.eq r5 true;
    is.neq self.caller r2 into r6;
    assert.eq r6 true;
    call credits.aleo/transfer_private_to_public r0 zerolend_vouching_v1.aleo r1 into r7 r8;
    cast self.caller r2 r1 r3 r4 into r9 as VouchRecord.record;
    async vouch_for r8 self.caller r2 r1 r3 into r10;
    output r7 as credits.aleo/credits.record;
    output r9 as VouchRecord.record;
    output r10 as zerolend_vouching_v1.aleo/vouch_for.future;

finalize vouch_for:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as address.public;
    input r2 as address.public;
    input r3 as u64.public;
    input r4 as u32.public;
    await r0;
    get.or_use zerolend_lending_pool_v4.aleo/credit_passport[r1] 0u8 into r5;
    gte r5 4u8 into r6;
    assert.eq r6 true;
    get.or_use vouches_out[r1] 0u32 into r7;
    lt r7 5u32 into r8;
    assert.eq r8 true;
    hash.bhp256 r1 into r9 as field;
    hash.bhp256 r2 into r10 as field;
    add r9 r10 into r11;
    get.or_use active_vouches[r11] 0u64 into r12;
    assert.eq r12 0u64;
    get.or_use zerolend_lending_pool_v4.aleo/credit_passport[r2] 0u8 into r13;
    add r13 1u8 into r14;
    gt r14 5u8 into r15;
    ternary r15 5u8 r14 into r16;
    set r3 into active_vouches[r11];
    set r4 into vouch_issued_at[r11];
    set r16 into vouch_boost[r2];
    add r7 1u32 into r17;
    set r17 into vouches_out[r1];
    get.or_use total_staked[r1] 0u64 into r18;
    add r18 r3 into r19;
    set r19 into total_staked[r1];

function redeem_vouch:
    input r0 as VouchRecord.record;
    assert.eq r0.owner self.caller;
    call credits.aleo/transfer_public_to_private self.caller r0.staked into r1 r2;
    async redeem_vouch r2 r0.owner r0.borrower r0.staked into r3;
    output r1 as credits.aleo/credits.record;
    output r3 as zerolend_vouching_v1.aleo/redeem_vouch.future;

finalize redeem_vouch:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as address.public;
    input r2 as address.public;
    input r3 as u64.public;
    await r0;
    hash.bhp256 r1 into r4 as field;
    hash.bhp256 r2 into r5 as field;
    add r4 r5 into r6;
    get active_vouches[r6] into r7;
    assert.eq r7 r3;
    get.or_use zerolend_lending_pool_v4.aleo/active_loan_count[0u8] 0u32 into r8;
    set 0u64 into active_vouches[r6];
    set 0u8 into vouch_boost[r2];
    get.or_use vouches_out[r1] 0u32 into r9;
    gt r9 0u32 into r10;
    branch.eq r10 false to end_then_0_0;
    sub r9 1u32 into r11;
    set r11 into vouches_out[r1];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;
    get.or_use total_staked[r1] 0u64 into r12;
    gte r12 r3 into r13;
    sub r12 r3 into r14;
    ternary r13 r14 0u64 into r15;
    set r15 into total_staked[r1];

function slash_vouch:
    input r0 as VouchRecord.record;
    input r1 as u32.private;
    async slash_vouch r0.owner r0.borrower r0.staked r1 into r2;
    output r2 as zerolend_vouching_v1.aleo/slash_vouch.future;

finalize slash_vouch:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as u64.public;
    input r3 as u32.public;
    hash.bhp256 r0 into r4 as field;
    hash.bhp256 r1 into r5 as field;
    add r4 r5 into r6;
    get active_vouches[r6] into r7;
    gt r7 0u64 into r8;
    assert.eq r8 true;
    get.or_use zerolend_lending_pool_v4.aleo/credit_passport[r1] 0u8 into r9;
    get.or_use vouch_boost[r1] 0u8 into r10;
    lt r9 r10 into r11;
    assert.eq r11 true;
    set 0u64 into active_vouches[r6];
    set 0u8 into vouch_boost[r1];
    get.or_use vouches_out[r0] 0u32 into r12;
    gt r12 0u32 into r13;
    branch.eq r13 false to end_then_0_2;
    sub r12 1u32 into r14;
    set r14 into vouches_out[r0];
    branch.eq true true to end_otherwise_0_3;
    position end_then_0_2;
    position end_otherwise_0_3;
    get.or_use total_staked[r0] 0u64 into r15;
    gte r15 r2 into r16;
    sub r15 r2 into r17;
    ternary r16 r17 0u64 into r18;
    set r18 into total_staked[r0];
    get.or_use slashed_to_pool[0u8] 0u64 into r19;
    add r19 r2 into r20;
    set r20 into slashed_to_pool[0u8];

function prove_solvency:
    async prove_solvency into r0;
    output r0 as zerolend_vouching_v1.aleo/prove_solvency.future;

finalize prove_solvency:
    get.or_use slashed_to_pool[0u8] 0u64 into r0;
    gte r0 0u64 into r1;
    assert.eq r1 true;

constructor:
    assert.eq edition 0u16;
