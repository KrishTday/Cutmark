import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAFAF8",
        surface: "#FFFFFF",
        line: "#D9D8D2",
        "line-strong": "#B8B7AF",
        ink: "#1A1A18",
        "ink-muted": "#6B6B64",
        accent: "#2A4B8D",
        "accent-strong": "#1C3364",
        marker: "#D98A2B",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        none: "0px",
      },
    },
  },
  plugins: [],
};

export default config;
