'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type LocationPickerMapProps = {
  latitude: number;
  longitude: number;
  zoom?: number;
  onChange: (latitude: number, longitude: number) => void;
};

function RecenterOnChange({ latitude, longitude, zoom }: { latitude: number; longitude: number; zoom: number }) {
  const map = useMap();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    map.flyTo([latitude, longitude], zoom);
  }, [latitude, longitude, zoom, map]);

  return null;
}

export function LocationPickerMap({ latitude, longitude, zoom = 16, onChange }: LocationPickerMapProps) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      className="locality-map"
      scrollWheelZoom={true}
      zoom={zoom}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker
        draggable
        eventHandlers={{
          dragend: (event) => {
            const marker = event.target as L.Marker;
            const position = marker.getLatLng();
            onChange(position.lat, position.lng);
          },
        }}
        icon={markerIcon}
        position={[latitude, longitude]}
      />
      <RecenterOnChange latitude={latitude} longitude={longitude} zoom={zoom} />
    </MapContainer>
  );
}
