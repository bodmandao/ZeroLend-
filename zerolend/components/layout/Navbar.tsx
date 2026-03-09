'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, Zap, ExternalLink, ChevronDown } from 'lucide-react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { useStore } from '../../lib/store';

export default function Navbar() {
  const { sidebarOpen, setSidebarOpen, setWallet, disconnectWallet } = useStore();
  const { address, connected, disconnect } = useWallet();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const shortAddress = address
    ? `${address.slice(0, 10)}...${address.slice(-6)}`
    : '';

  function handleDisconnect() {
    disconnect();
    disconnectWallet();
    setDropdownOpen(false);
  }

  return (
    <>
    
      <nav className="sticky top-0 z-40 glass border-b border-zero-border/50">
        <div className="flex items-center justify-between h-16 px-6">

          {/* Left: mobile toggle + logo */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden btn-ghost p-2 rounded-lg"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <Link href="/" className="flex items-center gap-2 group">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,212,255,0.3), rgba(0,255,204,0.15))',
                  border: '1px solid rgba(0,212,255,0.4)',
                }}
              >
                <Zap size={16} className="text-zero-cyan" />
              </div>
              <span
                className="font-bold text-lg gradient-text hidden sm:block"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                ZeroLend
              </span>
            </Link>
          </div>

          {/* Center: network pill */}
          <div
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              background: 'rgba(0,212,255,0.06)',
              border: '1px solid rgba(0,212,255,0.15)',
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-zero-teal animate-pulse-slow" />
            <span className="text-xs font-mono text-zero-text-dim">Aleo Testnet</span>
          </div>

          {/* Right: wallet */}
          <div className="flex items-center gap-3">
            {connected && address ? (
              /* Connected state — custom minimal button with dropdown */
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
                  <span className="text-sm font-mono text-zero-cyan">{shortAddress}</span>
                  <ChevronDown
                    size={14}
                    className="text-zero-text-dim transition-transform"
                    style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none' }}
                  />
                </button>

                {dropdownOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-60 rounded-xl overflow-hidden z-50"
                    style={{
                      background: '#0c1424',
                      border: '1px solid #1a2540',
                      boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                    }}
                  >
                    {/* Address display */}
                    <div className="p-3 border-b border-zero-border">
                      <p className="text-xs text-zero-text-dim mb-1">Connected as</p>
                      <p className="text-xs font-mono text-zero-text break-all leading-relaxed">
                        {address}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="p-2 space-y-0.5">
                      <a
                        href={`https://explorer.aleo.org/address/${address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zero-text-dim hover:text-zero-text hover:bg-white/5 transition-all"
                      >
                        <ExternalLink size={13} />
                        View on Explorer
                      </a>
                      <button
                        onClick={handleDisconnect}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                        style={{ color: '#ef4444' }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = 'transparent')
                        }
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Not connected — use WalletMultiButton */
              <WalletMultiButton />
            )}
          </div>

        </div>
      </nav>

      {/* Close dropdown on outside click */}
      {dropdownOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setDropdownOpen(false)}
        />
      )}
    </>
  );
}