import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import Navbar from "../components/layout/Navbar";
import Sidebar from "../components/layout/Sidebar";
import Background from "../components/layout/Background";
import WalletProvider from "../components/providers/WalletProvider";
import "@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css";

export const metadata: Metadata = {
  title: "ZeroLend — Private Credit on Aleo",
  description:
    "Undercollateralized private lending powered by zero-knowledge proofs on Aleo.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="scanlines">
        <Background />

        <WalletProvider>
          <div className="relative z-10 flex min-h-screen">
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0">
              <Navbar />

              <main className="flex-1 overflow-auto">
                <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </WalletProvider>

        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}