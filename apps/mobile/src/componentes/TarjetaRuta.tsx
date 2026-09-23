import { estadoRuta, horaEsperadaTexto } from '@rutas/shared';
import { colores } from '@rutas/shared/tokens';
import { Pressable, Text, View } from 'react-native';
import type { AsignacionDetallada } from '@/datos/asignaciones';
import { EstadoRutaBadge } from './EstadoRutaBadge';
import { Icono } from './Icono';
import { RutaTimeline } from './RutaTimeline';

interface Props {
  asignacion: AsignacionDetallada;
  /** Dias que no son hoy: se ven, no se marcan (§ movil-expo.md). */
  soloLectura?: boolean;
  onPress: () => void;
}

/**
 * La barra de color al borde izquierdo repite el estado del badge para escanear
 * la lista por franjas; el texto del badge sigue ahi.
 */
export function TarjetaRuta({ asignacion, soloLectura, onPress }: Props) {
  const estado = estadoRuta(asignacion.eventos, asignacion.canceladaEn);
  const { ruta, horaInicioEsperada, horaFinEsperada } = asignacion.horario;

  const colorBorde =
    estado === 'en_curso'
      ? colores.warning
      : estado === 'completada'
        ? colores.success
        : estado === 'cancelada'
          ? colores.fgMuted
          : colores.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ruta.nombre}, ${horaEsperadaTexto(horaInicioEsperada)} a ${horaEsperadaTexto(horaFinEsperada)}`}
      onPress={onPress}
      className="overflow-hidden rounded-app border border-border bg-surface active:opacity-80"
      testID="tarjeta-asignacion"
    >
      <View className="flex-row">
        <View style={{ width: 4, backgroundColor: colorBorde }} />
        <View className="flex-1 gap-3 p-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-lg font-semibold text-foreground" numberOfLines={2}>
                {ruta.nombre}
              </Text>
              <View className="mt-1 flex-row items-center gap-1.5">
                <Icono nombre="reloj" tamano={14} color={colores.fgMuted} />
                <Text className="text-base tabular-nums text-foreground-muted">
                  {horaEsperadaTexto(horaInicioEsperada)} — {horaEsperadaTexto(horaFinEsperada)}
                </Text>
              </View>
            </View>
            <EstadoRutaBadge estado={estado} />
          </View>

          <RutaTimeline origen={ruta.paradaInicio.nombre} destino={ruta.paradaFin.nombre} />

          <View className="flex-row items-center justify-between border-t border-border pt-3">
            <View className="flex-row items-center gap-1.5">
              <Icono nombre="camion" tamano={14} color={colores.fgMuted} />
              <Text className="text-sm tabular-nums text-foreground-muted">
                {asignacion.camionCodigo}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Text className="text-sm font-medium text-primary">
                {soloLectura ? 'Ver detalle' : 'Abrir'}
              </Text>
              <Icono nombre="chevron" tamano={14} color={colores.primary} />
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
