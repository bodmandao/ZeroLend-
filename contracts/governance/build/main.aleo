import credits.aleo;
import zerolend_oracle_v2.aleo;
import zerolend_lending_pool_v5.aleo;
program zerolend_governance_v2.aleo;

record Ballot:
    owner as address.private;
    proposal_id as field.private;
    vote_yes as boolean.private;
    weight as u64.private;
    cast_block as u32.private;
    nonce as field.private;

record GovernanceStake:
    owner as address.private;
    staked as u64.private;
    staked_block as u32.private;
    nonce as field.private;

struct ProposalContent:
    target_contract as field;
    param_key as u8;
    new_value as u64;
    description as field;

mapping protocol_admin:
    key as u8.public;
    value as address.public;

mapping proposal_content:
    key as field.public;
    value as ProposalContent.public;

mapping proposal_start:
    key as field.public;
    value as u32.public;

mapping proposal_end:
    key as field.public;
    value as u32.public;

mapping proposal_proposer:
    key as field.public;
    value as address.public;

mapping proposal_yes:
    key as field.public;
    value as u64.public;

mapping proposal_no:
    key as field.public;
    value as u64.public;

mapping proposal_executed:
    key as field.public;
    value as boolean.public;

mapping staked_balance:
    key as address.public;
    value as u64.public;

mapping total_staked:
    key as u8.public;
    value as u64.public;

mapping has_voted:
    key as field.public;
    value as boolean.public;

mapping proposal_count:
    key as u8.public;
    value as u32.public;

function initialize:
    async initialize self.caller into r0;
    output r0 as zerolend_governance_v2.aleo/initialize.future;

finalize initialize:
    input r0 as address.public;
    get.or_use protocol_admin[0u8] aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf into r1;
    assert.eq r1 aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf;
    set r0 into protocol_admin[0u8];
    set 0u32 into proposal_count[0u8];
    set 0u64 into total_staked[0u8];

function stake:
    input r0 as credits.aleo/credits.record;
    input r1 as u64.private;
    input r2 as u32.private;
    input r3 as field.private;
    gte r1 1000000u64 into r4;
    assert.eq r4 true;
    call credits.aleo/transfer_private_to_public r0 zerolend_governance_v2.aleo r1 into r5 r6;
    cast self.caller r1 r2 r3 into r7 as GovernanceStake.record;
    async stake r6 self.caller r1 into r8;
    output r5 as credits.aleo/credits.record;
    output r7 as GovernanceStake.record;
    output r8 as zerolend_governance_v2.aleo/stake.future;

finalize stake:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as address.public;
    input r2 as u64.public;
    await r0;
    get.or_use zerolend_lending_pool_v5.aleo/credit_passport[r1] 0u8 into r3;
    gte r3 1u8 into r4;
    assert.eq r4 true;
    get.or_use staked_balance[r1] 0u64 into r5;
    add r5 r2 into r6;
    set r6 into staked_balance[r1];
    get.or_use total_staked[0u8] 0u64 into r7;
    add r7 r2 into r8;
    set r8 into total_staked[0u8];

function unstake:
    input r0 as GovernanceStake.record;
    assert.eq r0.owner self.caller;
    call credits.aleo/transfer_public_to_private self.caller r0.staked into r1 r2;
    async unstake r2 self.caller r0.staked into r3;
    output r1 as credits.aleo/credits.record;
    output r3 as zerolend_governance_v2.aleo/unstake.future;

finalize unstake:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as address.public;
    input r2 as u64.public;
    await r0;
    get staked_balance[r1] into r3;
    gte r3 r2 into r4;
    assert.eq r4 true;
    sub r3 r2 into r5;
    set r5 into staked_balance[r1];
    get.or_use total_staked[0u8] 0u64 into r6;
    gte r6 r2 into r7;
    sub r6 r2 into r8;
    ternary r7 r8 0u64 into r9;
    set r9 into total_staked[0u8];

