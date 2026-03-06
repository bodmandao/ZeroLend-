program private_token.aleo;

record Token:
    owner as address.private;
    token_id as field.private;
    amount as u128.private;

mapping total_supply:
    key as field.public;
    value as u128.public;

mapping token_admin:
    key as field.public;
    value as address.public;

function initialize:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as address.private;
    cast r2 r0 r1 into r3 as Token.record;
    async initialize r0 r1 self.caller into r4;
    output r3 as Token.record;
    output r4 as private_token.aleo/initialize.future;

finalize initialize:
    input r0 as field.public;
    input r1 as u128.public;
    input r2 as address.public;
    get.or_use total_supply[r0] 0u128 into r3;
    assert.eq r3 0u128;
    set r1 into total_supply[r0];
    set r2 into token_admin[r0];

function mint:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as address.private;
    cast r2 r0 r1 into r3 as Token.record;
    async mint r0 r1 self.caller into r4;
    output r3 as Token.record;
    output r4 as private_token.aleo/mint.future;

finalize mint:
    input r0 as field.public;
    input r1 as u128.public;
    input r2 as address.public;
    get token_admin[r0] into r3;
    assert.eq r3 r2;
    get.or_use total_supply[r0] 0u128 into r4;
    add r4 r1 into r5;
    set r5 into total_supply[r0];

function transfer_private:
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
