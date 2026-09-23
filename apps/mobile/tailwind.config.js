// Tailwind 3.4: la app NUNCA importa el config del panel (Tailwind 4), solo los
// tokens de `@rutas/shared/tokens` como valores planos.
const { colores, radio } = require('@rutas/shared/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  // `componentes`, en espanol: con el glob en ingles no se generaba ninguna
  // clase usada solo dentro de un componente.
  content: ['./src/app/**/*.{js,jsx,ts,tsx}', './src/componentes/**/*.{js,jsx,ts,tsx}'],
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
        // `warning` pinta "En curso" e `info` los avisos de solo lectura: son
        // los mismos dos tokens del semaforo del panel, no colores nuevos.
        warning: colores.warning,
        info: colores.info,
      },
      borderRadius: {
        app: `${radio.app}px`,
        avatar: `${radio.avatar}px`,
      },
    },
  },
  plugins: [],
};
