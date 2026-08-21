import { ORDEN_PASOS, siguientePaso, type TipoEvento } from '@rutas/shared';
import { AlertTriangleIcon, CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ETIQUETA_PASO, ICONO_PASO } from './etiquetas-paso';
import { horaTexto } from './formato';

type EstadoPaso = 'completado' | 'activo' | 'pendiente';

interface Props {
  eventos: { tipo: TipoEvento; ocurrioEn: Date }[];
  horaInicioEsperada: string;
  horaFinEsperada: string;
  personasEsperadas: number;
  cntAbordaron: number | null;
  cntRetornaron: number | null;
  sospechoso: boolean;
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

/** `HH:mm` esperada de este paso, o `null` si el paso no tiene una (§2 UI monitor). */
function horaEsperadaDe(
  tipo: TipoEvento,
  horaInicioEsperada: string,
  horaFinEsperada: string,
): string | null {
  if (tipo === 'inicio_ruta') return horaInicioEsperada.slice(0, 5);
  if (tipo === 'fin_ruta') return horaFinEsperada.slice(0, 5);
  return null;
}

/** Texto compacto de personas para este paso: solo `fin_ruta` y `retorno` cuentan (§3-5 UI monitor). */
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
      ? `${personasEsperadas} esp. · ${reales} real`
      : `Esperadas: ${personasEsperadas}`;
  }
  if (tipo === 'retorno' && estado === 'completado' && cntRetornaron !== null) {
    return `Reales: ${cntRetornaron}`;
  }
  return null;
}

/**
 * Los cinco hitos como linea de tiempo: vertical en mobile (una sola columna
 * legible sin scroll horizontal, §movil), horizontal cuando la tarjeta misma
 * (no la ventana) ya tiene ancho para los cinco pasos en fila — por eso la
 * consulta es de contenedor (`@xl:`), no de viewport: en un grid de varias
 * columnas la tarjeta puede seguir angosta aunque la pantalla sea ancha.
 */
export function PasoTimeline({
  eventos,
  horaInicioEsperada,
  horaFinEsperada,
  personasEsperadas,
  cntAbordaron,
  cntRetornaron,
  sospechoso,
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

        const horaEsperadaTexto = horaEsperadaDe(tipo, horaInicioEsperada, horaFinEsperada);
        const horaRealTexto = cumplido ? horaTexto(cumplido.ocurrioEn.getTime()) : null;
        const personasTexto = personasDe(
          tipo,
          estado,
          personasEsperadas,
          cntAbordaron,
          cntRetornaron,
        );

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
                  horaEsperadaTexto ? (
                    <>
                      Esp. {horaEsperadaTexto}
                      <span className="mx-1 text-border">·</span>
                      <span className="font-medium text-foreground">
                        Real {horaRealTexto ?? '—'}
                      </span>
                    </>
                  ) : (
                    (horaRealTexto ?? 'Completado')
                  )
                ) : estado === 'activo' ? (
                  horaEsperadaTexto ? (
                    `Esperada ${horaEsperadaTexto}`
                  ) : (
                    'En progreso'
                  )
                ) : horaEsperadaTexto ? (
                  `Esperada ${horaEsperadaTexto}`
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
            </div>
          </li>
        );
      })}
    </ol>
  );
}
