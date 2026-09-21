/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Deep navy — matches the Brightern Plus poster's background/logo navy
        brand: {
          50:  '#eef2f9',
          100: '#d7e0ef',
          200: '#b0c1e0',
          300: '#84a0cf',
          400: '#5c7fba',
          500: '#3d5f9e',
          600: '#2b4780',
          700: '#213765',
          800: '#182a4d',
          900: '#0f1c34',
          950: '#0a1424',
        },
        // Warm gold — matches the poster's gold borders, badges and lettering
        gold: {
          50:  '#fdf8ec',
          100: '#fbefd1',
          200: '#fbe7b8',
          300: '#f6d585',
          400: '#eebd50',
          500: '#dda531',
          600: '#bd8323',
          700: '#96631c',
          800: '#794f1a',
          900: '#634019',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
