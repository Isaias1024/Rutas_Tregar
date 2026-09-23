'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type AgregarHorario,
  type EditarHorario,
  type ParadaCrear,
  type Resultado,
  type RutaCrear,
  type RutaEditar,
  rutaCrearSchema,
  rutaEditarSchema,
  TURNOS,
} from '@rutas/shared';
import { useEffect, useState, useTransition } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { AvisoAccion } from '@/components/aviso-accion';
import { type Coordenadas, SelectorParada } from '@/components/mapa/selector-parada';
import { EstadoVacio } from '@/components/estado-vacio';
import { EncabezadoPagina } from '@/components/shell/encabezado-pagina';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DialogoConfirmar } from '@/components/ui/dialogo-confirmar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Horario {
  id: string;
  turno: 'manana' | 'tarde' | 'noche';
  horaInicioEsperada: string;
  horaFinEsperada: string;
  personasEsperadas: number;
  activo: boolean;
  bloqueadaHoy: boolean;
}

interface Ruta {
  id: string;
  nombre: string;
  clienteId: string;
  clienteNombre: string;
  paradaInicioId: string;
  paradaInicioNombre: string;
  paradaFinId: string;
  paradaFinNombre: string;
  activa: boolean;
  horarios: Horario[];
}

interface Cliente {
  id: string;
  nombre: string;
}

interface Parada {
  id: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
}

type AccionRuta = (input: unknown) => Promise<Resultado<{ id: string }>>;

interface Props {
  titulo: string;
  descripcion: string;
  rutas: Ruta[];
  clientes: Cliente[];
  paradas: Parada[];
  apiKey: string | undefined;
  accionCrearRuta: (input: RutaCrear) => Promise<Resultado<{ id: string }>>;
  accionActualizarRuta: (input: RutaEditar) => Promise<Resultado<{ id: string }>>;
  accionBorrarRuta: AccionRuta;
  accionAgregarHorario: (input: AgregarHorario) => Promise<Resultado<{ id: string }>>;
  accionEditarHorario: (input: EditarHorario) => Promise<Resultado<{ id: string }>>;
  accionDesactivarHorario: AccionRuta;
  accionCrearParada: (input: ParadaCrear) => Promise<Resultado<{ id: string }>>;
}

const ETIQUETA_TURNO: Record<Horario['turno'], string> = {
  manana: 'manana',
  tarde: 'Tarde',
  noche: 'Noche',
};

function recortarHora(hora: string): string {
  return hora.slice(0, 5);
}

