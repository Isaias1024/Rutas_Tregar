import { colores } from '@rutas/shared/tokens';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Los iconos del sistema, dibujados a mano sobre `react-native-svg` (que ya es
 * dependencia directa de esta app).
 *
 * No se usa `@expo/vector-icons`: existe en el monorepo solo por hoisting a la
 * raiz, y este proyecto ya se quemo una vez con un paquete de Expo resuelto
 * desde la raiz en vez de desde `apps/mobile` (el incidente de
 * `babel-preset-expo`, § movil-expo.md). Catorce paths propios no valen
 * repetir esa clase de fallo.
 *
 * Todos son trazo de 24x24 sobre `currentColor`, para que hereden tamano y
 * color del sitio donde se usen.
 */
export type NombreIcono =
  | 'hoy'
  | 'semana'
  | 'historial'
  | 'perfil'
  | 'check'
  | 'reloj'
  | 'origen'
  | 'destino'
  | 'chevron'
  | 'alerta'
  | 'sin-conexion'
  | 'camion'
  | 'telefono'
  | 'salir';

const PATHS: Record<NombreIcono, string> = {
  hoy: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  semana:
    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01',
  historial: 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2',
  perfil: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  check: 'M20 6L9 17l-5-5',
  reloj: 'M12 6v6l4 2',
  origen: 'M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11z',
  destino: 'M4 22V4a1 1 0 0 1 1-1h13l-3 5 3 5H5',
  chevron: 'M9 18l6-6-6-6',
  alerta:
    'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  'sin-conexion':
    'M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 3-2M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8a15 15 0 0 0-6.8-3.4M19 12.9a10 10 0 0 0-2-1.5M12 20h.01',
  camion:
    'M10 17h4V5H2v12h3M20 17h2v-4l-3-4h-5v8h2M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM15 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
  telefono:
    'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  salir: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};

interface Props {
  nombre: NombreIcono;
  /** Lado del cuadro en px. 24 por defecto, como la rejilla en que se dibujaron. */
  tamano?: number;
  color?: string;
}

export function Icono({ nombre, tamano = 24, color = colores.fg }: Props) {
  return (
    <Svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {nombre === 'reloj' ? <Circle cx={12} cy={12} r={10} /> : null}
      {nombre === 'origen' ? <Circle cx={12} cy={10} r={2.5} /> : null}
      <Path d={PATHS[nombre]} />
    </Svg>
  );
}
