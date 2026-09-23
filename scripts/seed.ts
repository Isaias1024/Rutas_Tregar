process.loadEnvFile('.env');

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { count, eq, sql } from 'drizzle-orm';
import {
  asignacion,
  camion,
  cliente,
  db,
  evento,
  horario,
  parada,
  perfilPersonal,
  ruta,
  usuario,
} from '../packages/shared/src/db/index.ts';
import { fechaOperativa } from '../packages/shared/src/estado.ts';
import type { TipoEvento, TipoIncidente } from '../packages/shared/src/flujo.ts';

/**
 * Semilla de desarrollo DESTRUCTIVA: cada corrida vacia las doce tablas y
 * las vuelve a llenar con el mismo conjunto fijo.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'scripts/seed.ts: faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env. Corre `pnpm db:up && pnpm env:write` primero.',
  );
  process.exit(1);
}

// Guarda de seguridad: esta semilla BORRA TODO, incluidas las cuentas de Auth.
// `--forzar` existe solo para un staging desechable.
const esLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(supabaseUrl);
if (!esLocal && !process.argv.includes('--forzar')) {
  console.error(
    `scripts/seed.ts: ${supabaseUrl} no es local y esta semilla BORRA TODOS los datos.\n` +
      'Si de verdad quieres vaciar ese entorno, vuelve a correr con --forzar.',
  );
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Un solo lugar define usuarios y contrasenas: lo que se siembra es
// literalmente lo que se imprime al final.

const PASSWORD_ADMIN = 'Admin123!';
const PASSWORD_SUPERVISOR = 'Supervisor123!';
const PASSWORD_CHOFER = 'Driver123!';

type UsuarioPanel = {
  credencial: string;
  correo: string;
  password: string;
  rol: 'admin' | 'supervisor';
  nombre: string;
};

const USUARIOS_PANEL: UsuarioPanel[] = [
  {
    credencial: 'admin',
    correo: 'admin@test.com',
    password: PASSWORD_ADMIN,
    rol: 'admin',
    nombre: 'Administrator Test',
  },
  {
    credencial: 'supervisor',
    correo: 'supervisor@test.com',
    password: PASSWORD_SUPERVISOR,
    rol: 'supervisor',
    nombre: 'Supervisor Test',
  },
];

type Chofer = {
  credencial: string;
  nombre: string;
  apellido: string;
  correoContacto: string;
  telefono: string;
};

// El chofer teclea `credencial`, no un correo, y la app sintetiza
// `<credencial>@choferes.rutas.local`: con otro correo en Auth el login falla.
const CHOFERES: Chofer[] = [
  {
    credencial: 'driver1',
    nombre: 'Isaias',
    apellido: 'Barajas',
    correoContacto: 'driver1@test.com',
    telefono: '8110000001',
  },
  {
    credencial: 'driver2',
    nombre: 'Karla',
    apellido: 'Esparza',
    correoContacto: 'driver2@test.com',
    telefono: '8110000002',
  },
  {
    credencial: 'driver3',
    nombre: 'Leonel',
    apellido: 'De La Garza',
    correoContacto: 'driver3@test.com',
    telefono: '8110000003',
  },
];

function correoDeChofer(credencial: string): string {
  return `${credencial}@choferes.rutas.local`;
}

// Coordenadas reales del area metropolitana de Monterrey: el panel las pinta en
// un mapa y una parada en medio del mar se nota de inmediato.
const PARADAS = [
  {
    nombre: 'Av. Constitución & Av. Laderas',
    direccion: 'Av. Constitución & Av. Laderas',
    lat: 25.8406212,
    lng: -100.4073241,
  },
  {
    nombre: 'Cadereyta Jiménez',
    direccion: 'HXM7+XH6 Cadereyta Jiménez, Nuevo León, México',
    lat: 25.584903,
    lng: -100.036116,
  },
  {
    nombre: 'Cdad. Benito Juárez',
    direccion: 'MW39+VRX Cdad. Benito Juárez, Nuevo León, México',
    lat: 25.654747,
    lng: -100.080382,
  },
  {
    nombre: 'C. San Lucas & Cam. A San Javier',
    direccion: 'C. San Lucas & Cam. A San Javier',
    lat: 25.7380904,
    lng: -100.135478,
  },
  {
    nombre: 'Av. Abraham Lincoln PTE - OTE (Parada de autobús)',
    direccion: 'GAR-0265 Av. Abraham Lincoln PTE - OTE (Parada de autobús)',
    lat: 25.80596,
    lng: -100.56027,
  },
  {
    nombre: 'Fraccionamiento Real Palmas, Nuevo León, México',
    direccion: 'WR2Q+5FQ Fraccionamiento Real Palmas, Nuevo León, México',
    lat: 25.900463,
    lng: -100.161257,
  },
  {
    nombre: 'Banorte (Ciénega de Flores)',
    direccion: 'Banorte (Ciénega de Flores)',
    lat: 25.9527542,
    lng: -100.1682797,
  },
  {
    nombre: 'S-Mart (Carr. A Reynosa, Guadalupe)',
    direccion: 'S-Mart (Carr. A Reynosa, Guadalupe',
    lat: 25.6611818,
    lng: -100.1493921,
  },
  {
    nombre: 'Cedis Michelin',
    direccion: 'Cedis Michelin',
    lat: 25.8770089,
    lng: -100.2340557,
  },
  {
    nombre: 'CEVA Lenovo',
    direccion: 'CEVA Logistics (Lenovo Stand Alone)',
    lat: 25.7896213,
    lng: -100.1676254,
  },
  {
    nombre: 'CEVA Mty',
    direccion: 'CEVA Logistics Monterrey',
    lat: 25.7623993,
    lng: -100.1283012,
  },
  {
    nombre: 'CEVA Apodaca',
    direccion: 'CEVA Logistics MTY (Apodaca)',
    lat: 25.7713358,
    lng: -100.1438705,
  },
  {
    nombre: 'Laboratorios Griffith',
    direccion: 'Laboratorios Griffith de México',
    lat: 25.685572,
    lng: -100.4628042,
  },
  {
    nombre: 'Rosenberger',
    direccion: 'Rosenberger Mexico SA de CV',
    lat: 25.7585531,
    lng: -100.119366,
  },
  {
    nombre: 'SEAH Precision Apodaca',
    direccion: 'SEAH Precision Mexico - Planta Apodaca',
    lat: 25.7774548,
    lng: -100.1631919,
  },
] as const;

// Solo los tipos que el formulario ofrece (`TIPOS_CAMION`): la semilla no
// puede sembrar uno que el panel no deje elegir.
const CAMIONES = [
  { codigo: 'T01', tipo: 'Van', placas: 'NLE-0101-A' },
  { codigo: 'T02', tipo: 'Autobus', placas: 'NLE-0202-B' },
  { codigo: 'T03', tipo: 'Urvan', placas: 'NLE-0303-C' },
] as const;

// Una ruta SIN horario no existe en este modelo: `rutaCrearSchema` exige
// `min(1)` y el Planeador arma su cuadricula desde `horario`, no desde `ruta`.
const RUTAS = [
  {
    nombre: 'CEVA - ESCOBEDO',
    inicio: 'Av. Constitución & Av. Laderas',
    fin: 'CEVA Lenovo',
    turno: 'manana' as const,
    horaInicioEsperada: '04:10',
    horaFinEsperada: '05:10',
    personasEsperadas: 20,
  },
  {
    nombre: 'ROSENBERGER - CADEREYTA',
    inicio: 'Cadereyta Jiménez',
    fin: 'Rosenberger',
    turno: 'tarde' as const,
    horaInicioEsperada: '14:00',
    horaFinEsperada: '15:00',
    personasEsperadas: 18,
  },
  {
    nombre: 'CEVA GP - JUAREZ',
    inicio: 'Cdad. Benito Juárez',
    fin: 'CEVA Mty',
    turno: 'noche' as const,
    horaInicioEsperada: '20:00',
    horaFinEsperada: '21:00',
    personasEsperadas: 15,
  },
  {
    nombre: 'SEAH APODACA - SAN LUCAS',
    inicio: 'C. San Lucas & Cam. A San Javier',
    fin: 'SEAH Precision Apodaca',
    turno: 'manana' as const,
    horaInicioEsperada: '05:00',
    horaFinEsperada: '06:00',
    personasEsperadas: 22,
  },
  {
    nombre: 'CEDIS MICHELIN - REAL PALMAS',
    inicio: 'Fraccionamiento Real Palmas, Nuevo León, México',
    fin: 'Cedis Michelin',
    turno: 'tarde' as const,
    horaInicioEsperada: '13:30',
    horaFinEsperada: '14:30',
    personasEsperadas: 16,
  },
  {
    nombre: 'GRIFFITH - LINCOLN',
    inicio: 'Av. Abraham Lincoln PTE - OTE (Parada de autobús)',
    fin: 'Laboratorios Griffith',
    turno: 'noche' as const,
    horaInicioEsperada: '19:00',
    horaFinEsperada: '20:00',
    personasEsperadas: 14,
  },
  {
    nombre: 'CEVA APODACA - BANORTE',
    inicio: 'Banorte (Ciénega de Flores)',
    fin: 'CEVA Apodaca',
    turno: 'manana' as const,
    horaInicioEsperada: '05:30',
    horaFinEsperada: '06:30',
    personasEsperadas: 19,
  },
  {
    nombre: 'CEVA MTY - SMART GUADALUPE',
    inicio: 'S-Mart (Carr. A Reynosa, Guadalupe)',
    fin: 'CEVA Mty',
    turno: 'tarde' as const,
    horaInicioEsperada: '15:30',
    horaFinEsperada: '16:30',
    personasEsperadas: 17,
  },
] as const;

// `diasOffset` es relativo a HOY (fechaOperativa): negativo es historial ya
// cerrado, 0 es hoy, positivo es planeacion futura.
type ResultadoAsignacion =
  | 'a_tiempo'
  | 'tarde'
  | 'adelantado'
  | 'incidente'
  | 'cancelada'
  | 'en_curso'
  | 'pendiente';

type ConfigAsignacion = {
  diasOffset: number;
  rutaNombre: (typeof RUTAS)[number]['nombre'];
  choferCredencial: (typeof CHOFERES)[number]['credencial'];
  camionCodigo: (typeof CAMIONES)[number]['codigo'];
  resultado: ResultadoAsignacion;
  incidente?: TipoIncidente;
};

const ASIGNACIONES: ConfigAsignacion[] = [
  {
    diasOffset: -3,
    rutaNombre: 'CEVA - ESCOBEDO',
    choferCredencial: 'driver1',
    camionCodigo: 'T01',
    resultado: 'a_tiempo',
  },
  {
    diasOffset: -3,
    rutaNombre: 'ROSENBERGER - CADEREYTA',
    choferCredencial: 'driver2',
    camionCodigo: 'T02',
    resultado: 'tarde',
  },
  {
    diasOffset: -3,
    rutaNombre: 'CEVA GP - JUAREZ',
    choferCredencial: 'driver3',
    camionCodigo: 'T03',
    resultado: 'adelantado',
  },
  {
    diasOffset: -3,
    rutaNombre: 'SEAH APODACA - SAN LUCAS',
    choferCredencial: 'driver2',
    camionCodigo: 'T02',
    resultado: 'incidente',
    incidente: 'choque',
  },
  {
    diasOffset: -3,
    rutaNombre: 'CEVA APODACA - BANORTE',
    choferCredencial: 'driver3',
    camionCodigo: 'T03',
    resultado: 'cancelada',
  },

  {
    diasOffset: -2,
    rutaNombre: 'CEVA - ESCOBEDO',
    choferCredencial: 'driver2',
    camionCodigo: 'T02',
    resultado: 'a_tiempo',
  },
  {
    diasOffset: -2,
    rutaNombre: 'CEDIS MICHELIN - REAL PALMAS',
    choferCredencial: 'driver1',
    camionCodigo: 'T01',
    resultado: 'tarde',
  },
  {
    diasOffset: -2,
    rutaNombre: 'GRIFFITH - LINCOLN',
    choferCredencial: 'driver3',
    camionCodigo: 'T03',
    resultado: 'a_tiempo',
  },
  {
    diasOffset: -2,
    rutaNombre: 'CEVA MTY - SMART GUADALUPE',
    choferCredencial: 'driver1',
    camionCodigo: 'T01',
    resultado: 'adelantado',
  },
  {
    diasOffset: -2,
    rutaNombre: 'ROSENBERGER - CADEREYTA',
    choferCredencial: 'driver3',
    camionCodigo: 'T03',
    resultado: 'a_tiempo',
  },

  {
    diasOffset: -1,
    rutaNombre: 'CEVA - ESCOBEDO',
    choferCredencial: 'driver3',
    camionCodigo: 'T03',
    resultado: 'tarde',
  },
  {
    diasOffset: -1,
    rutaNombre: 'CEVA GP - JUAREZ',
    choferCredencial: 'driver1',
    camionCodigo: 'T01',
    resultado: 'a_tiempo',
  },
  {
    diasOffset: -1,
    rutaNombre: 'SEAH APODACA - SAN LUCAS',
    choferCredencial: 'driver2',
    camionCodigo: 'T02',
    resultado: 'a_tiempo',
  },
  {
    diasOffset: -1,
    rutaNombre: 'CEVA APODACA - BANORTE',
    choferCredencial: 'driver1',
    camionCodigo: 'T01',
    resultado: 'a_tiempo',
  },
  {
    diasOffset: -1,
    rutaNombre: 'CEDIS MICHELIN - REAL PALMAS',
    choferCredencial: 'driver2',
    camionCodigo: 'T02',
    resultado: 'incidente',
    incidente: 'trafico',
  },
  {
    diasOffset: -1,
    rutaNombre: 'GRIFFITH - LINCOLN',
    choferCredencial: 'driver3',
    camionCodigo: 'T03',
    resultado: 'cancelada',
  },

  {
    diasOffset: 0,
    rutaNombre: 'CEVA - ESCOBEDO',
    choferCredencial: 'driver1',
    camionCodigo: 'T01',
    resultado: 'a_tiempo',
  },
  {
    diasOffset: 0,
    rutaNombre: 'SEAH APODACA - SAN LUCAS',
    choferCredencial: 'driver2',
    camionCodigo: 'T02',
    resultado: 'en_curso',
  },
  {
    diasOffset: 0,
    rutaNombre: 'CEVA APODACA - BANORTE',
    choferCredencial: 'driver3',
    camionCodigo: 'T03',
    resultado: 'pendiente',
  },
  {
    diasOffset: 0,
    rutaNombre: 'ROSENBERGER - CADEREYTA',
    choferCredencial: 'driver1',
    camionCodigo: 'T01',
    resultado: 'pendiente',
  },
  {
    diasOffset: 0,
    rutaNombre: 'CEDIS MICHELIN - REAL PALMAS',
    choferCredencial: 'driver2',
    camionCodigo: 'T02',
    resultado: 'pendiente',
  },
  {
    diasOffset: 0,
    rutaNombre: 'CEVA GP - JUAREZ',
    choferCredencial: 'driver3',
    camionCodigo: 'T03',
    resultado: 'pendiente',
  },
  {
    diasOffset: 0,
    rutaNombre: 'GRIFFITH - LINCOLN',
    choferCredencial: 'driver1',
    camionCodigo: 'T01',
    resultado: 'pendiente',
  },
  {
    diasOffset: 0,
    rutaNombre: 'CEVA MTY - SMART GUADALUPE',
    choferCredencial: 'driver2',
    camionCodigo: 'T02',
    resultado: 'pendiente',
  },

  {
    diasOffset: 1,
    rutaNombre: 'CEVA - ESCOBEDO',
    choferCredencial: 'driver1',
    camionCodigo: 'T01',
    resultado: 'pendiente',
  },
  {
    diasOffset: 1,
    rutaNombre: 'ROSENBERGER - CADEREYTA',
    choferCredencial: 'driver2',
    camionCodigo: 'T02',
    resultado: 'pendiente',
  },
  {
    diasOffset: 1,
    rutaNombre: 'CEVA GP - JUAREZ',
    choferCredencial: 'driver3',
    camionCodigo: 'T03',
    resultado: 'pendiente',
  },
  {
    diasOffset: 1,
    rutaNombre: 'SEAH APODACA - SAN LUCAS',
    choferCredencial: 'driver2',
    camionCodigo: 'T02',
    resultado: 'pendiente',
  },
  {
    diasOffset: 1,
    rutaNombre: 'CEDIS MICHELIN - REAL PALMAS',
    choferCredencial: 'driver1',
    camionCodigo: 'T01',
    resultado: 'pendiente',
  },

  {
    diasOffset: 2,
    rutaNombre: 'GRIFFITH - LINCOLN',
    choferCredencial: 'driver3',
    camionCodigo: 'T03',
    resultado: 'pendiente',
  },
  {
    diasOffset: 2,
    rutaNombre: 'CEVA APODACA - BANORTE',
    choferCredencial: 'driver1',
    camionCodigo: 'T01',
    resultado: 'pendiente',
  },
  {
    diasOffset: 2,
    rutaNombre: 'CEVA MTY - SMART GUADALUPE',
    choferCredencial: 'driver2',
    camionCodigo: 'T02',
    resultado: 'pendiente',
  },
  {
    diasOffset: 2,
    rutaNombre: 'CEVA - ESCOBEDO',
    choferCredencial: 'driver3',
    camionCodigo: 'T03',
    resultado: 'pendiente',
  },
];

/** Minutos de offset sobre la hora esperada que produce cada resultado de puntualidad. */
const OFFSET_MIN_POR_RESULTADO: Partial<Record<ResultadoAsignacion, number>> = {
  a_tiempo: 0,
  tarde: 22,
  adelantado: -20,
};

