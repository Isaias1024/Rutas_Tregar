process.loadEnvFile('.env');

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { and, eq } from 'drizzle-orm';
import {
  camion,
  cliente,
  db,
  horario,
  parada,
  perfilPersonal,
  ruta,
  usuario,
} from '../packages/shared/src/db/index.ts';

// Semilla idempotente: cada `obtenerOCrear*` busca por su llave natural antes
// de insertar. `camion` y `usuario` tienen una unique real en la base
// (codigo / credencial) y usan `on conflict do nothing`; `cliente`, `parada`,
// `ruta` y `horario` no tienen una unique natural en el esquema, asi que se
// verifican con un SELECT antes del INSERT — mismo efecto, sin cambiar el
// esquema solo para la semilla.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'scripts/seed.ts: faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env. Corre `pnpm db:up && pnpm env:write` primero.',
  );
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function obtenerOCrearCliente(nombre: string): Promise<string> {
  const [existente] = await db
    .select({ id: cliente.id })
    .from(cliente)
    .where(eq(cliente.nombre, nombre))
    .limit(1);
  if (existente) {
    return existente.id;
  }
  const id = randomUUID();
  await db.insert(cliente).values({ id, nombre });
  return id;
}

async function obtenerOCrearParada(datos: {
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
}): Promise<string> {
  const [existente] = await db
    .select({ id: parada.id })
    .from(parada)
    .where(eq(parada.nombre, datos.nombre))
    .limit(1);
  if (existente) {
    return existente.id;
  }
  const id = randomUUID();
  await db.insert(parada).values({ id, ...datos });
  return id;
}

async function obtenerOCrearCamion(datos: {
  codigo: string;
  tipo: string;
  placas: string;
}): Promise<string> {
  const id = randomUUID();
  const [creado] = await db
    .insert(camion)
    .values({ id, ...datos })
    .onConflictDoNothing({ target: camion.codigo })
    .returning({ id: camion.id });
  if (creado) {
    return creado.id;
  }
  const [existente] = await db
    .select({ id: camion.id })
    .from(camion)
    .where(eq(camion.codigo, datos.codigo))
    .limit(1);
  if (!existente) {
    throw new Error(`No se pudo crear ni encontrar el camion ${datos.codigo}.`);
  }
  return existente.id;
}

async function obtenerOCrearUsuarioPanel(datos: {
  credencial: string;
  correo: string;
  rol: 'admin' | 'supervisor';
  nombre: string;
}): Promise<string> {
  const [existente] = await db
    .select({ id: usuario.id })
    .from(usuario)
    .where(eq(usuario.credencial, datos.credencial))
    .limit(1);
  if (existente) {
    return existente.id;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: datos.correo,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(
      `No se pudo crear el usuario de Auth para "${datos.credencial}": ${error?.message}`,
    );
  }

  await db.insert(usuario).values({
    id: data.user.id,
    credencial: datos.credencial,
    rol: datos.rol,
    correo: datos.correo,
    debeCambiarPassword: false,
  });
  await db.insert(perfilPersonal).values({ usuarioId: data.user.id, nombre: datos.nombre });
  return data.user.id;
}

async function obtenerOCrearChofer(datos: {
  credencial: string;
  nombre: string;
  telefono: string;
}): Promise<string> {
  const [existente] = await db
    .select({ id: usuario.id })
    .from(usuario)
    .where(eq(usuario.credencial, datos.credencial))
    .limit(1);
  if (existente) {
    return existente.id;
  }

  const correoSintetico = `${datos.credencial}@choferes.rutas.local`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: correoSintetico,
    password: `Semilla-${randomUUID().slice(0, 8)}`,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(
      `No se pudo crear el usuario de Auth para "${datos.credencial}": ${error?.message}`,
    );
  }

  await db.insert(usuario).values({
    id: data.user.id,
    credencial: datos.credencial,
    rol: 'chofer',
    debeCambiarPassword: true,
  });
  await db.insert(perfilPersonal).values({
    usuarioId: data.user.id,
    nombre: datos.nombre,
    telefono: datos.telefono,
  });
  return data.user.id;
}

