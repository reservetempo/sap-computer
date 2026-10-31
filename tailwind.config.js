/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Helvetica first, as on the original site.
        sans: ["Helvetica", "Arial", "sans-serif"],
        // The visualizer's fonts (theme.js font, via cssVars).
        "sap-label": "var(--sap-font-label)",
        "sap-body": "var(--sap-font-body)",
        "sap-mono": "var(--sap-font-mono)",
      },
    },
  },
  plugins: [],
};
