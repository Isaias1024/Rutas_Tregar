import { Modal, Text, View } from 'react-native';
import { BotonPrimario } from './BotonPrimario';
import { BotonSecundario } from './BotonSecundario';

interface Props {
  visible: boolean;
  titulo: string;
  descripcion: string;
  etiquetaConfirmar: string;
  ocupado?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/**
 * Confirmacion para lo que no se puede deshacer.
 *
 * `evento` es append-only: un hito marcado por error no se borra ni se edita
 * — queda en el historial y hay que corregirlo desde el panel. Por eso el
 * paso que cierra la ruta pregunta antes, y por eso ninguna accion de simple
 * navegacion lo hace (§14: nada de confirmaciones innecesarias).
 *
 * "Cancelar" va debajo y en secundario, no al lado: con el pulgar en marcha,
 * dos botones del mismo tamano lado a lado se tocan por accidente.
 */
export function ModalConfirmacion({
  visible,
  titulo,
  descripcion,
  etiquetaConfirmar,
  ocupado,
  onConfirmar,
  onCancelar,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancelar}
    >
      <View className="flex-1 justify-end bg-black/50 p-4">
        <View className="gap-4 rounded-app bg-background p-5">
          <View className="gap-2">
            <Text className="text-xl font-bold text-foreground">{titulo}</Text>
            <Text className="text-base text-foreground-muted">{descripcion}</Text>
          </View>
          <View className="gap-2">
            <BotonPrimario
              etiqueta={etiquetaConfirmar}
              onPress={onConfirmar}
              ocupado={ocupado}
              testID="boton-confirmar"
            />
            <BotonSecundario
              etiqueta="Cancelar"
              onPress={onCancelar}
              deshabilitado={ocupado}
              testID="boton-cancelar"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
