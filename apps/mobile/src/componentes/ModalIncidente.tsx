import { ETIQUETA_INCIDENTE, OPCIONES_INCIDENTE, type TipoIncidente } from '@rutas/shared';
import { Modal, Text, View } from 'react-native';
import { BotonPrimario } from './BotonPrimario';
import { BotonSecundario } from './BotonSecundario';

interface Props {
  visible: boolean;
  ocupado: boolean;
  onSeleccionar: (razon: TipoIncidente) => void;
  onCancelar: () => void;
}

export function ModalIncidente({ visible, ocupado, onSeleccionar, onCancelar }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View className="flex-1 items-center justify-center bg-black/30">
        <View className="mx-4 rounded-xl bg-white p-6 gap-4">
          <View className="gap-1">
            <Text className="text-lg font-semibold text-foreground">¿Qué sucedió en la ruta?</Text>
            <Text className="text-sm text-foreground-muted">
              Cuéntanos la razón por la que no pudiste completar esta ruta
            </Text>
          </View>

          <View className="gap-3">
            {OPCIONES_INCIDENTE.map((tipo) => (
              <BotonSecundario
                key={tipo}
                etiqueta={ETIQUETA_INCIDENTE[tipo]}
                onPress={() => onSeleccionar(tipo)}
                deshabilitado={ocupado}
              />
            ))}
          </View>

          <BotonPrimario etiqueta="Cancelar" onPress={onCancelar} deshabilitado={ocupado} />
        </View>
      </View>
    </Modal>
  );
}