function eventosPorResultado(resultado: ResultadoAsignacion): number {
  switch (resultado) {
    case 'cancelada':
    case 'pendiente':
      return 0;
    case 'en_curso':
      return 3;
    case 'incidente':
      return 4;
    default:
      return 5;
  }
}

/** Suma dias de calendario a una fecha 'YYYY-MM-DD' (sin componente de hora). */
function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * `fecha` + `horaHHMM` + `offsetMin` como instante real. Offset fijo -06:00:
 * Monterrey quedo fuera del horario de verano que Mexico abolio en 2022.
 */
function horaEnFecha(fecha: string, horaHHMM: string, offsetMin = 0): Date {
  const [horas, minutos] = horaHHMM.split(':').map(Number);
  let totalMin = (horas ?? 0) * 60 + (minutos ?? 0) + offsetMin;
  let diaOffset = 0;
  while (totalMin < 0) {
    totalMin += 1440;
    diaOffset -= 1;
  }
  while (totalMin >= 1440) {
    totalMin -= 1440;
    diaOffset += 1;
  }
  const fechaFinal = diaOffset === 0 ? fecha : sumarDias(fecha, diaOffset);
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return new Date(`${fechaFinal}T${hh}:${mm}:00-06:00`);
}

const NOMBRE_CLIENTE = 'CEVA';

