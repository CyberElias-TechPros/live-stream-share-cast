
import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '1.5rem',
			screens: {
				'2xl': '1280px'
			}
		},
		extend: {
			colors: {
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
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				stream: {
					DEFAULT: 'hsl(var(--stream))',
					light: 'hsl(var(--stream-light))',
					dark: 'hsl(var(--stream-dark))'
				},
				signal: 'hsl(var(--signal))',
				live: 'hsl(var(--live))'
			},
			fontFamily: {
				display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
				sans: ['Inter', 'system-ui', 'sans-serif'],
				mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 4px)',
				sm: 'calc(var(--radius) - 6px)',
				'2xl': '1.5rem',
				'3xl': '2rem'
			},
			boxShadow: {
				'glow': '0 0 40px -10px hsl(var(--glow-a))',
				'glow-lg': '0 0 90px -12px hsl(var(--glow-b))',
				'glow-live': '0 0 24px -4px rgba(255, 64, 84, 0.65)',
				'card': '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 60px -30px rgba(0,0,0,0.8)'
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				},
				aurora: {
					'0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
					'33%': { transform: 'translate3d(6%, -8%, 0) scale(1.15)' },
					'66%': { transform: 'translate3d(-7%, 6%, 0) scale(0.92)' }
				},
				'aurora-alt': {
					'0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
					'40%': { transform: 'translate3d(-8%, 7%, 0) scale(1.1)' },
					'75%': { transform: 'translate3d(5%, -5%, 0) scale(0.95)' }
				},
				marquee: {
					from: { transform: 'translateX(0)' },
					to: { transform: 'translateX(-50%)' }
				},
				'eq-1': {
					'0%, 100%': { transform: 'scaleY(0.35)' },
					'50%': { transform: 'scaleY(1)' }
				},
				'eq-2': {
					'0%, 100%': { transform: 'scaleY(1)' },
					'50%': { transform: 'scaleY(0.25)' }
				},
				'eq-3': {
					'0%, 100%': { transform: 'scaleY(0.55)' },
					'50%': { transform: 'scaleY(0.9)' }
				},
				float: {
					'0%, 100%': { transform: 'translateY(0)' },
					'50%': { transform: 'translateY(-10px)' }
				},
				'pulse-dot': {
					'0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(255,64,84,0.55)' },
					'50%': { opacity: '0.85', boxShadow: '0 0 0 5px rgba(255,64,84,0)' }
				},
				'sheen': {
					from: { transform: 'translateX(-120%) skewX(-18deg)' },
					to: { transform: 'translateX(240%) skewX(-18deg)' }
				},
				'orbit': {
					from: { transform: 'rotate(0deg)' },
					to: { transform: 'rotate(360deg)' }
				},
				'fade-in': {
					'0%': { opacity: '0' },
					'100%': { opacity: '1' }
				},
				'slide-in': {
					'0%': { transform: 'translateY(10px)', opacity: '0' },
					'100%': { transform: 'translateY(0)', opacity: '1' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				aurora: 'aurora 26s ease-in-out infinite',
				'aurora-alt': 'aurora-alt 32s ease-in-out infinite',
				marquee: 'marquee 36s linear infinite',
				'eq-1': 'eq-1 1.1s ease-in-out infinite',
				'eq-2': 'eq-2 0.9s ease-in-out infinite',
				'eq-3': 'eq-3 1.3s ease-in-out infinite',
				float: 'float 7s ease-in-out infinite',
				'float-slow': 'float 11s ease-in-out infinite',
				'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
				sheen: 'sheen 3.2s ease-in-out infinite',
				orbit: 'orbit 14s linear infinite',
				'fade-in': 'fade-in 0.3s ease-out',
				'slide-in': 'slide-in 0.4s ease-out'
			},
			transitionTimingFunction: {
				'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
