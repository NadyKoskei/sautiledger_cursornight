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
        card: '#FFFDF8',
        ink: '#1C1915',
        grove: {
          DEFAULT: '#1F6B45',
          dark: '#175134',
          light: '#E7F1EB',
        },
        clay: {
          DEFAULT: '#C45C26',
          light: '#FBEDE4',
        },
        dust: '#8A7A64',
        line: '#E6DCC9',
        danger: {
          DEFAULT: '#B3261E',
          light: '#FBE9E7',
        },
        warn: {
          DEFAULT: '#B26B00',
          light: '#FDF1DC',
        },
      },
      boxShadow: {
        mic: '0 18px 40px rgba(31, 107, 69, 0.32)',
        card: '0 1px 2px rgba(28, 25, 21, 0.04), 0 8px 24px rgba(28, 25, 21, 0.04)',
        nav: '0 -8px 24px rgba(28, 25, 21, 0.06)',
      },
      keyframes: {
        ripple: {
          '0%': { transform: 'scale(1)', opacity: '0.5' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        ripple: 'ripple 1.6s ease-out infinite',
        'fade-up': 'fade-up 0.25s ease-out both',
        'sheet-up': 'sheet-up 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
};
