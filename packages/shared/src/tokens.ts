/**
 * Tokens del sistema de diseno como valores planos: el panel usa Tailwind 4 y la
 * app Tailwind 3.4, y lo unico que cruza esa frontera son numeros y cadenas.
 */

export const colores = {
  // Verde oliva Tregar: el mismo de la marca y el mismo que pinta la app del chofer.
  primary: '#547F37',
  primaryHover: '#456B2D',
  primaryFg: '#FFFFFF',
  primaryTint: '#EEF4E9',
  background: '#FFFFFF',
  /** Fondo del area de contenido y de las superficies hundidas (slate-50). */
  surface: '#F8FAFC',
  border: '#E2E8F0',
  fg: '#0A0E1A',
  fgMuted: '#64748B',
  destructive: '#DC2626',
  success: '#6DAB3C',
  warning: '#D97706',
  info: '#2563EB',
  /** La barra lateral es un bloque solido de marca, no una superficie clara. */
  sidebar: '#547F37',
  sidebarFg: '#F8FAFC',
  sidebarAccent: '#6DAB3C',
  sidebarAccentFg: '#FFFFFF',
} as const;

/** Escala de espaciado en px, base 4. Sin valores arbitrarios. */
export const espaciado = [4, 8, 12, 16, 24, 32, 48, 64] as const;

export const radio = {
  panel: 10,
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

/** Sombra de tarjeta. Unica elevacion del sistema; no hay una segunda. */
export const sombra = {
  tarjeta: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  menu: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
} as const;

/**
 * Los seis estados como pastilla solida, con `bg`/`fg` ya contrastados.
 * `incidente` es terminal y no habla de la hora: por eso el rojo mas oscuro.
 */
export type EstadoSemaforo =
  | 'pendiente'
  | 'en_curso'
  | 'a_tiempo'
  | 'tarde'
  | 'adelantado'
  | 'incidente';

export const semaforo: Record<
  EstadoSemaforo,
  { texto: string; icono: string; fg: string; bg: string }
> = {
  pendiente: { texto: 'Pendiente', icono: '○', fg: '#0A0E1A', bg: '#F1F5F9' },
  en_curso: { texto: 'En curso', icono: '■', fg: '#FFFFFF', bg: '#D97706' },
  a_tiempo: { texto: 'A tiempo', icono: '●', fg: '#FFFFFF', bg: '#6DAB3C' },
  tarde: { texto: 'Tarde', icono: '▲', fg: '#FFFFFF', bg: '#DC2626' },
  adelantado: { texto: 'Adelantado', icono: '▼', fg: '#FFFFFF', bg: '#2563EB' },
  incidente: { texto: 'Terminada por incidente', icono: '✕', fg: '#FFFFFF', bg: '#7F1D1D' },
};
