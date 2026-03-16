/** @type {import('tailwindcss').Config} */
module.exports = {
      content: [
            './app/**/*.{js,jsx,ts,tsx}',
            './components/**/*.{js,jsx,ts,tsx}',
            './features/**/*.{js,jsx,ts,tsx}',
            './lib/**/*.{js,jsx,ts,tsx}',
            './providers/**/*.{js,jsx,ts,tsx}',
            './hooks/**/*.{js,jsx,ts,tsx}',
      ],
      presets: [require('nativewind/preset')],
      theme: {
            extend: {
                  colors: {
                        background: 'rgb(var(--color-background) / <alpha-value>)',
                        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
                        primary: {
                              DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
                              foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)',
                        },
                        secondary: {
                              DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
                              foreground: 'rgb(var(--color-secondary-foreground) / <alpha-value>)',
                        },
                        muted: 'rgb(var(--color-muted) / <alpha-value>)',
                        border: 'rgb(var(--color-border) / <alpha-value>)',
                        danger: 'rgb(var(--color-danger) / <alpha-value>)',
                        success: 'rgb(var(--color-success) / <alpha-value>)',
                  },
            },
      },
      plugins: [],
};
