import { verificarInvitacion } from '@/lib/auth/invitacion';
import { crearClienteServidor } from '@/lib/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

// Intercambia el codigo OAuth por sesion y aplica la compuerta de invitacion:
// si el correo no tiene una, la sesion recien creada se cierra aqui mismo.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user?.email) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const resultado = await verificarInvitacion(data.user.email);

  if (!resultado.ok) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=no_invitado`);
  }

  // Mismo motivo que en el login por contrasena: este redirect no vuelve a pasar
  // por `proxy.ts`, asi que la compuerta de /cuenta se decide aqui tambien.
  if (resultado.data.debeCambiarPassword) {
    return NextResponse.redirect(`${origin}/cuenta`);
  }
  const destino = resultado.data.rol === 'admin' ? '/planeador' : '/monitor';
  return NextResponse.redirect(`${origin}${destino}`);
}
