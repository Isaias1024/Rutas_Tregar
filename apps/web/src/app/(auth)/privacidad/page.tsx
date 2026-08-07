export const dynamic = 'force-static';

// Publica (RUTAS_PUBLICAS en proxy.ts): la abre el chofer desde la app,
// antes o despues de iniciar sesion, sin necesitar una cuenta del panel.
export default function PaginaPrivacidad() {
  return (
    <main className="mx-auto max-w-[720px] space-y-6 p-6 text-foreground">
      <h1 className="text-2xl font-semibold">Aviso de privacidad</h1>
      <p className="text-sm text-muted-foreground">
        Este aviso describe como Rutas — Transporte de Personal recaba y usa tus datos personales
        como empleado, conforme a la Ley Federal de Proteccion de Datos Personales en Posesion de
        los Particulares (LFPDPPP).
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Datos que recabamos</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm">
          <li>Nombre, correo y telefono, para identificarte y contactarte.</li>
          <li>
            Los cinco hitos que confirmas por ruta (viste la ruta, listo para iniciar, inicio,
            llegada, regreso), con su hora y, solo en dos de esos hitos, tu ubicacion GPS en ese
            instante.
          </li>
          <li>El token de notificaciones de tu telefono, para avisarte de tus rutas asignadas.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Para que los usamos</h2>
        <p className="text-sm">
          Unicamente para operar el servicio de transporte: asignarte rutas, medir la puntualidad y
          la ocupacion de cada viaje, y avisarte de cambios de ultimo minuto. No hay rastreo
          continuo de tu ubicacion: el GPS solo se registra en los dos hitos ya mencionados, nunca
          en segundo plano.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Cuanto tiempo los conservamos</h2>
        <p className="text-sm">
          Mientras dure tu relacion laboral, mas 12 meses despues de terminada, para efectos
          contables y legales. El historico de rutas y eventos se conserva sin tus datos de contacto
          una vez que se te da de baja.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Tus derechos (ARCO)</h2>
        <p className="text-sm">
          Puedes solicitar acceder, rectificar, cancelar u oponerte al uso de tus datos personales.
          Pide a un administrador que te de de baja para que tu nombre, correo y telefono se borren
          de forma permanente — tu historial de rutas y eventos se conserva porque sostiene
          registros laborales y operativos que la ley exige mantener.
        </p>
      </section>
    </main>
  );
}
