/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'brian-blue': '#007AFF',
        'success-green': '#34C759',
        'warning-orange': '#FF9500',
        'error-red': '#FF3B30',
        'apple-gray': {
          50: '#F5F5F7', 100: '#E5E5EA', 200: '#D1D1D6', 300: '#C7C7CC',
          400: '#8E8E93', 500: '#636366', 600: '#48484A', 700: '#3A3A3C',
          800: '#2C2C2E', 900: '#1D1D1F', 950: '#1C1C1E'
        },
        'apple-dark': {
          bg: '#1C1C1E', elevated: '#2C2C2E', grouped: '#000000', separator: '#38383A'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif']
      },
      borderRadius: {
        xl: '28px', '2xl': '16px', '3xl': '20px'
      },
      boxShadow: {
        glass: '0 4px 20px rgba(0,0,0,0.05)',
        'glass-dark': '0 4px 20px rgba(0,0,0,0.3)',
        focus: '0 0 0 3px rgba(0,122,255,0.2)'
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-right': 'slide-right 0.35s cubic-bezier(0.32,0.72,0,1)',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'cursor-blink': 'cursor-blink 1s step-end infinite'
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-up': { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'slide-right': { '0%': { opacity: '0', transform: 'translateX(20px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        'pulse-soft': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        'cursor-blink': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } }
      }
    }
  },
  plugins: []
}
