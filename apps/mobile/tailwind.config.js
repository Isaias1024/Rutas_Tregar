// Tailwind 3.4, la app NUNCA importa el config del panel (Tailwind 4). Lo
// unico que cruza esa frontera son los tokens de `@rutas/shared/tokens`
// como valores planos (numeros y cadenas), no un archivo de config.
const { colores, radio } = require('@rutas/shared/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/app/**/*.{js,jsx,ts,tsx}', './src/components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: colores.primary,
        'primary-hover': colores.primaryHover,
        'primary-fg': colores.primaryFg,
        'primary-tint': colores.primaryTint,
        background: colores.background,
        surface: colores.surface,
        border: colores.border,
        foreground: colores.fg,
        'foreground-muted': colores.fgMuted,
        destructive: colores.destructive,
        success: colores.success,
      },
      borderRadius: {
        app: `${radio.app}px`,
        avatar: `${radio.avatar}px`,
      },
    },
  },
  plugins: [],
};
