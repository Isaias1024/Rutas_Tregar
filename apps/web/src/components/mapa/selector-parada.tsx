'use client';

import { APIProvider, Map as MapaGoogle, Marker, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface Coordenadas {
  lat: number;
  lng: number;
}

interface Props {
  /** `undefined`/vacio => sin llave configurada: se degrada a captura manual (paso 6, Done-when). */
  apiKey: string | undefined;
  direccion: string;
  coordenadas: Coordenadas | null;
  onDireccionChange: (direccion: string) => void;
  onCoordenadasChange: (coordenadas: Coordenadas) => void;
}

// Monterrey, para centrar el mapa cuando aun no hay una parada seleccionada.
const CENTRO_DEFECTO: Coordenadas = { lat: 25.6866, lng: -100.3161 };

export function SelectorParada({
  apiKey,
  direccion,
  coordenadas,
  onDireccionChange,
  onCoordenadasChange,
}: Props) {
  if (!apiKey) {
    return (
      <CapturaManual
        direccion={direccion}
        coordenadas={coordenadas}
        onDireccionChange={onDireccionChange}
        onCoordenadasChange={onCoordenadasChange}
      />
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div className="space-y-2">
        <BuscadorDireccion
          direccion={direccion}
          onDireccionChange={onDireccionChange}
          onCoordenadasChange={onCoordenadasChange}
        />
        <p className="text-xs text-muted-foreground">
          O haz clic en el mapa para colocar el pin directamente.
        </p>
        <div className="h-64 w-full overflow-hidden rounded-lg border border-border">
          <MapaGoogle
            mapId="selector-parada"
            defaultCenter={coordenadas ?? CENTRO_DEFECTO}
            defaultZoom={coordenadas ? 15 : 11}
            gestureHandling="greedy"
            disableDefaultUI={false}
            onClick={(evento) => {
              if (evento.detail.latLng) {
                onCoordenadasChange(evento.detail.latLng);
              }
            }}
          >
            {coordenadas ? <Marker position={coordenadas} /> : null}
          </MapaGoogle>
        </div>
      </div>
    </APIProvider>
  );
}

function BuscadorDireccion({
  direccion,
  onDireccionChange,
  onCoordenadasChange,
}: Pick<Props, 'direccion' | 'onDireccionChange' | 'onCoordenadasChange'>) {
  const libreriaGeocoding = useMapsLibrary('geocoding');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar() {
    if (!libreriaGeocoding || !direccion.trim()) {
      return;
    }
    setBuscando(true);
    setError(null);
    try {
      const geocodificador = new libreriaGeocoding.Geocoder();
      const { results } = await geocodificador.geocode({ address: direccion });
      const primero = results[0];
      if (!primero) {
        setError('No se encontro esa direccion.');
        return;
      }
      onDireccionChange(primero.formatted_address);
      onCoordenadasChange({
        lat: primero.geometry.location.lat(),
        lng: primero.geometry.location.lng(),
      });
    } catch {
      setError('No se pudo geocodificar la direccion.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          value={direccion}
          onChange={(evento) => onDireccionChange(evento.target.value)}
          placeholder="Escribe una direccion y busca..."
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              evento.preventDefault();
              void buscar();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => void buscar()} disabled={buscando}>
          Buscar
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function CapturaManual({
  direccion,
  coordenadas,
  onDireccionChange,
  onCoordenadasChange,
}: Pick<Props, 'direccion' | 'coordenadas' | 'onDireccionChange' | 'onCoordenadasChange'>) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
      <p className="text-sm text-muted-foreground">
        No hay una llave de Google Maps configurada en este ambiente: captura la direccion y las
        coordenadas a mano.
      </p>
      <div className="space-y-1">
        <label htmlFor="parada-direccion-manual" className="text-sm font-medium">
          Direccion
        </label>
        <Input
          id="parada-direccion-manual"
          value={direccion}
          onChange={(evento) => onDireccionChange(evento.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor="parada-lat-manual" className="text-sm font-medium">
            Latitud
          </label>
          <Input
            id="parada-lat-manual"
            type="number"
            step="any"
            value={coordenadas?.lat ?? ''}
            onChange={(evento) =>
              onCoordenadasChange({ lat: Number(evento.target.value), lng: coordenadas?.lng ?? 0 })
            }
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="parada-lng-manual" className="text-sm font-medium">
            Longitud
          </label>
          <Input
            id="parada-lng-manual"
            type="number"
            step="any"
            value={coordenadas?.lng ?? ''}
            onChange={(evento) =>
              onCoordenadasChange({ lat: coordenadas?.lat ?? 0, lng: Number(evento.target.value) })
            }
          />
        </div>
      </div>
    </div>
  );
}
