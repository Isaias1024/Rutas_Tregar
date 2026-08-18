import { TZDate } from '@date-fns/tz';
import {
  estadoRuta,
  ORDEN_PASOS,
  puedeRegistrar,
  requiereContador,
  siguientePaso,
  type TipoIncidente,
} from '@rutas/shared';
import { format } from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BotonSecundario } from '@/componentes/BotonSecundario';
import { CabeceraDetalleRuta } from '@/componentes/CabeceraDetalleRuta';
import { ModalConfirmacion } from '@/componentes/ModalConfirmacion';
import { ModalIncidente } from '@/componentes/ModalIncidente';
import { ETIQUETA_ACCION, PasoActivo } from '@/componentes/paso-activo';
import { PasoStepper, type PasoStepperItem } from '@/componentes/paso-stepper';
import { type AsignacionDetallada, obtenerAsignacionPorId } from '@/datos/asignaciones';
import { type EventoDeRuta, combinarConPendientes, horaDelPaso } from '@/datos/eventos-locales';
import { supabase } from '@/lib/supabase';
import { almacenSqlite } from '@/outbox/db';
import { vaciarCola } from '@/outbox/flusher';
import { registrarEvento } from '@/outbox/registrar';
import { useSesion } from '../../_layout';

function formatearHora(iso: string): string {
  return format(new TZDate(iso, 'America/Mexico_City'), 'HH:mm');
}

function distanciaEnMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Radio de la tierra en metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.asin(Math.sqrt(a));
  return R * c;
}

function ubicacionEsCorrecta(
  eventoLat: number | undefined,
  eventoLng: number | undefined,
  paradaLat: number | undefined,
  paradaLng: number | undefined,
): boolean | undefined {
  if (
    eventoLat === undefined ||
    eventoLng === undefined ||
    paradaLat === undefined ||
    paradaLng === undefined
  ) {
    return undefined;
  }
  const distancia = distanciaEnMetros(eventoLat, eventoLng, paradaLat, paradaLng);
  return distancia <= 100; // Considera correcto si esta dentro de 100 metros
}