/**
 * Deja la base vacia sin tocar el esquema. Un solo `truncate` resuelve el orden
 * de las FK, y `restart identity` hace que dos corridas produzcan ids iguales.
 */
async function limpiarBase(): Promise<number> {
  await db.execute(sql`
    truncate table
      audit_log,
      notificacion_programada,
      dispositivo,
      evento,
      asignacion,
      horario,
      ruta,
      parada,
      perfil_personal,
      usuario,
      camion,
      cliente
    restart identity cascade
  `);

  // Las cuentas de Auth viven fuera de `public` y el truncate no las toca. Van
  // despues: con filas en `usuario`, su FK `on delete restrict` lo impediria.
  let borradas = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) {
      throw new Error(`No se pudo listar usuarios de Auth: ${error.message}`);
    }
    if (data.users.length === 0) {
      return borradas;
    }
    for (const u of data.users) {
      const { error: errorBorrado } = await supabaseAdmin.auth.admin.deleteUser(u.id);
      if (errorBorrado) {
        throw new Error(`No se pudo borrar el usuario de Auth ${u.email}: ${errorBorrado.message}`);
      }
      borradas++;
    }
    // Siempre se pide la pagina 1: al borrar, lo que quedaba atras se recorre
    // hacia adelante. Pedir la pagina 2 se saltaria filas.
  }
}

