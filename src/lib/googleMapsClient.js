const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

let mapsLoaderPromise;
let leafletLoaderPromise;

const normalizeCoordinates = (coordinates) => {
  if (!coordinates) return null;

  const lat = Number(coordinates.lat);
  const lng = Number(coordinates.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
};

/**
 * Carga Maps JavaScript API una sola vez y deja disponible la Routes Library.
 */
export const loadGoogleMapsApi = () => {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('VITE_GOOGLE_MAPS_API_KEY no está configurada.');
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (mapsLoaderPromise) return mapsLoaderPromise;

  mapsLoaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById('google-maps-js');

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.google.maps), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar Google Maps.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-js';
    script.async = true;
    script.defer = true;
    script.src = 'https://maps.googleapis.com/maps/api/js?key='
      + encodeURIComponent(GOOGLE_MAPS_API_KEY)
      + '&v=weekly&loading=async&libraries=routes&language=es&region=PE';
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps. Verifica la clave y las APIs habilitadas.'));
    document.head.appendChild(script);
  });

  return mapsLoaderPromise;
};

/**
 * Carga Leaflet una sola vez para que los mapas alternativos no dependan de
 * una clave o de APIs habilitadas en Google Maps.
 */
export const loadOpenStreetMapApi = () => {
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoaderPromise) return leafletLoaderPromise;

  leafletLoaderPromise = new Promise((resolve, reject) => {
    const cssId = 'leaflet-css';
    if (!document.getElementById(cssId)) {
      const css = document.createElement('link');
      css.id = cssId;
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
    }

    const scriptId = 'leaflet-js';
    const existingScript = document.getElementById(scriptId);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.L), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar el mapa gratuito.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => window.L
      ? resolve(window.L)
      : reject(new Error('No se pudo cargar el mapa gratuito.'));
    script.onerror = () => reject(new Error('No se pudo cargar el mapa gratuito.'));
    document.head.appendChild(script);
  });

  return leafletLoaderPromise;
};

const calculateWithDirectionsService = (maps, { origin, destination, originCoordinates, destinationCoordinates }) => new Promise((resolve, reject) => {
  if (typeof maps.DirectionsService !== 'function') {
    reject(new Error('Google Maps no tiene disponible el servicio de rutas. Verifica que Maps JavaScript API esté habilitada.'));
    return;
  }

  const directionsService = new maps.DirectionsService();
  directionsService.route({
    origin: originCoordinates || origin,
    destination: destinationCoordinates || destination,
    travelMode: maps.TravelMode?.DRIVING || 'DRIVING',
  }, (result, status) => {
    const route = result?.routes?.[0];
    const leg = route?.legs?.[0];

    if (status !== 'OK' || !route || !leg) {
      reject(new Error(`Google Maps no pudo calcular la ruta. Estado: ${status || 'desconocido'}.`));
      return;
    }

    const duration = leg.duration_in_traffic || leg.duration;

    resolve({
      route,
      directionsResult: result,
      distanceMeters: leg.distance?.value || 0,
      durationMillis: (duration?.value || 0) * 1000,
      source: 'directions-service',
    });
  });
});

const geocodeWithOpenStreetMap = async (address) => {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pe&q='
    + encodeURIComponent(address);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('No se pudo consultar el buscador de direcciones gratuito.');
  }

  const places = await response.json();
  const place = places[0];
  if (!place) {
    throw new Error(`No se pudo ubicar la dirección: ${address}`);
  }

  return {
    lat: Number(place.lat),
    lon: Number(place.lon),
  };
};

export const reverseGeocodeWithOpenStreetMap = async ({ lat, lng }) => {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('No se pudo obtener la dirección de la ubicación seleccionada.');
  }

  const place = await response.json();
  const address = place.address || {};
  const locality = address.city || address.town || address.village || address.municipality || address.county;
  const region = address.state || 'Pasco';

  return {
    displayName: place.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    city: [locality, region].filter(Boolean).join(', '),
  };
};

