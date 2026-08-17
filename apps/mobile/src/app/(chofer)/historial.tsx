import { estadoRuta } from '@rutas/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EncabezadoDia } from '@/componentes/EncabezadoDia';
import { EstadoCarga } from '@/componentes/EstadoCarga';
import { EstadoError } from '@/componentes/EstadoError';
import { EstadoVacio } from '@/componentes/EstadoVacio';
import { FiltroHistorial, type FiltroEstado } from '@/componentes/FiltroHistorial';
import { TarjetaRuta } from '@/componentes/TarjetaRuta';
import { agruparPorDia, fechaOperativaHoy, sumarDias } from '@/datos/asignaciones';
import { useAsignaciones } from '@/datos/useAsignaciones';

/** Cuanto historial se trae de una vez. Un mes cubre la quincena y su anterior. */
const DIAS_ATRAS = 30;

/**
 * Las rutas que el chofer ya hizo, de la mas reciente hacia atras.
 *
 * Incluye las canceladas a proposito (`incluirCanceladas`): forman parte de lo
 * que le paso ese dia y explican un hueco en su jornada. En Hoy y Semana se
 * omiten, porque ahi solo estorbarian entre las que si va a manejar.
 */
export default function PaginaHistorial() {
  const hoy = fechaOperativaHoy();
  // Hasta AYER: lo de hoy vive en su propia pestana y todavia se esta
  // ejecutando, asi que no es historial.
  const hasta = sumarDias(hoy, -1);
  const desde = sumarDias(hoy, -DIAS_ATRAS);
  const [filtro, setFiltro] = useState<FiltroEstado>('todas');

  const { asignaciones, cargando, hayError, refrescando, refrescar, reintentar } = useAsignaciones(
    desde,
    hasta,
    true,
  );

  const secciones = useMemo(() => {
    const filtradas = asignaciones.filter((asignacion) => {
      if (filtro === 'todas') {
        return true;
      }
      return estadoRuta(asignacion.eventos, asignacion.canceladaEn) === filtro;
    });
    // Mas reciente primero: al revisar el historial se busca lo de ayer, no lo
    // del mes pasado.
    return agruparPorDia(filtradas).reverse();
  }, [asignaciones, filtro]);

  const filas = useMemo(
    () => secciones.flatMap((grupo) => [grupo.fecha, ...grupo.asignaciones] as const),
    [secciones],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="gap-3 pt-4 pb-2">
        <Text className="px-4 text-2xl font-bold text-foreground">Historial</Text>
        <FiltroHistorial valor={filtro} onCambiar={setFiltro} />
      </View>

      <FlatList
        className="flex-1"
        contentContainerClassName="flex-grow gap-2 px-4 pb-4"
        data={cargando || hayError ? [] : filas}
        keyExtractor={(item) => (typeof item === 'string' ? `dia-${item}` : item.id)}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
        ListEmptyComponent={
          cargando ? (
            <EstadoCarga filas={3} />
          ) : hayError ? (
            <EstadoError onReintentar={reintentar} />
          ) : (
            <EstadoVacio
              titulo="Sin rutas en tu historial"
              detalle="Aqui apareceran las rutas de los ultimos 30 dias."
              icono="historial"
            />
          )
        }
        renderItem={({ item }) =>
          typeof item === 'string' ? (
            <EncabezadoDia fecha={item} />
          ) : (
            <TarjetaRuta
              asignacion={item}
              soloLectura
              onPress={() =>
                router.push({
                  pathname: '/(chofer)/ruta/[id]',
                  params: { id: item.id, soloLectura: '1' },
                })
              }
            />
          )
        }
      />
    </SafeAreaView>
  );
}
