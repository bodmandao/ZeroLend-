// The 'test_lending_pool_usad' test program.
import lending_pool_usad.aleo;
program test_lending_pool_usad.aleo {
    @test
    @should_fail
    fn test_main_fails() {
        let result: u32 = lending_pool_usad.aleo::main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    constructor() {}
}
