const t = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}', './lib/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: t('ground'), panel: t('panel'), 'panel-2': t('panel-2'), text: t('text'), muted: t('muted'),
        rule: t('rule'), 'rule-2': t('rule-2'), gold: t('gold'), 'gold-dim': t('gold-dim'),
        good: t('good'), warn: t('warn'), stop: t('stop'), 'on-accent': t('on-accent'),
      },
      fontFamily: { sans: ['var(--font-ui)'], doc: ['var(--font-doc)'] },
    },
  },
  plugins: [],
};
