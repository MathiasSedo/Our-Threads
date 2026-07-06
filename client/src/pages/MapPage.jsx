import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import TagPill from '../components/TagPill.jsx';
import ContactForm from '../components/ContactForm.jsx';
import TripsPanel from '../components/TripsPanel.jsx';
import { lookupCoords } from '../hooks/useGeo.js';
import { blendTagColor } from '../utils/tagColors.js';
import './MapPage.css';

function WaypointLabelForm({ onConfirm, onSkip }) {
  const [label, setLabel] = useState('');
  return (
    <div className="waypoint-label-form">
      <span className="waypoint-label-hint">Name this stop</span>
      <input
        className="waypoint-label-input"
        placeholder="City, landmark…"
        value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onConfirm(label); if (e.key === 'Escape') onSkip(); }}
        autoFocus
      />
      <div className="waypoint-label-actions">
        <button className="trip-btn-ghost" onClick={onSkip}>Skip</button>
        <button className="trip-btn-primary" onClick={() => onConfirm(label)}>Add</button>
      </div>
    </div>
  );
}

function tripRoutePoints(trip) {
  const contacts = (trip.contacts || []).map(c => ({
    order: c.order_index,
    lat: c.home_lat || c.lat,
    lng: c.home_lng || c.lng,
  }));
  const waypoints = (trip.waypoints || []).map(w => ({
    order: w.order_index,
    lat: w.lat,
    lng: w.lng,
  }));
  return [...contacts, ...waypoints]
    .sort((a, b) => a.order - b.order)
    .filter(p => p.lat && p.lng)
    .map(p => [p.lat, p.lng]);
}

