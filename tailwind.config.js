/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 2px 8px rgba(28, 29, 25, 0.025)',
        lift: '0 16px 40px rgba(28, 29, 25, 0.09)',
        emerald: '0 4px 12px rgba(28, 29, 25, 0.06)'
      },
      colors: {
        slate: {
          50: '#faf8f7', 100: '#f2efed', 200: '#e4dfdc', 300: '#cec8c3',
          400: '#9a938e', 500: '#706964', 600: '#59514c', 700: '#443d38',
          800: '#302c29', 900: '#23201e', 950: '#1a1715'
        },
        // Legacy emerald utility names now carry the municipal orange brand.
        emerald: {
          50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74',
          400: '#fb923c', 500: '#f97316', 600: '#c2410c', 700: '#9a3412',
          800: '#7c2d12', 900: '#7c2d12', 950: '#431407'
        },
        brand: {
          50: '#fff7ed', 100: '#ffedd5', 500: '#f97316',
          600: '#c2410c', 700: '#9a3412', 900: '#7c2d12'
        },
        accent: {
          500: '#f59e0b'
        }
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' }
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97) translateY(8px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' }
        }
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.25s ease-out both',
        'scale-in': 'scale-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s linear infinite'
      }
    }
  },
  plugins: []
};
