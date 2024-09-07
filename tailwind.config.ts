import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}', // если используешь компоненты
    './src/pages/**/*.{js,ts,jsx,tsx}', // если используешь pages
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;

