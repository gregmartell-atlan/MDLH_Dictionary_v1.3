/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // DuckDB-inspired color palette
      colors: {
        // Primary yellow - the signature DuckDB color
        duck: {
          50: '#FFFEF0',
          100: '#FFFDE0',
          200: '#FFF9B0',
          300: '#FFF580',
          400: '#FFF000', // DuckDB bright yellow
          500: '#FFE500',
          600: '#E6CE00',
          700: '#B3A000',
          800: '#806F00',
          900: '#4D4200',
        },
        // Warm cream backgrounds
        cream: {
          50: '#FFFEFB',
          100: '#FFF9E6',  // Main background
          200: '#FFF3CC',
          300: '#FFEDB3',
          400: '#FFE799',
          500: '#FFE180',
        },
        // MotherDuck orange accent
        quack: {
          50: '#FFF5EB',
          100: '#FFE5CC',
          200: '#FFCC99',
          300: '#FFB366',
          400: '#FF9933',
          500: '#FF8000',  // MotherDuck orange
          600: '#E67300',
          700: '#B35900',
          800: '#804000',
          900: '#4D2600',
        },
        // Dark slate for editors
        slate: {
          850: '#141B27',
          950: '#0A0F17',
        },
      },
      fontFamily: {
        // Monospace for headings - DuckDB style
        mono: ['JetBrains Mono', 'Fira Code', 'SF Mono', 'Consolas', 'monospace'],
        // Clean sans for body
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      letterSpacing: {
        'widest-plus': '0.15em',
      },
      boxShadow: {
        'duck': '0 4px 14px 0 rgba(255, 240, 0, 0.15)',
        'duck-lg': '0 10px 25px -3px rgba(255, 240, 0, 0.2)',
        'card-warm': '0 4px 24px rgba(0,0,0,0.08), 0 1.5px 4px rgba(0,0,0,0.04)',
        'inner-glow': 'inset 0 0 20px rgba(255, 240, 0, 0.1)',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
      animation: {
        'quack': 'quack 0.3s ease-in-out',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        quack: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-5deg)' },
          '75%': { transform: 'rotate(5deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}
