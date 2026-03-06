// The 'test_credit_score' test program.
import credit_score.aleo;
program test_credit_score.aleo {
    @test
    script test_it() {
        let result: u32 = credit_score.aleo/main(1u32, 2u32);
        assert_eq(result, 3u32);
    }

    @test
    @should_fail
    transition do_nothing() {
        let result: u32 = credit_score.aleo/main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    async constructor() {}
}
