/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Figtree"', 'system-ui', 'sans-serif'],
      },
      colors: {
        paper: '#F4EFE4',
        ink: '#1C1915',
        grove: '#1F6B45',
        clay: '#C45C26',
        dust: '#8A7A64',
      },
      boxShadow: {
        mic: '0 18px 40px rgba(31, 107, 69, 0.28)',
      },
    },
  },
  plugins: [],
};
