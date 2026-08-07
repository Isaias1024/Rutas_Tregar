// Sintesis deterministica del correo interno que exige Supabase Auth. El
// chofer nunca ve ni teclea un correo — solo su credencial y su contrasena
// (§ movil-expo.md) — y este es el UNICO lugar del proyecto que sabe
// construir `<credencial>@choferes.rutas.local`, en espejo del mismo patron
// que usa `apps/web/src/server/catalogos.ts` al crear la cuenta.
export function correoDesdeCredencial(credencial: string): string {
  return `${credencial.trim().toLowerCase()}@choferes.rutas.local`;
}
