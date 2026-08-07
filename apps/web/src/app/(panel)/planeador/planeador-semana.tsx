'use client';

import type { Asignar, Cancelar, Reasignar, Resultado } from '@rutas/shared';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Turno = 'manana' | 'tarde' | 'noche';

interface Horario {
  id: string;
  turno: Turno;
  horaInicioEsperada: string;
  horaFinEsperada: string;
  personasEsperadas: number;
  rutaId: string;
  rutaNombre: string;
}

interface AsignacionFila {
  id: string;
  horarioId: string;
  fecha: string;
  secuencia: number;
  choferId: string;
  choferNombre: string | null;
  camionId: string;
  camionCodigo: string;
}

interface Chofer {
  id: string;
  nombre: string | null;
}

interface Camion {
  id: string;
  codigo: string;
  estado: string;
}

interface Props {
  fechas: string[];
  horarios: Horario[];
  asignaciones: AsignacionFila[];
  choferes: Chofer[];
  camiones: Camion[];
  semanaAnteriorHref: string;
  semanaSiguienteHref: string;
  accionAsignar: (input: Asignar) => Promise<Resultado<{ id: string }>>;
  accionReasignar: (input: Reasignar) => Promise<Resultado<{ id: string }>>;
  accionCancelar: (input: Cancelar) => Promise<Resultado<{ id: string }>>;
}

const TURNOS_ORDEN: readonly Turno[] = ['manana', 'tarde', 'noche'];
const ETIQUETA_TURNO: Record<Turno, string> = { manana: 'Manana', tarde: 'Tarde', noche: 'Noche' };

function recortarHora(hora: string): string {
  return hora.slice(0, 5);
}

