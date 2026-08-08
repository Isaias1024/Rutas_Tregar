import {
  ORDEN_PASOS,
  requiereContador,
  siguientePaso,
  type EventoRegistrado,
  type TipoEvento,
} from '@rutas/shared';
import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { PasoActivo } from '@/componentes/paso-activo';
import { PasoStepper, type PasoStepperItem } from '@/componentes/paso-stepper';
import { type AsignacionDetallada, obtenerAsignacionPorId } from '@/datos/asignaciones';
import { supabase } from '@/lib/supabase';
import { almacenSqlite } from '@/outbox/db';
import { vaciarCola } from '@/outbox/flusher';
import { registrarEvento } from '@/outbox/registrar';
import { useSesion } from '../../_layout';

const ETIQUETA_PASO: Record<TipoEvento, string> = {
  vio_ruta: 'Vi la ruta',
  listo_inicio: 'Listo para iniciar',
  inicio_ruta: 'Inicie la ruta',
  fin_ruta: 'Llegue al final',
  retorno: 'Regrese',
};

const ETIQUETA_TURNO: Record<string, string> = { manana: 'Manana', tarde: 'Tarde', noche: 'Noche' };

interface EventoFila extends EventoRegistrado {
  ocurrioEn: string;
}

function formatearHora(iso: string): string {
  return format(new TZDate(iso, 'America/Mexico_City'), 'HH:mm');
}

export default function PaginaDetalleRuta() {
  const { id, soloLectura } = useLocalSearchParams<{ id: string; soloLectura?: string }>();
  const { usuario } = useSesion();
  const [asignacion, setAsignacion] = useState<AsignacionDetallada | null>(null);
  const [eventos, setEventos] = useState<EventoFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [detalle, respuestaEventos, pendientes] = await Promise.all([
      obtenerAsignacionPorId(id),
      supabase
        .from('evento')
        .select('tipo, ocurrio_en')
        .eq('asignacion_id', id)
        .order('ocurrio_en', { ascending: true }),
      almacenSqlite.listar(),
    ]);
    setAsignacion(detalle);

    // Combina lo ya subido con lo que sigue en el outbox local para esta
    // asignacion: la UI avanza con lo que se acaba de encolar, sin esperar
    // a que el flusher realmente lo suba (paso 11).
    const combinados = new Map<TipoEvento, EventoFila>();
    for (const fila of respuestaEventos.data ?? []) {
      combinados.set(fila.tipo as TipoEvento, {
        tipo: fila.tipo as TipoEvento,
        ocurrioEn: fila.ocurrio_en,
      });
    }
    for (const fila of pendientes) {
      if (fila.payload.asignacion_id === id) {
        combinados.set(fila.payload.tipo, {
          tipo: fila.payload.tipo,
          ocurrioEn: fila.payload.ocurrio_en,
        });
      }
    }
    setEventos(
      ORDEN_PASOS.filter((tipo) => combinados.has(tipo)).map(
        (tipo) => combinados.get(tipo) as EventoFila,
      ),
    );
  }, [id]);

  useEffect(() => {
    cargar().finally(() => setCargando(false));
  }, [cargar]);

  const esSoloLectura = soloLectura === '1';
  const paso = siguientePaso(eventos);
  const eventosPorTipo = new Map(eventos.map((evento) => [evento.tipo, evento]));

  async function registrar(contadorValor?: number) {
    if (!paso || !usuario) {
      return;
    }
    setRegistrando(true);
    setError(null);
    try {
      const contador =
        requiereContador(paso) && contadorValor !== undefined
          ? {
              campo: (paso === 'fin_ruta' ? 'cnt_abordaron' : 'cnt_retornaron') as
                | 'cnt_abordaron'
                | 'cnt_retornaron',
              valor: contadorValor,
            }
          : undefined;

      await registrarEvento({ asignacionId: id, tipo: paso, capturadoPor: usuario.id, contador });
      await cargar();
      // No bloquea el avance de la UI (ya se recargo arriba con el evento
      // local): solo intenta vaciar la cola de una vez si hay red.
      void vaciarCola();
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

  const completados = eventos.length;
  const totalPasos = ORDEN_PASOS.length;
  const tituloProgreso = paso ? `Paso ${completados + 1} de ${totalPasos}` : 'Ruta completada';

  const pasosStepper: PasoStepperItem[] = ORDEN_PASOS.map((tipoPaso) => {
    const cumplido = eventosPorTipo.get(tipoPaso);
    if (cumplido) {
      return {
        tipo: tipoPaso,
        etiqueta: ETIQUETA_PASO[tipoPaso],
        estado: 'completado',
        horaTexto: formatearHora(cumplido.ocurrioEn),
      };
    }
    return {
      tipo: tipoPaso,
      etiqueta: ETIQUETA_PASO[tipoPaso],
      estado: tipoPaso === paso ? 'activo' : 'futuro',
    };
  });

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-4">
      <View className="rounded-app border border-border bg-surface p-4">
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

      <View>
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-base font-semibold text-foreground">Progreso</Text>
          <Text className="text-sm font-medium text-primary">{tituloProgreso}</Text>
        </View>
        <PasoStepper pasos={pasosStepper} />
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
    </ScrollView>
  );
}
