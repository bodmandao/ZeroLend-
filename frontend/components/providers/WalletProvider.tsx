"use client";

import { useMemo } from "react";
import { AleoWalletProvider } from "@provablehq/aleo-wallet-adaptor-react";
import { WalletModalProvider } from "@provablehq/aleo-wallet-adaptor-react-ui";
import { LeoWalletAdapter } from "@provablehq/aleo-wallet-adaptor-leo";
import { ShieldWalletAdapter } from "@provablehq/aleo-wallet-adaptor-shield";
import { Network } from "@provablehq/aleo-types";
import { DecryptPermission } from "@provablehq/aleo-wallet-adaptor-core";

export default function WalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const wallets = useMemo(() => {
    return [new LeoWalletAdapter(), new ShieldWalletAdapter()];
  }, []);

  return (
    <AleoWalletProvider
      wallets={wallets}
      network={Network.TESTNET}
      autoConnect
      decryptPermission={DecryptPermission.UponRequest}
      programs={["zerolend_lending_pool_v5.aleo","credits.aleo","zerolend_vouching_v2.aleo",
      "test_usdcx_stablecoin.aleo","test_usad_stablecoin.aleo",
      "zerolend_governance_v2.aleo","zerolend_oracle_v2.aleo","test_usdcx_stablecoin.aleo"]} 
      onError={(error) => console.error(error)}
    >
      <WalletModalProvider>{children}</WalletModalProvider>
    </AleoWalletProvider>
  );
}