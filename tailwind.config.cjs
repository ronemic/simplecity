module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // The page is almost entirely neutral. Only two colors carry meaning:
        //   brand  the SimpleCity blue — links, buttons, institutional marks
        //   open   ochre — a comment window is still open to you
        // Ochre is the brand blue's complement and appears nowhere else, so the
        // one thing that catches the eye is "you can still act".
        ink: "#17202b",
        slate: "#4a5563",
        quiet: "#5c6675",
        rule: "#ccd4de",
        "rule-strong": "#a3aebd",
        paper: "#e8ecf2",
        surface: "#f9fafc",
        brand: "#2457a6",
        "brand-deep": "#1b4381",
        "brand-tint": "#dee8f6",
        open: "#845010",
        "open-tint": "#f7efdf",
        affirm: "#276749",
        deny: "#8c2f21",
        band: "#e0e7f0",
        // Retained so pages not yet migrated keep resolving.
        civic: "#2457a6",
        newsprint: "#f9fafc",
        harbor: "#2457a6",
        moss: "#597d35",
        clay: "#b75f44",
        sun: "#8a5312"
      },
      boxShadow: {
        soft: "0 1px 2px rgba(23, 32, 43, 0.05)"
      },
      borderRadius: {
        DEFAULT: "3px",
        sm: "2px",
        md: "3px",
        lg: "4px",
        xl: "6px"
      },
      fontFamily: {
        sans: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        prose: ["var(--font-prose)", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      },
      fontWeight: {
        // The old design set almost everything to 900. Hierarchy now comes from
        // size and color, so the top of the scale is a restrained 600.
        medium: "500",
        semibold: "600",
        bold: "600",
        black: "600"
      },
      letterSpacing: {
        tightest: "-0.03em",
        tighter: "-0.022em",
        tight: "-0.014em"
      }
    }
  },
  plugins: []
};
