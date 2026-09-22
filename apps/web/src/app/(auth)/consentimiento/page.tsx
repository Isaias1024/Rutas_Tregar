import Link from 'next/link';

export const dynamic = 'force-static';

// Publica (RUTAS_PUBLICAS en proxy.ts), enlazada desde la app del chofer: explica
// que confirmar los hitos registra hora y, en dos de ellos, ubicacion.
export default function PaginaConsentimiento() {
  return (
    <main className="mx-auto max-w-[720px] space-y-6 p-6 text-foreground">
      <h1 className="text-2xl font-semibold">Consentimiento para el registro de tus rutas</h1>
      <p className="text-sm">
        Al usar la app de Rutas para confirmar los hitos de tu ruta (viste la ruta, listo para
        iniciar, inicio, llegada y regreso), aceptas que se registre la hora de cada confirmacion y,
        unicamente en los hitos de inicio y llegada, tu ubicacion GPS en ese momento.
      </p>
      <p className="text-sm">
        No hay rastreo continuo de tu ubicacion en ningun momento — ni mientras la app esta abierta
        ni en segundo plano. Si niegas el permiso de ubicacion, la app sigue funcionando igual: el
        evento se guarda sin coordenadas.
      </p>
      <p className="text-sm">
        Puedes leer el detalle completo de que datos se recaban, para que se usan y por cuanto
        tiempo se conservan en el{' '}
        <Link href="/privacidad" className="text-primary underline">
          aviso de privacidad
        </Link>
        .
      </p>
    </main>
  );
}
