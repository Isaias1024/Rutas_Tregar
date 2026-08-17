import { ActivityIndicator, Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

interface Props {
  etiqueta: string;
  onPress: () => void;
  /** Muestra spinner y bloquea el toque. */
  ocupado?: boolean;
  deshabilitado?: boolean;
  /** Rojo en vez de verde, para lo que cierra o descarta algo. */
  destructivo?: boolean;
  testID?: string;
}

/**
 * El unico boton de accion de una pantalla (§ movil-expo.md: "un solo objetivo
 * tactil activo por pantalla"). Ancho completo, 72px de alto y texto de 20px
 * semibold — medidas fijas del sistema, no decorativas: se toca con guante y
 * de reojo, con el telefono en una mano.
 *
 * `minHeight` en vez de `height`: si el usuario del telefono subio el tamano de
 * fuente del sistema, el boton crece en lugar de recortar la etiqueta.
 */
export function BotonPrimario({
  etiqueta,
  onPress,
  ocupado,
  deshabilitado,
  destructivo,
  testID,
}: Props) {
  const escala = useSharedValue(1);
  const estiloEscala = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }));
  const inactivo = ocupado || deshabilitado;

  return (
    <Animated.View style={estiloEscala}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        accessibilityState={{ disabled: Boolean(inactivo), busy: Boolean(ocupado) }}
        className={`items-center justify-center rounded-app px-4 disabled:opacity-40 ${
          destructivo ? 'bg-destructive' : 'bg-primary'
        }`}
        style={{ minHeight: 72 }}
        disabled={inactivo}
        onPressIn={() => {
          escala.value = withTiming(0.97, { duration: 100 });
        }}
        onPressOut={() => {
          escala.value = withTiming(1, { duration: 150 });
        }}
        onPress={onPress}
        testID={testID}
      >
        {ocupado ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-center text-xl font-semibold text-primary-fg">{etiqueta}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
