module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        paper: "#f4f6f8",
        newsprint: "#fbfcfd",
        civic: "#2457a6",
        harbor: "#1d766f",
        moss: "#597d35",
        clay: "#b75f44",
        sun: "#c99d34"
      },
      boxShadow: {
        soft: "0 10px 28px rgba(23, 23, 23, 0.08)"
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ],
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "monospace"]
      }
    }
  },
  plugins: []
};
