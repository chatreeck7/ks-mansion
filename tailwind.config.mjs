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
        // ── Console: the "สมุดประจำเดือน" logbook identity ──────────────
        // Paper, a ruled ledger and one ink, with a red margin for problems
        // and a highlighter for "you are here". See docs/console-design-system.md.
        'console-paper': '#FBF6E9', // the page
        'console-spine': '#F3EDDD', // the notebook spine: sidebar, quiet panels
        'console-card': '#FFFFFF', // a card laid on the page
        'console-sunk': '#E6DFCC', // inactive tabs, tracks, hover wash
        'console-ink': '#1E2D4A',
        'console-ink-soft': '#4E5566',
        'console-ink-faint': '#6B6F78',
        'console-rule': '#A9BCD0', // ledger lines between rows
        'console-line': '#DCD2BB', // card and chrome borders
        'console-line-strong': '#CFC6B3',
        'console-print': '#8C8073', // rules on paper documents (bill, receipt, sheet)
        'console-margin': '#E7B9B2', // the red margin line down the page
        'console-highlight': '#F2DE7C', // the highlighter: current step / row
        'console-ok': '#2D6A4F',
        'console-ok-bg': '#E3EFE6',
        'console-warn': '#8A5A12',
        'console-warn-bg': '#F7EBCB',
        'console-crit': '#B0443A', // the margin pen: problems and missing data
        'console-crit-bg': '#FFF7F4',
        'console-info': '#3C5F7D',
        'console-info-bg': '#E4ECF2',
        'console-mute-bg': '#EFE9DA',
      },
      fontFamily: {
        sans: ['"Google Sans"', 'Helvetica Neue', 'Arial', 'sans-serif'],
        console: ['Sarabun', 'Noto Sans Thai', 'sans-serif'],
        // Page titles, room numbers, digits and ticks only — never body text.
        hand: ['Mali', 'Sarabun', 'cursive'],
        figure: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      screens: {
        // The console's one layout switch: spine sidebar at and above, bottom
        // tab bar below. Chosen by the design, not by a device class.
        desk: '900px',
      },
      backgroundImage: {
        // The red margin line ruled down the left of every console page.
        'console-ruled':
          'linear-gradient(90deg, transparent 30px, #E7B9B2 30px 31.5px, transparent 31.5px)',
        // Hatching for rooms under repair: present, but not in play.
        'console-hatch':
          'repeating-linear-gradient(45deg, #E2DACA 0 4px, #F3EDDD 4px 8px)',
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
