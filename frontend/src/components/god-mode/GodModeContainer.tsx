import { useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { useSpacetimeDB } from 'spacetimedb/react'
import GodModeInteractions from './GodModeInteractions'
import GodModeMarkers from './GodModeMarkers'
import GodModeControls from './GodModeControls'
import IncidentReporter from '../IncidentReporter'

const MAP_CENTER: [number, number] = [21.1458, 79.0882]
const MAP_ZOOM = 13

export type PlacementMode = 'none' | 'incident' | 'ambulance' | 'firetruck' | 'police' | 'volunteer' | 'barrier'

export default function GodModeContainer() {
  const { isActive: connected } = useSpacetimeDB()
  const [placementMode, setPlacementMode] = useState<PlacementMode>('none')
  const [incidentCoords, setIncidentCoords] = useState<{ lat: number, lng: number } | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="flex w-screen h-screen bg-[#ebe8e3] text-[#553a34] font-sans overflow-hidden" style={{ fontFamily: 'Cera Pro, Trebuchet MS, sans-serif' }}>
      
      {/* Mobile Sidebar Toggle Button */}
      <button 
        className="md:hidden fixed top-6 left-6 z-[2000] bg-[#ffffff] p-3 shadow-md border border-[#dac2b6]/40 text-[#553a34] font-black text-xs uppercase tracking-[0.2em]"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? '✕ Close' : '☰ Menu'}
      </button>

      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-[#553a34]/20 backdrop-blur-sm z-[2999]"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`fixed md:relative top-0 left-0 h-full w-[85vw] max-w-[420px] md:w-[420px] flex-none flex flex-col bg-[#ffffff] border-r border-[#dac2b6]/40 z-[3000] md:z-[1000] shadow-[4px_0_24px_rgba(85,58,52,0.02)] transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <GodModeControls
          connected={connected}
          placementMode={placementMode}
          setPlacementMode={setPlacementMode}
        />

        {incidentCoords && (
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-[#fcf9f4] border-t border-[#dac2b6]/40 shadow-[0_-8px_30px_rgba(85,58,52,0.05)] z-50 overflow-y-auto max-h-[60vh]">
            <h3 className="font-black text-xs text-[#553a34] uppercase tracking-[0.2em] mb-4">Report Incident</h3>
            <IncidentReporter
              forcedLat={incidentCoords.lat}
              forcedLng={incidentCoords.lng}
              onSuccess={() => {
                setIncidentCoords(null);
                setPlacementMode('none');
              }}
              onCancel={() => {
                setIncidentCoords(null);
              }}
            />
          </div>
        )}
      </div>

      <div className="flex-1 relative bg-[#ebe8e3]">
        <MapContainer
          center={MAP_CENTER}
          zoom={MAP_ZOOM}
          style={{
            height: '100%', width: '100%',
            // @ts-ignore
            cursor: (placementMode !== 'none' || incidentCoords) ? 'crosshair' : 'grab'
          }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap'
            maxZoom={19}
          />
          <GodModeInteractions
            placementMode={placementMode}
            onPlaced={() => setPlacementMode('none')}
            onIncidentClick={(lat, lng) => setIncidentCoords({ lat, lng })}
          />
          <GodModeMarkers />
        </MapContainer>
      </div>
    </div>
  )
}
