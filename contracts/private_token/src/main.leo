// ============================================================
// Private fungible token foundation for the lending protocol
// ============================================================

program private_token.aleo {

    // ----------------------------------------------------------------
    // RECORDS
    // ----------------------------------------------------------------

    record Token {
        owner:    address,
        token_id: field,
        amount:   u128,
    }

    // ----------------------------------------------------------------
    // MAPPINGS
    // ----------------------------------------------------------------

    mapping total_supply: field => u128;
    mapping token_admin:  field => address;

    // ----------------------------------------------------------------
    // TRANSITIONS
    // ----------------------------------------------------------------

    /// Initialize a new token type. Called once by the deployer.
    async transition initialize(
        token_id:       field,
        initial_supply: u128,
        receiver:       address
    ) -> (Token, Future) {
        let t: Token = Token {
            owner:    receiver,
            token_id: token_id,
            amount:   initial_supply,
        };
        return (t,finalize(token_id, initial_supply, self.caller));
    }

    async function finalize(token_id: field, supply: u128, admin: address) {
        let existing: u128 = Mapping::get_or_use(total_supply, token_id, 0u128);
        assert_eq(existing, 0u128); // prevent re-initialization
        Mapping::set(total_supply, token_id, supply);
        Mapping::set(token_admin,  token_id, admin);
    }

     /// Mint tokens — only callable by the token admin.
    async transition mint(
        token_id: field,
        amount:   u128,
        receiver: address
    ) -> (  Token, Future) {
        let t: Token = Token {
            owner:    receiver,
            token_id: token_id,
            amount:   amount,
        };
        return (t, finalize_mint(token_id, amount, self.caller));
    }

    async function finalize_mint(token_id: field, amount: u128, caller: address) {
        let admin: address = Mapping::get(token_admin, token_id);
        assert_eq(admin, caller);
        let s: u128 = Mapping::get_or_use(total_supply, token_id, 0u128);
        Mapping::set(total_supply, token_id, s + amount);
    }

   
}