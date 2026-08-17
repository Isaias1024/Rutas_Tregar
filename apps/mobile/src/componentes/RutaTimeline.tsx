import { colores } from '@rutas/shared/tokens';
import { Text, View } from 'react-native';

interface Props {
  origen: string;
  destino: string;
  /** Direccion bajo cada punto. Solo la pantalla de detalle las muestra. */
  direccionOrigen?: string;
  direccionDestino?: string;
}

/**
 * El trayecto como dos puntos unidos por una linea: de donde salgo, a donde
 * voy. Responde de un vistazo dos de las preguntas que el chofer trae siempre
 * (§17), sin que tenga que leer una frase con flecha en medio.
 *
 * El circulo hueco marca el origen y el cuadro relleno el destino: la forma
 * distingue los extremos aunque el color no se aprecie bajo el sol.
 */
export function RutaTimeline({ origen, destino, direccionOrigen, direccionDestino }: Props) {
  return (
    <View className="gap-0">
      <View className="flex-row items-start gap-3">
        <View className="items-center" style={{ width: 12 }}>
          <View
            className="rounded-full border-2 bg-background"
            style={{ width: 12, height: 12, borderColor: colores.fgMuted }}
          />
          <View
            className="w-0.5 flex-1 bg-border"
            style={{ minHeight: direccionOrigen ? 22 : 14 }}
          />
        </View>
        <View className="flex-1 pb-2">
          <Text className="text-base font-medium text-foreground">{origen}</Text>
          {direccionOrigen ? (
            <Text className="text-sm text-foreground-muted">{direccionOrigen}</Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row items-start gap-3">
        <View className="items-center" style={{ width: 12 }}>
          <View
            style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: colores.primary }}
          />
        </View>
        <View className="flex-1">
          <Text className="text-base font-medium text-foreground">{destino}</Text>
          {direccionDestino ? (
            <Text className="text-sm text-foreground-muted">{direccionDestino}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