export default function PaginaDetalleRuta() {
  const { id, soloLectura } = useLocalSearchParams<{ id: string; soloLectura?: string }>();
  const { usuario } = useSesion();
  const [asignacion, setAsignacion] = useState<AsignacionDetallada | null>(null);
  const [eventos, setEventos] = useState<EventoDeRuta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<number | undefined>(undefined);
  const [pidiendoConfirmacion, setPidiendoConfirmacion] = useState(false);
  const [pidiendoIncidente, setPidiendoIncidente] = useState(false);

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
    setEventos(
      combinarConPendientes(
        id,
        (respuestaEventos.data ?? []).map((fila) => ({
          tipo: fila.tipo,
          ocurrioEn: fila.ocurrio_en,
        })),
        pendientes,
      ),
    );
  }, [id]);

  useEffect(() => {
    cargar().finally(() => setCargando(false));
  }, [cargar]);

  const esSoloLectura = soloLectura === '1';
  const paso = siguientePaso(eventos);

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
      setPidiendoConfirmacion(false);
    }
  }

  async function registrarIncidente(razon: TipoIncidente) {
    if (!usuario) {
      return;
    }
    setRegistrando(true);
    setError(null);
    try {
      await registrarEvento({
        asignacionId: id,
        tipo: 'fin_ruta_incidente',
        capturadoPor: usuario.id,
        razonIncidente: razon,
      });
      await cargar();
      void vaciarCola();
    } catch {
      setError('No se pudo registrar el incidente. Intenta de nuevo.');
    } finally {
      setRegistrando(false);
      setPidiendoIncidente(false);
    }
  }

  /**
   * Solo `retorno` pregunta antes: es el hito que cierra la ruta y `evento` es
   * append-only — marcarlo por error no se deshace desde la app, hay que ir al
   * panel. Los demas pasos no preguntan (§14: nada de confirmaciones
   * innecesarias).
   */
  function intentarRegistrar(contadorValor?: number) {
    if (paso === 'retorno') {
      setConfirmando(contadorValor);
      setPidiendoConfirmacion(true);
      return;
    }
    void registrar(contadorValor);
  }

  if (cargando) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!asignacion) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-center text-base text-foreground-muted">
          No se encontro esta asignacion.
        </Text>
      </SafeAreaView>
    );
  }

  const estado = estadoRuta(eventos, asignacion.canceladaEn);
  const inicioReal = horaDelPaso(eventos, 'inicio_ruta');
  const finReal = horaDelPaso(eventos, 'retorno');
  const eventosPorTipo = new Map(eventos.map((evento) => [evento.tipo, evento]));
  const puedeTerminarConIncidente = puedeRegistrar('fin_ruta_incidente', eventos);

  const pasosStepper: PasoStepperItem[] = ORDEN_PASOS.map((tipoPaso) => {
    const cumplido = eventosPorTipo.get(tipoPaso);
    if (cumplido) {
      let ubicacionCorrecta: boolean | undefined;
      if (tipoPaso === 'inicio_ruta') {
        ubicacionCorrecta = ubicacionEsCorrecta(
          cumplido.lat,
          cumplido.lng,
          asignacion.horario.ruta.paradaInicio.lat,
          asignacion.horario.ruta.paradaInicio.lng,
        );
      } else if (tipoPaso === 'fin_ruta') {
        ubicacionCorrecta = ubicacionEsCorrecta(
          cumplido.lat,
          cumplido.lng,
          asignacion.horario.ruta.paradaFin.lat,
          asignacion.horario.ruta.paradaFin.lng,
        );
      }
      return {
        tipo: tipoPaso,
        etiqueta: ETIQUETA_ACCION[tipoPaso],
        estado: 'completado',
        horaTexto: formatearHora(cumplido.ocurrioEn),
        lat: cumplido.lat,
        lng: cumplido.lng,
        sinGps: cumplido.sinGps,
        ubicacionCorrecta,
      };
    }
    return {
      tipo: tipoPaso,
      etiqueta: ETIQUETA_ACCION[tipoPaso],
      estado: tipoPaso === paso ? 'activo' : 'futuro',
    };
  });

  // Una ruta cancelada no se marca aunque sea de hoy: el supervisor ya la
  // solto y sus hitos dejaron de tener sentido.
  const puedeMarcar = paso !== null && !esSoloLectura && estado !== 'cancelada';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView className="flex-1" contentContainerClassName="gap-5 p-4">
        <CabeceraDetalleRuta
          asignacion={asignacion}
          estado={estado}
          horaInicioReal={inicioReal ? formatearHora(inicioReal) : null}
          horaFinReal={finReal ? formatearHora(finReal) : null}
        />

        <View>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-foreground">Progreso</Text>
            <Text className="text-sm font-medium tabular-nums text-primary">
              {paso ? `Paso ${eventos.length + 1} de ${ORDEN_PASOS.length}` : 'Ruta completada'}
            </Text>
          </View>
          <PasoStepper pasos={pasosStepper} />
        </View>

        {error ? <Text className="text-center text-base text-destructive">{error}</Text> : null}

        {puedeMarcar && paso ? (
          // `key` obligatoria: reinicia la fase y el contador al avanzar de
          // hito, en vez de arrastrar lo tecleado en el paso anterior.
          <PasoActivo
            key={paso}
            tipo={paso}
            registrando={registrando}
            onConfirmar={intentarRegistrar}
          />
        ) : null}

        {puedeTerminarConIncidente && !esSoloLectura ? (
          <View className="gap-2">
            <Text className="text-center text-sm text-foreground-muted">
              Si no puedes completar la ruta normalmente
            </Text>
            <BotonSecundario
              etiqueta="Terminar ruta por incidente"
              destructivo
              deshabilitado={registrando}
              onPress={() => setPidiendoIncidente(true)}
              testID="boton-terminar-incidente"
            />
          </View>
        ) : null}

        {estado === 'cancelada' ? (
          <Text className="text-center text-base text-foreground-muted">
            Esta ruta fue cancelada por el supervisor.
          </Text>
        ) : paso && esSoloLectura ? (
          <Text className="text-center text-base text-foreground-muted">
            Solo consulta: los pasos se marcan el mismo dia de la ruta.
          </Text>
        ) : null}
      </ScrollView>

      <ModalConfirmacion
        visible={pidiendoConfirmacion}
        titulo="Finalizar ruta"
        descripcion="Confirma que llegaste al punto final y deseas finalizar esta ruta. Esto no se puede deshacer desde la app."
        etiquetaConfirmar="Finalizar ruta"
        ocupado={registrando}
        onConfirmar={() => void registrar(confirmando)}
        onCancelar={() => setPidiendoConfirmacion(false)}
      />

      <ModalIncidente
        visible={pidiendoIncidente}
        ocupado={registrando}
        onSeleccionar={registrarIncidente}
        onCancelar={() => setPidiendoIncidente(false)}
      />
    </SafeAreaView>
  );
}
