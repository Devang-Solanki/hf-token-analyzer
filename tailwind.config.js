/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        rule: "var(--line)",
        "rule-strong": "var(--line-strong)",
        accent: {
          DEFAULT: "var(--accent)",
          ink: "var(--accent-ink)",
          text: "var(--accent-text)",
          foreground: "var(--accent-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--bg-press)",
          foreground: "var(--muted-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        sev: {
          contained: "var(--sev-contained)",
          elevated: "var(--sev-elevated)",
          breach: "var(--sev-breach)",
          total: "var(--sev-total)",
        },
      },
      /* Brutalist: no rounding anywhere. */
      borderRadius: { none: "0", sm: "0", DEFAULT: "0", md: "0", lg: "0", xl: "0", full: "0" },
      fontFamily: {
        sans: ["var(--font-display)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      boxShadow: { none: "none" },
    },
  },
  plugins: [],
}