export function TablaRutas({
  titulo,
  descripcion,
  rutas,
  clientes,
  paradas: paradasIniciales,
  apiKey,
  accionCrearRuta,
  accionActualizarRuta,
  accionBorrarRuta,
  accionAgregarHorario,
  accionEditarHorario,
  accionDesactivarHorario,
  accionCrearParada,
}: Props) {
  const [paradas, setParadas] = useState(paradasIniciales);
  const [dialogoCrearAbierto, setDialogoCrearAbierto] = useState(false);
  const [rutaEditando, setRutaEditando] = useState<Ruta | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [porBorrar, setPorBorrar] = useState<Ruta | null>(null);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [exitoBorrado, setExitoBorrado] = useState<string | null>(null);

  const botonNuevo = (
    <Button type="button" onClick={() => setDialogoCrearAbierto(true)}>
      Nueva ruta
    </Button>
  );

  function pedirBorrado(ruta: Ruta) {
    setErrorBorrado(null);
    setExitoBorrado(null);
    setPorBorrar(ruta);
  }

  function confirmarBorrado() {
    const ruta = porBorrar;
    if (!ruta) {
      return;
    }
    setErrorBorrado(null);
    startTransition(async () => {
      // El resultado se ignoraba: un borrado rechazado dejaba la fila en pantalla
      // sin decir por que, y se leia como "el boton no hace nada".
      const resultado = await accionBorrarRuta(ruta.id);
      if (!resultado.ok) {
        setErrorBorrado(resultado.error.mensaje);
        return;
      }
      setPorBorrar(null);
      setExitoBorrado(`Ruta "${ruta.nombre}" desactivada correctamente.`);
    });
  }

  function agregarParadaNueva(parada: {
    id: string;
    nombre: string;
    direccion: string;
    lat: number;
    lng: number;
  }) {
    setParadas((actual) => [...actual, parada].sort((a, b) => a.nombre.localeCompare(b.nombre)));
  }

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo={titulo} descripcion={descripcion} acciones={botonNuevo} />
      {/* El error de un borrado se pinta dentro del dialogo, no aqui. */}
      <AvisoAccion exito={exitoBorrado} />

      <DialogoConfirmar
        abierto={porBorrar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setPorBorrar(null);
          }
        }}
        titulo="Desactivar ruta"
        descripcion={`La ruta "${porBorrar?.nombre ?? ''}" y sus horarios dejan de planearse. Las asignaciones y los eventos ya registrados se conservan en el historico.`}
        etiquetaConfirmar="Desactivar"
        error={errorBorrado}
        pendiente={pendiente}
        onConfirmar={confirmarBorrado}
      />

      {rutas.length === 0 ? (
        <Card>
          <EstadoVacio titulo="Aun no hay rutas. Crea la primera" accion={botonNuevo} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {rutas.map((ruta) => {
            const rutaBloqueada = ruta.horarios.some((h) => h.bloqueadaHoy);
            return (
              <li
                key={ruta.id}
                className="rounded-lg border border-border bg-card p-4 shadow-tarjeta"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{ruta.nombre}</p>
                    <p className="text-sm text-muted-foreground">{ruta.clienteNombre}</p>
                    <p className="text-sm text-muted-foreground">
                      {ruta.paradaInicioNombre} → {ruta.paradaFinNombre}
                    </p>
                    {rutaBloqueada ? (
                      <p className="mt-1 text-sm text-warning">
                        Ya tiene un viaje iniciado o terminado hoy: no se puede editar hasta manana.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={rutaBloqueada}
                      onClick={() => setRutaEditando(ruta)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={pendiente}
                      onClick={() => pedirBorrado(ruta)}
                    >
                      Desactivar
                    </Button>
                  </div>
                </div>

                <ListaHorarios
                  ruta={ruta}
                  accionAgregarHorario={accionAgregarHorario}
                  accionEditarHorario={accionEditarHorario}
                  accionDesactivarHorario={accionDesactivarHorario}
                />
              </li>
            );
          })}
        </ul>
      )}

      <DialogoCrearRuta
        abierto={dialogoCrearAbierto}
        onOpenChange={setDialogoCrearAbierto}
        clientes={clientes}
        paradas={paradas}
        apiKey={apiKey}
        accionCrearRuta={accionCrearRuta}
        accionCrearParada={accionCrearParada}
        onParadaCreada={agregarParadaNueva}
      />

      <DialogoEditarRuta
        ruta={rutaEditando}
        onOpenChange={(abierto) => {
          if (!abierto) setRutaEditando(null);
        }}
        clientes={clientes}
        paradas={paradas}
        apiKey={apiKey}
        accionActualizarRuta={accionActualizarRuta}
        accionCrearParada={accionCrearParada}
        onParadaCreada={agregarParadaNueva}
      />
    </div>
  );
}

function ListaHorarios({
  ruta,
  accionAgregarHorario,
  accionEditarHorario,
  accionDesactivarHorario,
}: {
  ruta: Ruta;
  accionAgregarHorario: Props['accionAgregarHorario'];
  accionEditarHorario: Props['accionEditarHorario'];
  accionDesactivarHorario: Props['accionDesactivarHorario'];
}) {
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [turno, setTurno] = useState<Horario['turno']>('manana');
  const [horaInicio, setHoraInicio] = useState('06:00');
  const [horaFin, setHoraFin] = useState('06:30');
  const [personas, setPersonas] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [errorHorario, setErrorHorario] = useState<string | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function abrirCrear() {
    setEditandoId(null);
    setTurno('manana');
    setHoraInicio('06:00');
    setHoraFin('06:30');
    setPersonas(1);
    setError(null);
    setFormularioAbierto(true);
  }

  function abrirEditar(horarioAEditar: Horario) {
    setEditandoId(horarioAEditar.id);
    setTurno(horarioAEditar.turno);
    setHoraInicio(recortarHora(horarioAEditar.horaInicioEsperada));
    setHoraFin(recortarHora(horarioAEditar.horaFinEsperada));
    setPersonas(horarioAEditar.personasEsperadas);
    setError(null);
    setFormularioAbierto(true);
  }

  function cerrarFormulario() {
    setFormularioAbierto(false);
    setEditandoId(null);
  }

  function guardar() {
    setError(null);
    startTransition(async () => {
      const resultado = editandoId
        ? await accionEditarHorario({
            id: editandoId,
            turno,
            horaInicioEsperada: horaInicio,
            horaFinEsperada: horaFin,
            personasEsperadas: personas,
          })
        : await accionAgregarHorario({
            rutaId: ruta.id,
            turno,
            horaInicioEsperada: horaInicio,
            horaFinEsperada: horaFin,
            personasEsperadas: personas,
          });
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      cerrarFormulario();
    });
  }

  function confirmarDesactivacion() {
    const horarioId = porDesactivar;
    if (!horarioId) {
      return;
    }
    setErrorHorario(null);
    startTransition(async () => {
      // Mismo caso que "Borrar ruta": sin esto, un rechazo dejaba el horario en
      // pantalla sin explicacion y se leia como un boton muerto.
      const resultado = await accionDesactivarHorario(horarioId);
      if (!resultado.ok) {
        setErrorHorario(resultado.error.mensaje);
        return;
      }
      setPorDesactivar(null);
    });
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <DialogoConfirmar
        abierto={porDesactivar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setPorDesactivar(null);
          }
        }}
        titulo="Desactivar horario"
        descripcion="El horario deja de planearse, pero se conserva junto con las asignaciones y los eventos que ya tiene."
        etiquetaConfirmar="Desactivar"
        error={errorHorario}
        pendiente={pendiente}
        onConfirmar={confirmarDesactivacion}
      />
      {ruta.horarios.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin horarios activos.</p>
      ) : (
        <ul className="space-y-1">
          {ruta.horarios.map((horario) => (
            <li
              key={horario.id}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <Badge variant="secondary">{ETIQUETA_TURNO[horario.turno]}</Badge>
                <span className="tabular-nums">
                  {recortarHora(horario.horaInicioEsperada)}–{recortarHora(horario.horaFinEsperada)}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {horario.personasEsperadas} personas
                </span>
                {horario.bloqueadaHoy ? (
                  <span className="text-warning" title="Ya tiene un viaje iniciado o terminado hoy">
                    (en curso hoy)
                  </span>
                ) : null}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendiente || horario.bloqueadaHoy}
                  onClick={() => abrirEditar(horario)}
                >
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendiente}
                  onClick={() => setPorDesactivar(horario.id)}
                >
                  Desactivar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formularioAbierto ? (
        <div className="space-y-2 rounded-md border border-border bg-surface p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Select value={turno} onValueChange={(v) => setTurno(v as Horario['turno'])}>
              <SelectTrigger className="w-full" aria-label="Turno">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TURNOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ETIQUETA_TURNO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              aria-label="Hora de inicio"
            />
            <Input
              type="time"
              value={horaFin}
              onChange={(e) => setHoraFin(e.target.value)}
              aria-label="Hora de fin"
            />
            <Input
              type="number"
              min={1}
              value={personas}
              onChange={(e) => setPersonas(Number(e.target.value))}
              aria-label="Personas esperadas"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pendiente} onClick={guardar}>
              Guardar horario
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={cerrarFormulario}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={abrirCrear}>
          Agregar horario
        </Button>
      )}
    </div>
  );
}

