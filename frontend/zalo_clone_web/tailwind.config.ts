/**
 * Tailwind CSS configuration
 */

import type { Config } from 'tailwindcss';

const config: Config = {
      content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
      theme: {
            extend: {
                  colors: {
                        primary: '#1976d2',
                        secondary: '#dc004e',
                  },
                  spacing: {
                        safe: 'max(env(safe-area-inset-bottom), 1rem)',
                  },
            },
      },
      plugins: [],
      // Thêm cmp class prefix để tránh conflict với Ant Design
      corePlugins: {
            preflight: true,
      },
};

export default config;
