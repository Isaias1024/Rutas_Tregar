import { colores } from '@rutas/shared/tokens';
import { Text, View } from 'react-native';
import { BotonSecundario } from './BotonSecundario';
import { Icono } from './Icono';

interface Props {
  /** `true` cuando el fallo fue de red y no del servidor. */
  sinConexion?: boolean;
  onReintentar: () => void;
}

/**
 * Distingue "sin conexion" de "fallo el servidor" porque la accion del chofer
 * cambia: moverse a donde haya senal, o simplemente reintentar.
 */
export function EstadoError({ sinConexion, onReintentar }: Props) {
  return (
    <View className="items-center justify-center gap-4 px-6 py-12">
      <Icono nombre={sinConexion ? 'sin-conexion' : 'alerta'} tamano={40} color={colores.fgMuted} />
      <View className="gap-1">
        <Text className="text-center text-lg font-semibold text-foreground">
          {sinConexion ? 'Sin conexion' : 'No pudimos cargar tus rutas'}
        </Text>
        <Text className="text-center text-base text-foreground-muted">
          {sinConexion
            ? 'Lo que marques se guarda y se envia solo cuando vuelva la senal.'
            : 'Intenta nuevamente.'}
        </Text>
      </View>
      <View className="w-full max-w-xs">
        <BotonSecundario etiqueta="Reintentar" onPress={onReintentar} testID="boton-reintentar" />
      </View>
    </View>
  );
}
