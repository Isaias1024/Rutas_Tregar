/**
 * Tokens del sistema de diseno (§7) como valores planos.
 *
 * Nunca un archivo de config de Tailwind compartido: el panel usa Tailwind 4 y la
 * app Tailwind 3.4, y lo unico que puede cruzar esa frontera son numeros y cadenas.
 */

export const colores = {
  primary: '#0E7A3C',
  primaryHover: '#0A5E2E',
  primaryFg: '#FFFFFF',
  primaryTint: '#E8F5ED',
  background: '#FFFFFF',
  surface: '#F8FAF9',
  border: '#E2E8E5',
  fg: '#111827',
  fgMuted: '#6B7280',
  destructive: '#B91C1C',
  success: '#047857',
} as const;

/** Escala de espaciado en px, base 4. Sin valores arbitrarios. */
export const espaciado = [4, 8, 12, 16, 24, 32, 48, 64] as const;

export const radio = {
  panel: 6,
  app: 12,
  avatar: 9999,
} as const;

export const tipografia = {
  display: { familia: 'Inter', tamano: 32, interlineado: 40, peso: 600, tracking: -0.02 },
  titulo: { familia: 'Inter', tamano: 24, interlineado: 32, peso: 600, tracking: -0.01 },
  tituloChico: { familia: 'Inter', tamano: 20, interlineado: 28, peso: 600, tracking: -0.01 },
  cuerpo: { familia: 'Inter', tamano: 16, interlineado: 24, peso: 400, tracking: 0 },
  cuerpoDenso: { familia: 'Inter', tamano: 14, interlineado: 20, peso: 400, tracking: 0 },
  leyenda: { familia: 'Inter', tamano: 12, interlineado: 16, peso: 500, tracking: 0.01 },
  botonApp: { familia: 'Inter', tamano: 20, interlineado: 28, peso: 600, tracking: 0 },
} as const;

export const movimiento = {
  hoverFoco: { duracionMs: 120, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  panelODialogo: { duracionMs: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  confirmacionPaso: { duracionMs: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
} as const;

/** Los cinco estados del semaforo. El estado nunca depende solo del color. */
export type EstadoSemaforo = 'pendiente' | 'en_curso' | 'a_tiempo' | 'tarde' | 'adelantado';

export const semaforo: Record<
  EstadoSemaforo,
  { texto: string; icono: string; fg: string; bg: string }
> = {
  pendiente: { texto: 'Pendiente', icono: '○', fg: '#6B7280', bg: '#F3F4F6' },
  en_curso: { texto: 'En curso', icono: '■', fg: '#B45309', bg: '#FEF3C7' },
  a_tiempo: { texto: 'A tiempo', icono: '●', fg: '#047857', bg: '#D1FAE5' },
  tarde: { texto: 'Tarde', icono: '▲', fg: '#B91C1C', bg: '#FEE2E2' },
  adelantado: { texto: 'Adelantado', icono: '▼', fg: '#1D4ED8', bg: '#DBEAFE' },
};
