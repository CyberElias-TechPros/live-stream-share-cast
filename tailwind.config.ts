import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        bg: "hsl(var(--bg))",
        "bg-raised": "hsl(var(--bg-raised))",
        panel: "hsl(var(--panel))",
        "panel-2": "hsl(var(--panel-2))",
        line: "hsl(var(--line))",
        "line-strong": "hsl(var(--line-strong))",
        text: "hsl(var(--text))",
        "text-muted": "hsl(var(--text-muted))",
        "text-faint": "hsl(var(--text-faint))",
        live: {
          DEFAULT: "hsl(var(--live))",
          hot: "hsl(var(--live-hot))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          deep: "hsl(var(--accent-deep))",
        },
        ok: "hsl(var(--ok))",
        warn: "hsl(var(--warn))",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 6px)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.22, 1, 0.36, 1)",
        "spring": "cubic-bezier(0.34, 1.4, 0.44, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "none" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out both",
        "slide-up": "slide-up 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "scale-in": "scale-in 0.3s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
