import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { EstadoVacio } from '@/componentes/EstadoVacio';
import { TarjetaAsignacion } from '@/componentes/TarjetaAsignacion';
import {
  type AsignacionDetallada,
  fechaOperativaHoy,
  obtenerAsignaciones,
} from '@/datos/asignaciones';

export default function PaginaHoy() {
  const [asignaciones, setAsignaciones] = useState<AsignacionDetallada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    const hoy = fechaOperativaHoy();
    const filas = await obtenerAsignaciones(hoy, hoy);
    setAsignaciones(filas);
  }, []);

  useEffect(() => {
    cargar().finally(() => setCargando(false));
  }, [cargar]);

  async function refrescar() {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  }

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="flex-grow gap-3 p-4"
      data={asignaciones}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
      ListEmptyComponent={<EstadoVacio titulo="Hoy no tienes rutas asignadas" />}
      renderItem={({ item }) => (
        <TarjetaAsignacion
          asignacion={item}
          onPress={() => router.push({ pathname: '/(chofer)/ruta/[id]', params: { id: item.id } })}
        />
      )}
    />
  );
}
