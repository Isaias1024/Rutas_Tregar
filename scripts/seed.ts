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

/**
 * Semilla de desarrollo: DESTRUCTIVA y de conjunto fijo.
 *
 * Cada corrida vacia las doce tablas y las vuelve a llenar con exactamente el
 * mismo conjunto minimo. No es "idempotente" por buscar-antes-de-insertar como
 * la version anterior, sino por reconstruccion: correrla N veces deja siempre
 * los mismos conteos.
 *
 * Lo que NO crea, a proposito: ninguna `asignacion` y ningun `evento`. Las tres
 * rutas quedan como plantillas libres, cada una con su horario, para que el
 * Planeador tenga que programarlas desde cero.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'scripts/seed.ts: faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env. Corre `pnpm db:up && pnpm env:write` primero.',
  );
  process.exit(1);
}

// Guarda de seguridad. Esta semilla BORRA TODO, incluidas las cuentas de Auth:
// apuntada por accidente a un entorno compartido se lleva los datos reales por
// delante. Solo corre contra un Supabase local salvo que se pida explicito con
// `--forzar`, que existe para un staging desechable y para nada mas.
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

// --- credenciales dummy -------------------------------------------------------
// Un solo lugar define usuarios y contrasenas: lo que se siembra es
// literalmente lo que se imprime al final. Dos listas separadas se
// desincronizan en cuanto alguien cambia una contrasena.

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

// El chofer NO teclea un correo: teclea `credencial`, y la app sintetiza
// `<credencial>@choferes.rutas.local` (apps/mobile/src/lib/credencial.ts). Por
// eso el correo de Auth se deriva de la credencial y no puede ser
// `driverN@test.com`: con ese correo en Auth, teclear `driver1` en la app
// buscaria `driver1@choferes.rutas.local` y el login fallaria. El
// `driverN@test.com` de la especificacion se conserva como correo de contacto
// en `perfil_personal`, que es donde este modelo lo guarda.
const CHOFERES: Chofer[] = [
  {
    credencial: 'driver1',
    nombre: 'Driver',
    apellido: 'Uno',
    correoContacto: 'driver1@test.com',
    telefono: '8110000001',
  },
  {
    credencial: 'driver2',
    nombre: 'Driver',
    apellido: 'Dos',
    correoContacto: 'driver2@test.com',
    telefono: '8110000002',
  },
  {
    credencial: 'driver3',
    nombre: 'Driver',
    apellido: 'Tres',
    correoContacto: 'driver3@test.com',
    telefono: '8110000003',
  },
];

function correoDeChofer(credencial: string): string {
  return `${credencial}@choferes.rutas.local`;
}

// --- catalogos ----------------------------------------------------------------

// Coordenadas reales del area metropolitana de Monterrey: el panel las pinta en
// un mapa y una parada en medio del mar se nota de inmediato.
const PARADAS = [
  {
    nombre: 'Stop 1',
    direccion: 'Av. Colon 500, Centro, Monterrey, N.L.',
    lat: 25.6714,
    lng: -100.3096,
  },
  {
    nombre: 'Stop 2',
    direccion: 'Parque Industrial Stiva, Apodaca, N.L.',
    lat: 25.7785,
    lng: -100.1817,
  },
  {
    nombre: 'Stop 3',
    direccion: 'Av. Eugenio Garza Sada 2501, Monterrey, N.L.',
    lat: 25.6512,
    lng: -100.2895,
  },
  {
    nombre: 'Stop 4',
    direccion: 'Parque Industrial Milimex, Santa Catarina, N.L.',
    lat: 25.6866,
    lng: -100.4593,
  },
  {
    nombre: 'Stop 5',
    direccion: 'Av. Benito Juarez 1000, Guadalupe, N.L.',
    lat: 25.6776,
    lng: -100.2593,
  },
  {
    nombre: 'Stop 6',
    direccion: 'Carretera Miguel Aleman km 15, Ciudad Benito Juarez, N.L.',
    lat: 25.6488,
    lng: -100.0947,
  },
] as const;

const CAMIONES = [
  { codigo: 'T01', tipo: 'Van', placas: 'NLE-0101-A' },
  { codigo: 'T02', tipo: 'Autobus', placas: 'NLE-0202-B' },
  { codigo: 'T03', tipo: 'Sprinter', placas: 'NLE-0303-C' },
] as const;

// Cada ruta trae su horario porque en este sistema una ruta SIN horario no
// existe: `rutaCrearSchema` exige `min(1)` y el Planeador arma su cuadricula
// desde `horario`, no desde `ruta` (`listarHorariosActivos`). Una ruta sin
// horario seria invisible y no se podria programar — justo lo contrario de lo
// que se busca. El horario no lleva fecha: la fecha nace en `asignacion`, y de
// esas se siembran cero.
const RUTAS = [
  {
    nombre: 'Route 1',
    inicio: 'Stop 1',
    fin: 'Stop 2',
    turno: 'manana' as const,
    horaInicioEsperada: '06:00',
    horaFinEsperada: '07:00',
    personasEsperadas: 20,
  },
  {
    nombre: 'Route 2',
    inicio: 'Stop 3',
    fin: 'Stop 4',
    turno: 'tarde' as const,
    horaInicioEsperada: '14:00',
    horaFinEsperada: '15:00',
    personasEsperadas: 18,
  },
  {
    nombre: 'Route 3',
    inicio: 'Stop 5',
    fin: 'Stop 6',
    turno: 'noche' as const,
    horaInicioEsperada: '20:00',
    horaFinEsperada: '21:00',
    personasEsperadas: 15,
  },
] as const;

const NOMBRE_CLIENTE = 'Test Client';

// --- limpieza -----------------------------------------------------------------

/**
 * Deja la base vacia sin tocar el esquema.
 *
 * `truncate` con las doce tablas en UNA sola sentencia resuelve el orden de las
 * foreign keys por si mismo — no hay que borrar en cascada a mano — y
 * `restart identity` devuelve el `bigserial` de `audit_log` a 1 para que dos
 * corridas produzcan ids identicos.
 *
 * Sobre `evento`, que es append-only (§ datos-y-rls.md): esa regla prohibe el
 * UPDATE y el DELETE de negocio, y `db:check` la verifica comprobando que la
 * tabla no tenga politicas de UPDATE ni DELETE. Esto no es una correccion de
 * datos, es el vaciado completo de una base local de desarrollo, y corre como
 * dueno de la tabla via DATABASE_URL, no bajo RLS. Ninguna politica cambia.
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

  // Las cuentas de Auth viven fuera del esquema `public`, asi que el truncate
  // no las toca. Van DESPUES: mientras `usuario` tuviera filas, su FK contra
  // `auth.users` es `on delete restrict` y el borrado fallaria.
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

// --- creacion -----------------------------------------------------------------

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

  const camionIds: string[] = [];
  for (const c of CAMIONES) {
    const id = randomUUID();
    await db.insert(camion).values({ id, ...c });
    camionIds.push(id);
  }

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
  }

  for (const [indice, c] of CHOFERES.entries()) {
    const id = await crearCuentaAuth(correoDeChofer(c.credencial), PASSWORD_CHOFER);
    await db.insert(usuario).values({
      id,
      credencial: c.credencial,
      rol: 'chofer',
      activo: true,
      // `false` a proposito: en `true` la app exige cambiar la contrasena al
      // primer ingreso y `Driver123!` dejaria de servir en cuanto alguien
      // entre una vez — que es justo lo que hace inservible una credencial de
      // prueba. Para ejercitar esa pantalla: `pnpm chofer:prueba --forzar-cambio`.
      debeCambiarPassword: false,
      // El Planeador deriva el camion del chofer (`resolverCamionDelChofer`) y
      // `asignacion.camion_id` es NOT NULL: sin este vinculo, asignar falla.
      camionId: camionIds[indice],
    });
    await db.insert(perfilPersonal).values({
      usuarioId: id,
      nombre: `${c.nombre} ${c.apellido}`,
      correo: c.correoContacto,
      telefono: c.telefono,
    });
  }

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
    await db.insert(horario).values({
      id: randomUUID(),
      rutaId,
      turno: r.turno,
      horaInicioEsperada: r.horaInicioEsperada,
      horaFinEsperada: r.horaFinEsperada,
      personasEsperadas: r.personasEsperadas,
    });
  }
}

// --- validacion ---------------------------------------------------------------

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
    // En este modelo "ruta programada" y "asignacion" son la MISMA fila: una
    // `asignacion` es un horario + una fecha + un chofer + un camion. Por eso
    // no son dos conteos distintos, y se reporta como una sola linea en vez de
    // fingir dos. `evento` va aparte: es lo que marca el chofer.
    {
      etiqueta: 'Scheduled / Assignments',
      obtenido: await contarFilas(db.select({ n: count() }).from(asignacion)),
      esperado: 0,
    },
    {
      etiqueta: 'Events',
      obtenido: await contarFilas(db.select({ n: count() }).from(evento)),
      esperado: 0,
    },
  ];
}

// --- salida -------------------------------------------------------------------

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

// --- principal ----------------------------------------------------------------

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
  console.log('Ninguna ruta quedo programada: las 3 estan libres para el Planeador.');
  console.log('');
}

await principal();
process.exit(0);
