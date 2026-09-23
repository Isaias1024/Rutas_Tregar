import { View } from 'react-native';

/**
 * Esqueleto de tarjeta, no un spinner: asi el vacio no se lee como "no tienes
 * rutas hoy". Sin brillo animado, que se mira muchas veces al dia y cansa.
 */
function BloqueTarjeta() {
  return (
    <View className="gap-3 rounded-app border border-border bg-surface p-4">
      <View className="h-5 w-2/3 rounded bg-border" />
      <View className="h-4 w-1/2 rounded bg-border" />
      <View className="h-4 w-3/4 rounded bg-border" />
    </View>
  );
}

/**
 * Claves fijas en vez del indice: estos bloques no se reordenan, se dibujan y
 * desaparecen completos.
 */
const CLAVES = ['esqueleto-a', 'esqueleto-b', 'esqueleto-c', 'esqueleto-d', 'esqueleto-e'] as const;

interface Props {
  /** Cuantas tarjetas fantasma dibujar. Tres llenan una pantalla tipica. */
  filas?: number;
}

export function EstadoCarga({ filas = 3 }: Props) {
  return (
    <View className="gap-3" accessibilityLabel="Cargando rutas">
      {CLAVES.slice(0, filas).map((clave) => (
        <BloqueTarjeta key={clave} />
      ))}
    </View>
  );
}
