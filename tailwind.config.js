/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Earth/gold-Palette aus v2 als Startpunkt — wird verfeinert
        // sobald Design-Sprache in M3/M4 sitzt.
        primary: '#C9A962',
        success: '#6EC49E',
        danger: '#D4706E',
        warning: '#ECB761',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
