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
          dark: "#0F172A",
          card: "#1E1B4B",
          light: "#F8FAFC",
          navy: "#312E81",
          indigo: "#6366F1",
          sage: "#10B981",
          amber: "#D97706",
          red: "#DC2626",
        }
      },
      fontFamily: {
        sans: ['var(--font-humanist)', 'Open Sans', 'Fira Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geometric)', 'Space Grotesk', 'Inter', 'monospace'],
      }
    },
  },
  plugins: [],
}
