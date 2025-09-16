/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  // Disable Tailwind's Preflight to prevent conflicts with MUI's CssBaseline
  corePlugins: {
    preflight: false,
  },
  plugins: [],
}
