/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 12px 30px rgba(15, 23, 42, 0.08)'
      },
      colors: {
        brand: {
          50: '#effdf7',
          100: '#d8fbe9',
          500: '#16a34a',
          700: '#166534'
        },
        accent: {
          500: '#f59e0b'
        }
      }
    }
  },
  plugins: []
};
