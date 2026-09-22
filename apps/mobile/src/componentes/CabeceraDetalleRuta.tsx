import { horaEsperadaTexto, type EstadoRuta } from '@rutas/shared';
import { colores } from '@rutas/shared/tokens';
import { Text, View } from 'react-native';
import type { AsignacionDetallada } from '@/datos/asignaciones';
import { fechaLarga } from './EncabezadoHoy';
import { EstadoRutaBadge } from './EstadoRutaBadge';
import { Icono } from './Icono';
import { RutaTimeline } from './RutaTimeline';

const ETIQUETA_TURNO: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };

interface Props {
  asignacion: AsignacionDetallada;
  estado: EstadoRuta;
  /** Hora real de arranque, ya formateada, cuando la ruta ya inicio. */
  horaInicioReal: string | null;
  horaFinReal: string | null;
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View className="flex-1">
      <Text className="text-xs font-medium uppercase text-foreground-muted">{etiqueta}</Text>
      <Text className="text-base font-semibold tabular-nums text-foreground">{valor}</Text>
    </View>
  );
}

/**
 * La ficha de la ruta. La hora real se muestra JUNTO a la programada, no en su
 * lugar: juntas dicen si se salio a tiempo, que es lo que el supervisor pregunta.
 */
export function CabeceraDetalleRuta({ asignacion, estado, horaInicioReal, horaFinReal }: Props) {
  const { ruta, horaInicioEsperada, horaFinEsperada, turno } = asignacion.horario;

  return (
    <View className="gap-4 rounded-app border border-border bg-surface p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-xl font-bold text-foreground">{ruta.nombre}</Text>
          <Text className="mt-0.5 text-base text-foreground-muted">
            {fechaLarga(asignacion.fecha)}
          </Text>
        </View>
        <EstadoRutaBadge estado={estado} />
      </View>

      <View className="flex-row gap-3 border-t border-border pt-3">
        <Dato
          etiqueta="Programado"
          valor={`${horaEsperadaTexto(horaInicioEsperada)}—${horaEsperadaTexto(horaFinEsperada)}`}
        />
        {horaInicioReal ? (
          <Dato
            etiqueta="Real"
            valor={horaFinReal ? `${horaInicioReal}—${horaFinReal}` : horaInicioReal}
          />
        ) : null}
      </View>

      <View className="flex-row items-center gap-4 border-t border-border pt-3">
        <View className="flex-row items-center gap-1.5">
          <Icono nombre="camion" tamano={16} color={colores.fgMuted} />
          <Text className="text-base tabular-nums text-foreground-muted">
            {asignacion.camionCodigo}
          </Text>
        </View>
        <Text className="text-base text-foreground-muted">
          Turno {ETIQUETA_TURNO[turno] ?? turno}
        </Text>
      </View>

      <View className="border-t border-border pt-3">
        <RutaTimeline
          origen={ruta.paradaInicio.nombre}
          destino={ruta.paradaFin.nombre}
          direccionOrigen={ruta.paradaInicio.direccion}
          direccionDestino={ruta.paradaFin.direccion}
        />
      </View>
    </View>
  );
}
