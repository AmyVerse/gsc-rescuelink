import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { motion, AnimatePresence } from 'framer-motion';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import type { LiveEntities, Incidents, DistressSignals } from '../module_bindings/types';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

let lastKnownLocation: [number, number] | null = null;

// ── Emoji icon helper ──────────────────────────────────────────────────
const EMOJI: Record<string, string> = {
  ambulance: '🚑',
  firetruck: '🚒',
  police: '🚔',
  volunteer: '🙋',
  rescue: '🆘',
  barrier: '🚧',
  default: '🚨',
};

// ── Strip markdown for plain-text preview ────────────────────────────
const stripMarkdown = (md: string): string => {
  return md
    .replace(/^#{1,6}\s+/gm, '')       // headings
    .replace(/\*\*(.*?)\*\*/g, '$1')    // bold
    .replace(/\*(.*?)\*/g, '$1')        // italic
    .replace(/__(.*?)__/g, '$1')        // bold alt
    .replace(/_(.*?)_/g, '$1')          // italic alt
    .replace(/~~(.*?)~~/g, '$1')        // strikethrough
    .replace(/`(.*?)`/g, '$1')          // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // images
    .replace(/^[-*+]\s+/gm, '')        // unordered lists
    .replace(/^\d+\.\s+/gm, '')        // ordered lists
    .replace(/^>\s?/gm, '')            // blockquotes
    .replace(/---/g, '')               // horizontal rules
    .replace(/\n{2,}/g, ' ')           // collapse newlines
    .replace(/\n/g, ' ')               // remaining newlines
    .trim();
};

// ── Incident category icons ──────────────────────────────────────────
const INCIDENT_EMOJI: Record<string, string> = {
  fire: '🔥',
  flood: '🌊',
  medical: '🏥',
  security: '🛡️',
  infrastructure: '🏗️',
  traffic: '🚦',
  rescue: '🆘',
  earthquake: '🌍',
  storm: '⛈️',
  chemical: '☣️',
  explosion: '💥',
  collapse: '🏚️',
  gas: '💨',
  power: '⚡',
  water: '💧',
  accident: '🚗',
  barrier: '🚧',
  other: '📍',
  default: '🚨',
};

const getIncidentEmoji = (category: string): string => {
  const key = category.toLowerCase().trim();
  return INCIDENT_EMOJI[key] ?? INCIDENT_EMOJI.default;
};

const MapComponent = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const [searchParams] = useSearchParams();
  const paramLat = searchParams.get('lat');
  const paramLng = searchParams.get('lng');

  const [isLocating, setIsLocating] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: number, duration: number } | null>(null);
  const [mapBounds, setMapBounds] = useState<mapboxgl.LngLatBounds | null>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  // ── SpacetimeDB data ────────────────────────────────────────────
  const [allEntities] = useTable(tables.live_entities);
  const [allIncidents] = useTable(tables.incidents);
  const [allSignals] = useTable(tables.distress_signals);


  // ── Derived data ────────────────────────────────────────────────
  const responders = useMemo(() => allEntities.filter((e: LiveEntities) => e.type === 'responder'), [allEntities]);
  const barriers = useMemo(() => allEntities.filter((e: LiveEntities) => e.type === 'barrier'), [allEntities]);
  const distressSignals = useMemo(() => {
    const incidentById = new Map<number, Incidents>();
    allIncidents.forEach((incident) => {
      incidentById.set(Number(incident.incidentId), incident);
    });
    const entityByPhone = new Map<string, LiveEntities>();
    allEntities.forEach((e) => {
      if (e.userPhone) entityByPhone.set(e.userPhone, e);
    });

    return allSignals.map((signal: DistressSignals) => {
      const incident = signal.incidentId != null ? incidentById.get(Number(signal.incidentId)) : undefined;
      const entity = signal.userPhone ? entityByPhone.get(signal.userPhone) : undefined;

      const lat = incident?.lat ?? entity?.lat;
      const lng = incident?.lng ?? entity?.lng;

      return {
        ...signal,
        lat,
        lng,
      };
    }).filter((s) => s.lat !== undefined && s.lng !== undefined);
  }, [allSignals, allIncidents, allEntities]);
  const activeIncidents = useMemo(() => allIncidents.filter((i: Incidents) => i.status === 'active'), [allIncidents]);

  // ── Viewport-filtered incidents ─────────────────────────────────────
  const viewportIncidents = useMemo(() => {
    if (!mapBounds) return activeIncidents;
    return activeIncidents.filter((incident: Incidents) => {
      const sw = mapBounds.getSouthWest();
      const ne = mapBounds.getNorthEast();
      return (
        incident.lat >= sw.lat &&
        incident.lat <= ne.lat &&
        incident.lng >= sw.lng &&
        incident.lng <= ne.lng
      );
    });
  }, [activeIncidents, mapBounds]);

  // ── Update bounds handler ──────────────────────────────────────────
  const updateBounds = useCallback(() => {
    if (mapInstance.current) {
      setMapBounds(mapInstance.current.getBounds());
    }
  }, []);

  // ── Find nearest incident utility ──────────────────────────────────
  const getNearestIncident = (lat: number, lng: number) => {
    if (activeIncidents.length === 0) return null;
    let nearest = activeIncidents[0];
    let minD = Infinity;
    activeIncidents.forEach(inc => {
      const d = Math.sqrt(Math.pow(inc.lat - lat, 2) + Math.pow(inc.lng - lng, 2));
      if (d < minD) {
        minD = d;
        nearest = inc;
      }
    });
    return nearest;
  };

  // ── Fetch route from Mapbox ────────────────────────────────────────
  const fetchRoute = async (start: [number, number], end: [number, number], barriersList: LiveEntities[]) => {
    try {
      const avoidCoords = barriersList.map(b => `point(${b.lng} ${b.lat})`).join(',');
      const excludeParam = avoidCoords ? `&exclude=${avoidCoords}` : '';
      
      const query = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${start[0]},${start[1]};${end[0]},${end[1]}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}${excludeParam}`,
        { method: 'GET' }
      );
      const json = await query.json();
      if (json.code !== 'Ok') return null;
      const data = json.routes[0];
      const route = data.geometry.coordinates;
      const geojson: any = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: route
        }
      };

      if (mapInstance.current) {
        if (mapInstance.current.getSource('route')) {
          (mapInstance.current.getSource('route') as mapboxgl.GeoJSONSource).setData(geojson);
        } else {
          mapInstance.current.addSource('route', {
            type: 'geojson',
            data: geojson
          });
          mapInstance.current.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#ff3b30',
              'line-width': 5,
              'line-opacity': 0.75
            }
          });
        }
      }
      return { distance: data.distance, duration: data.duration };
    } catch (err) {
      console.error('Routing failed:', err);
      return null;
    }
  };

  // ── Effect: Handle routing ──────────────────
  useEffect(() => {
    if (selectedEntity && (selectedEntity.type === 'responder' || selectedEntity.type === 'distress')) {
      const nearest = getNearestIncident(selectedEntity.lat, selectedEntity.lng);
      if (nearest) {
        fetchRoute([selectedEntity.lng, selectedEntity.lat], [nearest.lng, nearest.lat], barriers)
          .then(info => setRouteInfo(info));
      } else {
        setRouteInfo(null);
      }
    } else {
      setRouteInfo(null);
      if (mapInstance.current && mapInstance.current.getLayer('route')) {
        mapInstance.current.removeLayer('route');
      }
      if (mapInstance.current && mapInstance.current.getSource('route')) {
        mapInstance.current.removeSource('route');
      }
    }
  }, [selectedEntity, barriers]);

  useEffect(() => {
    if (mapInstance.current || !mapContainer.current) return;

    const initialCenter: [number, number] = (paramLat && paramLng)
      ? [parseFloat(paramLng), parseFloat(paramLat)]
      : lastKnownLocation || [79.0882, 21.1458];

    const initialZoom = (paramLat && paramLng) ? 16 : (lastKnownLocation ? 16 : 12);

    mapInstance.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/standard',
      center: initialCenter,
      zoom: initialZoom,
      antialias: true,
      attributionControl: false
    });

    if ("geolocation" in navigator && !lastKnownLocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { longitude, latitude } = position.coords;
          lastKnownLocation = [longitude, latitude];
          setUserLocation({ lat: latitude, lng: longitude });

          if (mapInstance.current && !paramLat) {
            mapInstance.current.flyTo({
              center: [longitude, latitude],
              zoom: 16,
              duration: 3000,
              essential: true
            });

            userMarker.current = new mapboxgl.Marker({ color: '#553a34' })
              .setLngLat([longitude, latitude])
              .addTo(mapInstance.current);
          }
          setIsLocating(false);
        },
        () => setIsLocating(false),
        { enableHighAccuracy: true }
      );
    }

    mapInstance.current.on('click', (e) => {
      if (!(e.originalEvent.target as HTMLElement).closest('.mapboxgl-marker')) {
        setSelectedEntity(null);
      }
    });

    // Track viewport bounds for incident list
    mapInstance.current.on('load', updateBounds);
    mapInstance.current.on('moveend', updateBounds);

  }, []);

  useEffect(() => {
    if (!mapInstance.current || !paramLat || !paramLng) return;
    mapInstance.current.flyTo({
      center: [parseFloat(paramLng), parseFloat(paramLat)],
      zoom: 16,
      duration: 2000,
      essential: true
    });
  }, [paramLat, paramLng]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const markers: mapboxgl.Marker[] = [];
    responders.forEach((entity: LiveEntities) => {
      const el = document.createElement('div');
      el.innerHTML = `<span role="img" aria-label="${entity.subType}" style="font-size: 36px;">${EMOJI[entity.subType] ?? EMOJI.default}</span>`;
      el.style.width = '48px';
      el.style.height = '48px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.cursor = 'pointer';
      el.onclick = (e) => {
        e.stopPropagation();
        setSelectedEntity({
          id: entity.id.toHexString(),
          entityNumber: entity.entityNumber,
          type: 'responder',
          subType: entity.subType,
          status: entity.status,
          phone: entity.userPhone,
          lat: entity.lat,
          lng: entity.lng,
          destinationLat: entity.destinationLat,
          destinationLng: entity.destinationLng,
        });
      };
      const marker = new mapboxgl.Marker(el).setLngLat([entity.lng, entity.lat]).addTo(mapInstance.current!);
      markers.push(marker);
    });
    return () => { markers.forEach(marker => marker.remove()); };
  }, [responders]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const markers: mapboxgl.Marker[] = [];
    barriers.forEach((entity: LiveEntities) => {
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center';
      el.innerHTML = `
        <div class="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75"></div>
        <div class="relative z-10 w-12 h-12 flex items-center justify-center text-3xl drop-shadow-md">
          ${EMOJI.barrier}
        </div>
      `;
      const marker = new mapboxgl.Marker(el).setLngLat([entity.lng, entity.lat]).addTo(mapInstance.current!);
      markers.push(marker);
    });
    return () => { markers.forEach(marker => marker.remove()); };
  }, [barriers]);

  // ── Draw destination line when an entity is selected ─────────────────
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Helper to safely clean up
    const removeLine = () => {
      if (map.getLayer('destination-line')) map.removeLayer('destination-line');
      if (map.getSource('destination-source')) map.removeSource('destination-source');
      if (map.getLayer('destination-target')) map.removeLayer('destination-target');
      if (map.getSource('destination-target-source')) map.removeSource('destination-target-source');
    };

    removeLine();

    if (selectedEntity && selectedEntity.entityNumber !== undefined) {
      const entity = responders.find((r: LiveEntities) => r.entityNumber === selectedEntity.entityNumber);
      if (entity && entity.destinationLat !== undefined && entity.destinationLng !== undefined) {

        map.addSource('destination-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [entity.lng, entity.lat],
                [entity.destinationLng, entity.destinationLat]
              ]
            },
            properties: {}
          }
        });

        // Draw dotted line
        map.addLayer({
          id: 'destination-line',
          type: 'line',
          source: 'destination-source',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#3b82f6',
            'line-width': 4,
            'line-dasharray': [2, 2],
            'line-opacity': 0.8
          }
        });

        // Destination target point
        map.addSource('destination-target-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [entity.destinationLng, entity.destinationLat]
            },
            properties: {}
          }
        });

        map.addLayer({
          id: 'destination-target',
          type: 'circle',
          source: 'destination-target-source',
          paint: {
            'circle-radius': 6,
            'circle-color': '#3b82f6',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff'
          }
        });
      }
    }
  }, [selectedEntity, responders]);

  // ── Add markers for distress signals ────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current) return;
    const markers: mapboxgl.Marker[] = [];

    distressSignals.forEach((signal) => {
      const el = document.createElement('div');
      el.innerHTML = '<span role="img" aria-label="distress" style="font-size: 36px; color: #3b82f6;">🚨</span>';
      el.style.width = '48px';
      el.style.height = '48px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.cursor = 'pointer';

      el.onclick = (e) => {
        e.stopPropagation();
        setSelectedEntity({
          id: signal.signalId.toString(),
          type: 'distress',
          subType: 'Distress Signal',
          status: signal.status,
          phone: signal.userPhone,
          lat: signal.lat!,
          lng: signal.lng!
        });
      };

      const marker = new mapboxgl.Marker(el).setLngLat([signal.lng!, signal.lat!]).addTo(mapInstance.current!);
      markers.push(marker);
    });

    return () => { markers.forEach(marker => marker.remove()); };
  }, [distressSignals]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const markers: mapboxgl.Marker[] = [];
    activeIncidents.forEach((incident: Incidents) => {
      const el = document.createElement('div');
      el.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="#ff3b30" stroke="#fff" stroke-width="2"/>
          <circle cx="12" cy="10" r="3" fill="#fff"/>
        </svg>
      `;
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.cursor = 'pointer';
      el.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))';
      el.onclick = (e) => {
        e.stopPropagation();
        setSelectedEntity({
          id: incident.incidentId.toString(),
          type: 'incident',
          subType: incident.category,
          status: incident.status,
          lat: incident.lat,
          lng: incident.lng,
          description: incident.description
        });
      };
      const marker = new mapboxgl.Marker(el).setLngLat([incident.lng, incident.lat]).addTo(mapInstance.current!);
      markers.push(marker);
    });
    return () => { markers.forEach(marker => marker.remove()); };
  }, [activeIncidents]);

  return (
    <>
      <div ref={mapContainer} className="w-full h-full" />

      {/* ── Left-side Incident List Panel ──────────────────────────────── */}
      <AnimatePresence>
        {!isPanelCollapsed && (
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
            className="fixed top-24 left-4 w-[360px] max-h-[calc(100vh-120px)] bg-white/90 backdrop-blur-xl border border-espresso/15 shadow-2xl z-5000 flex flex-col rounded-sm overflow-hidden"
          >
            {/* Panel Header */}
            <div className="bg-espresso text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                <h3 className="text-[13px] font-black uppercase tracking-[.25em]">Incidents in View</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-black bg-white/15 px-2.5 py-1 rounded-xs tracking-wider">
                  {viewportIncidents.length}
                </span>
                <button
                  type="button"
                  onClick={() => setIsPanelCollapsed(true)}
                  className="text-white/40 hover:text-white transition-colors cursor-pointer p-0.5"
                  title="Collapse panel"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Incident List */}
            <div className="flex-1 overflow-y-auto">
              {viewportIncidents.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <div className="text-3xl mb-3 opacity-30">📍</div>
                  <p className="text-[13px] font-bold text-espresso/40 uppercase tracking-widest">No incidents in view</p>
                  <p className="text-[12px] text-espresso/25 mt-1">Pan or zoom out to discover</p>
                </div>
              ) : (
                viewportIncidents.map((incident: Incidents, index: number) => {
                  const isSelected = selectedEntity?.type === 'incident' && selectedEntity?.id === incident.incidentId.toString();
                  const timeSince = (() => {
                    const now = Date.now();
                    const created = Number(incident.createdAt);
                    // createdAt might be seconds or ms — handle both
                    const createdMs = created < 1e12 ? created * 1000 : created;
                    const diffMin = Math.floor((now - createdMs) / 60000);
                    if (diffMin < 1) return 'Just now';
                    if (diffMin < 60) return `${diffMin}m ago`;
                    const diffHr = Math.floor(diffMin / 60);
                    if (diffHr < 24) return `${diffHr}h ago`;
                    return `${Math.floor(diffHr / 24)}d ago`;
                  })();

                  return (
                    <motion.button
                      key={incident.incidentId.toString()}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      onClick={() => {
                        setSelectedEntity({
                          id: incident.incidentId.toString(),
                          type: 'incident',
                          subType: incident.category,
                          status: incident.status,
                          lat: incident.lat,
                          lng: incident.lng,
                          description: incident.description
                        });
                        mapInstance.current?.flyTo({
                          center: [incident.lng, incident.lat],
                          zoom: 16,
                          duration: 1500,
                          essential: true
                        });
                      }}
                      className={`w-full text-left px-5 py-4 border-b border-espresso/5 transition-all duration-200 cursor-pointer group ${
                        isSelected
                          ? 'bg-espresso/8 border-l-4 border-l-terracotta'
                          : 'hover:bg-espresso/4 border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          <div className={`w-9 h-9 rounded-xs flex items-center justify-center text-base ${
                            isSelected ? 'bg-terracotta/15 text-terracotta' : 'bg-espresso/5 group-hover:bg-espresso/10'
                          }`}>
                            {getIncidentEmoji(incident.category)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[13px] font-black text-espresso uppercase tracking-wide truncate">
                              {incident.category}
                            </span>
                            <span className="text-[11px] font-bold text-espresso/30 uppercase tracking-wider flex-shrink-0">
                              {timeSince}
                            </span>
                          </div>
                          <p className="text-[13px] text-espresso/50 leading-relaxed line-clamp-2">
                            {incident.description ? stripMarkdown(incident.description) : 'No description available'}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              incident.status === 'active' ? 'bg-red-500 animate-pulse' : 'bg-espresso/20'
                            }`} />
                            <span className="text-[11px] font-bold text-espresso/30 uppercase tracking-widest">
                              {incident.status}
                            </span>
                            <span className="text-[11px] text-espresso/20">•</span>
                            <span className="text-[11px] font-mono text-espresso/25">
                              {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
                            </span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-espresso/30">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </div>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>

            {/* Panel Footer */}
            {viewportIncidents.length > 0 && (
              <div className="px-5 py-3 border-t border-espresso/8 bg-espresso/3">
                <p className="text-[11px] font-bold text-espresso/30 uppercase tracking-widest text-center">
                  {viewportIncidents.length} of {activeIncidents.length} total incidents
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Collapsed panel toggle button ──────────────────────────────── */}
      <AnimatePresence>
        {isPanelCollapsed && (
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onClick={() => setIsPanelCollapsed(false)}
            className="fixed top-24 left-4 bg-espresso text-white px-3 py-3 z-5000 rounded-sm shadow-xl cursor-pointer hover:bg-espresso/90 transition-colors flex items-center gap-2"
            title="Show incident list"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M9 18l6-6-6-6" />
            </svg>
            <span className="text-[10px] font-black uppercase tracking-widest">{viewportIncidents.length}</span>
            <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isLocating && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 flex items-center justify-center z-5000 pointer-events-none"
          >
            <div className="bg-white/95 backdrop-blur-xl px-10 py-6 rounded-sm border border-espresso/15 shadow-2xl flex items-center gap-4 pointer-events-auto">
              <div className="w-4 h-4 bg-terracotta rounded-full animate-pulse" />
              <span className="text-[16px] font-black text-espresso tracking-widest uppercase">Locating you...</span>
            </div>
          </motion.div>
        )}

        {selectedEntity && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="fixed top-24 right-6 w-[350px] max-h-[calc(100vh-140px)] bg-white/85 backdrop-blur-xl border border-espresso/20 shadow-2xl z-5000 flex flex-col rounded-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-espresso text-white p-8">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 bg-white/10 rounded-xs flex items-center justify-center text-2xl">
                  {selectedEntity.type === 'responder' ? EMOJI[selectedEntity.subType] : selectedEntity.type === 'distress' ? '🚨' : '🔥'}
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedEntity(null); }} className="text-white/40 hover:text-white transition-colors cursor-pointer p-1">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight leading-none mb-2">{selectedEntity.subType}</h2>
              <p className="text-[10px] font-black uppercase tracking-[.3em] opacity-40">{selectedEntity.type} Tactical Node</p>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-espresso/30 mb-2">Current Status</h4>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${selectedEntity.status === 'active' || selectedEntity.status === 'responding' ? 'bg-emerald-500 animate-pulse' : 'bg-espresso/20'}`} />
                  <span className="text-lg font-bold text-espresso capitalize">{selectedEntity.status}</span>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-espresso/30 mb-2">Coordinates</h4>
                <p className="text-base font-bold text-espresso tracking-tight">{selectedEntity.lat.toFixed(6)}, {selectedEntity.lng.toFixed(6)}</p>
              </div>

              {selectedEntity.phone && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-espresso/30 mb-2">Comms Frequency</h4>
                  <p className="text-base font-bold text-espresso tracking-tight">📞 {selectedEntity.phone}</p>
                </div>
              )}

              {routeInfo && (
                <div className="bg-espresso/5 border border-espresso/10 p-5 rounded-xs">
                  <div className="flex justify-between items-end">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-espresso/30 mb-1">Route Distance</h4>
                      <p className="text-xl font-black text-espresso">{routeInfo.distance < 1000 ? `${routeInfo.distance.toFixed(0)}m` : `${(routeInfo.distance / 1000).toFixed(1)}km`}</p>
                    </div>
                    <div className="text-right">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-espresso/30 mb-1">Estimated ETA</h4>
                      <p className="text-xl font-black text-terracotta">~{Math.max(1, Math.round(routeInfo.duration / 60))} MIN</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-espresso/5 flex items-center gap-2">
                    <div className="w-2 h-2 bg-terracotta rounded-full animate-ping" />
                    <span className="text-[9px] font-black text-espresso/40 uppercase tracking-widest">Live Traffic Routing Active</span>
                  </div>
                </div>
              )}

              {!routeInfo && userLocation && (
                <div className="bg-espresso/5 border border-espresso/10 p-5 rounded-xs">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-espresso/30 mb-1">Distance to Node</h4>
                  <p className="text-xl font-black text-espresso">
                    {(() => {
                      const R = 6371;
                      const dLat = (selectedEntity.lat - userLocation.lat) * Math.PI / 180;
                      const dLon = (selectedEntity.lng - userLocation.lng) * Math.PI / 180;
                      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(selectedEntity.lat * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                      const d = R * c;
                      return d < 1 ? `${(d * 1000).toFixed(0)}m` : `${d.toFixed(1)}km`;
                    })()}
                  </p>
                </div>
              )}

              {selectedEntity.type === 'incident' && (
                <div className="pt-4">
                  <Link to={`/incident/${selectedEntity.id}`} className="flex items-center justify-center gap-2 w-full py-4 border border-espresso text-espresso text-[11px] font-black uppercase tracking-[.2em] hover:bg-espresso hover:text-white transition-all rounded-xs shadow-sm">
                    View Tactical Briefing
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                  </Link>
                </div>
              )}
            </div>

            <div className="p-8 border-t border-espresso/5">
              <button className="w-full py-4 bg-espresso text-white text-[12px] font-black uppercase tracking-[.3em] hover:bg-espresso/90 transition-all rounded-xs shadow-xl flex items-center justify-center gap-3" onClick={() => { mapInstance.current?.flyTo({ center: [selectedEntity.lng, selectedEntity.lat], zoom: 17, essential: true }); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
                </svg>
                Focus Command
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default MapComponent;