function CampoParada({
  id,
  etiqueta,
  valor,
  onChange,
  paradas,
  apiKey,
  accionCrearParada,
  onParadaCreada,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (id: string) => void;
  paradas: Parada[];
  apiKey: string | undefined;
  accionCrearParada: Props['accionCrearParada'];
  onParadaCreada: (parada: Parada) => void;
}) {
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [coordenadas, setCoordenadas] = useState<Coordenadas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function abrir() {
    setNombre('');
    setDireccion('');
    setCoordenadas(null);
    setError(null);
    setDialogoAbierto(true);
  }

  function guardar() {
    setError(null);
    startTransition(async () => {
      const resultado = await accionCrearParada({
        nombre,
        direccion,
        lat: coordenadas?.lat ?? Number.NaN,
        lng: coordenadas?.lng ?? Number.NaN,
      });
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      onParadaCreada({
        id: resultado.data.id,
        nombre,
        direccion,
        lat: coordenadas?.lat ?? 0,
        lng: coordenadas?.lng ?? 0,
      });
      onChange(resultado.data.id);
      setDialogoAbierto(false);
    });
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <div className="flex gap-2">
        <Select value={valor} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Selecciona una parada" />
          </SelectTrigger>
          <SelectContent>
            {paradas.map((parada) => (
              <SelectItem key={parada.id} value={parada.id}>
                {parada.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={abrir}>
          Nueva
        </Button>
      </div>

      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Nueva parada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="nueva-parada-nombre" className="text-sm font-medium">
                Nombre
              </label>
              <Input
                id="nueva-parada-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <SelectorParada
              apiKey={apiKey}
              direccion={direccion}
              coordenadas={coordenadas}
              onDireccionChange={setDireccion}
              onCoordenadasChange={setCoordenadas}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" disabled={pendiente} onClick={guardar}>
                Crear
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DialogoCrearRuta({
  abierto,
  onOpenChange,
  clientes,
  paradas,
  apiKey,
  accionCrearRuta,
  accionCrearParada,
  onParadaCreada,
}: {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  clientes: Cliente[];
  paradas: Parada[];
  apiKey: string | undefined;
  accionCrearRuta: Props['accionCrearRuta'];
  accionCrearParada: Props['accionCrearParada'];
  onParadaCreada: (parada: Parada) => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<RutaCrear>({
    resolver: zodResolver(rutaCrearSchema),
    defaultValues: {
      clienteId: '',
      nombre: '',
      paradaInicioId: '',
      paradaFinId: '',
      horarios: [
        {
          turno: 'manana',
          horaInicioEsperada: '06:00',
          horaFinEsperada: '06:30',
          personasEsperadas: 1,
        },
      ],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'horarios' });

  function cerrar() {
    form.reset({
      clienteId: '',
      nombre: '',
      paradaInicioId: '',
      paradaFinId: '',
      horarios: [
        {
          turno: 'manana',
          horaInicioEsperada: '06:00',
          horaFinEsperada: '06:30',
          personasEsperadas: 1,
        },
      ],
    });
    setError(null);
    onOpenChange(false);
  }

  function guardar(valores: RutaCrear) {
    setError(null);
    startTransition(async () => {
      const resultado = await accionCrearRuta(valores);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      cerrar();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? onOpenChange(true) : cerrar())}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Nueva ruta</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(guardar)} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="ruta-cliente-crear" className="text-sm font-medium">
              Cliente
            </label>
            <Controller
              control={form.control}
              name="clienteId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ruta-cliente-crear" className="w-full">
                    <SelectValue placeholder="Selecciona un cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((cliente) => (
                      <SelectItem key={cliente.id} value={cliente.id}>
                        {cliente.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="ruta-nombre-crear" className="text-sm font-medium">
              Nombre
            </label>
            <Input id="ruta-nombre-crear" {...form.register('nombre')} />
          </div>

          <Controller
            control={form.control}
            name="paradaInicioId"
            render={({ field }) => (
              <CampoParada
                id="ruta-parada-inicio-crear"
                etiqueta="Parada de inicio"
                valor={field.value}
                onChange={field.onChange}
                paradas={paradas}
                apiKey={apiKey}
                accionCrearParada={accionCrearParada}
                onParadaCreada={onParadaCreada}
              />
            )}
          />

          <Controller
            control={form.control}
            name="paradaFinId"
            render={({ field }) => (
              <CampoParada
                id="ruta-parada-fin-crear"
                etiqueta="Parada de fin"
                valor={field.value}
                onChange={field.onChange}
                paradas={paradas}
                apiKey={apiKey}
                accionCrearParada={accionCrearParada}
                onParadaCreada={onParadaCreada}
              />
            )}
          />
          {form.formState.errors.paradaFinId ? (
            <p className="text-sm text-destructive">{form.formState.errors.paradaFinId.message}</p>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium">Horarios</p>
            {fields.map((campo, indice) => (
              <div key={campo.id} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Controller
                  control={form.control}
                  name={`horarios.${indice}.turno`}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full" aria-label="Turno">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TURNOS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {ETIQUETA_TURNO[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Input
                  type="time"
                  aria-label="Hora de inicio"
                  {...form.register(`horarios.${indice}.horaInicioEsperada`)}
                />
                <Input
                  type="time"
                  aria-label="Hora de fin"
                  {...form.register(`horarios.${indice}.horaFinEsperada`)}
                />
                <Input
                  type="number"
                  min={1}
                  aria-label="Personas esperadas"
                  {...form.register(`horarios.${indice}.personasEsperadas`, {
                    valueAsNumber: true,
                  })}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={fields.length <= 1}
                  onClick={() => remove(indice)}
                >
                  Quitar
                </Button>
                {form.formState.errors.horarios?.[indice]?.horaFinEsperada?.message ||
                form.formState.errors.horarios?.[indice]?.personasEsperadas?.message ? (
                  <p className="col-span-full text-sm text-destructive">
                    {form.formState.errors.horarios?.[indice]?.horaFinEsperada?.message ??
                      form.formState.errors.horarios?.[indice]?.personasEsperadas?.message}
                  </p>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  turno: 'manana',
                  horaInicioEsperada: '06:00',
                  horaFinEsperada: '06:30',
                  personasEsperadas: 1,
                })
              }
            >
              Agregar horario
            </Button>
            {form.formState.errors.horarios?.message ? (
              <p className="text-sm text-destructive">{form.formState.errors.horarios.message}</p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              Crear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoEditarRuta({
  ruta,
  onOpenChange,
  clientes,
  paradas,
  apiKey,
  accionActualizarRuta,
  accionCrearParada,
  onParadaCreada,
}: {
  ruta: Ruta | null;
  onOpenChange: (abierto: boolean) => void;
  clientes: Cliente[];
  paradas: Parada[];
  apiKey: string | undefined;
  accionActualizarRuta: Props['accionActualizarRuta'];
  accionCrearParada: Props['accionCrearParada'];
  onParadaCreada: (parada: Parada) => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<RutaEditar>({ resolver: zodResolver(rutaEditarSchema) });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `form.reset` (de useForm) es estable entre renders.
  useEffect(() => {
    if (ruta) {
      form.reset({
        id: ruta.id,
        clienteId: ruta.clienteId,
        nombre: ruta.nombre,
        paradaInicioId: ruta.paradaInicioId,
        paradaFinId: ruta.paradaFinId,
      });
      setError(null);
    }
  }, [ruta]);

  function guardar(valores: RutaEditar) {
    setError(null);
    startTransition(async () => {
      const resultado = await accionActualizarRuta(valores);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={ruta !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Editar ruta</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(guardar)} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="ruta-cliente-editar" className="text-sm font-medium">
              Cliente
            </label>
            <Controller
              control={form.control}
              name="clienteId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ruta-cliente-editar" className="w-full">
                    <SelectValue placeholder="Selecciona un cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((cliente) => (
                      <SelectItem key={cliente.id} value={cliente.id}>
                        {cliente.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="ruta-nombre-editar" className="text-sm font-medium">
              Nombre
            </label>
            <Input id="ruta-nombre-editar" {...form.register('nombre')} />
          </div>

          <Controller
            control={form.control}
            name="paradaInicioId"
            render={({ field }) => (
              <CampoParada
                id="ruta-parada-inicio-editar"
                etiqueta="Parada de inicio"
                valor={field.value}
                onChange={field.onChange}
                paradas={paradas}
                apiKey={apiKey}
                accionCrearParada={accionCrearParada}
                onParadaCreada={onParadaCreada}
              />
            )}
          />

          <Controller
            control={form.control}
            name="paradaFinId"
            render={({ field }) => (
              <CampoParada
                id="ruta-parada-fin-editar"
                etiqueta="Parada de fin"
                valor={field.value}
                onChange={field.onChange}
                paradas={paradas}
                apiKey={apiKey}
                accionCrearParada={accionCrearParada}
                onParadaCreada={onParadaCreada}
              />
            )}
          />
          {form.formState.errors.paradaFinId ? (
            <p className="text-sm text-destructive">{form.formState.errors.paradaFinId.message}</p>
          ) : null}

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
