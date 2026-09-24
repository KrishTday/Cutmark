import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#101116",
        surface: "#18191F",
        "surface-raised": "#202127",
        line: "#30313A",
        "line-strong": "#454650",
        ink: "#F3F2F7",
        "ink-muted": "#B0AFBA",
        "ink-faint": "#7F808B",
        accent: "#B8A5FF",
        "accent-strong": "#9D85F0",
        marker: "#F0A58F",
        well: "#15161B",
        "well-hover": "#272830",
        "trim-selection": "#332D46",
        "accent-soft": "#262231",
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
