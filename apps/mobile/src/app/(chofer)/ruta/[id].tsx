import {
  ORDEN_PASOS,
  requiereContador,
  siguientePaso,
  type EventoRegistrado,
  type TipoEvento,
} from '@rutas/shared';
import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { PasoActivo } from '@/componentes/paso-activo';
import { type AsignacionDetallada, obtenerAsignacionPorId } from '@/datos/asignaciones';
import { supabase } from '@/lib/supabase';
import { capturarUbicacion } from '@/ubicacion';

const ETIQUETA_PASO: Record<TipoEvento, string> = {
  vio_ruta: 'Vi la ruta',
  listo_inicio: 'Listo para iniciar',
  inicio_ruta: 'Inicie la ruta',
  fin_ruta: 'Llegue al final',
  retorno: 'Regrese',
};

const ETIQUETA_TURNO: Record<string, string> = { manana: 'Manana', tarde: 'Tarde', noche: 'Noche' };

// Solo estos dos pasos capturan GPS (§ movil-expo.md, paso 10).
const REQUIERE_GPS: ReadonlySet<TipoEvento> = new Set(['listo_inicio', 'fin_ruta']);

interface EventoFila extends EventoRegistrado {
  ocurrioEn: string;
}

function formatearHora(iso: string): string {
  return format(new TZDate(iso, 'America/Mexico_City'), 'HH:mm');
}

export default function PaginaDetalleRuta() {
  const { id, soloLectura } = useLocalSearchParams<{ id: string; soloLectura?: string }>();
  const [asignacion, setAsignacion] = useState<AsignacionDetallada | null>(null);
  const [eventos, setEventos] = useState<EventoFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [detalle, respuestaEventos] = await Promise.all([
      obtenerAsignacionPorId(id),
      supabase
        .from('evento')
        .select('tipo, ocurrio_en')
        .eq('asignacion_id', id)
        .order('ocurrio_en', { ascending: true }),
    ]);
    setAsignacion(detalle);
    setEventos(
      (respuestaEventos.data ?? []).map((fila) => ({
        tipo: fila.tipo as TipoEvento,
        ocurrioEn: fila.ocurrio_en,
      })),
    );
  }, [id]);

  useEffect(() => {
    cargar().finally(() => setCargando(false));
  }, [cargar]);

  const esSoloLectura = soloLectura === '1';
  const paso = siguientePaso(eventos);
  const eventosPorTipo = new Map(eventos.map((evento) => [evento.tipo, evento]));

  async function registrar(contador?: number) {
    if (!paso) {
      return;
    }
    setRegistrando(true);
    setError(null);
    try {
      const { data: datosUsuario, error: errorUsuario } = await supabase.auth.getUser();
      const capturadoPor = datosUsuario.user?.id;
      if (errorUsuario || !capturadoPor) {
        throw new Error('Sin sesion');
      }

      const ubicacion = REQUIERE_GPS.has(paso) ? await capturarUbicacion() : null;

      const { error: errorEvento } = await supabase.from('evento').insert({
        asignacion_id: id,
        tipo: paso,
        ocurrio_en: new Date().toISOString(),
        monotonic_ms: Math.round(globalThis.performance.now()),
        lat: ubicacion?.lat ?? null,
        lng: ubicacion?.lng ?? null,
        gps_precision_m: ubicacion?.gpsPrecisionM ?? null,
        sin_gps: ubicacion ? ubicacion.sinGps : true,
        origen: 'app',
        capturado_por: capturadoPor,
        client_event_id: Crypto.randomUUID(),
      });
      if (errorEvento) {
        throw errorEvento;
      }

      if (requiereContador(paso) && contador !== undefined) {
        const campo = paso === 'fin_ruta' ? 'cnt_abordaron' : 'cnt_retornaron';
        await supabase
          .from('asignacion')
          .update({ [campo]: contador })
          .eq('id', id);
      }

      await cargar();
    } catch {
      setError('No se pudo registrar. Intenta de nuevo.');
    } finally {
      setRegistrando(false);
    }
  }

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!asignacion) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-center text-base text-foreground-muted">
          No se encontro esta asignacion.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4">
      <View>
        <Text className="text-xl font-semibold text-foreground">
          {asignacion.horario.ruta.nombre}
        </Text>
        <Text className="mt-1 text-base text-foreground-muted">
          {ETIQUETA_TURNO[asignacion.horario.turno] ?? asignacion.horario.turno} ·{' '}
          {asignacion.camionCodigo}
        </Text>
        <Text className="mt-1 tabular-nums text-base text-foreground-muted">
          {asignacion.horario.horaInicioEsperada.slice(0, 5)}–
          {asignacion.horario.horaFinEsperada.slice(0, 5)}
        </Text>
        <Text className="mt-1 text-base text-foreground-muted">
          {asignacion.horario.ruta.paradaInicioNombre} → {asignacion.horario.ruta.paradaFinNombre}
        </Text>
      </View>

      <View className="gap-2">
        {ORDEN_PASOS.map((tipoPaso) => {
          const cumplido = eventosPorTipo.get(tipoPaso);
          if (!cumplido) {
            return null;
          }
          return (
            <View
              key={tipoPaso}
              className="flex-row items-center justify-between rounded-app border border-border bg-surface px-4 py-3"
            >
              <Text className="text-base font-medium text-foreground">
                {ETIQUETA_PASO[tipoPaso]}
              </Text>
              <Text className="tabular-nums text-base text-foreground-muted">
                {formatearHora(cumplido.ocurrioEn)}
              </Text>
            </View>
          );
        })}
      </View>

      {error ? <Text className="text-center text-base text-destructive">{error}</Text> : null}

      {paso && !esSoloLectura ? (
        <PasoActivo tipo={paso} registrando={registrando} onConfirmar={registrar} />
      ) : null}

      {paso && esSoloLectura ? (
        <Text className="text-center text-sm text-foreground-muted">
          Solo lectura: los dias futuros no se marcan todavia.
        </Text>
      ) : null}

      <View className="gap-2">
        {ORDEN_PASOS.filter((tipoPaso) => !eventosPorTipo.has(tipoPaso) && tipoPaso !== paso).map(
          (tipoPaso) => (
            <Text key={tipoPaso} className="text-base text-foreground-muted">
              {ETIQUETA_PASO[tipoPaso]}
            </Text>
          ),
        )}
      </View>
    </ScrollView>
  );
}
