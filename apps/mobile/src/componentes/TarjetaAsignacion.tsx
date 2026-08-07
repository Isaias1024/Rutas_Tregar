import { Pressable, Text, View } from 'react-native';
import type { AsignacionDetallada, Turno } from '@/datos/asignaciones';

const ETIQUETA_TURNO: Record<Turno, string> = {
  manana: 'Manana',
  tarde: 'Tarde',
  noche: 'Noche',
};

interface Props {
  asignacion: AsignacionDetallada;
  /** Dias futuros en "Semana": se ven, no se marcan (paso 9). */
  soloLectura?: boolean;
  onPress: () => void;
}

export function TarjetaAsignacion({ asignacion, soloLectura, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-app border border-border bg-surface p-4"
      testID="tarjeta-asignacion"
    >
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 text-lg font-semibold text-foreground">
          {asignacion.horario.ruta.nombre}
        </Text>
        <Text className="text-sm font-medium text-foreground-muted">
          {ETIQUETA_TURNO[asignacion.horario.turno]}
        </Text>
      </View>
      <Text className="mt-1 text-base tabular-nums text-foreground-muted">
        {asignacion.horario.horaInicioEsperada.slice(0, 5)} · {asignacion.camionCodigo}
      </Text>
      <Text className="mt-1 text-sm text-foreground-muted">
        {asignacion.horario.ruta.paradaInicioNombre} → {asignacion.horario.ruta.paradaFinNombre}
      </Text>
      <Text className="mt-2 text-sm font-medium text-primary">
        {soloLectura ? 'Solo lectura' : 'Pendiente: Vio la ruta'}
      </Text>
    </Pressable>
  );
}
