import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      colors: {
        zero: {
          bg: "#04060f",
          surface: "#080d1a",
          card: "#0c1424",
          border: "#1a2540",
          cyan: "#00d4ff",
          "cyan-dim": "#0099bb",
          teal: "#00ffcc",
          violet: "#7c3aed",
          "violet-bright": "#a855f7",
          gold: "#f59e0b",
          red: "#ef4444",
          green: "#10b981",
          muted: "#4a5878",
          text: "#c8d6f0",
          "text-dim": "#6b7fa3",
        },
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)",
        "glow-cyan":
          "radial-gradient(ellipse at center, rgba(0,212,255,0.15) 0%, transparent 70%)",
        "glow-violet":
          "radial-gradient(ellipse at center, rgba(124,58,237,0.15) 0%, transparent 70%)",
        "hero-gradient":
          "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,212,255,0.12) 0%, transparent 60%)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      boxShadow: {
        glass:
          "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        "glass-hover":
          "0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
        cyan: "0 0 20px rgba(0,212,255,0.25), 0 0 60px rgba(0,212,255,0.1)",
        violet: "0 0 20px rgba(124,58,237,0.3), 0 0 60px rgba(124,58,237,0.1)",
        teal: "0 0 20px rgba(0,255,204,0.2)",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4,0,0.6,1) infinite",
        "float": "float 6s ease-in-out infinite",
        "scan": "scan 3s linear infinite",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        glowPulse: {
          "0%,100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};
export default config;
