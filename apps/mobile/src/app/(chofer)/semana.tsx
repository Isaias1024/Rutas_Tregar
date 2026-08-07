import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, SectionList, View } from 'react-native';
import { EncabezadoDia } from '@/componentes/EncabezadoDia';
import { EstadoVacio } from '@/componentes/EstadoVacio';
import { TarjetaAsignacion } from '@/componentes/TarjetaAsignacion';
import {
  agruparPorDia,
  fechaOperativaHoy,
  obtenerAsignaciones,
  sumarDias,
  type GrupoDia,
} from '@/datos/asignaciones';

export default function PaginaSemana() {
  const [grupos, setGrupos] = useState<GrupoDia[]>([]);
  const [cargando, setCargando] = useState(true);
  const hoy = fechaOperativaHoy();

  useEffect(() => {
    let activo = true;
    (async () => {
      const fin = sumarDias(hoy, 6);
      const filas = await obtenerAsignaciones(hoy, fin);
      if (!activo) {
        return;
      }
      setGrupos(agruparPorDia(filas));
      setCargando(false);
    })();
    return () => {
      activo = false;
    };
  }, [hoy]);

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SectionList
      className="flex-1 bg-background"
      contentContainerClassName="flex-grow gap-2 p-4"
      sections={grupos.map((grupo) => ({ title: grupo.fecha, data: grupo.asignaciones }))}
      keyExtractor={(item) => item.id}
      renderSectionHeader={({ section }) => (
        <EncabezadoDia fecha={section.title} esHoy={section.title === hoy} />
      )}
      ListEmptyComponent={<EstadoVacio titulo="No tienes rutas asignadas esta semana" />}
      renderItem={({ item, section }) => {
        // "Los dias futuros son solo lectura: se ven, no se marcan" (paso 9).
        const esFuturo = section.title > hoy;
        return (
          <TarjetaAsignacion
            asignacion={item}
            soloLectura={esFuturo}
            onPress={() =>
              router.push(
                (esFuturo
                  ? `/(chofer)/ruta/${item.id}?soloLectura=1`
                  : `/(chofer)/ruta/${item.id}`) as never,
              )
            }
          />
        );
      }}
    />
  );
}
