/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        primary: '#2c2c2c',
        secondary: '#8b7355',
        accent: '#d4af37',
        'text-dark': '#333',
        'text-light': '#666',
        'bg-light': '#f8f8f8',
        'console-paper': '#f5f4f0',
        'console-card': '#fffefb',
        'console-sunk': '#ebe8e1',
        'console-ink': '#2c2c2c',
        'console-ink-soft': '#6b6862',
        'console-ink-faint': '#97928a',
        'console-rule': '#8b7355',
        'console-ok': '#45704f',
        'console-ok-bg': '#e6efe8',
        'console-warn': '#96591b',
        'console-warn-bg': '#f5eadd',
        'console-crit': '#9c372b',
        'console-crit-bg': '#f6e5e2',
        'console-info': '#3c5f7d',
        'console-info-bg': '#e4ecf2',
        'console-mute-bg': '#eceae5',
      },
      fontFamily: {
        sans: ['Helvetica Neue', 'Arial', 'sans-serif'],
        console: ['Sarabun', 'Noto Sans Thai', 'sans-serif'],
        figure: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        widest: '0.2em',
      },
      container: {
        center: true,
        padding: '1.25rem',
        screens: {
          sm: '640px',
          md: '768px',
          lg: '1024px',
          xl: '1200px',
        },
      },
    },
  },
  plugins: [],
}
