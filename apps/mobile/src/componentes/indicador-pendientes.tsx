import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { almacenSqlite } from '@/outbox/db';
import { vaciarCola } from '@/outbox/flusher';

const INTERVALO_MS = 10_000;

/**
 * Indicador discreto con el numero de eventos sin subir; desaparece cuando
 * la cola queda vacia (paso 11). Tambien es lo que dispara `vaciarCola` de
 * forma periodica: no hay un listener de conectividad dedicado, cada pasada
 * simplemente intenta subir y deja en la cola lo que siga fallando.
 */
export function IndicadorPendientes() {
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    let activo = true;

    async function ciclo() {
      await vaciarCola(almacenSqlite);
      const total = await almacenSqlite.contar();
      if (activo) {
        setPendientes(total);
      }
    }

    ciclo();
    const intervalo = setInterval(ciclo, INTERVALO_MS);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, []);

  if (pendientes === 0) {
    return null;
  }

  return (
    <View className="flex-row items-center justify-center gap-2 bg-primary-tint px-4 py-2">
      <Text className="text-sm font-medium text-primary">
        {pendientes}{' '}
        {pendientes === 1 ? 'evento pendiente de subir' : 'eventos pendientes de subir'}
      </Text>
    </View>
  );
}