async function obtenerOCrearRuta(datos: {
  nombre: string;
  clienteId: string;
  paradaInicioId: string;
  paradaFinId: string;
}): Promise<string> {
  const [existente] = await db
    .select({ id: ruta.id })
    .from(ruta)
    .where(eq(ruta.nombre, datos.nombre))
    .limit(1);
  if (existente) {
    return existente.id;
  }
  const id = randomUUID();
  await db.insert(ruta).values({ id, ...datos });
  return id;
}

async function obtenerOCrearHorario(datos: {
  rutaId: string;
  turno: 'manana' | 'tarde' | 'noche';
  horaInicioEsperada: string;
  horaFinEsperada: string;
  personasEsperadas: number;
}): Promise<void> {
  const [existente] = await db
    .select({ id: horario.id })
    .from(horario)
    .where(
      and(
        eq(horario.rutaId, datos.rutaId),
        eq(horario.turno, datos.turno),
        eq(horario.horaInicioEsperada, datos.horaInicioEsperada),
      ),
    )
    .limit(1);
  if (existente) {
    return;
  }
  await db.insert(horario).values({ id: randomUUID(), ...datos });
}

async function principal() {
  const clienteId = await obtenerOCrearCliente('Manufacturas del Norte');

  const paradaPlantaId = await obtenerOCrearParada({
    nombre: 'Planta Norte — Apodaca',
    direccion: 'Parque Industrial Stiva Aeropuerto, Apodaca, N.L.',
    lat: 25.7785,
    lng: -100.1817,
  });
  const paradaCentroId = await obtenerOCrearParada({
    nombre: 'Terminal Centro — Monterrey',
    direccion: 'Av. Colon, Centro, Monterrey, N.L.',
    lat: 25.6714,
    lng: -100.3096,
  });
  const paradaSurId = await obtenerOCrearParada({
    nombre: 'Planta Sur — Santa Catarina',
    direccion: 'Parque Industrial Milimex, Santa Catarina, N.L.',
    lat: 25.6866,
    lng: -100.4593,
  });

  await obtenerOCrearCamion({ codigo: 'T23', tipo: 'Van', placas: 'NLE-2301-A' });
  await obtenerOCrearCamion({ codigo: 'T24', tipo: 'Autobus', placas: 'NLE-2402-B' });

  await obtenerOCrearUsuarioPanel({
    credencial: 'admin',
    correo: 'admin@example.com',
    rol: 'admin',
    nombre: 'Admin Semilla',
  });
  await obtenerOCrearUsuarioPanel({
    credencial: 'supervisor',
    correo: 'supervisor@example.com',
    rol: 'supervisor',
    nombre: 'Supervisor Semilla',
  });

  await obtenerOCrearChofer({ credencial: 'jperez', nombre: 'Juan Perez', telefono: '8110000001' });
  await obtenerOCrearChofer({
    credencial: 'mgarcia',
    nombre: 'Maria Garcia',
    telefono: '8110000002',
  });

  // Ruta con dos horarios en el mismo turno: el caso que motiva la tabla
  // `horario` (§4) — la misma ruta sale dos veces en la manana, cada una con
  // su propio cupo esperado.
  const rutaDobleId = await obtenerOCrearRuta({
    nombre: 'Centro - Planta Norte',
    clienteId,
    paradaInicioId: paradaCentroId,
    paradaFinId: paradaPlantaId,
  });
  await obtenerOCrearHorario({
    rutaId: rutaDobleId,
    turno: 'manana',
    horaInicioEsperada: '06:00',
    horaFinEsperada: '07:00',
    personasEsperadas: 20,
  });
  await obtenerOCrearHorario({
    rutaId: rutaDobleId,
    turno: 'manana',
    horaInicioEsperada: '08:00',
    horaFinEsperada: '09:00',
    personasEsperadas: 15,
  });

  // La otra ruta lleva un solo horario.
  const rutaSencillaId = await obtenerOCrearRuta({
    nombre: 'Centro - Planta Sur',
    clienteId,
    paradaInicioId: paradaCentroId,
    paradaFinId: paradaSurId,
  });
  await obtenerOCrearHorario({
    rutaId: rutaSencillaId,
    turno: 'tarde',
    horaInicioEsperada: '14:00',
    horaFinEsperada: '15:00',
    personasEsperadas: 18,
  });

  console.log('Semilla lista.');
}

await principal();
process.exit(0);
