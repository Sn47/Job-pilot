const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: token('paper'), surface: token('surface'), ink: token('ink'), muted: token('muted'),
        rule: token('rule'), go: token('go'), 'on-go': token('on-go'), stop: token('stop'), warm: token('warm'),
      },
      fontFamily: { sans: ['var(--font-ui)', 'system-ui', 'sans-serif'], serif: ['var(--font-serif)', 'Georgia', 'serif'] },
      borderRadius: { control: '6px', sheet: '10px' },
    },
  },
  plugins: [],
};