export const searchAddressesWithOpenStreetMap = async (query) => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 3) return [];

  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&countrycodes=pe&q='
    + encodeURIComponent(normalizedQuery);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('No se pudo buscar la dirección.');
  }

  const places = await response.json();
  return places.map(place => {
    const address = place.address || {};
    const locality = address.city || address.town || address.village || address.municipality || address.county;
    const region = address.state || 'Pasco';

    return {
      lat: Number(place.lat),
      lng: Number(place.lon),
      address: place.display_name,
      city: [locality, region].filter(Boolean).join(', '),
    };
  });
};

const calculateWithOpenStreetMap = async ({ origin, destination, originCoordinates, destinationCoordinates }) => {
  const [originPoint, destinationPoint] = await Promise.all([
    originCoordinates
      ? Promise.resolve({ lat: originCoordinates.lat, lon: originCoordinates.lng })
      : geocodeWithOpenStreetMap(origin),
    destinationCoordinates
      ? Promise.resolve({ lat: destinationCoordinates.lat, lon: destinationCoordinates.lng })
      : geocodeWithOpenStreetMap(destination),
  ]);

  const coordinates = `${originPoint.lon},${originPoint.lat};${destinationPoint.lon},${destinationPoint.lat}`;
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`
  );

  if (!response.ok) {
    throw new Error('No se pudo consultar el cálculo gratuito de la ruta.');
  }

  const data = await response.json();
  const route = data.routes?.[0];
  if (!route) {
    throw new Error('No se encontró una ruta para la dirección ingresada.');
  }

  return {
    route: null,
    osrmGeometry: route.geometry?.coordinates?.map(([lon, lat]) => ({ lat, lng: lon })) || [],
    distanceMeters: route.distance || 0,
    durationMillis: (route.duration || 0) * 1000,
    source: 'openstreetmap',
  };
};

/**
 * Calcula la ruta en vehículo desde la farmacia hasta el domicilio.
 * Usa Google Maps cuando la clave tiene rutas habilitadas. Si se usa una
 * Demo Key limitada, cae atrás a Nominatim + OSRM para mantener la demo
 * funcional sin facturación de Google.
 */
export const calculateDeliveryRoute = async ({ origin, destination, originCoordinates, destinationCoordinates }) => {
  if (!origin || !destination) {
    throw new Error('Se necesitan el origen de la farmacia y la dirección de entrega.');
  }

  try {
    const maps = await loadGoogleMapsApi();

    if (typeof maps.importLibrary === 'function') {
      const { Route } = await maps.importLibrary('routes');

      if (typeof Route?.computeRoutes === 'function') {
        const result = await Route.computeRoutes({
          origin: originCoordinates || origin,
          destination: destinationCoordinates || destination,
          travelMode: 'DRIVING',
          routingPreference: 'TRAFFIC_AWARE',
          fields: ['distanceMeters', 'durationMillis', 'path', 'viewport'],
        });

        const route = result.routes?.[0];
        if (route) {
          return {
            route,
            distanceMeters: route.distanceMeters || 0,
            durationMillis: route.durationMillis || route.staticDurationMillis || 0,
            source: 'routes-library',
          };
        }
      }
    }

    if (typeof maps.DirectionsService === 'function') {
      return await calculateWithDirectionsService(maps, {
        origin,
        destination,
        originCoordinates,
        destinationCoordinates,
      });
    }
  } catch (error) {
    console.warn('Google Maps no puede calcular la ruta; se usará OpenStreetMap/OSRM.', error);
  }

  return calculateWithOpenStreetMap({
    origin,
    destination,
    originCoordinates: normalizeCoordinates(originCoordinates),
    destinationCoordinates: normalizeCoordinates(destinationCoordinates),
  });
};

export const formatDistance = (distanceMeters = 0) => {
  if (distanceMeters < 1000) return Math.round(distanceMeters) + ' m';
  return (distanceMeters / 1000).toFixed(1) + ' km';
};

export const formatDuration = (durationMillis = 0) => {
  const totalMinutes = Math.max(1, Math.round(durationMillis / 60000));
  if (totalMinutes < 60) return totalMinutes + ' min';

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? hours + ' h ' + minutes + ' min' : hours + ' h';
};
