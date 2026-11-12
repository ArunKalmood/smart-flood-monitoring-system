/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd",
          400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8",
          800: "#1e40af", 900: "#1e3a8a"
        },
        danger: {
          50: "#fef2f2", 100: "#fee2e2", 400: "#f87171",
          500: "#ef4444", 600: "#dc2626", 700: "#b91c1c"
        },
        warning: {
          50: "#fffbeb", 100: "#fef3c7", 400: "#fbbf24",
          500: "#f59e0b", 600: "#d97706", 700: "#b45309"
        },
        success: {
          50: "#f0fdf4", 100: "#dcfce7", 400: "#4ade80",
          500: "#22c55e", 600: "#16a34a", 700: "#15803d"
        },
        glass: {
          light: "rgba(255,255,255,0.15)",
          dark: "rgba(0,0,0,0.2)"
        },
        dt: {
          bg: "#07111F",
          bg2: "#0B1728",
          panel: "#102238",
          panelGlass: "rgba(16, 34, 56, 0.85)",
          border: "#1E3A5F",
          borderBright: "#2A4E7F",
          cyan: "#22D3EE",
          cyanGlow: "rgba(34, 211, 238, 0.2)",
          blue: "#3B82F6",
          blueGlow: "rgba(59, 130, 246, 0.25)",
          text: "#F8FAFC",
          muted: "#94A3B8",
          subtle: "#64748B",
          safe: "#10B981",
          warning: "#F59E0B",
          danger: "#EF4444",
        }
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      backdropBlur: { xs: "2px" },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "ping-slow": "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
      }
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
