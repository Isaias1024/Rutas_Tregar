import {
  horaEsperadaTexto,
  ORDEN_PASOS,
  siguientePaso,
  type TipoEvento,
  ubicacionEsCorrecta,
} from '@rutas/shared';
import { AlertTriangleIcon, CheckIcon, MapPinOffIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ETIQUETA_PASO, ICONO_PASO } from './etiquetas-paso';
import { horaTexto } from './formato';

type EstadoPaso = 'completado' | 'activo' | 'pendiente';

interface EventoConUbicacion {
  tipo: TipoEvento;
  ocurrioEn: Date;
  lat: number | null;
  lng: number | null;
  sinGps: boolean;
}

interface Props {
  eventos: EventoConUbicacion[];
  horaInicioEsperada: string;
  horaFinEsperada: string;
  personasEsperadas: number;
  cntAbordaron: number | null;
  cntRetornaron: number | null;
  sospechoso: boolean;
  /** Coordenadas de la parada de inicio y fin, solo para el flag de ubicacion. */
  paradaInicio: { lat: number; lng: number };
  paradaFin: { lat: number; lng: number };
}

function circulo(estado: EstadoPaso) {
  if (estado === 'completado') {
    return 'bg-primary text-primary-foreground';
  }
  if (estado === 'activo') {
    return 'border-2 border-primary bg-primary-tint text-primary';
  }
  return 'border border-border bg-background text-muted-foreground';
}

/** Hora esperada de este paso en 12h, o `null` si el paso no tiene una. */
function horaEsperadaDe(
  tipo: TipoEvento,
  horaInicioEsperada: string,
  horaFinEsperada: string,
): string | null {
  if (tipo === 'inicio_ruta') return horaEsperadaTexto(horaInicioEsperada);
  if (tipo === 'fin_ruta') return horaEsperadaTexto(horaFinEsperada);
  return null;
}

/** Texto declarativo de personas: solo `fin_ruta` y `retorno` llevan contador. */
function personasDe(
  tipo: TipoEvento,
  estado: EstadoPaso,
  personasEsperadas: number,
  cntAbordaron: number | null,
  cntRetornaron: number | null,
): string | null {
  if (tipo === 'fin_ruta') {
    const reales = estado === 'completado' ? cntAbordaron : null;
    return reales !== null
      ? `Personas esperadas: ${personasEsperadas} · reales: ${reales}`
      : `Personas esperadas: ${personasEsperadas}`;
  }
  if (tipo === 'retorno' && estado === 'completado' && cntRetornaron !== null) {
    return `Personas que regresan: ${cntRetornaron}`;
  }
  return null;
}

/**
 * Parada esperada para el flag de ubicacion: inicio en `listo_inicio` e
 * `inicio_ruta`, fin en `fin_ruta`. Los demas pasos no exigen una ubicacion.
 */
function paradaEsperadaDe(
  tipo: TipoEvento,
  paradaInicio: { lat: number; lng: number },
  paradaFin: { lat: number; lng: number },
): { lat: number; lng: number } | null {
  if (tipo === 'listo_inicio' || tipo === 'inicio_ruta') return paradaInicio;
  if (tipo === 'fin_ruta') return paradaFin;
  return null;
}

/**
 * Los cinco hitos como linea de tiempo. La consulta es de contenedor (`@xl:`) y
 * no de viewport: en un grid la tarjeta puede seguir angosta con la pantalla ancha.
 */
