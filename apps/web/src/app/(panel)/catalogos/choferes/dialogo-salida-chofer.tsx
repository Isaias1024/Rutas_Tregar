'use client';

import type { Resultado } from '@rutas/shared';
import { useEffect, useState } from 'react';
import { DialogoConfirmar } from '@/components/ui/dialogo-confirmar';

export interface RutaActiva {
  asignacionId: string;
  fecha: string;
  turno: string;
  horaInicioEsperada: string;
  rutaNombre: string;
  camionCodigo: string;
}

export type TipoSalida = 'borrar' | 'baja';

interface Props {
  /** El chofer que se va, o `null` si el dialogo esta cerrado. */
  chofer: { id: string; nombre: string } | null;
  tipo: TipoSalida;
  pendiente: boolean;
  error: string | null;
  onCerrar: () => void;
  onConfirmar: () => void;
  accionConsultarRutas: (input: unknown) => Promise<Resultado<RutaActiva[]>>;
}

function etiquetaFecha(fecha: string, hoy: string): string {
  if (fecha === hoy) {
    return 'Hoy';
  }
  const dia = new Date(`${fecha}T00:00:00`);
  const texto = dia.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * La confirmacion de "este chofer se va", con las rutas que va a soltar.
 *
 * Las rutas se piden al abrir y no se precargan con la tabla: son de hoy en
 * adelante, cambian con cada asignacion del planeador, y una lista traida
 * cuando se pinto la pagina podria enseñar rutas que ya se reasignaron. Lo que
 * se muestra aqui sale de la MISMA consulta que el servidor usa para
 * liberarlas, asi que la lista confirmada y la accion aplicada no divergen.
 */
export function DialogoSalidaChofer({
  chofer,
  tipo,
  pendiente,
  error,
  onCerrar,
  onConfirmar,
  accionConsultarRutas,
}: Props) {
  const [rutas, setRutas] = useState<RutaActiva[] | null>(null);
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null);
  const choferId = chofer?.id ?? null;

  useEffect(() => {
    if (!choferId) {
      setRutas(null);
      setErrorConsulta(null);
      return;
    }
    let vigente = true;
    setRutas(null);
    setErrorConsulta(null);
    accionConsultarRutas(choferId).then((resultado) => {
      // El dialogo pudo cerrarse (o cambiar de chofer) mientras la consulta
      // viajaba: sin esta guarda, la respuesta vieja pisaba la nueva.
      if (!vigente) {
        return;
      }
      if (resultado.ok) {
        setRutas(resultado.data);
      } else {
        setErrorConsulta(resultado.error.mensaje);
      }
    });
    return () => {
      vigente = false;
    };
  }, [choferId, accionConsultarRutas]);

  const nombre = chofer?.nombre ?? '';
  const hoy = new Date().toISOString().slice(0, 10);

  const descripcion =
    tipo === 'baja'
      ? `Se borran el nombre, el correo y el telefono de "${nombre}" de forma permanente (LFPDPPP) y se revoca su acceso. Sus rutas y eventos historicos se conservan. No se puede deshacer.`
      : `"${nombre}" deja de aparecer en el catalogo y de poder asignarse. Sigue disponible en el historico.`;

  return (
    <DialogoConfirmar
      abierto={chofer !== null}
      onOpenChange={(abierto) => {
        if (!abierto) {
          onCerrar();
        }
      }}
      titulo={tipo === 'baja' ? 'Dar de baja al chofer' : 'Borrar chofer'}
      descripcion={descripcion}
      detalle={<DetalleRutas nombre={nombre} rutas={rutas} error={errorConsulta} hoy={hoy} />}
      etiquetaConfirmar={tipo === 'baja' ? 'Dar de baja' : 'Borrar'}
      error={error}
      pendiente={pendiente}
      onConfirmar={onConfirmar}
    />
  );
}

function DetalleRutas({
  nombre,
  rutas,
  error,
  hoy,
}: {
  nombre: string;
  rutas: RutaActiva[] | null;
  error: string | null;
  hoy: string;
}) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        No se pudieron consultar sus rutas: {error}
      </p>
    );
  }

  if (rutas === null) {
    return <p className="text-sm text-muted-foreground">Consultando sus rutas asignadas…</p>;
  }

  if (rutas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No tiene rutas asignadas de hoy en adelante.</p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
      <p className="text-sm font-medium text-foreground">
        {nombre} tiene {rutas.length}{' '}
        {rutas.length === 1 ? 'ruta activa o futura' : 'rutas activas o futuras'}. Si continuas, se
        le quitan y esos horarios quedan libres para otro chofer:
      </p>
      <ul className="space-y-1">
        {rutas.map((ruta) => (
          <li key={ruta.asignacionId} className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{ruta.rutaNombre}</span> —{' '}
            {etiquetaFecha(ruta.fecha, hoy)}{' '}
            <span className="tabular-nums">{ruta.horaInicioEsperada.slice(0, 5)}</span> ·{' '}
            {ruta.camionCodigo}
          </li>
        ))}
      </ul>
    </div>
  );
}