function nombreDia(fechaISO: string): string {
  const fecha = new Date(`${fechaISO}T00:00:00`);
  const etiqueta = fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

interface DialogoState {
  horarioId: string;
  asignacionExistente: AsignacionFila | null;
}

export function PlaneadorSemana({
  fechas,
  horarios,
  asignaciones,
  choferes,
  camiones,
  semanaAnteriorHref,
  semanaSiguienteHref,
  accionAsignar,
  accionReasignar,
  accionCancelar,
}: Props) {
  const [diaSeleccionado, setDiaSeleccionado] = useState(fechas[0] ?? '');
  const [dialogo, setDialogo] = useState<DialogoState | null>(null);

  const horariosPorTurno = useMemo(() => {
    const mapa = new Map<Turno, Horario[]>();
    for (const turno of TURNOS_ORDEN) {
      mapa.set(turno, []);
    }
    for (const h of horarios) {
      mapa.get(h.turno)?.push(h);
    }
    return mapa;
  }, [horarios]);

  const asignacionesDelDia = useMemo(
    () => asignaciones.filter((a) => a.fecha === diaSeleccionado),
    [asignaciones, diaSeleccionado],
  );

  function asignacionesDe(horarioId: string): AsignacionFila[] {
    return asignacionesDelDia.filter((a) => a.horarioId === horarioId);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="outline" size="sm">
          <Link href={semanaAnteriorHref}>Semana anterior</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={semanaSiguienteHref}>Semana siguiente</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {fechas.map((fecha) => (
          <Button
            key={fecha}
            type="button"
            size="sm"
            variant={fecha === diaSeleccionado ? 'default' : 'outline'}
            onClick={() => setDiaSeleccionado(fecha)}
          >
            {nombreDia(fecha)}
          </Button>
        ))}
      </div>

      <div className="space-y-6">
        {TURNOS_ORDEN.map((turno) => {
          const horariosDelTurno = horariosPorTurno.get(turno) ?? [];
          return (
            <section key={turno} className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">{ETIQUETA_TURNO[turno]}</h2>
              {horariosDelTurno.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin horarios en este turno.</p>
              ) : (
                <ul className="space-y-2">
                  {horariosDelTurno.map((horario) => (
                    <li key={horario.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">{horario.rutaNombre}</p>
                          <p className="text-sm tabular-nums text-muted-foreground">
                            {recortarHora(horario.horaInicioEsperada)}–
                            {recortarHora(horario.horaFinEsperada)} · {horario.personasEsperadas}{' '}
                            personas
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDialogo({ horarioId: horario.id, asignacionExistente: null })
                          }
                        >
                          Asignar
                        </Button>
                      </div>

                      {asignacionesDe(horario.id).length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {asignacionesDe(horario.id).map((a) => (
                            <li
                              key={a.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
                            >
                              <span>
                                #{a.secuencia} · {a.choferNombre ?? 'Sin nombre'} · {a.camionCodigo}
                              </span>
                              <span className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setDialogo({ horarioId: horario.id, asignacionExistente: a })
                                  }
                                >
                                  Reasignar
                                </Button>
                                <BotonCancelar
                                  asignacionId={a.id}
                                  accionCancelar={accionCancelar}
                                />
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <DialogoAsignar
        abierto={dialogo !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setDialogo(null);
        }}
        horarioId={dialogo?.horarioId ?? null}
        asignacionExistente={dialogo?.asignacionExistente ?? null}
        fecha={diaSeleccionado}
        choferes={choferes}
        camiones={camiones}
        accionAsignar={accionAsignar}
        accionReasignar={accionReasignar}
        onCerrar={() => setDialogo(null)}
      />
    </div>
  );
}

function BotonCancelar({
  asignacionId,
  accionCancelar,
}: {
  asignacionId: string;
  accionCancelar: Props['accionCancelar'];
}) {
  const [pendiente, startTransition] = useTransition();

  function cancelar() {
    if (!confirm('¿Cancelar esta asignacion? La fila y sus eventos se conservan.')) {
      return;
    }
    startTransition(async () => {
      await accionCancelar({ asignacionId });
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={pendiente} onClick={cancelar}>
      Cancelar
    </Button>
  );
}

interface FormularioAsignacion {
  choferId: string;
  camionId: string;
}

function DialogoAsignar({
  abierto,
  onOpenChange,
  horarioId,
  asignacionExistente,
  fecha,
  choferes,
  camiones,
  accionAsignar,
  accionReasignar,
  onCerrar,
}: {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  horarioId: string | null;
  asignacionExistente: AsignacionFila | null;
  fecha: string;
  choferes: Chofer[];
  camiones: Camion[];
  accionAsignar: Props['accionAsignar'];
  accionReasignar: Props['accionReasignar'];
  onCerrar: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormularioAsignacion>({
    defaultValues: {
      choferId: asignacionExistente?.choferId ?? '',
      camionId: asignacionExistente?.camionId ?? '',
    },
    values: {
      choferId: asignacionExistente?.choferId ?? '',
      camionId: asignacionExistente?.camionId ?? '',
    },
  });

  function guardar(valores: FormularioAsignacion) {
    setError(null);
    startTransition(async () => {
      const resultado =
        asignacionExistente !== null
          ? await accionReasignar({
              asignacionId: asignacionExistente.id,
              choferId: valores.choferId,
              camionId: valores.camionId,
            })
          : await accionAsignar({
              horarioId: horarioId as string,
              fecha,
              choferId: valores.choferId,
              camionId: valores.camionId,
            });
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      onCerrar();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{asignacionExistente ? 'Reasignar' : 'Asignar'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(guardar)} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="planeador-chofer" className="text-sm font-medium">
              Chofer
            </label>
            <Controller
              control={form.control}
              name="choferId"
              rules={{ required: true }}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="planeador-chofer" className="w-full">
                    <SelectValue placeholder="Selecciona un chofer" />
                  </SelectTrigger>
                  <SelectContent>
                    {choferes.map((chofer) => (
                      <SelectItem key={chofer.id} value={chofer.id}>
                        {chofer.nombre ?? chofer.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="planeador-camion" className="text-sm font-medium">
              Camion
            </label>
            <Controller
              control={form.control}
              name="camionId"
              rules={{ required: true }}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="planeador-camion" className="w-full">
                    <SelectValue placeholder="Selecciona un camion" />
                  </SelectTrigger>
                  <SelectContent>
                    {camiones.map((camion) => (
                      <SelectItem
                        key={camion.id}
                        value={camion.id}
                        disabled={camion.estado === 'mantenimiento'}
                      >
                        {camion.codigo}
                        {camion.estado === 'mantenimiento' ? ' (mantenimiento)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
