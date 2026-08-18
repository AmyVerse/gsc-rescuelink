import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import type { LeafletEventHandlerFnMap } from 'leaflet'
import { useTable, useReducer } from 'spacetimedb/react'
import { tables, reducers } from '../../module_bindings'
import type { LiveEntities, Incidents } from '../../module_bindings/types'
const EMOJI: Record<string, string> = {
  ambulance: '🚑',
  firetruck: '🚒',
  police: '🚔',
  volunteer: '🙋',
  rescue: '🆘',
  barrier: '🚧',
  default: '🚨',
}

function makeEmojiIcon(subType: string) {
  return L.divIcon({
    className: 'responder-icon',
    html: `<span style="font-size: 24px" role="img" aria-label="${subType}">${EMOJI[subType] ?? EMOJI.default}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  })
}

interface ResponderMarkerProps {
  entity: LiveEntities
  onDrag: (entity: LiveEntities, lat: number, lng: number) => void
  onDelete: (id: import('spacetimedb').Identity) => void
}

function ResponderMarker({ entity, onDrag, onDelete }: ResponderMarkerProps) {
  const markerRef = useRef<L.Marker>(null)
  const isDragging = useRef(false)
  const [initialPos] = useState<[number, number]>([entity.lat, entity.lng])

  const entityRef = useRef(entity)
  const onDragRef = useRef(onDrag)

  useEffect(() => {
    entityRef.current = entity
    onDragRef.current = onDrag
    if (!isDragging.current && markerRef.current) {
      markerRef.current.setLatLng([entity.lat, entity.lng])
    }
  }, [entity.lat, entity.lng, entity, onDrag])

  const handlers = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      dragstart() {
        isDragging.current = true
      },
      drag() {
        const m = markerRef.current
        if (!m) return
        const p = m.getLatLng()
        onDragRef.current(entityRef.current, p.lat, p.lng)
      },
      dragend() {
        isDragging.current = false
      }
    }),
    []
  )

  const icon = useMemo(() => makeEmojiIcon(entity.subType), [entity.subType]);

  return (
    <Marker
      ref={markerRef}
      position={initialPos}
      icon={icon}
      draggable
      eventHandlers={handlers}
    >
      <Popup>
        <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 160, color: '#333' }}>
          <p style={{ fontWeight: 700, marginBottom: 4 }}>
            {EMOJI[entity.subType] ?? EMOJI.default} {entity.subType.toUpperCase()}
          </p>
          <p style={{ fontSize: 12 }}>
            Status: <b>{entity.status}</b>
          </p>
          {entity.userPhone && (
            <p style={{ fontSize: 12 }}>📞 {entity.userPhone}</p>
          )}
          <p style={{ fontSize: 11, marginTop: 4 }}>
            {entity.lat.toFixed(5)}, {entity.lng.toFixed(5)}
          </p>
          <button
            onClick={() => onDelete(entity.id)}
            style={{
              marginTop: '10px', width: '100%', padding: '6px',
              backgroundColor: '#dc2626', color: 'white',
              border: 'none', borderRadius: '4px', cursor: 'pointer',
              fontWeight: 'bold', fontSize: '12px'
            }}>
            Delete Entity
          </button>
        </div>
      </Popup>
    </Marker>
  )
}

export default function GodModeMarkers() {
  const [allEntities] = useTable(tables.live_entities)
  const [allIncidents] = useTable(tables.incidents)
  const activeIncidents = useMemo(() => allIncidents.filter((i: Incidents) => i.status === 'active'), [allIncidents])
  const distressMarkers = useMemo(() => allEntities.filter((e: LiveEntities) => e.type === 'distress'), [allEntities])
  const responders = useMemo(() => allEntities.filter((e: LiveEntities) => e.type === 'responder'), [allEntities])
  const barriers = useMemo(() => allEntities.filter((e: LiveEntities) => e.type === 'barrier'), [allEntities])

  const godModeMoveEntity = useReducer(reducers.godModeMoveEntity)
  const godModeDeleteEntity = useReducer(reducers.godModeDeleteEntity)
  const godModeDeleteIncident = useReducer(reducers.godModeDeleteIncident)

  const handleDrag = useCallback(
    (entity: LiveEntities, lat: number, lng: number) => { GodModeMoveEntity(entity, lat, lng) },
    []
  )

  function GodModeMoveEntity(entity: LiveEntities, lat: number, lng: number) {
    godModeMoveEntity({
      targetId: entity.id,
      lat,
      lng,
      type: entity.type,
      subType: entity.subType,
    })
  }

  const handleDeleteEntity = (id: import('spacetimedb').Identity) => {
    godModeDeleteEntity({ entityId: id })
  }

  const handleDeleteIncident = (id: bigint) => {
    godModeDeleteIncident({ incidentId: id })
  }

  const incidentColor = (cat: string) => cat === 'fire' || cat === 'medical' ? '#ff3b30' : '#ff453a'

  return (
    <>
      {activeIncidents.map((inc: Incidents) => (
        <CircleMarker
          key={String(inc.incidentId)}
          center={[inc.lat, inc.lng]}
          radius={20}
          pathOptions={{
            color: incidentColor(inc.category),
            fillColor: incidentColor(inc.category),
            fillOpacity: 0.22,
            weight: 2.5,
          }}
        >
          <Popup>
            <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 200, color: '#333' }}>
              <p style={{ fontWeight: 700, color: '#ff3b30', marginBottom: 4 }}>
                🔴 {inc.category.toUpperCase()} INCIDENT
              </p>
              <p style={{ fontSize: 12, lineHeight: 1.5 }}>{inc.description}</p>
              <p style={{ fontSize: 11, marginTop: 6 }}>
                ID #{String(inc.incidentId)} · {inc.status}
              </p>
              <button
                onClick={() => handleDeleteIncident(inc.incidentId)}
                style={{
                  marginTop: '10px', width: '100%', padding: '6px',
                  backgroundColor: '#dc2626', color: 'white',
                  border: 'none', borderRadius: '4px', cursor: 'pointer',
                  fontWeight: 'bold', fontSize: '12px'
                }}>
                Delete Incident
              </button>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {distressMarkers.map((e: LiveEntities) => (
        <ResponderMarker
          key={e.id.toHexString()}
          entity={e}
          onDrag={handleDrag}
          onDelete={handleDeleteEntity}
        />
      ))}

      {/* SOS distress signals removed */}

      {responders.map((e: LiveEntities) => (
        <ResponderMarker
          key={e.id.toHexString()}
          entity={e}
          onDrag={handleDrag}
          onDelete={handleDeleteEntity}
        />
      ))}

      {barriers.map((e: LiveEntities) => (
        <ResponderMarker
          key={e.id.toHexString()}
          entity={e}
          onDrag={handleDrag}
          onDelete={handleDeleteEntity}
        />
      ))}
    </>
  )
}
