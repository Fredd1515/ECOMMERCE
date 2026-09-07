import React, { useEffect, useRef } from 'react';
import { Clock3, MapPinned, Route as RouteIcon } from 'lucide-react';
import {
  formatDistance,
  formatDuration,
  loadGoogleMapsApi,
  loadOpenStreetMapApi,
} from '@/lib/googleMapsClient';

const DeliveryRoutePreview = ({ routeEstimate }) => {
  const mapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let mapPolylines = [];
    let directionsRenderer = null;
    let leafletMap = null;

    const drawRoute = async () => {
      const hasRouteData = routeEstimate?.route
        || routeEstimate?.directionsResult
        || routeEstimate?.osrmGeometry?.length;
      if (!hasRouteData || !mapRef.current) return;

      try {
        if (routeEstimate.osrmGeometry?.length) {
          const L = await loadOpenStreetMapApi();
          if (cancelled) return;

          const geometry = routeEstimate.osrmGeometry
            .map(point => [Number(point.lat), Number(point.lng)])
            .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

          if (geometry.length < 2) {
            throw new Error('La ruta alternativa no contiene suficientes puntos para dibujarla.');
          }

          leafletMap = L.map(mapRef.current).setView(geometry[0], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
          }).addTo(leafletMap);

          const routeLine = L.polyline(geometry, {
            color: '#059669',
            opacity: 0.9,
            weight: 5,
          }).addTo(leafletMap);
          leafletMap.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
          return;
        }

        const maps = await loadGoogleMapsApi();
        if (cancelled) return;

        let Map = maps.Map;
        if (typeof Map !== 'function' && typeof maps.importLibrary === 'function') {
          ({ Map } = await maps.importLibrary('maps'));
        }

        if (typeof Map !== 'function') {
          throw new Error('Google Maps no pudo inicializar el mapa.');
        }

        const map = new Map(mapRef.current, {
          center: { lat: -10.682, lng: -76.256 },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          mapId: 'DEMO_MAP_ID',
        });

        if (routeEstimate.directionsResult) {
          let DirectionsRenderer = maps.DirectionsRenderer;
          if (typeof DirectionsRenderer !== 'function' && typeof maps.importLibrary === 'function') {
            ({ DirectionsRenderer } = await maps.importLibrary('routes'));
          }

          if (typeof DirectionsRenderer !== 'function') {
            throw new Error('Google Maps no pudo dibujar la ruta.');
          }

          directionsRenderer = new DirectionsRenderer({
            map,
            suppressMarkers: false,
            polylineOptions: {
              strokeColor: '#059669',
              strokeOpacity: 0.9,
              strokeWeight: 5,
            },
          });
          directionsRenderer.setDirections(routeEstimate.directionsResult);
          return;
        }

        if (routeEstimate.route.viewport) {
          map.fitBounds(routeEstimate.route.viewport);
        }

        mapPolylines = routeEstimate.route.createPolylines({
          polylineOptions: {
            map,
            strokeColor: '#059669',
            strokeOpacity: 0.9,
            strokeWeight: 5,
          },
        });
      } catch (error) {
        console.error('Error dibujando ruta de delivery:', error);
      }
    };

    drawRoute();

    return () => {
      cancelled = true;
      mapPolylines.forEach(polyline => polyline.setMap(null));
      directionsRenderer?.setMap(null);
      leafletMap?.remove();
    };
  }, [routeEstimate]);

  if (!routeEstimate) return null;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
          <RouteIcon className="w-5 h-5" />
          Ruta de entrega calculada
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="rounded-xl bg-white border border-emerald-100 p-3">
            <div className="flex items-center gap-1.5 text-gray-500 text-[11px]">
              <MapPinned className="w-3.5 h-3.5" />
              Distancia
            </div>
            <p className="text-lg font-bold text-gray-900 mt-1">
              {formatDistance(routeEstimate.distanceMeters)}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-emerald-100 p-3">
            <div className="flex items-center gap-1.5 text-gray-500 text-[11px]">
              <Clock3 className="w-3.5 h-3.5" />
              Tiempo estimado
            </div>
            <p className="text-lg font-bold text-gray-900 mt-1">
              {formatDuration(routeEstimate.durationMillis)}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-emerald-800 mt-3">
          {routeEstimate.source === 'openstreetmap'
            ? 'Ruta gratuita de demostración. El tiempo puede variar durante la entrega.'
            : 'Tiempo de traslado estimado considerando el tráfico actual. Puede variar durante la entrega.'}
        </p>
      </div>

      <div ref={mapRef} className="h-44 w-full bg-emerald-100" aria-label="Mapa de la ruta de entrega" />
    </div>
  );
};

export default DeliveryRoutePreview;
