/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      screens: {
        xs: '400px',
      },
      colors: {
        ink: {
          950: '#080B12',
          900: '#0B0F17',
          800: '#131A26',
          700: '#1B2434',
          600: '#26314480'
        },
        mint: {
          400: '#3CF0C5',
          500: '#16E0B0',
          600: '#0FB98F',
        },
        coral: {
          400: '#FF7A7A',
          500: '#FF5D5D',
          600: '#E24444',
        },
        gold: {
          400: '#F7CB3F',
          500: '#F2B705',
        },
        slate: {
          250: '#C7D0DD',
        }
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 20px 50px -20px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(60,240,197,0.15), 0 0 30px -5px rgba(60,240,197,0.25)',
      },
      backgroundImage: {
        'card-gradient': 'linear-gradient(135deg, #1B2434 0%, #0B0F17 60%, #16E0B022 100%)',
        'gold-gradient': 'linear-gradient(135deg, #3a2f12 0%, #0B0F17 55%, #F2B70530 100%)',
      },
      keyframes: {
        countup: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
      },
      animation: {
        countup: 'countup 0.4s ease-out',
        pulseSoft: 'pulseSoft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
