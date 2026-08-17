import { View } from 'react-native';

/**
 * Esqueleto de tarjeta, no un spinner centrado.
 *
 * La pantalla aparece con la forma que va a tener: el chofer entiende que sus
 * rutas estan por llegar en vez de mirar un vacio que podria significar
 * "no tienes nada hoy". Es la diferencia entre "cargando" y "vacio" antes de
 * leer una sola palabra.
 *
 * Sin animacion de brillo a proposito: alguien mira esta pantalla muchas veces
 * al dia y el parpadeo cansa mas de lo que informa.
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
 * Claves fijas en vez del indice del arreglo: estos bloques no se reordenan ni
 * cambian de identidad — se dibujan y desaparecen completos cuando llegan los
 * datos — asi que una lista de nombres estables dice eso mejor que un indice.
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
