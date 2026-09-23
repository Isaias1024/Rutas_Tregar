import { requiereContador, type TipoEvento } from '@rutas/shared';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { BotonPrimario } from './BotonPrimario';

/**
 * Lo que dice el boton en cada hito, en voz de accion y con las palabras que el
 * chofer usa: "Iniciar ruta" y "Finalizar ruta" para los dos momentos clave.
 */
export const ETIQUETA_ACCION: Record<TipoEvento, string> = {
  vio_ruta: 'Vi la ruta',
  listo_inicio: 'Estoy listo para iniciar',
  inicio_ruta: 'Iniciar ruta',
  fin_ruta: 'Llegue al destino',
  fin_ruta_incidente: 'Terminar ruta por incidente',
  retorno: 'Finalizar ruta',
};

const PLACEHOLDER_CONTADOR: Partial<Record<TipoEvento, string>> = {
  fin_ruta: 'Cuantas personas bajaron?',
  retorno: 'Cuantas personas regresaron?',
};

interface Props {
  tipo: TipoEvento;
  registrando: boolean;
  onConfirmar: (contador?: number) => void;
}

/**
 * Un solo boton activo, y un solo evento: el primer toque abre la pregunta del
 * contador. Montarlo con `key={tipo}` o el contador anterior reaparece.
 */
export function PasoActivo({ tipo, registrando, onConfirmar }: Props) {
  const necesitaContador = requiereContador(tipo);
  const [pidiendoContador, setPidiendoContador] = useState(false);
  const [contadorTexto, setContadorTexto] = useState('');

  const contadorNumero = Number.parseInt(contadorTexto, 10);
  const contadorValido =
    contadorTexto.trim() !== '' && Number.isFinite(contadorNumero) && contadorNumero >= 0;

  if (necesitaContador && pidiendoContador) {
    return (
      <View className="gap-3">
        <View>
          <Text className="mb-1 text-base font-medium text-foreground">
            {PLACEHOLDER_CONTADOR[tipo]}
          </Text>
          <View
            className={`rounded-app border-2 px-4 py-3 ${
              contadorValido ? 'border-primary bg-primary/5' : 'border-border bg-surface'
            }`}
          >
            <TextInput
              className="text-2xl font-bold tabular-nums text-foreground"
              style={{ minHeight: 52 }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#94a3b8"
              value={contadorTexto}
              onChangeText={setContadorTexto}
              editable={!registrando}
              autoFocus
              testID="input-contador"
            />
          </View>
          {contadorTexto && !contadorValido && (
            <Text className="mt-1 text-sm text-destructive">
              Ingresa un número válido (0 o mayor)
            </Text>
          )}
        </View>
        <BotonPrimario
          etiqueta="Confirmar"
          ocupado={registrando}
          deshabilitado={!contadorValido}
          onPress={() => onConfirmar(contadorNumero)}
          testID="boton-paso-activo"
        />
      </View>
    );
  }

  return (
    <BotonPrimario
      etiqueta={ETIQUETA_ACCION[tipo]}
      ocupado={registrando}
      onPress={() => (necesitaContador ? setPidiendoContador(true) : onConfirmar())}
      testID="boton-paso-activo"
    />
  );
}
