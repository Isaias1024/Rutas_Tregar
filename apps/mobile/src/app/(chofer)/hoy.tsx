import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EncabezadoHoy } from '@/componentes/EncabezadoHoy';
import { EstadoCarga } from '@/componentes/EstadoCarga';
import { EstadoError } from '@/componentes/EstadoError';
import { EstadoVacio } from '@/componentes/EstadoVacio';
import { ResumenDia } from '@/componentes/ResumenDia';
import { TarjetaRuta } from '@/componentes/TarjetaRuta';
import { fechaOperativaHoy } from '@/datos/asignaciones';
import { contarPorEstado, useAsignaciones } from '@/datos/useAsignaciones';
import { usePerfil } from '@/datos/usePerfil';

/**
 * La pantalla principal del chofer y la que abre al entrar (§16.1).
 *
 * Solo el dia operativo de hoy, ordenado cronologicamente: la lista responde
 * "que sigue" de arriba hacia abajo sin que el chofer tenga que filtrar nada.
 */
export default function PaginaHoy() {
  const hoy = fechaOperativaHoy();
  const { asignaciones, cargando, hayError, refrescando, refrescar, reintentar } = useAsignaciones(
    hoy,
    hoy,
  );
  const { perfil } = usePerfil();

  // Cronologico (§16.3). El servidor no garantiza orden y `agruparPorDia` no
  // aplica aqui, que es de un solo dia.
  const ordenadas = useMemo(
    () =>
      [...asignaciones].sort((a, b) =>
        a.horario.horaInicioEsperada.localeCompare(b.horario.horaInicioEsperada),
      ),
    [asignaciones],
  );
  const conteo = useMemo(() => contarPorEstado(ordenadas), [ordenadas]);

  const encabezado = (
    <View className="gap-4 pb-2">
      <EncabezadoHoy nombre={perfil?.nombre ?? ''} fecha={hoy} />
      {ordenadas.length > 0 ? <ResumenDia conteo={conteo} /> : null}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <FlatList
        className="flex-1"
        contentContainerClassName="flex-grow gap-3 p-4"
        data={cargando || hayError ? [] : ordenadas}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={encabezado}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
        ListEmptyComponent={
          cargando ? (
            <EstadoCarga />
          ) : hayError ? (
            <EstadoError onReintentar={reintentar} />
          ) : (
            <EstadoVacio
              titulo="No tienes rutas asignadas para hoy"
              detalle="Cuando el supervisor te asigne una, aparecera aqui."
            />
          )
        }
        renderItem={({ item }) => (
          <TarjetaRuta
            asignacion={item}
            onPress={() =>
              router.push({ pathname: '/(chofer)/ruta/[id]', params: { id: item.id } })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}
