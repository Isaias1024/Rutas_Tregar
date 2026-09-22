import { colores } from '@rutas/shared/tokens';
import { Text, View } from 'react-native';
import type { PerfilChofer } from '@/datos/perfil';
import { iniciales } from '@/datos/perfil';
import { Icono, type NombreIcono } from './Icono';

function Renglon({
  icono,
  etiqueta,
  valor,
}: {
  icono: NombreIcono;
  etiqueta: string;
  valor: string;
}) {
  return (
    <View className="flex-row items-center gap-3 border-t border-border py-3">
      <Icono nombre={icono} tamano={18} color={colores.fgMuted} />
      <Text className="flex-1 text-base text-foreground-muted">{etiqueta}</Text>
      <Text className="text-base font-medium tabular-nums text-foreground">{valor}</Text>
    </View>
  );
}

interface Props {
  perfil: PerfilChofer;
}

/**
 * El avatar son iniciales: pedir una foto seria pedir un dato personal que la
 * operacion no necesita. Y el correo sintetico de Supabase no se muestra jamas.
 */
export function TarjetaPerfil({ perfil }: Props) {
  return (
    <View className="gap-4 rounded-app border border-border bg-surface p-5">
      <View className="items-center gap-3">
        <View
          className="items-center justify-center rounded-avatar"
          style={{ width: 72, height: 72, backgroundColor: colores.primary }}
        >
          <Text className="text-2xl font-bold text-primary-fg">
            {iniciales(perfil.nombre || perfil.credencial)}
          </Text>
        </View>
        <View className="items-center">
          <Text className="text-center text-xl font-bold text-foreground">
            {perfil.nombre || 'Sin nombre registrado'}
          </Text>
          <Text className="text-base text-foreground-muted">Chofer</Text>
        </View>
      </View>

      <View>
        <Renglon icono="perfil" etiqueta="Credencial" valor={perfil.credencial} />
        <Renglon icono="telefono" etiqueta="Telefono" valor={perfil.telefono || 'Sin registrar'} />
        <Renglon icono="camion" etiqueta="Camion" valor={perfil.camionCodigo ?? 'Sin asignar'} />
      </View>
    </View>
  );
}
