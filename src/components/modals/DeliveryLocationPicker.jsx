import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, MousePointerClick, Search } from 'lucide-react';
import {
  loadGoogleMapsApi,
  loadOpenStreetMapApi,
  reverseGeocodeWithOpenStreetMap,
  searchAddressesWithOpenStreetMap,
} from '@/lib/googleMapsClient';

const DEFAULT_CENTER = { lat: -10.5, lng: -76.5667 };

const getLatLng = (latLng) => ({
  lat: typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat,
  lng: typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng,
});

const DeliveryLocationPicker = ({ selectedLocation, onLocationChange }) => {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const cleanupRef = useRef(() => {});
  const selectionHandlerRef = useRef(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState('');
  const [mapProvider, setMapProvider] = useState('');

  useEffect(() => {
    let active = true;

    const emitSelection = async (position, updateMarker) => {
      const coordinates = getLatLng(position);
      setSelecting(true);
      setError('');

      try {
        await updateMarker(coordinates);
        const address = await reverseGeocodeWithOpenStreetMap(coordinates);
        if (!active) return;
        onLocationChange({
          ...coordinates,
          address: address.displayName,
          city: address.city,
        });
      } catch (selectionError) {
        console.warn('No se pudo obtener la dirección del mapa:', selectionError);
        if (!active) return;
        onLocationChange({
          ...coordinates,
          address: `Ubicación seleccionada (${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)})`,
          city: selectedLocation?.city || 'Pasco',
        });
        setError('Se guardó la ubicación, pero no se pudo convertir en una dirección.');
      } finally {
        if (active) setSelecting(false);
      }
    };

    const initializeGoogleMap = async (maps) => {
      let Map = maps.Map;
      if (typeof Map !== 'function' && typeof maps.importLibrary === 'function') {
        ({ Map } = await maps.importLibrary('maps'));
      }
      if (typeof Map !== 'function') {
        throw new Error('La Demo Key de Google no permite cargar Maps JavaScript.');
      }

      const initialPosition = selectedLocation || DEFAULT_CENTER;
      const map = new Map(mapElementRef.current, {
        center: initialPosition,
        zoom: selectedLocation ? 16 : 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        mapId: 'DEMO_MAP_ID',
      });
      mapRef.current = map;
      setMapProvider('google');

      const updateMarker = async (coordinates) => {
        map.panTo(coordinates);

        if (!markerRef.current) {
          let Marker = maps.Marker;
          let markerOptions = {
            map,
            position: coordinates,
            title: 'Ubicación de entrega',
            draggable: true,
          };

          if (typeof Marker !== 'function' && typeof maps.importLibrary === 'function') {
            const markerLibrary = await maps.importLibrary('marker');
            Marker = markerLibrary.AdvancedMarkerElement;
            markerOptions = {
              map,
              position: coordinates,
              title: 'Ubicación de entrega',
              gmpDraggable: true,
            };
          }

          if (typeof Marker !== 'function') {
            throw new Error('Google Maps no permite colocar un marcador.');
          }

          markerRef.current = new Marker(markerOptions);
          markerRef.current.addListener('dragend', event => {
            emitSelection(event.latLng, updateMarker);
          });
        } else {
          markerRef.current.position = coordinates;
        }
      };

      const clickListener = map.addListener('click', event => {
        emitSelection(event.latLng, updateMarker);
      });

      selectionHandlerRef.current = position => emitSelection(position, updateMarker);
      cleanupRef.current = () => clickListener?.remove();
      if (selectedLocation) await updateMarker(selectedLocation);
    };

    const initializeLeafletMap = async () => {
      const L = await loadOpenStreetMapApi();
      if (!active) return;

      const initialPosition = selectedLocation || DEFAULT_CENTER;
      const map = L.map(mapElementRef.current).setView(
        [initialPosition.lat, initialPosition.lng],
        selectedLocation ? 16 : 13
      );

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      mapRef.current = map;
      setMapProvider('openstreetmap');

      const updateMarker = async (coordinates) => {
        const point = [coordinates.lat, coordinates.lng];
        map.panTo(point);

        if (!markerRef.current) {
          markerRef.current = L.marker(point, { draggable: true }).addTo(map);
          markerRef.current.on('dragend', () => {
            emitSelection(markerRef.current.getLatLng(), updateMarker);
          });
        } else {
          markerRef.current.setLatLng(point);
        }
      };

      map.on('click', event => emitSelection(event.latlng, updateMarker));
      selectionHandlerRef.current = position => emitSelection(position, updateMarker);
      cleanupRef.current = () => map.remove();
      if (selectedLocation) await updateMarker(selectedLocation);
    };

    const initializeMap = async () => {
      try {
        try {
          const maps = await loadGoogleMapsApi();
          await initializeGoogleMap(maps);
        } catch (googleError) {
          console.warn('Google Demo Key no permite el mapa; se usará OpenStreetMap.', googleError);
          await initializeLeafletMap();
        }

        if (active) setMapLoading(false);
      } catch (mapError) {
        console.error('Error cargando selector de ubicación:', mapError);
        if (active) {
          setMapLoading(false);
          setError(mapError.message || 'No se pudo cargar ningún mapa.');
        }
      }
    };

    initializeMap();

    return () => {
      active = false;
      cleanupRef.current();
      markerRef.current?.setMap?.(null);
      markerRef.current = null;
      mapRef.current = null;
      selectionHandlerRef.current = null;
    };
  }, []);

  const handleAddressSearch = async (event) => {
    event.preventDefault();
    if (addressQuery.trim().length < 3) {
      setError('Escribe al menos 3 caracteres para buscar una dirección.');
      return;
    }

    setSearchLoading(true);
    setSearchResults([]);
    setError('');
    try {
      const results = await searchAddressesWithOpenStreetMap(addressQuery);
      if (results.length === 0) {
        setError('No encontramos esa dirección. Prueba agregando distrito y departamento.');
      } else {
        setSearchResults(results);
      }
    } catch (searchError) {
      setError(searchError.message || 'No se pudo buscar la dirección.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchResult = (result) => {
    setAddressQuery(result.address);
    setSearchResults([]);
    if (selectionHandlerRef.current) {
      selectionHandlerRef.current(result);
    } else {
      setError('Espera a que el mapa termine de cargar.');
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-indigo-100 p-2 text-indigo-700">
          <MapPin className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-indigo-900 text-sm">Selecciona tu ubicación en el mapa</h4>
          <p className="text-xs text-indigo-800 mt-1">
            Haz clic en el punto de entrega o mueve el marcador para precisar tu domicilio.
          </p>
        </div>
      </div>

      <form onSubmit={handleAddressSearch} className="space-y-2">
        <label className="block text-xs font-semibold text-indigo-900">
          Buscar una dirección
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={addressQuery}
              onChange={event => setAddressQuery(event.target.value)}
              placeholder="Ej. Jr. Lima 123, Yanahuanca, Pasco"
              className="w-full pl-9 pr-3 py-2.5 border border-indigo-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={searchLoading}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 text-sm font-semibold flex items-center gap-2"
          >
            {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="bg-white border border-indigo-100 rounded-xl overflow-hidden shadow-sm max-h-48 overflow-y-auto">
            {searchResults.map((result, index) => (
              <button
                key={`${result.lat}-${result.lng}-${index}`}
                type="button"
                onClick={() => handleSearchResult(result)}
                className="w-full text-left px-3 py-2.5 text-xs text-gray-700 hover:bg-indigo-50 border-b last:border-b-0 border-gray-100"
              >
                {result.address}
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="relative overflow-hidden rounded-xl border border-indigo-200 bg-indigo-100">
        <div ref={mapElementRef} className="h-64 w-full" aria-label="Selector de ubicación de entrega" />
        {mapLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-indigo-800 text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando mapa...
          </div>
        )}
        {selecting && (
          <div className="absolute left-3 top-3 rounded-lg bg-white/95 px-3 py-2 text-xs text-indigo-800 shadow-sm flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Buscando dirección...
          </div>
        )}
      </div>

      {mapProvider === 'openstreetmap' && (
        <p className="text-[11px] text-indigo-800 bg-white border border-indigo-100 rounded-xl px-3 py-2">
          Google Demo Key no habilita el mapa JavaScript; se está usando un mapa gratuito para la demostración.
        </p>
      )}

      {selectedLocation && (
        <div className="text-xs text-indigo-900 bg-white border border-indigo-100 rounded-xl px-3 py-2 flex items-start gap-2">
          <MousePointerClick className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Ubicación seleccionada: {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
};

export default DeliveryLocationPicker;
