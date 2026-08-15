/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        prism: {
          dark: "#FFFFFF",
          light: "#111111",
          navy: "#D9D8D4",
          indigo: "#F6F3EE",
          sage: "#BFAE98",
          amber: "#8A8A8A",
          red: "#4A4A4A",
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-space-grotesk)', 'Space Grotesk', 'JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
