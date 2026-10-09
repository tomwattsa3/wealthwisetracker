// Styles are built once at publish time (instead of the Tailwind script compiling them on every
// phone each time the app opens), so the app shows up much faster.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './index.tsx', './App.tsx', './constants.ts', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}', './services/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { numeric: ['Inter', 'sans-serif'] },
    },
  },
  plugins: [],
};
