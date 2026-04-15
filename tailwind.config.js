export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        card: '0 30px 80px rgba(7, 15, 29, 0.25)',
        glow: '0 20px 50px rgba(56, 189, 248, 0.18)',
      },
      backdropBlur: {
        xs: '2px',
      },
      backgroundImage: {
        'hero-gradient': 'radial-gradient(circle at top left, rgba(56, 189, 248, 0.25), transparent 24%), radial-gradient(circle at bottom right, rgba(168, 85, 247, 0.18), transparent 22%)',
      },
    },
  },
  plugins: [],
}
