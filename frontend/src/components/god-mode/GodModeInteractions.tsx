import { useMapEvents } from 'react-leaflet'
import { useReducer } from 'spacetimedb/react'
import { Identity } from 'spacetimedb'
import { reducers } from '../../module_bindings'
import type { PlacementMode } from './GodModeContainer'

interface Props {
  placementMode: PlacementMode
  onPlaced: () => void
  onIncidentClick?: (lat: number, lng: number) => void
}

export default function GodModeInteractions({ placementMode, onPlaced, onIncidentClick }: Props) {
  const godModeMoveEntity = useReducer(reducers.godModeMoveEntity)

  useMapEvents({
    click(e) {
      if (placementMode === 'none') return

      const { lat, lng } = e.latlng

      if (placementMode === 'incident') {
        if (onIncidentClick) onIncidentClick(lat, lng)
        return // do not call onPlaced yet
      } else if (placementMode === 'barrier') {
        const randomHex = Array.from({ length: 64 })
          .map(() => Math.floor(Math.random() * 16).toString(16))
          .join('')
        godModeMoveEntity({
          targetId: Identity.fromString(randomHex),
          lat,
          lng,
          type: 'barrier',
          subType: 'roadblock'
        })
      } else {
        // Place a responder
        // Generate a random ID for the new responder
        const randomHex = Array.from({ length: 64 })
          .map(() => Math.floor(Math.random() * 16).toString(16))
          .join('')
        godModeMoveEntity({
          targetId: Identity.fromString(randomHex),
          lat,
          lng,
          type: 'responder',
          subType: placementMode
        })
      }

      onPlaced()
    }
  })

  return null
}
