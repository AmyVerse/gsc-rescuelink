import { useTable } from 'spacetimedb/react'
import { tables } from '../../module_bindings'
import type { LiveEntities, Incidents, DistressSignals } from '../../module_bindings/types'
import type { PlacementMode } from './GodModeContainer'

interface Props {
  connected: boolean
  placementMode: PlacementMode
  setPlacementMode: (mode: PlacementMode) => void
}



export default function GodModeControls({ connected, placementMode, setPlacementMode }: Props) {
  const [allEntities]  = useTable(tables.live_entities)
  const [allIncidents] = useTable(tables.incidents)
  const [allSignals]   = useTable(tables.distress_signals)

  const activeIncidents = allIncidents.filter((i: Incidents) => i.status === 'active')
  const responders      = allEntities.filter((e: LiveEntities) => e.type === 'responder')
  const barriers        = allEntities.filter((e: LiveEntities) => e.type === 'barrier')
  const pendingSOS      = allSignals.filter((s: DistressSignals) => s.status === 'pending')

  return (
    <div className="flex-1 overflow-y-auto bg-[#ffffff]">
      {/* Header */}
      <div className="p-6 border-b border-[#dac2b6]/40 flex items-center justify-between bg-[#fcf9f4]">
        <div>
          <h1 className="font-black text-2xl text-[#553a34] tracking-tight">GOD MODE</h1>
          <p className="text-[10px] font-bold text-[#974726] uppercase tracking-[0.25em] mt-1">Rescue Link Control</p>
        </div>
        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${connected ? 'bg-[#ffdea0]' : 'bg-[#dac2b6]/50'}`} title={connected ? "Connected" : "Disconnected"}>
          <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-[#553d00]' : 'bg-[#553a34]/50'}`} />
        </div>
      </div>

      <div className="p-6 border-b border-[#dac2b6]/40 bg-[#fcf9f4]">
        <h2 className="font-black text-xs text-[#553a34]/60 uppercase tracking-[0.2em] mb-4">System Metrics</h2>
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatBadge label="Incidents"    value={activeIncidents.length} />
          <StatBadge label="Responders"   value={responders.length} />
          <StatBadge label="Pending SOS"  value={pendingSOS.length} />
          <StatBadge label="Barriers"     value={barriers.length} />
          <StatBadge label="All Entities" value={allEntities.length} />
        </div>
      </div>

      {/* Spawning Controls */}
      <div className="p-6">
        <h2 className="font-black text-xs text-[#553a34]/60 uppercase tracking-[0.2em] mb-4">Spawning Tools</h2>
        <div className="text-[10px] text-[#553a34]/50 mb-4 font-bold uppercase tracking-[0.15em]">
          Select mode then click map to deploy:
        </div>
        <div className="flex flex-col gap-2">
          <ModeButton mode="incident" currentMode={placementMode} onClick={() => setPlacementMode(placementMode === 'incident' ? 'none' : 'incident')} label="🔴 Create Incident" />
          <ModeButton mode="ambulance" currentMode={placementMode} onClick={() => setPlacementMode(placementMode === 'ambulance' ? 'none' : 'ambulance')} label="🚑 Deploy Ambulance" />
          <ModeButton mode="firetruck" currentMode={placementMode} onClick={() => setPlacementMode(placementMode === 'firetruck' ? 'none' : 'firetruck')} label="🚒 Deploy Firetruck" />
          <ModeButton mode="police" currentMode={placementMode} onClick={() => setPlacementMode(placementMode === 'police' ? 'none' : 'police')} label="🚔 Deploy Police Unit" />
          <ModeButton mode="volunteer" currentMode={placementMode} onClick={() => setPlacementMode(placementMode === 'volunteer' ? 'none' : 'volunteer')} label="🙋 Deploy Volunteer" />
        </div>

        <h2 className="font-black text-xs text-[#553a34]/60 uppercase tracking-[0.2em] mb-4 mt-6">Road Controls</h2>
        <div className="flex flex-col gap-2">
          <ModeButton mode="barrier" currentMode={placementMode} onClick={() => setPlacementMode(placementMode === 'barrier' ? 'none' : 'barrier')} label="🚧 Place Barrier" />
        </div>

        <div className="text-[10px] font-bold text-[#553a34]/40 uppercase tracking-[0.15em] text-center mt-6 pt-6 border-t border-[#dac2b6]/30">
          Click any item on map to Delete.
        </div>
      </div>
    </div>
  )
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#ffffff] border border-[#dac2b6]/50 p-4 shadow-sm flex flex-col justify-center">
      <div className="text-2xl font-black text-[#553a34] leading-none mb-1">{value}</div>
      <div className="text-[9px] font-black text-[#553a34]/50 uppercase tracking-[0.2em]">{label}</div>
    </div>
  )
}

function ModeButton({ 
  mode, currentMode, onClick, label 
}: { 
  mode: PlacementMode, currentMode: PlacementMode, onClick: () => void, label: string 
}) {
  const isActive = mode === currentMode;
  return (
    <button
      onClick={onClick}
      className={`w-full p-4 font-black text-xs uppercase tracking-[0.15em] text-left transition-all border ${
        isActive 
          ? 'bg-[#553a34] text-white border-[#553a34] shadow-[0_4px_14px_rgba(85,58,52,0.2)]' 
          : 'bg-[#ffffff] text-[#553a34] border-[#dac2b6] hover:bg-[#ebe8e3]'
      }`}
    >
      {label}
    </button>
  )
}
