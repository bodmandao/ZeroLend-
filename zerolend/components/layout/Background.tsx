'use client';

export default function Background() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      {/* Base */}
      <div className="absolute inset-0 bg-[#04060f]" />

      {/* Grid */}
      <div className="absolute inset-0 bg-grid opacity-100" />

      {/* Hero glow top */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] opacity-30"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,212,255,0.18) 0%, transparent 70%)',
        }}
      />

      {/* Violet glow bottom-right */}
      <div
        className="absolute bottom-0 right-0 w-[600px] h-[600px] opacity-20"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(124,58,237,0.3) 0%, transparent 70%)',
        }}
      />

      {/* Teal glow bottom-left */}
      <div
        className="absolute bottom-1/4 left-0 w-[400px] h-[400px] opacity-10"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,255,204,0.25) 0%, transparent 70%)',
        }}
      />

      {/* Noise texture */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '256px 256px',
        }}
      />
    </div>
  );
}
