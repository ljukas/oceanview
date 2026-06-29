import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Map as MapGL,
  type MapLayerMouseEvent,
  Marker,
  type MarkerDragEvent,
  NavigationControl,
} from '@vis.gl/react-maplibre'
import { MapPinIcon } from 'lucide-react'
import { LEFKADA, mapStyleUrl } from './mapConfig'

export default function LocationPicker({
  value,
  onChange,
}: {
  value: { lat: number; lng: number } | null
  onChange: (loc: { lat: number; lng: number }) => void
}) {
  const initialViewState = value ? { longitude: value.lng, latitude: value.lat, zoom: 11 } : LEFKADA
  return (
    <MapGL
      initialViewState={initialViewState}
      mapStyle={mapStyleUrl()}
      onClick={(e: MapLayerMouseEvent) => onChange({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
      style={{ width: '100%', height: '100%' }}
    >
      <NavigationControl position="top-right" />
      {value ? (
        <Marker
          longitude={value.lng}
          latitude={value.lat}
          anchor="bottom"
          draggable
          onDragEnd={(e: MarkerDragEvent) => onChange({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
        >
          <MapPinIcon className="size-8 fill-brand text-brand drop-shadow" />
        </Marker>
      ) : null}
    </MapGL>
  )
}
