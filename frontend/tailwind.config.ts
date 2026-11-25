import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        fb: {
          blue: "#DE4018",
          blueHover: "#C63713",
          primary: "#DE4018",
          primaryHover: "#C63713",
          canvas: "var(--bg-canvas)",
          card: "var(--bg-card)",
          hover: "var(--bg-hover)",
          input: "var(--bg-input)",
          border: "var(--border-color)",
          text: "var(--text-primary)",
          muted: "var(--text-secondary)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
