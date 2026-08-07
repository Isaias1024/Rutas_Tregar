import * as Location from 'expo-location';

// Captura de GPS solo para listo_inicio y fin_ruta (paso 10). Permiso
// negado, timeout o sin senal: coordenadas nulas y sin_gps=true, NUNCA
// bloquea el registro del evento (§ movil-expo.md). No se pide permiso de
// ubicacion en segundo plano — solo `requestForegroundPermissionsAsync`.

export interface CoordenadasCapturadas {
  lat: number | null;
  lng: number | null;
  gpsPrecisionM: number | null;
  sinGps: boolean;
}

const TIMEOUT_MS = 5000;

const SIN_SENAL: CoordenadasCapturadas = {
  lat: null,
  lng: null,
  gpsPrecisionM: null,
  sinGps: true,
};

export async function capturarUbicacion(): Promise<CoordenadasCapturadas> {
  try {
    const { status: estadoActual } = await Location.getForegroundPermissionsAsync();
    let permiso = estadoActual;
    if (permiso !== Location.PermissionStatus.GRANTED) {
      const solicitud = await Location.requestForegroundPermissionsAsync();
      permiso = solicitud.status;
    }
    if (permiso !== Location.PermissionStatus.GRANTED) {
      return SIN_SENAL;
    }

    const posicion = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), TIMEOUT_MS);
      }),
    ]);

    if (!posicion) {
      return SIN_SENAL;
    }

    return {
      lat: posicion.coords.latitude,
      lng: posicion.coords.longitude,
      gpsPrecisionM: posicion.coords.accuracy,
      sinGps: false,
    };
  } catch {
    return SIN_SENAL;
  }
}
