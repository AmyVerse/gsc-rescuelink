import { useState, useMemo, useEffect } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { tables, reducers } from '../module_bindings';
import type { LiveEntities, Incidents } from '../module_bindings/types';
import { Identity } from 'spacetimedb';
import MarkdownContent from '../components/MarkdownContent';
import { analyzeDispatch } from '../lib/ai';
import type { DispatchSuggestion } from '../lib/ai';

const MAP_CENTER: [number, number] = [21.1458, 79.0882];
const MAP_ZOOM = 13;

const EMOJI: Record<string, string> = {
  ambulance: '🚑',
  firetruck: '🚒',
  police: '🚔',
  volunteer: '🙋',
  rescue: '🆘',
  barrier: '🚧',
  default: '🚨',
};



function AdminMapInteractions({
  selectedEntityNumber,
  onDestinationSelected,
  placementMode,
  onPlaced
}: {
  selectedEntityNumber: bigint | null;
  onDestinationSelected: (lat: number, lng: number) => void;
  placementMode: string;
  onPlaced: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (placementMode !== 'none') {
        onPlaced(e.latlng.lat, e.latlng.lng);
      } else if (selectedEntityNumber !== null) {
        onDestinationSelected(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

export default function AdminDashboard() {
  const adminPasswordHash = import.meta.env.VITE_ADMIN_PASSWORD || 'password';
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  const { isActive: connected } = useSpacetimeDB();
  const [allEntities] = useTable(tables.live_entities);
  const [allIncidents] = useTable(tables.incidents);

  const adminAssignDestination = useReducer(reducers.adminAssignDestination);
  const godModeMoveEntity = useReducer(reducers.godModeMoveEntity);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<bigint | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<bigint | null>(null);
  const [placementMode, setPlacementMode] = useState<string>('none');
  
  const [aiSuggestion, setAiSuggestion] = useState<DispatchSuggestion | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showJustification, setShowJustification] = useState(false);
  const [analyzedIncidentId, setAnalyzedIncidentId] = useState<bigint | null>(null);
  const [suggestedResponderIds, setSuggestedResponderIds] = useState<bigint[]>([]);
  const [dispatchedIncidents, setDispatchedIncidents] = useState<Record<string, boolean>>({});

  const responders = useMemo(
    () => allEntities.filter((e: LiveEntities) => e.type === 'responder'),
    [allEntities]
  );
  const barriers = useMemo(
    () => allEntities.filter((e: LiveEntities) => e.type === 'barrier'),
    [allEntities]
  );
  
  const incidents = useMemo(
    () => [...allIncidents].sort((a: Incidents, b: Incidents) => Number(b.createdAt - a.createdAt)),
    [allIncidents]
  );

  const handleDestinationSelected = (lat: number, lng: number) => {
    if (selectedEntity !== null) {
      adminAssignDestination({
        entityNumber: selectedEntity,
        destLat: lat,
        destLng: lng,
      });
      setSelectedEntity(null);
    }
  };

  const handlePlaced = (lat: number, lng: number) => {
    if (placementMode !== 'none') {
      const randomHex = Array.from({ length: 64 })
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join('');
      godModeMoveEntity({
        targetId: Identity.fromString(randomHex),
        lat,
        lng,
        type: placementMode === 'barrier' ? 'barrier' : 'responder',
        subType: placementMode === 'barrier' ? 'roadblock' : placementMode
      });
      setPlacementMode('none');
    }
  };

  useEffect(() => {
    if (selectedIncident !== null && selectedIncident !== analyzedIncidentId) {
      const inc = incidents.find(i => i.incidentId === selectedIncident);
      if (inc) {
        setIsAnalyzing(true);
        setAnalyzedIncidentId(selectedIncident);
        const idleResponders = responders.filter(r => r.destinationLat === undefined || r.destinationLat === null || r.destinationLat > 900.0);
        const availableResources: Record<string, number> = {};
        idleResponders.forEach(r => {
           availableResources[r.subType] = (availableResources[r.subType] || 0) + 1;
        });
        
        analyzeDispatch(inc.description, availableResources).then(suggestion => {
           setAiSuggestion(suggestion);
           
           const suggestedIds: bigint[] = [];
           suggestion.allocation.forEach(alloc => {
             const typeResponders = idleResponders
               .filter(r => r.subType === alloc.type)
               .map(r => ({
                 id: r.entityNumber,
                 dist: L.latLng(r.lat, r.lng).distanceTo(L.latLng(inc.lat, inc.lng))
               }))
               .sort((a, b) => a.dist - b.dist);
               
             const selected = typeResponders.slice(0, alloc.count).map(r => r.id);
             suggestedIds.push(...selected);
           });
           setSuggestedResponderIds(suggestedIds);
           setIsAnalyzing(false);
        });
      }
    } else if (selectedIncident === null) {
      setAiSuggestion(null);
      setAnalyzedIncidentId(null);
      setShowJustification(false);
      setSuggestedResponderIds([]);
    }
  }, [selectedIncident, analyzedIncidentId, incidents, responders]);

  if (!isAuthenticated) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-[#fcf9f4]" style={{ fontFamily: 'Cera Pro, Trebuchet MS, sans-serif' }}>
        <form 
          className="bg-[#ffffff] p-12 flex flex-col gap-8 min-w-[420px] border border-[#dac2b6]/30 shadow-[0_4px_24px_rgba(85,58,52,0.04)]"
          onSubmit={(e) => {
            e.preventDefault();
            if (passwordInput === adminPasswordHash) {
              setIsAuthenticated(true);
            } else {
              alert('Incorrect password');
            }
          }}
        >
          <div className="text-center mb-2">
            <div className="w-16 h-16 mx-auto bg-[#ebe8e3] rounded-full flex items-center justify-center mb-6">
              <span className="text-2xl text-[#553a34]">🏛️</span>
            </div>
            <h1 className="text-3xl font-black text-[#553a34] tracking-tight">ADMIN PORTAL</h1>
            <p className="text-xs text-[#553a34]/50 uppercase tracking-[0.2em] mt-2 font-bold">Government Operations</p>
          </div>
          
          <div className="flex flex-col gap-2">
            <input
              type="password"
              placeholder="System Password"
              className="w-full p-4 bg-[#ebe8e3] border-b-2 border-[#553a34] text-center text-lg outline-none text-[#553a34] placeholder:text-[#553a34]/40 font-bold transition-all focus:bg-[#fcf9f4]"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoFocus
            />
          </div>
          
          <button type="submit" className="w-full bg-[#553a34] text-white font-bold p-4 rounded-md mt-2 hover:bg-[#3d2a25] transition-all uppercase tracking-widest text-sm shadow-[0_4px_14px_rgba(85,58,52,0.2)]">
            Establish Connection
          </button>
        </form>
      </div>
    );
  }

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

      {/* Sidebar */}
      <div className={`fixed md:relative top-0 left-0 h-full w-[85vw] max-w-[420px] md:w-[420px] flex-none flex flex-col bg-[#ffffff] border-r border-[#dac2b6]/40 z-[3000] md:z-50 shadow-[4px_0_24px_rgba(85,58,52,0.02)] transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-6 border-b border-[#dac2b6]/40 flex items-center justify-between bg-[#fcf9f4]">
          <div>
            <h1 className="font-black text-2xl text-[#553a34] tracking-tight">ADMIN PORTAL</h1>
            <p className="text-[10px] font-bold text-[#974726] uppercase tracking-[0.25em] mt-1">Live Rescue Link Overview</p>
          </div>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${connected ? 'bg-[#ffdea0]' : 'bg-[#dac2b6]/50'}`} title={connected ? "Connected" : "Disconnected"}>
            <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-[#553d00]' : 'bg-[#553a34]/50'}`} />
          </div>
        </div>

        {/* Responders List */}
        <div className="flex-1 overflow-y-auto border-b border-[#dac2b6]/40 bg-[#fcf9f4]">
          <div className="p-5 bg-[#ffffff] sticky top-0 z-10 border-b border-[#dac2b6]/40 shadow-sm">
            <h2 className="font-black text-xs text-[#553a34]/60 uppercase tracking-[0.2em] mb-3">Available Responders ({responders.length})</h2>
            <div className="flex flex-wrap gap-2">
              {['ambulance', 'firetruck', 'police', 'volunteer', 'barrier'].map(sub => (
                <button
                  key={sub}
                  onClick={() => setPlacementMode(placementMode === sub ? 'none' : sub)}
                  className={`text-[10px] px-3 py-2 font-bold uppercase tracking-widest transition-colors border ${
                    placementMode === sub 
                      ? 'bg-[#553a34] text-white border-[#553a34]' 
                      : 'bg-white text-[#553a34] border-[#dac2b6] hover:bg-[#ebe8e3]'
                  }`}
                >
                  <span className="mr-1">{EMOJI[sub]}</span> ADD
                </button>
              ))}
            </div>
          </div>
          <div className="p-5 flex flex-col gap-4">
            {responders.map((r: LiveEntities) => {
              const isSelected = selectedEntity === r.entityNumber;
              const hasDest = r.destinationLat !== undefined && r.destinationLat !== null && r.destinationLat <= 900.0;
              const isSuggested = suggestedResponderIds.includes(r.entityNumber);
              
              return (
                <div 
                  key={r.entityNumber.toString()} 
                  onClick={() => setSelectedEntity(isSelected ? null : r.entityNumber)}
                  className={`p-4 cursor-pointer transition-all border-l-4 bg-white shadow-sm ${
                    isSelected 
                      ? 'border-l-[#553a34] border-t border-r border-b border-[#553a34]/20 bg-[#ebe8e3]/30' 
                      : isSuggested
                      ? 'border-l-[#974726] border border-[#dac2b6] bg-[#fcf9f4]'
                      : 'border-l-transparent border border-[#dac2b6]/40 hover:border-[#dac2b6]'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-black text-sm text-[#553a34] uppercase tracking-tight">{EMOJI[r.subType] ?? EMOJI.default} UNIT #{r.entityNumber.toString()}</span>
                    <div className="flex gap-2 items-center">
                      {isSuggested && <span className="text-[9px] bg-[#ffdea0] text-[#261900] px-2 py-1 rounded-full uppercase font-black tracking-widest">Suggested</span>}
                      <span className={`text-[9px] px-2 py-1 rounded-sm uppercase font-black tracking-widest border ${
                        r.status === 'deployed' ? 'bg-[#ebe8e3] text-[#553a34] border-[#dac2b6]' : 'bg-[#553a34] text-white border-[#553a34]'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-[#553a34]/70 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="uppercase tracking-widest text-[#553a34]/50">Type</span>
                      <span className="uppercase text-[#553a34]">{r.subType}</span>
                    </div>
                    {hasDest ? (
                      <div className="text-[#974726] font-black text-[10px] mt-2 pt-2 border-t border-[#dac2b6]/30 uppercase tracking-[0.2em] text-center">🎯 Deployed to Target</div>
                    ) : (
                      <div className="text-[#553a34]/40 text-[10px] mt-2 pt-2 border-t border-[#dac2b6]/30 uppercase tracking-[0.2em] text-center">Idle — Click Map to Assign</div>
                    )}
                  </div>
                </div>
              );
            })}
            {responders.length === 0 && <div className="text-center text-[#553a34]/40 font-bold uppercase tracking-widest text-xs py-8">No responders available</div>}
          </div>
        </div>

        {/* Incidents List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 bg-[#ffffff] sticky top-0 z-10 border-b border-[#dac2b6]/40 shadow-sm">
            <h2 className="font-black text-xs text-[#553a34]/60 uppercase tracking-[0.2em]">Live Incidents ({incidents.length})</h2>
          </div>
          <div className="p-5 flex flex-col gap-4">
            {incidents.map((inc: Incidents) => {
              const isSelected = selectedIncident === inc.incidentId;
              return (
              <div 
                key={inc.incidentId.toString()} 
                onClick={() => setSelectedIncident(isSelected ? null : inc.incidentId)}
                className={`p-4 border-l-4 cursor-pointer transition-all bg-white shadow-sm ${
                  isSelected ? 'border-l-[#974726] border-t border-r border-b border-[#974726]/20 bg-[#ebe8e3]/30' : 'border-l-transparent border border-[#dac2b6]/40 hover:border-[#dac2b6]'
                }`}
              >
                <div className="flex justify-between items-center mb-3">
                  <span className={`font-black text-xs uppercase tracking-widest ${isSelected ? 'text-[#974726]' : 'text-[#553a34]'}`}>
                    {isSelected ? '■' : '●'} {inc.category}
                  </span>
                  <span className="text-[10px] font-bold text-[#553a34]/40 uppercase tracking-widest">
                    {new Date(Number(inc.createdAt)).toLocaleTimeString()}
                  </span>
                </div>
                <p className={`text-sm leading-relaxed ${isSelected ? 'text-[#553a34] font-medium' : 'text-[#553a34]/80'}`}>{inc.description}</p>
                <div className="mt-3 pt-3 border-t border-[#dac2b6]/30 text-[10px] text-[#553a34]/50 font-bold uppercase tracking-[0.15em] flex justify-between">
                  <span>ID: {inc.incidentId.toString()}</span>
                  <span>{inc.lat.toFixed(4)}, {inc.lng.toFixed(4)}</span>
                </div>
              </div>
            )})}
            {incidents.length === 0 && <div className="text-center text-[#553a34]/40 font-bold uppercase tracking-widest text-xs py-8">No active incidents</div>}
          </div>
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative bg-[#ebe8e3]">
        {/* Top AI Dispatch Panel */}
        {selectedIncident !== null && (
          <div className="absolute top-6 left-6 right-6 z-[2000] bg-[#ffffff] border border-[#dac2b6]/40 rounded-sm p-6 shadow-[0_8px_30px_rgba(85,58,52,0.08)] flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-[#dac2b6]/30 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl text-[#974726]">⚙️</span>
                <h3 className="font-black text-sm uppercase tracking-[0.25em] text-[#553a34]">Strategic AI Dispatch</h3>
              </div>
              {isAnalyzing && <span className="text-xs font-bold text-[#974726] uppercase tracking-widest animate-pulse">Computing Allocation...</span>}
            </div>
            
            {aiSuggestion && (
              <div className="mt-2 text-sm text-[#553a34]">
                <p className="font-bold text-lg mb-5 leading-relaxed">{aiSuggestion.suggestionText}</p>
                
                <div className="flex flex-wrap gap-4 items-center mb-6">
                  <div className="flex gap-2">
                    {aiSuggestion.allocation.map((alloc, idx) => (
                      <span key={idx} className="bg-[#ffdea0] px-4 py-2 border border-[#dac2b6]/50 text-[#261900] font-black text-[10px] uppercase tracking-widest shadow-sm">
                        {alloc.count}× {alloc.type}
                      </span>
                    ))}
                    {aiSuggestion.allocation.length === 0 && <span className="text-[#553a34]/50 font-bold bg-[#ebe8e3] px-4 py-2 text-[10px] uppercase tracking-widest">No resources to allocate</span>}
                  </div>
                  
                  <button 
                    onClick={() => setShowJustification(!showJustification)}
                    className="ml-auto text-[10px] px-4 py-2 border border-[#dac2b6] font-black hover:bg-[#ebe8e3] transition-colors uppercase tracking-[0.2em] text-[#553a34]"
                  >
                    {showJustification ? 'Hide Reasoning —' : 'View Reasoning +'}
                  </button>
                </div>
                
                {suggestedResponderIds.length > 0 && selectedIncident && (
                  dispatchedIncidents[selectedIncident.toString()] ? (
                    <div className="w-full bg-[#ebe8e3] text-[#553a34] font-black py-4 text-xs uppercase tracking-[0.25em] text-center border border-[#dac2b6]">
                      ✓ Units Deployed Successfully
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        const inc = incidents.find(i => i.incidentId === selectedIncident);
                        if (inc) {
                          suggestedResponderIds.forEach(id => {
                            adminAssignDestination({
                              entityNumber: id,
                              destLat: inc.lat,
                              destLng: inc.lng,
                            });
                          });
                          setSuggestedResponderIds([]);
                          setDispatchedIncidents(prev => ({ ...prev, [inc.incidentId.toString()]: true }));
                        }
                      }}
                      className="w-full bg-[#553a34] hover:bg-[#3d2a25] text-white font-bold py-4 text-xs uppercase tracking-[0.25em] transition-all shadow-[0_4px_14px_rgba(85,58,52,0.2)]"
                    >
                      ⚡ Autodeploy {suggestedResponderIds.length} Nearest Units
                    </button>
                  )
                )}

                {showJustification && (
                  <div className="mt-6 p-5 bg-[#fcf9f4] border border-[#dac2b6]/40 text-sm text-[#553a34]/80 leading-relaxed font-medium">
                    <span className="text-[#974726] font-black uppercase tracking-widest text-xs block mb-2">Rationale:</span>
                    {aiSuggestion.justification}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {selectedEntity !== null && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[1000] bg-[#553a34] text-white px-8 py-4 rounded-sm font-black shadow-[0_8px_30px_rgba(85,58,52,0.15)] pointer-events-none animate-pulse text-xs uppercase tracking-widest border border-[#dac2b6]/20">
            Assign Destination: Click anywhere on the map
          </div>
        )}
        {placementMode !== 'none' && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[1000] bg-[#974726] text-white px-8 py-4 rounded-sm font-black shadow-[0_8px_30px_rgba(151,71,38,0.2)] pointer-events-none animate-pulse text-xs uppercase tracking-widest border border-[#dac2b6]/20">
            Place Responder: Click to drop {EMOJI[placementMode]}
          </div>
        )}
        
        <MapContainer
          center={MAP_CENTER}
          zoom={MAP_ZOOM}
          style={{ height: '100%', width: '100%', cursor: (selectedEntity || placementMode !== 'none') ? 'crosshair' : 'grab' }}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap'
            maxZoom={19}
          />
          
          <AdminMapInteractions 
            selectedEntityNumber={selectedEntity} 
            onDestinationSelected={handleDestinationSelected}
            placementMode={placementMode}
            onPlaced={handlePlaced}
          />

          {/* Render Incidents */}
          {incidents.map((inc: Incidents) => {
            const isSelected = selectedIncident === inc.incidentId;
            return (
            <CircleMarker
              key={`inc-${inc.incidentId}`}
              center={[inc.lat, inc.lng]}
              radius={isSelected ? 22 : 16}
              eventHandlers={{
                click: () => {
                  if (selectedEntity !== null) {
                    handleDestinationSelected(inc.lat, inc.lng);
                  } else {
                    setSelectedIncident(isSelected ? null : inc.incidentId);
                  }
                }
              }}
              pathOptions={{
                color: isSelected ? '#553a34' : '#974726', 
                fillColor: isSelected ? '#553a34' : '#974726', 
                fillOpacity: isSelected ? 0.8 : 0.4,
                weight: isSelected ? 4 : 2
              }}
            >
              <Popup><div className={`font-black uppercase tracking-widest text-xs ${isSelected ? 'text-[#553a34]' : 'text-[#974726]'}`}>{inc.category}</div></Popup>
            </CircleMarker>
          )})}

          {/* Render Responders & Deployment Lines */}
          {responders.map((r: LiveEntities) => {
            const hasDest = r.destinationLat !== undefined && r.destinationLat !== null && r.destinationLat <= 900.0 && r.destinationLng !== undefined;
            const isSelected = selectedEntity === r.entityNumber;
            const icon = L.divIcon({
              className: 'responder-icon',
              html: `<div style="background: ${isSelected ? '#ffffff' : 'transparent'}; border-radius: 50%; padding: ${isSelected ? '4px' : '0'}; box-shadow: ${isSelected ? '0 4px 12px rgba(85,58,52,0.2)' : 'none'}; border: ${isSelected ? '2px solid #553a34' : 'none'}; transition: all 0.2s;"><span style="font-size: ${isSelected ? '28px' : '24px'};" role="img" aria-label="${r.subType}">${EMOJI[r.subType] ?? EMOJI.default}</span></div>`,
              iconSize: isSelected ? [44, 44] : [36, 36],
              iconAnchor: isSelected ? [22, 22] : [18, 18],
            });

            return (
              <div key={`resp-${r.entityNumber.toString()}`}>
                <Marker position={[r.lat, r.lng]} icon={icon}>
                  <Popup><div className="font-bold text-[#553a34] uppercase text-xs tracking-widest">Unit #{r.entityNumber.toString()} - {r.status}</div></Popup>
                </Marker>
                {/* Draw line to destination if exists */}
                {hasDest && (
                  <Polyline
                    positions={[
                      [r.lat, r.lng],
                      [r.destinationLat!, r.destinationLng!]
                    ]}
                    color={isSelected ? "#553a34" : "#dac2b6"}
                    weight={isSelected ? 4 : 2}
                    dashArray={isSelected ? "10, 10" : "5, 5"}
                    opacity={isSelected ? 0.9 : 0.6}
                  />
                )}
                {/* Destination Target Marker */}
                {hasDest && (
                  <CircleMarker
                    center={[r.destinationLat!, r.destinationLng!]}
                    radius={5}
                    pathOptions={{ color: isSelected ? "#553a34" : "#dac2b6", fillColor: isSelected ? "#553a34" : "#dac2b6", fillOpacity: 1 }}
                  />
                )}
              </div>
            );
          })}

          {/* Render Barriers */}
          {barriers.map((b: LiveEntities) => {
            const icon = L.divIcon({
              className: 'barrier-icon',
              html: `<div style="display:flex; justify-content:center; align-items:center; width:36px; height:36px; border-radius:50%; background:rgba(239,68,68,0.2); border:2px solid #ef4444;"><span style="font-size:24px;" role="img" aria-label="barrier">🚧</span></div>`,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            });

            return (
              <Marker key={`barrier-${b.entityNumber.toString()}`} position={[b.lat, b.lng]} icon={icon}>
                <Popup><div className="font-bold text-[#ef4444] uppercase text-xs tracking-widest">Road Barrier</div></Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Incident Details Right Panel */}
      {selectedIncident !== null && (() => {
        const inc = incidents.find((i: Incidents) => i.incidentId === selectedIncident);
        if (!inc) return null;
        return (
          <div className="w-[360px] h-full bg-[#ffffff] border-l border-[#dac2b6]/40 z-50 flex flex-col shadow-[-8px_0_30px_rgba(85,58,52,0.05)] relative">
            <div className="p-6 border-b border-[#dac2b6]/40 flex justify-between items-center bg-[#fcf9f4]">
              <h2 className="font-black text-xs text-[#553a34] uppercase tracking-[0.2em]">Incident Brief</h2>
              <button className="text-[#553a34]/40 hover:text-[#553a34] transition-colors" onClick={() => setSelectedIncident(null)}>✕</button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="mb-6">
                <span className="font-black text-[#974726] text-xs uppercase tracking-[0.2em] bg-[#974726]/10 px-3 py-1.5 border border-[#974726]/20">
                  {inc.category}
                </span>
              </div>
              <div className="text-sm text-[#553a34]/80 leading-relaxed markdown-override font-medium">
                <MarkdownContent content={inc.description} />
              </div>
              
              <div className="mt-8 pt-6 border-t border-[#dac2b6]/40">
                <div className="text-[10px] text-[#553a34]/50 font-black uppercase tracking-[0.2em] mb-3">Location Data</div>
                <div className="text-xs text-[#553a34] font-medium tracking-wide">LAT: {inc.lat.toFixed(6)}</div>
                <div className="text-xs text-[#553a34] font-medium tracking-wide mt-1.5">LNG: {inc.lng.toFixed(6)}</div>
              </div>
              
              <div className="mt-6 pt-6 border-t border-[#dac2b6]/40">
                <div className="text-[10px] text-[#553a34]/50 font-black uppercase tracking-[0.2em] mb-3">Time Logged</div>
                <div className="text-xs text-[#553a34] font-medium tracking-wide">{new Date(Number(inc.createdAt)).toLocaleString()}</div>
              </div>
            </div>
            {selectedEntity !== null && (
              <div className="p-6 bg-[#fcf9f4] border-t border-[#dac2b6]/40">
                {dispatchedIncidents[inc.incidentId.toString()] ? (
                  <button 
                    disabled
                    className="w-full bg-[#ebe8e3] text-[#553a34] font-black py-4 text-xs uppercase tracking-[0.2em] border border-[#dac2b6]/50 cursor-not-allowed"
                  >
                    ✓ DEPLOYED TO TARGET
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      handleDestinationSelected(inc.lat, inc.lng);
                      setDispatchedIncidents(prev => ({ ...prev, [inc.incidentId.toString()]: true }));
                    }}
                    className="w-full bg-[#553a34] hover:bg-[#3d2a25] text-white font-bold py-4 rounded-sm text-xs uppercase tracking-[0.2em] transition-all shadow-[0_4px_14px_rgba(85,58,52,0.2)]"
                  >
                    DEPLOY SELECTED UNIT
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
