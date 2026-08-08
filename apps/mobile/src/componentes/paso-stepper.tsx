import type { TipoEvento } from '@rutas/shared';
import { Text, View } from 'react-native';

export interface PasoStepperItem {
  tipo: TipoEvento;
  etiqueta: string;
  estado: 'completado' | 'activo' | 'futuro';
  horaTexto?: string;
}

interface Props {
  pasos: PasoStepperItem[];
}

/**
 * Los cinco hitos como linea de tiempo vertical: nodo relleno + hora para lo
 * cumplido, nodo resaltado para el paso que sigue, nodo vacio para lo que
 * falta. Reemplaza las tres listas sueltas (cumplidos / activo / futuros)
 * por una sola estructura que se entiende de un vistazo.
 */
export function PasoStepper({ pasos }: Props) {
  return (
    <View>
      {pasos.map((paso, indice) => {
        const esUltimo = indice === pasos.length - 1;
        return (
          <View key={paso.tipo} className="flex-row">
            <View className="items-center" style={{ width: 28 }}>
              <View
                className={
                  paso.estado === 'completado'
                    ? 'size-7 items-center justify-center rounded-full bg-primary'
                    : paso.estado === 'activo'
                      ? 'size-7 items-center justify-center rounded-full border-2 border-primary bg-primary-tint'
                      : 'size-7 items-center justify-center rounded-full border border-border bg-background'
                }
              >
                {paso.estado === 'completado' ? (
                  <Text className="text-sm font-bold text-primary-fg" aria-hidden>
                    {'✓'}
                  </Text>
                ) : null}
              </View>
              {esUltimo ? null : (
                <View
                  className={
                    paso.estado === 'completado'
                      ? 'w-0.5 flex-1 bg-primary'
                      : 'w-0.5 flex-1 bg-border'
                  }
                  style={{ minHeight: 16 }}
                />
              )}
            </View>
            <View className="flex-1 pb-4 pl-3">
              <Text
                className={
                  paso.estado === 'futuro'
                    ? 'text-base text-foreground-muted'
                    : 'text-base font-medium text-foreground'
                }
              >
                {paso.etiqueta}
              </Text>
              {paso.horaTexto ? (
                <Text className="tabular-nums text-sm text-foreground-muted">{paso.horaTexto}</Text>
              ) : null}
              {paso.estado === 'activo' ? (
                <Text className="text-sm font-medium text-primary">Siguiente paso</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
