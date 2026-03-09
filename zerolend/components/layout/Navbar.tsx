'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Zap, ChevronDown, ExternalLink } from 'lucide-react';
import { useStore } from '../../lib/store';
import { connectWallet, formatAddress } from '../../lib/aleo';
import toast from 'react-hot-toast';

export default function Navbar() {
  const pathname = usePathname();
  const { wallet, setWallet, disconnectWallet, sidebarOpen, setSidebarOpen } = useStore();
  const [connecting, setConnecting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      const address = await connectWallet();
      if (address) {
        setWallet({ connected: true, address });
        toast.success('Wallet connected!');
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <nav className="sticky top-0 z-40 glass border-b border-zero-border/50">
      <div className="flex items-center justify-between h-16 px-6">
        {/* Left: logo + mobile toggle */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden btn-ghost p-2 rounded-lg"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(0,212,255,0.3), rgba(0,255,204,0.15))',
                border: '1px solid rgba(0,212,255,0.4)',
              }}>
              <Zap size={16} className="text-zero-cyan" />
            </div>
            <span
              className="font-display font-bold text-lg gradient-text hidden sm:block"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              ZeroLend
            </span>
          </Link>
        </div>

        {/* Center: network badge */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{
            background: 'rgba(0,212,255,0.06)',
            border: '1px solid rgba(0,212,255,0.15)',
          }}>
          <div className="w-1.5 h-1.5 rounded-full bg-zero-teal animate-pulse-slow" />
          <span className="text-xs font-mono text-zero-text-dim">Aleo Testnet</span>
        </div>

        {/* Right: wallet */}
        <div className="flex items-center gap-3">
          {wallet.connected && wallet.address ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
                style={{
                  background: 'rgba(0,212,255,0.08)',
                  border: '1px solid rgba(0,212,255,0.2)',
                }}
              >
                <div className="w-2 h-2 rounded-full bg-zero-teal" />
                <span className="text-sm font-mono text-zero-cyan">
                  {formatAddress(wallet.address)}
                </span>
                <ChevronDown size={14} className="text-zero-text-dim" />
              </button>

              {dropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-56 rounded-xl overflow-hidden z-50"
                  style={{
                    background: '#0c1424',
                    border: '1px solid #1a2540',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                  }}
                >
                  <div className="p-3 border-b border-zero-border">
                    <p className="text-xs text-zero-text-dim mb-1">Connected as</p>
                    <p className="text-xs font-mono text-zero-text truncate">
                      {wallet.address}
                    </p>
                  </div>
                  <div className="p-2">
                    <a
                      href={`https://explorer.aleo.org/address/${wallet.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zero-text-dim hover:text-zero-text hover:bg-white/5 transition-all"
                    >
                      <ExternalLink size={14} />
                      View on Explorer
                    </a>
                    <button
                      onClick={() => { disconnectWallet(); setDropdownOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zero-red hover:bg-red-500/10 transition-all"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="btn-primary flex items-center gap-2"
            >
              {connecting ? (
                <><div className="zk-loader" style={{ width: 14, height: 14 }} />Connecting…</>
              ) : (
                'Connect Wallet'
              )}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
