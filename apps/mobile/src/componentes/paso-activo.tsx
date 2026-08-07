import { requiereContador, type TipoEvento } from '@rutas/shared';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

const ETIQUETA_PASO: Record<TipoEvento, string> = {
  vio_ruta: 'Vi la ruta',
  listo_inicio: 'Listo para iniciar',
  inicio_ruta: 'Inicie la ruta',
  fin_ruta: 'Llegue al final',
  retorno: 'Regrese',
};

const PLACEHOLDER_CONTADOR: Partial<Record<TipoEvento, string>> = {
  fin_ruta: '¿Cuantos abordaron?',
  retorno: '¿Cuantos regresaron?',
};

interface Props {
  tipo: TipoEvento;
  registrando: boolean;
  onConfirmar: (contador?: number) => void;
}

/**
 * Un solo boton activo, de ancho completo y 72px de alto, texto 20px
 * semibold (§ movil-expo.md). Cuando el paso pide contador, el textbox
 * numerico vive DENTRO de este mismo paso — no es una pantalla aparte — y
 * el boton se niega a confirmar sin un numero valido.
 */
export function PasoActivo({ tipo, registrando, onConfirmar }: Props) {
  const [contadorTexto, setContadorTexto] = useState('');
  const necesitaContador = requiereContador(tipo);
  const contadorNumero = Number.parseInt(contadorTexto, 10);
  const contadorValido =
    !necesitaContador ||
    (contadorTexto.trim() !== '' && Number.isFinite(contadorNumero) && contadorNumero >= 0);

  return (
    <View className="gap-3">
      {necesitaContador ? (
        <View>
          <Text className="mb-1 text-base font-medium text-foreground">
            {PLACEHOLDER_CONTADOR[tipo]}
          </Text>
          <TextInput
            className="h-14 rounded-app border border-border px-4 text-lg text-foreground"
            keyboardType="number-pad"
            value={contadorTexto}
            onChangeText={setContadorTexto}
            editable={!registrando}
            testID="input-contador"
          />
        </View>
      ) : null}
      <Pressable
        className="h-[72px] items-center justify-center rounded-app bg-primary disabled:opacity-50"
        disabled={registrando || !contadorValido}
        onPress={() => onConfirmar(necesitaContador ? contadorNumero : undefined)}
        testID="boton-paso-activo"
      >
        {registrando ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-xl font-semibold text-primary-fg">{ETIQUETA_PASO[tipo]}</Text>
        )}
      </Pressable>
    </View>
  );
}