export function PasoTimeline({
  eventos,
  horaInicioEsperada,
  horaFinEsperada,
  personasEsperadas,
  cntAbordaron,
  cntRetornaron,
  sospechoso,
  paradaInicio,
  paradaFin,
}: Props) {
  const eventosPorTipo = new Map(eventos.map((evento) => [evento.tipo, evento]));
  const siguiente = siguientePaso(eventos.map((evento) => ({ tipo: evento.tipo })));

  return (
    <ol className="flex flex-col @xl:flex-row">
      {ORDEN_PASOS.map((tipo, indice) => {
        const cumplido = eventosPorTipo.get(tipo);
        const estado: EstadoPaso = cumplido
          ? 'completado'
          : tipo === siguiente
            ? 'activo'
            : 'pendiente';
        const esUltimo = indice === ORDEN_PASOS.length - 1;
        const Icono = ICONO_PASO[tipo];

        const horaEsperadaDelPaso = horaEsperadaDe(tipo, horaInicioEsperada, horaFinEsperada);
        const horaRealTexto = cumplido ? horaTexto(cumplido.ocurrioEn.getTime()) : null;
        const personasTexto = personasDe(
          tipo,
          estado,
          personasEsperadas,
          cntAbordaron,
          cntRetornaron,
        );

        // `false` explicito, nunca `undefined` (sin GPS, o la parada sin
        // coordenadas): ahi no hay nada que contradecir.
        const paradaEsperada = paradaEsperadaDe(tipo, paradaInicio, paradaFin);
        const ubicacionDistinta =
          cumplido && !cumplido.sinGps && paradaEsperada
            ? ubicacionEsCorrecta(
                cumplido.lat,
                cumplido.lng,
                paradaEsperada.lat,
                paradaEsperada.lng,
              ) === false
            : false;

        return (
          <li
            key={tipo}
            className="flex gap-2.5 @xl:flex-1 @xl:flex-col @xl:items-center @xl:gap-1.5"
          >
            <div className="flex flex-col items-center @xl:w-full @xl:flex-row">
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full',
                  circulo(estado),
                )}
              >
                {estado === 'completado' ? (
                  <CheckIcon aria-hidden="true" className="size-3" />
                ) : (
                  <Icono aria-hidden="true" className="size-3" />
                )}
              </span>
              {esUltimo ? null : (
                <span
                  aria-hidden="true"
                  className={cn(
                    'w-0.5 flex-1 @xl:h-0.5 @xl:w-auto',
                    estado === 'completado' ? 'bg-primary' : 'bg-border',
                  )}
                  style={{ minHeight: 12 }}
                />
              )}
            </div>
            <div className="min-w-0 pb-3 @xl:px-1 @xl:pb-0 @xl:text-center">
              <p
                className={cn(
                  'text-xs',
                  estado === 'pendiente' ? 'text-muted-foreground' : 'font-medium text-foreground',
                )}
              >
                {ETIQUETA_PASO[tipo]}
              </p>
              <p className="text-[0.6875rem] tabular-nums text-muted-foreground">
                {estado === 'completado' ? (
                  horaEsperadaDelPaso ? (
                    <>
                      Hora esperada: {horaEsperadaDelPaso}
                      <span className="mx-1 text-border">·</span>
                      <span className="font-medium text-foreground">
                        real: {horaRealTexto ?? '—'}
                      </span>
                    </>
                  ) : (
                    (horaRealTexto ?? 'Completado')
                  )
                ) : estado === 'activo' ? (
                  horaEsperadaDelPaso ? (
                    `Hora esperada: ${horaEsperadaDelPaso}`
                  ) : (
                    'En progreso'
                  )
                ) : horaEsperadaDelPaso ? (
                  `Hora esperada: ${horaEsperadaDelPaso}`
                ) : (
                  'Sin registrar'
                )}
              </p>
              {personasTexto ? (
                <p className="text-[0.6875rem] tabular-nums text-muted-foreground">
                  {personasTexto}
                </p>
              ) : null}
              {tipo === 'inicio_ruta' && sospechoso ? (
                <p className="flex items-center gap-1 text-[0.6875rem] font-medium text-warning @xl:justify-center">
                  <AlertTriangleIcon aria-hidden="true" className="size-3 shrink-0" />
                  Hora distinta
                </p>
              ) : null}
              {ubicacionDistinta ? (
                <p className="flex items-center gap-1 text-[0.6875rem] font-medium text-warning @xl:justify-center">
                  <MapPinOffIcon aria-hidden="true" className="size-3 shrink-0" />
                  Otra ubicacion
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
