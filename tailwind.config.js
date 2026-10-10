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
          50: '#fafaf7', 100: '#f2f2ed', 200: '#e3e4dc', 300: '#cccec3',
          400: '#969a8e', 500: '#6b7064', 600: '#53594c', 700: '#3e4438',
          800: '#2c3029', 900: '#20231e', 950: '#171a15'
        },
        emerald: {
          50: '#f7fae9', 100: '#edf4c8', 200: '#e1ee9a', 300: '#d6ec70',
          400: '#d5ed48', 500: '#a7bf2b', 600: '#72841c', 700: '#566619',
          800: '#424f19', 900: '#333e18', 950: '#20280e'
        },
        brand: {
          50: '#effdf7',
          100: '#d8fbe9',
          500: '#16a34a',
          600: '#059669',
          700: '#166534',
          900: '#064e3b'
        },
        accent: {
          500: '#f59e0b'
        }
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
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
