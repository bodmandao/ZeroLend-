// The 'test_vouching' test program.
import vouching.aleo;
program test_vouching.aleo {
    @test
    script test_it() {
        let result: u32 = vouching.aleo/main(1u32, 2u32);
        assert_eq(result, 3u32);
    }

    @test
    @should_fail
    transition do_nothing() {
        let result: u32 = vouching.aleo/main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    async constructor() {}
}
