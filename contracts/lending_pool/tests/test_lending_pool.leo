// The 'test_lending_pool' test program.
import lending_pool.aleo;
program test_lending_pool.aleo {
    @test
    script test_it() {
        let result: u32 = lending_pool.aleo/main(1u32, 2u32);
        assert_eq(result, 3u32);
    }

    @test
    @should_fail
    transition do_nothing() {
        let result: u32 = lending_pool.aleo/main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    async constructor() {}
}
