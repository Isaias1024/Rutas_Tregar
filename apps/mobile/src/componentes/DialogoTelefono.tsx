import { useEffect, useState } from 'react';
import { Modal, Text, TextInput, View } from 'react-native';
import { useSesion } from '@/app/_layout';
import { actualizarTelefono } from '@/datos/perfil';
import { BotonPrimario } from './BotonPrimario';
import { BotonSecundario } from './BotonSecundario';

interface Props {
  visible: boolean;
  telefonoActual: string;
  onCerrar: () => void;
  onGuardado: () => void;
}

/** Diez digitos, el formato nacional. Se valida aqui y Postgres guarda lo que llegue. */
function esValido(telefono: string): boolean {
  return /^\d{10}$/.test(telefono);
}

/**
 * El unico campo del perfil que el chofer puede escribir. Teclado numerico y sin
 * formato automatico: diez digitos de corrido son mas rapidos que los guiones.
 */
export function DialogoTelefono({ visible, telefonoActual, onCerrar, onGuardado }: Props) {
  const { usuario } = useSesion();
  const [valor, setValor] = useState(telefonoActual);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reabrir el dialogo tiene que partir del telefono vigente, no del texto a
  // medias que quedo de la vez que se cancelo.
  useEffect(() => {
    if (visible) {
      setValor(telefonoActual);
      setError(null);
    }
  }, [visible, telefonoActual]);

  async function guardar() {
    if (!usuario || !esValido(valor)) {
      setError('Escribe los 10 digitos de tu telefono.');
      return;
    }
    setGuardando(true);
    const resultado = await actualizarTelefono(usuario.id, valor);
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.mensaje);
      return;
    }
    onGuardado();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCerrar}
    >
      <View className="flex-1 justify-end bg-black/50 p-4">
        <View className="gap-4 rounded-app bg-background p-5">
          <Text className="text-xl font-bold text-foreground">Cambiar telefono</Text>
          <TextInput
            className="rounded-app border border-border px-4 text-lg tabular-nums text-foreground"
            style={{ minHeight: 56 }}
            keyboardType="number-pad"
            maxLength={10}
            value={valor}
            onChangeText={(texto) => {
              setValor(texto.replace(/\D/g, ''));
              setError(null);
            }}
            editable={!guardando}
            placeholder="8112345678"
            testID="input-telefono"
          />
          {error ? <Text className="text-base text-destructive">{error}</Text> : null}
          <View className="gap-2">
            <BotonPrimario etiqueta="Guardar" onPress={guardar} ocupado={guardando} />
            <BotonSecundario etiqueta="Cancelar" onPress={onCerrar} deshabilitado={guardando} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
