import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EstadoCarga } from '@/componentes/EstadoCarga';
import { EstadoError } from '@/componentes/EstadoError';
import { EstadoVacio } from '@/componentes/EstadoVacio';
import { SelectorDiaSemana } from '@/componentes/SelectorDiaSemana';
import { TarjetaRuta } from '@/componentes/TarjetaRuta';
import { fechaOperativaHoy, sumarDias } from '@/datos/asignaciones';
import { useAsignaciones } from '@/datos/useAsignaciones';

const DIAS_VISIBLES = 7;

/**
 * La semana del chofer: siete dias desde hoy, uno seleccionable a la vez.
 *
 * Es pantalla de consulta (§7). Un dia que no es hoy abre el detalle en solo
 * lectura — no se marca el futuro porque no ha pasado, y no se marca el pasado
 * porque `evento` es append-only y llegar tarde a registrarlo falsearia la
 * hora. Ambas restricciones las vuelve a imponer el servidor.
 */
export default function PaginaSemana() {
  const hoy = fechaOperativaHoy();
  const fin = sumarDias(hoy, DIAS_VISIBLES - 1);
  const [diaElegido, setDiaElegido] = useState(hoy);

  const { asignaciones, cargando, hayError, refrescando, refrescar, reintentar } = useAsignaciones(
    hoy,
    fin,
  );

  const dias = useMemo(
    () =>
      Array.from({ length: DIAS_VISIBLES }, (_, indice) => {
        const fecha = sumarDias(hoy, indice);
        return {
          fecha,
          cantidadRutas: asignaciones.filter((a) => a.fecha === fecha).length,
        };
      }),
    [hoy, asignaciones],
  );

  const delDia = useMemo(
    () =>
      asignaciones
        .filter((a) => a.fecha === diaElegido)
        .sort((a, b) => a.horario.horaInicioEsperada.localeCompare(b.horario.horaInicioEsperada)),
    [asignaciones, diaElegido],
  );

  const esHoy = diaElegido === hoy;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="gap-3 pt-4 pb-3">
        <Text className="px-4 text-2xl font-bold text-foreground">Semana</Text>
        <SelectorDiaSemana
          dias={dias}
          fechaSeleccionada={diaElegido}
          hoy={hoy}
          onSeleccionar={setDiaElegido}
        />
        {esHoy ? null : (
          <Text className="px-4 text-sm text-foreground-muted">
            Solo consulta: los pasos se marcan el mismo dia de la ruta.
          </Text>
        )}
      </View>

      <FlatList
        className="flex-1"
        contentContainerClassName="flex-grow gap-3 px-4 pb-4"
        data={cargando || hayError ? [] : delDia}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
        ListEmptyComponent={
          cargando ? (
            <EstadoCarga filas={2} />
          ) : hayError ? (
            <EstadoError onReintentar={reintentar} />
          ) : (
            <EstadoVacio titulo="Sin rutas este dia" icono="semana" />
          )
        }
        renderItem={({ item }) => (
          <TarjetaRuta
            asignacion={item}
            soloLectura={!esHoy}
            onPress={() =>
              router.push({
                pathname: '/(chofer)/ruta/[id]',
                params: esHoy ? { id: item.id } : { id: item.id, soloLectura: '1' },
              })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}
