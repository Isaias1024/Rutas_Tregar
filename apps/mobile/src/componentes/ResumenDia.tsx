import { colores } from '@rutas/shared/tokens';
import { Text, View } from 'react-native';

export interface ConteoDia {
  total: number;
  pendientes: number;
  enCurso: number;
  completadas: number;
}

interface Props {
  conteo: ConteoDia;
}

function Celda({ valor, etiqueta, color }: { valor: number; etiqueta: string; color: string }) {
  return (
    <View className="flex-1 items-center rounded-app border border-border bg-surface px-2 py-3">
      <Text className="text-2xl font-bold tabular-nums" style={{ color }}>
        {valor}
      </Text>
      <Text className="mt-0.5 text-center text-xs font-medium uppercase text-foreground-muted">
        {etiqueta}
      </Text>
    </View>
  );
}

/**
 * "En curso" solo aparece cuando hay una ruta corriendo: el resto del dia seria
 * un cero inutil, y su lugar lo ocupa el conteo de completadas.
 */
export function ResumenDia({ conteo }: Props) {
  return (
    <View className="flex-row gap-2" accessibilityLabel={`${conteo.total} rutas hoy`}>
      <Celda valor={conteo.total} etiqueta="Rutas hoy" color={colores.fg} />
      {conteo.enCurso > 0 ? (
        <Celda valor={conteo.enCurso} etiqueta="En curso" color={colores.warning} />
      ) : null}
      <Celda valor={conteo.pendientes} etiqueta="Pendientes" color={colores.fg} />
      <Celda valor={conteo.completadas} etiqueta="Completadas" color={colores.success} />
    </View>
  );
}
