import { Text, View } from 'react-native';

interface Props {
  /** 'YYYY-MM-DD', tal cual llega de la base. */
  fecha: string;
  esHoy?: boolean;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  if (anio === undefined || mes === undefined || dia === undefined) {
    return fecha;
  }
  // Ancla en UTC a proposito: `fecha` es un dia de calendario, no un
  // instante real, asi que leer el nombre del dia con getUTCDay() evita
  // cualquier corrimiento por la zona horaria del dispositivo.
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return `${DIAS[diaSemana]} ${dia} de ${MESES[mes - 1]}`;
}

export function EncabezadoDia({ fecha, esHoy }: Props) {
  return (
    <View className="mb-2 mt-4 flex-row items-center gap-2">
      <Text className="text-lg font-semibold text-foreground">{formatearFecha(fecha)}</Text>
      {esHoy ? (
        <View className="rounded-full bg-primary-tint px-2 py-0.5">
          <Text className="text-xs font-medium text-primary">Hoy</Text>
        </View>
      ) : null}
    </View>
  );
}
