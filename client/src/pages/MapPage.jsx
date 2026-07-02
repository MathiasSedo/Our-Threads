import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import TagPill from '../components/TagPill.jsx';
import ContactForm from '../components/ContactForm.jsx';
import { lookupCoords } from '../hooks/useGeo.js';
import { blendTagColor } from '../utils/tagColors.js';
import './MapPage.css';

export default function MapPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef([]);
  const updateMarkersRef = useRef(() => {});
  const pendingPinRef = useRef(null); // { type: 'forId'|'forNew', id? }
  const commitPinRef = useRef(null); // set when pin mode is active
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
  const [pinForContact, setPinForContact] = useState(null);
  const [savedForm, setSavedForm] = useState(null);

  const CORE_ORDER = ['Visit', 'Work', 'Family', 'Invite for wedding'];

  useEffect(() => {
    Promise.all([api.get('/contacts'), api.get('/tags')])
      .then(([cs, ts]) => {
        const list = cs || [];
        // Fill missing coords from bundled city data — instant, no API call
        const filled = list.map(c => {
          if (c.lat && c.lng) return c;
          const coords = lookupCoords(c.city, c.country);
          if (coords) {
            api.patch(`/contacts/${c.id}/location`, coords).catch(() => {});
            return { ...c, ...coords };
          }
          return c;
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

  // Capture pin intent from URL immediately, activate once map is ready
  useEffect(() => {
    const pinForId = searchParams.get('pinFor');
    const pinForNew = searchParams.get('pinForNew');
    if (!pinForId && !pinForNew) return;
    setSearchParams({}, { replace: true });
    pendingPinRef.current = pinForId ? { type: 'forId', id: pinForId } : { type: 'forNew' };
    // If map already ready, activate now
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
    setPinForContact(null);
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
      attribution: '© CARTO', subdomains: 'abcd', opacity: 0.55, className: 'map-base-tile',
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

    // Activate any pin that was requested before the map was ready
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
      // Prefer "visit in" coords over "met in" coords for pin placement
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