async function crearCuentaAuth(correo: string, password: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: correo,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear la cuenta de Auth "${correo}": ${error?.message}`);
  }
  return data.user.id;
}

async function sembrar() {
  const clienteId = randomUUID();
  await db.insert(cliente).values({ id: clienteId, nombre: NOMBRE_CLIENTE });

  const paradaIdPorNombre = new Map<string, string>();
  for (const p of PARADAS) {
    const id = randomUUID();
    await db.insert(parada).values({ id, ...p });
    paradaIdPorNombre.set(p.nombre, id);
  }

  const camionIdPorCodigo = new Map<string, string>();
  const camionIds: string[] = [];
  for (const c of CAMIONES) {
    const id = randomUUID();
    await db.insert(camion).values({ id, ...c });
    camionIds.push(id);
    camionIdPorCodigo.set(c.codigo, id);
  }

  let supervisorId = '';
  for (const u of USUARIOS_PANEL) {
    const id = await crearCuentaAuth(u.correo, u.password);
    await db.insert(usuario).values({
      id,
      credencial: u.credencial,
      rol: u.rol,
      correo: u.correo,
      activo: true,
      // Los usuarios del panel entran por OAuth en produccion; el cambio
      // obligatorio de contrasena es del flujo del chofer.
      debeCambiarPassword: false,
    });
    await db.insert(perfilPersonal).values({ usuarioId: id, nombre: u.nombre, correo: u.correo });
    if (u.rol === 'supervisor') {
      supervisorId = id;
    }
  }

  const choferIdPorCredencial = new Map<string, string>();
  for (const [indice, c] of CHOFERES.entries()) {
    const id = await crearCuentaAuth(correoDeChofer(c.credencial), PASSWORD_CHOFER);
    await db.insert(usuario).values({
      id,
      credencial: c.credencial,
      rol: 'chofer',
      activo: true,
      // `false` a proposito: en `true`, `Driver123!` dejaria de servir tras el
      // primer ingreso. Para probar esa pantalla: `pnpm chofer:prueba --forzar-cambio`.
      debeCambiarPassword: false,
      // El Planeador deriva el camion del chofer y `asignacion.camion_id` es
      // NOT NULL: sin este vinculo, asignar falla.
      camionId: camionIds[indice],
    });
    await db.insert(perfilPersonal).values({
      usuarioId: id,
      nombre: `${c.nombre} ${c.apellido}`,
      correo: c.correoContacto,
      telefono: c.telefono,
    });
    choferIdPorCredencial.set(c.credencial, id);
  }

  type InfoHorario = {
    id: string;
    horaInicioEsperada: string;
    horaFinEsperada: string;
    personasEsperadas: number;
  };
  const horarioPorRuta = new Map<string, InfoHorario>();

  for (const r of RUTAS) {
    const paradaInicioId = paradaIdPorNombre.get(r.inicio);
    const paradaFinId = paradaIdPorNombre.get(r.fin);
    if (!paradaInicioId || !paradaFinId) {
      throw new Error(`La ruta "${r.nombre}" apunta a una parada que no se sembro.`);
    }
    const rutaId = randomUUID();
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: r.nombre,
      paradaInicioId,
      paradaFinId,
    });
    const horarioId = randomUUID();
    await db.insert(horario).values({
      id: horarioId,
      rutaId,
      turno: r.turno,
      horaInicioEsperada: r.horaInicioEsperada,
      horaFinEsperada: r.horaFinEsperada,
      personasEsperadas: r.personasEsperadas,
    });
    horarioPorRuta.set(r.nombre, {
      id: horarioId,
      horaInicioEsperada: r.horaInicioEsperada,
      horaFinEsperada: r.horaFinEsperada,
      personasEsperadas: r.personasEsperadas,
    });
  }

  const hoy = fechaOperativa(new Date());
  for (const cfg of ASIGNACIONES) {
    await crearAsignacion(cfg, {
      hoy,
      horarioPorRuta,
      choferIdPorCredencial,
      camionIdPorCodigo,
      supervisorId,
    });
  }
}

/**
 * Una asignacion y, salvo `cancelada` / `pendiente`, su secuencia de eventos.
 * El contador de `fin_ruta`/`retorno` vive en `asignacion`, no en el evento.
 */
async function crearAsignacion(
  cfg: ConfigAsignacion,
  ctx: {
    hoy: string;
    horarioPorRuta: Map<
      string,
      { id: string; horaInicioEsperada: string; horaFinEsperada: string; personasEsperadas: number }
    >;
    choferIdPorCredencial: Map<string, string>;
    camionIdPorCodigo: Map<string, string>;
    supervisorId: string;
  },
) {
  const info = ctx.horarioPorRuta.get(cfg.rutaNombre);
  const choferId = ctx.choferIdPorCredencial.get(cfg.choferCredencial);
  const camionId = ctx.camionIdPorCodigo.get(cfg.camionCodigo);
  if (!info || !choferId || !camionId) {
    throw new Error(`ASIGNACIONES trae una referencia que no existe: ${JSON.stringify(cfg)}`);
  }

  const fecha = sumarDias(ctx.hoy, cfg.diasOffset);
  const asignacionId = randomUUID();
  const canceladaEn =
    cfg.resultado === 'cancelada' ? horaEnFecha(fecha, info.horaInicioEsperada, -60) : null;

  await db.insert(asignacion).values({
    id: asignacionId,
    horarioId: info.id,
    fecha,
    secuencia: 1,
    choferId,
    camionId,
    camionCodigo: cfg.camionCodigo,
    canceladaEn,
    createdBy: ctx.supervisorId,
  });

  if (cfg.resultado === 'cancelada' || cfg.resultado === 'pendiente') {
    return;
  }

  const offsetMin = OFFSET_MIN_POR_RESULTADO[cfg.resultado] ?? 0;

  async function marcar(tipo: TipoEvento, ocurrioEn: Date) {
    await db.insert(evento).values({
      id: randomUUID(),
      asignacionId,
      tipo,
      ocurrioEn,
      recibidoEn: new Date(ocurrioEn.getTime() + 60_000),
      lat: null,
      lng: null,
      gpsPrecisionM: null,
      sinGps: false,
      origen: 'app',
      capturadoPor: choferId,
      clientEventId: randomUUID(),
      razonIncidente: tipo === 'fin_ruta_incidente' ? (cfg.incidente ?? 'otro') : null,
    });
  }

  await marcar('vio_ruta', horaEnFecha(fecha, info.horaInicioEsperada, -30));
  await marcar('listo_inicio', horaEnFecha(fecha, info.horaInicioEsperada, -10));

  if (cfg.resultado === 'en_curso') {
    await marcar('inicio_ruta', horaEnFecha(fecha, info.horaInicioEsperada, 2));
    return;
  }

  await marcar('inicio_ruta', horaEnFecha(fecha, info.horaInicioEsperada, offsetMin));

  if (cfg.resultado === 'incidente') {
    await marcar('fin_ruta_incidente', horaEnFecha(fecha, info.horaInicioEsperada, offsetMin + 15));
    return;
  }

  await marcar('fin_ruta', horaEnFecha(fecha, info.horaFinEsperada, offsetMin));
  const abordaron = Math.max(1, info.personasEsperadas - 1);
  await db
    .update(asignacion)
    .set({ cntAbordaron: abordaron })
    .where(eq(asignacion.id, asignacionId));

  await marcar('retorno', horaEnFecha(fecha, info.horaFinEsperada, offsetMin + 15));
  await db
    .update(asignacion)
    .set({ cntRetornaron: abordaron })
    .where(eq(asignacion.id, asignacionId));
}

async function contarFilas(consulta: Promise<{ n: number }[]>): Promise<number> {
  const [fila] = await consulta;
  return fila?.n ?? 0;
}

type Verificacion = { etiqueta: string; obtenido: number; esperado: number };

async function validar(): Promise<Verificacion[]> {
  const porRol = async (rol: 'admin' | 'supervisor' | 'chofer') =>
    contarFilas(db.select({ n: count() }).from(usuario).where(eq(usuario.rol, rol)));

  return [
    { etiqueta: 'Administrators', obtenido: await porRol('admin'), esperado: 1 },
    { etiqueta: 'Supervisors', obtenido: await porRol('supervisor'), esperado: 1 },
    { etiqueta: 'Drivers', obtenido: await porRol('chofer'), esperado: CHOFERES.length },
    {
      etiqueta: 'Stops',
      obtenido: await contarFilas(db.select({ n: count() }).from(parada)),
      esperado: PARADAS.length,
    },
    {
      etiqueta: 'Routes',
      obtenido: await contarFilas(db.select({ n: count() }).from(ruta)),
      esperado: RUTAS.length,
    },
    {
      etiqueta: 'Route schedules',
      obtenido: await contarFilas(db.select({ n: count() }).from(horario)),
      esperado: RUTAS.length,
    },
    {
      etiqueta: 'Buses',
      obtenido: await contarFilas(db.select({ n: count() }).from(camion)),
      esperado: CAMIONES.length,
    },
    // En este modelo "ruta programada" y "asignacion" son la MISMA fila, por eso
    // se reporta una sola linea; `evento` va aparte porque lo marca el chofer.
    {
      etiqueta: 'Scheduled / Assignments',
      obtenido: await contarFilas(db.select({ n: count() }).from(asignacion)),
      esperado: ASIGNACIONES.length,
    },
    {
      etiqueta: 'Events',
      obtenido: await contarFilas(db.select({ n: count() }).from(evento)),
      esperado: ASIGNACIONES.reduce((acc, cfg) => acc + eventosPorResultado(cfg.resultado), 0),
    },
  ];
}

const LINEA = '========================================';
const GUIONES = '----------------------------------------';

function imprimirCredenciales() {
  console.log('');
  console.log(LINEA);
  console.log('       SEED COMPLETED SUCCESSFULLY');
  console.log(LINEA);
  console.log('');
  console.log('USERS');
  console.log(GUIONES);

  for (const u of USUARIOS_PANEL) {
    console.log('');
    console.log(u.rol.toUpperCase());
    console.log(`Email: ${u.correo}`);
    console.log(`Password: ${u.password}`);
  }

  console.log('');
  console.log('DRIVERS');
  console.log(GUIONES);
  console.log('');
  console.log('La app pide CREDENCIAL, no correo: se teclea la credencial de abajo.');

  for (const [indice, c] of CHOFERES.entries()) {
    console.log('');
    console.log(`Driver ${indice + 1}`);
    console.log(`Credencial: ${c.credencial}`);
    console.log(`Password: ${PASSWORD_CHOFER}`);
    console.log(`(correo interno de Auth: ${correoDeChofer(c.credencial)})`);
  }

  console.log('');
  console.log(LINEA);
}

function imprimirResumen(verificaciones: Verificacion[], ok: boolean) {
  const ancho = Math.max(...verificaciones.map((v) => v.etiqueta.length));
  console.log('');
  console.log(LINEA);
  console.log('DATABASE SEED SUMMARY');
  console.log(LINEA);
  console.log('');
  for (const v of verificaciones) {
    const marca = v.obtenido === v.esperado ? '' : `   <-- SE ESPERABAN ${v.esperado}`;
    console.log(`${v.etiqueta.padEnd(ancho)} : ${v.obtenido}${marca}`);
  }
  console.log('');
  console.log(`Status: ${ok ? 'SUCCESS' : 'FAILED'}`);
  console.log(LINEA);
  console.log('');
}

async function principal() {
  const cuentasBorradas = await limpiarBase();
  console.log(`Base vaciada (${cuentasBorradas} cuentas de Auth eliminadas).`);

  await sembrar();

  const verificaciones = await validar();
  const fallidas = verificaciones.filter((v) => v.obtenido !== v.esperado);

  if (fallidas.length > 0) {
    imprimirResumen(verificaciones, false);
    console.error('La semilla termino con conteos que no cuadran:');
    for (const v of fallidas) {
      console.error(`  ${v.etiqueta}: hay ${v.obtenido}, se esperaban ${v.esperado}`);
    }
    process.exit(1);
  }

  imprimirCredenciales();
  imprimirResumen(verificaciones, true);
  console.log('3 dias de historial cerrado, hoy en curso y 2 dias de planeacion hacia adelante.');
  console.log('');
}

await principal();
process.exit(0);