function propose:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u64.private;
    input r3 as field.private;
    input r4 as u32.private;
    cast r0 r1 r2 r3 into r5 as ProposalContent;
    async propose self.caller r5 r4 into r6;
    output r6 as zerolend_governance_v2.aleo/propose.future;

finalize propose:
    input r0 as address.public;
    input r1 as ProposalContent.public;
    input r2 as u32.public;
    get.or_use zerolend_lending_pool_v5.aleo/credit_passport[r0] 0u8 into r3;
    gte r3 3u8 into r4;
    assert.eq r4 true;
    get.or_use staked_balance[r0] 0u64 into r5;
    gte r5 1000000u64 into r6;
    assert.eq r6 true;
    get.or_use proposal_count[0u8] 0u32 into r7;
    hash.bhp256 r0 into r8 as field;
    cast r7 into r9 as field;
    add r8 r9 into r10;
    set r1 into proposal_content[r10];
    set r2 into proposal_start[r10];
    add r2 17280u32 into r11;
    set r11 into proposal_end[r10];
    set r0 into proposal_proposer[r10];
    set 0u64 into proposal_yes[r10];
    set 0u64 into proposal_no[r10];
    set false into proposal_executed[r10];
    add r7 1u32 into r12;
    set r12 into proposal_count[0u8];

function cast_vote:
    input r0 as field.private;
    input r1 as boolean.private;
    input r2 as u32.private;
    input r3 as field.private;
    cast self.caller r0 r1 0u64 r2 r3 into r4 as Ballot.record;
    async cast_vote r0 r2 self.caller r1 into r5;
    output r4 as Ballot.record;
    output r5 as zerolend_governance_v2.aleo/cast_vote.future;

finalize cast_vote:
    input r0 as field.public;
    input r1 as u32.public;
    input r2 as address.public;
    input r3 as boolean.public;
    get proposal_start[r0] into r4;
    get proposal_end[r0] into r5;
    gte r1 r4 into r6;
    assert.eq r6 true;
    lte r1 r5 into r7;
    assert.eq r7 true;
    hash.bhp256 r2 into r8 as field;
    add r8 r0 into r9;
    get.or_use has_voted[r9] false into r10;
    not r10 into r11;
    assert.eq r11 true;
    set true into has_voted[r9];
    get.or_use zerolend_lending_pool_v5.aleo/credit_passport[r2] 0u8 into r12;
    gte r12 1u8 into r13;
    assert.eq r13 true;
    get.or_use staked_balance[r2] 0u64 into r14;
    gte r14 1000000u64 into r15;
    assert.eq r15 true;
    cast r12 into r16 as u64;
    mul r16 r14 into r17;
    branch.eq r3 false to end_then_0_0;
    get.or_use proposal_yes[r0] 0u64 into r18;
    add r18 r17 into r19;
    set r19 into proposal_yes[r0];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    get.or_use proposal_no[r0] 0u64 into r20;
    add r20 r17 into r21;
    set r21 into proposal_no[r0];
    position end_otherwise_0_1;

function execute_proposal:
    input r0 as field.private;
    input r1 as u32.private;
    async execute_proposal r0 r1 into r2;
    output r2 as zerolend_governance_v2.aleo/execute_proposal.future;

finalize execute_proposal:
    input r0 as field.public;
    input r1 as u32.public;
    get proposal_end[r0] into r2;
    get proposal_executed[r0] into r3;
    gt r1 r2 into r4;
    assert.eq r4 true;
    not r3 into r5;
    assert.eq r5 true;
    get.or_use proposal_yes[r0] 0u64 into r6;
    get.or_use proposal_no[r0] 0u64 into r7;
    add r6 r7 into r8;
    get.or_use total_staked[0u8] 0u64 into r9;
    mul r9 1000u64 into r10;
    div r10 10000u64 into r11;
    gte r8 r11 into r12;
    assert.eq r12 true;
    mul r8 6000u64 into r13;
    div r13 10000u64 into r14;
    gte r6 r14 into r15;
    assert.eq r15 true;
    set true into proposal_executed[r0];

constructor:
    assert.eq edition 0u16;