export default function MapPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef([]);
  const updateMarkersRef = useRef(() => {});
  const pendingPinRef = useRef(null);
  const commitPinRef = useRef(null);
  const tripLinesRef = useRef({});
  const tripPickRef = useRef(null);
  const tripMapClickRef = useRef(null);

  const [contacts, setContacts] = useState([]);
  const [allTags, setAllTags] = useState(['All']);
  const [activeTag, setActiveTag] = useState('All');
  const [selected, setSelected] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [stats, setStats] = useState({ people: 0, cities: 0, countries: 0 });
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [placingPin, setPlacingPin] = useState(false);
  const [manualCoords, setManualCoords] = useState(null);
  const [savedForm, setSavedForm] = useState(null);
  const [trips, setTrips] = useState([]);
  const [activeTripIds, setActiveTripIds] = useState(new Set());
  const [showTrips, setShowTrips] = useState(false);
  const [tripPickMode, setTripPickMode] = useState(false);
  const [pendingWaypoint, setPendingWaypoint] = useState(null); // { lat, lng, tripId }

  const CORE_ORDER = ['Visit', 'Work', 'Family', 'Invite for wedding'];

  useEffect(() => {
    api.get('/trips').then(ts => setTrips(ts || [])).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([api.get('/contacts'), api.get('/tags')])
      .then(([cs, ts]) => {
        const list = cs || [];
        const filled = list.map(c => {
          let updated = c;
          if (!c.lat || !c.lng) {
            const coords = lookupCoords(c.city, c.country);
            if (coords) {
              api.patch(`/contacts/${c.id}/location`, coords).catch(() => {});
              updated = { ...updated, ...coords };
            }
          }
          if (c.home_city && c.home_country && (!c.home_lat || !c.home_lng)) {
            const homeCoords = lookupCoords(c.home_city, c.home_country);
            if (homeCoords) {
              api.patch(`/contacts/${c.id}/home-location`, homeCoords).catch(() => {});
              updated = { ...updated, home_lat: homeCoords.lat, home_lng: homeCoords.lng };
            }
          }
          return updated;
        });
        setContacts(filled);
        const names = (ts || []).map(t => t.name);
        const ordered = [
          ...CORE_ORDER.filter(n => names.includes(n)),
          ...names.filter(n => !CORE_ORDER.includes(n)).sort(),
        ];
        setAllTags(['All', ...ordered]);
        updateStats(filled);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function updateStats(list) {
    const cities = new Set(list.map(c => `${c.city},${c.country}`));
    const countries = new Set(list.map(c => c.country));
    setStats({ people: list.length, cities: cities.size, countries: countries.size });
  }

  useEffect(() => {
    if (loading) return;
    initMap();
    return () => {
      if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }
    };
  }, [loading]);

  useEffect(() => { updateMarkers(); }, [contacts, activeTag]);
  useEffect(() => { updateMarkersRef.current = updateMarkers; });

  // Redraw polylines whenever trips data or active set changes
  useEffect(() => {
    if (!leafletRef.current) return;
    import('leaflet').then(({ default: L }) => {
      // Remove lines for trips no longer active
      Object.keys(tripLinesRef.current).forEach(id => {
        if (!activeTripIds.has(Number(id))) {
          tripLinesRef.current[id]?.remove();
          delete tripLinesRef.current[id];
        }
      });
      // Draw/update lines for active trips
      activeTripIds.forEach(id => {
        const trip = trips.find(t => t.id === id);
        if (!trip) return;
        const pts = tripRoutePoints(trip);
        if (tripLinesRef.current[id]) {
          tripLinesRef.current[id].setLatLngs(pts);
        } else if (pts.length >= 2) {
          tripLinesRef.current[id] = L.polyline(pts, {
            color: '#8a7a6a',
            weight: 1.5,
            dashArray: '4 8',
            opacity: 0.5,
          }).addTo(leafletRef.current);
        }
      });
    });
  }, [trips, activeTripIds]);

  useEffect(() => {
    const pinForId = searchParams.get('pinFor');
    const pinForNew = searchParams.get('pinForNew');
    if (!pinForId && !pinForNew) return;
    setSearchParams({}, { replace: true });
    pendingPinRef.current = pinForId ? { type: 'forId', id: pinForId } : { type: 'forNew' };
    if (leafletRef.current) activatePendingPin();
  }, [searchParams]);

  async function commitPin(rawCoords) {
    const pending = pendingPinRef.current;
    if (!pending) return;
    pendingPinRef.current = null;
    const coords = { lat: Math.round(rawCoords.lat * 100) / 100, lng: Math.round(rawCoords.lng * 100) / 100 };
    if (pending.type === 'forId') {
      await api.patch(`/contacts/${pending.id}/location`, coords).catch(() => {});
      setContacts(prev => prev.map(c => c.id === Number(pending.id) ? { ...c, ...coords } : c));
      sessionStorage.setItem(`pinCoords_${pending.id}`, JSON.stringify(coords));
    } else {
      sessionStorage.setItem('pinNewCoords', JSON.stringify(coords));
    }
    setPlacingPin(false);
    leafletRef.current.getContainer().style.cursor = '';
    navigate('/threads');
  }

  function activatePendingPin() {
    if (!pendingPinRef.current || !leafletRef.current) return;
    setPlacingPin(true);
    commitPinRef.current = commitPin;
    leafletRef.current.getContainer().style.cursor = 'crosshair';
    leafletRef.current.once('click', e => { commitPinRef.current = null; commitPin(e.latlng); });
  }

  async function initMap() {
    const L = (await import('leaflet')).default;
    await import('leaflet/dist/leaflet.css');
    if (leafletRef.current) return;
    const map = L.map(mapRef.current, { center: [30, 15], zoom: 2, zoomControl: false, worldCopyJump: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© CARTO', subdomains: 'abcd', opacity: 0.75, className: 'map-base-tile',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    leafletRef.current = map;
    map.on('zoomend', () => updateMarkersRef.current());
    updateMarkers();

    const focusId = searchParams.get('contact');
    if (focusId) {
      const focusContact = contacts.find(c => c.id === Number(focusId));
      const fLat = focusContact?.home_lat || focusContact?.lat;
      const fLng = focusContact?.home_lng || focusContact?.lng;
      if (fLat && fLng) {
        const nearby = contacts.filter(c => {
          const cLat = c.home_lat || c.lat;
          const cLng = c.home_lng || c.lng;
          return cLat && cLng && Math.abs(cLat - fLat) < 0.5 && Math.abs(cLng - fLng) < 0.5;
        });
        setSelected(nearby.length > 1 ? nearby : [focusContact]);
        map.setView([fLat, fLng], 7);
      }
      setSearchParams({}, { replace: true });
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude, longitude } = pos.coords;
        const youIcon = L.divIcon({
          html: '<div class="map-dot map-dot-you"></div>',
          className: '', iconSize: [4, 4], iconAnchor: [2, 2],
        });
        const youMarker = L.marker([latitude, longitude], { icon: youIcon, zIndexOffset: 1000 }).addTo(map);
        youMarker.on('click', () => map.setView([latitude, longitude], 9, { animate: true }));
      }, () => {});
    }

    if (pendingPinRef.current) activatePendingPin();
  }

  async function updateMarkers() {
    const L = (await import('leaflet')).default;
    if (!leafletRef.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const visible = activeTag === 'All'
      ? contacts
      : contacts.filter(c => c.tags?.some(t => t.name === activeTag));
    const visibleIds = new Set(visible.map(c => c.id));
    const zoom = leafletRef.current.getZoom();
    const showCityLabels = zoom >= 6;

    contacts.forEach(contact => {
      const pinLat = contact.home_lat || contact.lat;
      const pinLng = contact.home_lng || contact.lng;
      if (!pinLat || !pinLng) return;
      const isVis = visibleIds.has(contact.id);
      const blend = blendTagColor(contact.tags);
      const style = blend ? ` style="border-color:${blend}; box-shadow:0 0 0 2px ${blend}26"` : '';
      const dot = L.divIcon({
        html: `<div class="map-dot${!isVis ? ' map-dot-dim' : ''}"${style}></div>`,
        className: '', iconSize: [10, 10], iconAnchor: [5, 5],
      });
      const marker = L.marker([pinLat, pinLng], { icon: dot }).addTo(leafletRef.current);
      marker.on('click', e => {
        if (commitPinRef.current) {
          L.DomEvent.stopPropagation(e);
          leafletRef.current.off('click');
          const fn = commitPinRef.current;
          commitPinRef.current = null;
          fn({ lat: pinLat, lng: pinLng });
          return;
        }
        if (tripPickRef.current) {
          L.DomEvent.stopPropagation(e);
          tripPickRef.current.onAddContact(contact);
          return;
        }
        if (!isVis) return;
        const nearby = contacts.filter(c => {
          const cLat = c.home_lat || c.lat;
          const cLng = c.home_lng || c.lng;
          return cLat && cLng && Math.abs(cLat - pinLat) < 0.5 && Math.abs(cLng - pinLng) < 0.5;
        });
        setSelected(nearby.length > 1 ? nearby : [contact]);
        leafletRef.current.setView([pinLat, pinLng], 7, { animate: true });
      });
      markersRef.current.push(marker);

      if (showCityLabels) {
        const label = contact.home_city || contact.city;
        const cityIcon = L.divIcon({
          html: `<div class="map-label-city${!isVis ? ' map-label-dim' : ''}">${label}</div>`,
          className: '', iconSize: [120, 16], iconAnchor: [-8, -2],
        });
        markersRef.current.push(L.marker([pinLat, pinLng], { icon: cityIcon, interactive: false }).addTo(leafletRef.current));
      }
    });
  }

  function handleSave(contact) {
    setContacts(prev => [contact, ...prev]);
    setAdding(false);
    setManualCoords(null);
  }

  async function startPlacingPin(formSnapshot = null) {
    const L = (await import('leaflet')).default;
    if (!leafletRef.current) return;
    if (formSnapshot) setSavedForm(formSnapshot);
    setAdding(false);
    setPlacingPin(true);
    leafletRef.current.getContainer().style.cursor = 'crosshair';
    leafletRef.current.once('click', e => {
      const coords = { lat: Math.round(e.latlng.lat * 100) / 100, lng: Math.round(e.latlng.lng * 100) / 100 };
      setManualCoords(coords);
      setPlacingPin(false);
      setAdding(true);
      leafletRef.current.getContainer().style.cursor = '';
    });
  }

  function cancelPlacingPin() {
    setPlacingPin(false);
    commitPinRef.current = null;
    if (leafletRef.current) leafletRef.current.getContainer().style.cursor = '';
    leafletRef.current?.off('click');
  }

  function startTripPick(trip) {
    setTripPickMode(true);
    if (leafletRef.current) leafletRef.current.getContainer().style.cursor = 'crosshair';

    tripPickRef.current = {
      trip,
      onAddContact: async (contact) => {
        const current = tripPickRef.current.trip;
        if (current.contacts.some(c => c.contact_id === contact.id)) return;
        const order = current.contacts.length + current.waypoints.length;
        await api.post(`/trips/${current.id}/contacts`, { contact_id: contact.id, order_index: order }).catch(() => {});
        const newContact = { contact_id: contact.id, order_index: order, name: contact.name, lat: contact.lat, lng: contact.lng, home_lat: contact.home_lat, home_lng: contact.home_lng, city: contact.city, home_city: contact.home_city };
        const updated = { ...current, contacts: [...current.contacts, newContact] };
        tripPickRef.current.trip = updated;
        setTrips(prev => prev.map(t => t.id === current.id ? updated : t));
      },
      onAddWaypoint: (latlng) => {
        const current = tripPickRef.current.trip;
        setPendingWaypoint({ lat: latlng.lat, lng: latlng.lng, tripId: current.id });
      },
    };

    // Map click on empty space → add waypoint
    const handler = (e) => {
      if (tripPickRef.current) tripPickRef.current.onAddWaypoint(e.latlng);
    };
    tripMapClickRef.current = handler;
    leafletRef.current?.on('click', handler);
  }

  function stopTripPick() {
    setTripPickMode(false);
    if (tripMapClickRef.current) {
      leafletRef.current?.off('click', tripMapClickRef.current);
      tripMapClickRef.current = null;
    }
    tripPickRef.current = null;
    if (leafletRef.current) leafletRef.current.getContainer().style.cursor = '';
  }

  async function confirmWaypoint(label) {
    if (!pendingWaypoint || !tripPickRef.current) return;
    const current = tripPickRef.current.trip;
    const order = current.contacts.length + current.waypoints.length;
    const row = await api.post(`/trips/${current.id}/waypoints`, {
      lat: pendingWaypoint.lat,
      lng: pendingWaypoint.lng,
      label: label || null,
      order_index: order,
    }).catch(() => null);
    setPendingWaypoint(null);
    if (!row) return;
    const updated = { ...current, waypoints: [...current.waypoints, row] };
    tripPickRef.current.trip = updated;
    setTrips(prev => prev.map(t => t.id === current.id ? updated : t));
  }

  async function handleReorder(trip, stops, fromIdx, dir) {
    const toIdx = fromIdx + dir;
    if (toIdx < 0 || toIdx >= stops.length) return;
    const reordered = [...stops];
    [reordered[fromIdx], reordered[toIdx]] = [reordered[toIdx], reordered[fromIdx]];

    const contactUpdates = [];
    const waypointUpdates = [];
    reordered.forEach((stop, i) => {
      if (stop.order_index === i) return;
      if (stop.type === 'contact') contactUpdates.push({ id: stop.rowId, order_index: i });
      else waypointUpdates.push({ id: stop.rowId, order_index: i });
    });

    const updatedContacts = trip.contacts.map(c => {
      const u = contactUpdates.find(x => x.id === c.id);
      return u ? { ...c, order_index: u.order_index } : c;
    });
    const updatedWaypoints = trip.waypoints.map(w => {
      const u = waypointUpdates.find(x => x.id === w.id);
      return u ? { ...w, order_index: u.order_index } : w;
    });
    const updated = { ...trip, contacts: updatedContacts, waypoints: updatedWaypoints };
    if (tripPickRef.current?.trip?.id === trip.id) tripPickRef.current.trip = updated;
    setTrips(prev => prev.map(t => t.id === trip.id ? updated : t));
    api.put(`/trips/${trip.id}/order`, { contacts: contactUpdates, waypoints: waypointUpdates }).catch(() => {});
  }

  function toggleTripActive(trip, fitBounds = false) {
    setActiveTripIds(prev => {
      const next = new Set(prev);
      if (next.has(trip.id)) {
        next.delete(trip.id);
      } else {
        next.add(trip.id);
        if (fitBounds) {
          const pts = tripRoutePoints(trip);
          if (pts.length >= 2) {
            import('leaflet').then(({ default: L }) => {
              leafletRef.current?.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
            });
          }
        }
      }
      return next;
    });
  }

  return (
    <div className="map-page">
      <div className="map-header">
        <div className="map-title-block">
          <span className="map-title">_ The Map _</span>
          <span className="map-stats">
            {stats.people} people &nbsp;·&nbsp; {stats.cities} cities &nbsp;·&nbsp; {stats.countries} countries
          </span>
        </div>
        <div className="map-tag-filter">
          {allTags.map(tag => (
            <TagPill key={tag} tag={tag} active={activeTag === tag} onClick={() => setActiveTag(tag)} />
          ))}
        </div>
      </div>

      <div className="map-actions">
        <button className="map-add-btn" onClick={() => { setManualCoords(null); setAdding(true); }}>+ Add</button>
        <button
          className={`map-pin-btn${placingPin ? ' active' : ''}`}
          onClick={placingPin ? cancelPlacingPin : startPlacingPin}
        >
          {placingPin ? 'Tap the map…' : '⊕ Pin'}
        </button>
        <button
          className={`map-pin-btn${showTrips ? ' active' : ''}`}
          onClick={() => setShowTrips(v => !v)}
        >
          ✈ Travels
        </button>
      </div>

      {adding && (
        <div className="map-add-overlay">
          <div className="map-add-panel">
            <h2 className="add-title">Add a new thread</h2>
            {manualCoords && (
              <p className="pin-coords-note">
                Pinned at {manualCoords.lat.toFixed(2)}°, {manualCoords.lng.toFixed(2)}°
              </p>
            )}
            <ContactForm
              key={manualCoords ? 'pinned' : 'normal'}
              initial={savedForm || {}}
              onSave={(c) => { setSavedForm(null); handleSave(c); }}
              onCancel={() => { setAdding(false); setManualCoords(null); setSavedForm(null); }}
              onStartPin={(formSnapshot) => startPlacingPin(formSnapshot)}
              allContacts={contacts}
              manualCoords={manualCoords}
            />
          </div>
        </div>
      )}

      {pendingWaypoint && (
        <WaypointLabelForm
          onConfirm={confirmWaypoint}
          onSkip={() => confirmWaypoint(null)}
        />
      )}

      {showTrips && (
        <TripsPanel
          trips={trips}
          activeTripIds={activeTripIds}
          tripPickMode={tripPickMode}
          onTripsChange={setTrips}
          onToggleTrip={toggleTripActive}
          onStartPick={startTripPick}
          onStopPick={stopTripPick}
          onClose={() => { setShowTrips(false); stopTripPick(); }}
          onReorder={handleReorder}
          onRemoveWaypoint={(tripId, waypointId) => {
            setTrips(prev => prev.map(t => t.id === tripId
              ? { ...t, waypoints: t.waypoints.filter(w => w.id !== waypointId) }
              : t
            ));
            if (tripPickRef.current?.trip?.id === tripId) {
              tripPickRef.current.trip = { ...tripPickRef.current.trip, waypoints: tripPickRef.current.trip.waypoints.filter(w => w.id !== waypointId) };
            }
          }}
        />
      )}

      <div className="map-frame">
        <div className="map-corner tl" /><div className="map-corner tr" />
        <div className="map-corner bl" /><div className="map-corner br" />
        {loading && <div className="map-loading">Placing your threads on the map...</div>}
        <div ref={mapRef} className="map-leaf" />
        {selected && (
          <div className="map-popup">
            <button className="popup-close" onClick={() => setSelected(null)}>×</button>
            {selected.map(c => {
              const isExpanded = expandedIds.has(c.id);
              return (
                <div key={c.id} className="popup-contact">
                  <h3 className="popup-name">{c.name}</h3>
                  <p className="popup-location">{c.home_city || c.city}, {c.home_country || c.country}</p>
                  {c.tags?.length > 0 && <div className="popup-tags">{c.tags.map(t => <TagPill key={t.id} tag={t} />)}</div>}
                  {c.how_we_met && (
                    <p className="popup-story">
                      {isExpanded ? c.how_we_met : `${c.how_we_met.slice(0, 120)}${c.how_we_met.length > 120 ? '…' : ''}`}
                    </p>
                  )}
                  {isExpanded && c.contact_info && <p className="popup-contact-info">{c.contact_info}</p>}
                  <button
                    className="popup-open-page"
                    onClick={() => setExpandedIds(prev => {
                      const next = new Set(prev);
                      next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                      return next;
                    })}
                  >
                    {isExpanded ? 'Close page' : 'Open page'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
