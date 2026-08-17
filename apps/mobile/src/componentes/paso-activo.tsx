import { requiereContador, type TipoEvento } from '@rutas/shared';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { BotonPrimario } from './BotonPrimario';

/**
 * Lo que dice el boton en cada hito, en primera persona y en voz de accion.
 *
 * `inicio_ruta` y `retorno` son literalmente "Iniciar ruta" y "Finalizar ruta":
 * son los dos momentos que el chofer nombra asi y los que el resto de la app
 * (badges, resumen) refleja como EN CURSO y COMPLETADA. Los otros tres siguen
 * siendo hitos reales del flujo, solo que de preparacion y cierre.
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
 * Un solo boton activo, de ancho completo y 72px de alto (§ movil-expo.md).
 *
 * Cuando el paso pide contador, el textbox numerico vive DENTRO de este mismo
 * paso — no es una pantalla aparte — pero **en segundo lugar**: primero el
 * chofer marca el hito ("Llegue al destino"), y solo entonces se le pregunta el
 * numero. Al reves no funcionaba: el boton nacia apagado esperando un dato que
 * el chofer todavia no tiene, porque la gente no ha terminado de bajar cuando el
 * camion apenas se detuvo. Se contaba primero y se marcaba despues, que es justo
 * lo contrario del orden real.
 *
 * Sigue siendo UN evento y UNA escritura: el hito no se registra al primer
 * toque, solo abre la pregunta. `onConfirmar` se llama una sola vez, con el
 * contador ya dentro — `evento` es append-only y no se corrige con un UPDATE
 * posterior.
 *
 * Quien lo usa **tiene que montarlo con `key={tipo}`**: este componente guarda
 * la fase y el numero tecleado, y al avanzar de hito ese estado debe morir con
 * el paso anterior. Sin la `key` es el mismo componente montado al que solo le
 * cambia el `tipo`, y el numero de "cuantas bajaron" reaparecia prellenado en
 * "cuantas regresaron".
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
