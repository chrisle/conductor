/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx,js,jsx}',
    './index.html',
    // Scan sibling extensions so their Tailwind classes (e.g. bg-jira-sunken)
    // get emitted into the host app's stylesheet. Extensions are loaded at
    // runtime, so their classes only appear in CSS if we scan them here.
    '../kanban-extension/src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        jira: {
          surface: '#22272b',
          raised: '#2c333a',
          sunken: '#161a1d',
          hovered: '#282e33',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      fontSize: {
        'ui-xs': 'var(--ui-text-xs)',
        'ui-sm': 'var(--ui-text-sm)',
        'ui-base': 'var(--ui-text-base)',
        'ui-lg': 'var(--ui-text-lg)',
        'ui-xl': 'var(--ui-text-xl)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace']
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
}
