import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import Navbar from '../components/layout/Navbar';
import Sidebar from '../components/layout/Sidebar';
import Background from '../components/layout/Background';
import { AleoWalletProvider } from "@provablehq/aleo-wallet-adaptor-react";
import { WalletModalProvider } from "@provablehq/aleo-wallet-adaptor-react-ui";
import { LeoWalletAdapter } from "@provablehq/aleo-wallet-adaptor-leo";
import "@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css";
import { ShieldWalletAdapter } from "@provablehq/aleo-wallet-adaptor-shield";
import { Network } from '@provablehq/aleo-types';
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core';
import { useMemo } from "react";


export const metadata: Metadata = {
  title: 'ZeroLend — Private Credit on Aleo',
  description:
    'Undercollateralized private lending powered by zero-knowledge proofs on Aleo.',
  openGraph: {
    title: 'ZeroLend',
    description: 'Private credit. Proven trustlessly.',
    images: ['/og.png'],
  },
};

const wallets = useMemo(() => {
  return [new LeoWalletAdapter(), new ShieldWalletAdapter()];
}, []);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="scanlines">
        <Background />
        <div className="relative z-10 flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Navbar />
            <main className="flex-1 overflow-auto">
              <AleoWalletProvider
                wallets={wallets}
                network={Network.TESTNET}
                autoConnect={true}
                decryptPermission={DecryptPermission.UponRequest}
                programs={['programName']}
                onError={(error) => console.error(error)}
              >
                <WalletModalProvider>
                  <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900">
                    {children}
                  </div>
                </WalletModalProvider>
              </AleoWalletProvider>

            </main>
          </div>
        </div>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#0c1424',
              border: '1px solid #1a2540',
              color: '#c8d6f0',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#00d4ff', secondary: '#04060f' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#04060f' },
            },
          }}
        />
      </body>
    </html>
  );
}
