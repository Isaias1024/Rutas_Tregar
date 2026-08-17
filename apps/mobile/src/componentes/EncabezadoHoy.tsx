import { colores } from '@rutas/shared/tokens';
import { Text, View } from 'react-native';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * El saludo se elige con la hora local del dispositivo a proposito: es
 * cortesia, no un dato operativo. Todo lo que decide algo (que rutas son de
 * hoy, si un dia ya paso) usa `fechaOperativaHoy()` con la zona de Monterrey.
 */
export function saludo(hora: number): string {
  if (hora < 12) {
    return 'Buenos dias';
  }
  if (hora < 19) {
    return 'Buenas tardes';
  }
  return 'Buenas noches';
}

/** `fecha` es 'YYYY-MM-DD' de calendario: se lee anclada en UTC, sin correrla de dia. */
export function fechaLarga(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  if (anio === undefined || mes === undefined || dia === undefined) {
    return fecha;
  }
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return `${DIAS[diaSemana]}, ${dia} de ${MESES[mes - 1]}`;
}

interface Props {
  nombre: string;
  /** 'YYYY-MM-DD' del dia operativo que se esta mostrando. */
  fecha: string;
  horaActual?: number;
}

export function EncabezadoHoy({ nombre, fecha, horaActual = new Date().getHours() }: Props) {
  // Solo el primer nombre: "Buenos dias, Juan" se lee de un golpe; el nombre
  // completo obliga a leer una linea entera para no decir nada mas.
  const primerNombre = nombre.trim().split(/\s+/)[0] ?? '';

  return (
    <View className="gap-1">
      <Text className="text-base text-foreground-muted">{saludo(horaActual)}</Text>
      <Text className="text-3xl font-bold text-foreground">{primerNombre}</Text>
      <View className="mt-1 flex-row items-center gap-2">
        <View
          className="rounded-full"
          style={{ width: 8, height: 8, backgroundColor: colores.primary }}
        />
        <Text className="text-base font-medium text-foreground-muted">{fechaLarga(fecha)}</Text>
      </View>
    </View>
  );
}
