import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import TagPill from '../components/TagPill.jsx';
import ContactForm from '../components/ContactForm.jsx';
import { geocode } from '../utils/geocode.js';
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
  const [contacts, setContacts] = useState([]);
  const [allTags, setAllTags] = useState(['All']);
  const [activeTag, setActiveTag] = useState('All');
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState({ people: 0, cities: 0, countries: 0 });
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const CORE_ORDER = ['Visit', 'Work', 'Family', 'Invite for wedding'];

  useEffect(() => {
    Promise.all([api.get('/contacts'), api.get('/tags')]).then(([cs, ts]) => {
      const list = cs || [];
      setContacts(list);
      const names = ts.map(t => t.name);
      const ordered = [
        ...CORE_ORDER.filter(n => names.includes(n)),
        ...names.filter(n => !CORE_ORDER.includes(n)).sort(),
      ];
      setAllTags(['All', ...ordered]);
      updateStats(list);
      setLoading(false);

      // Contacts missing coordinates get geocoded in the background, one at a
      // time — Nominatim rate-limits to 1 req/sec, and firing these in parallel
      // gets the whole page temporarily banned. Already-cached contacts (the
      // common case after first load) need no network calls at all.
      const missing = list.filter(c => !c.lat || !c.lng);
      (async () => {
        for (const c of missing) {
          const coords = await geocode(c.city, c.country);
          if (coords) {
            api.patch(`/contacts/${c.id}/location`, coords).catch(() => {});
            setContacts(prev => {
              const next = prev.map(p => p.id === c.id ? { ...p, ...coords } : p);
              updateStats(next);
              return next;
            });
          }
          await new Promise(r => setTimeout(r, 1100));
        }
      })();
    });
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
      if (focusContact?.lat && focusContact?.lng) {
        const nearby = contacts.filter(c =>
          c.lat && c.lng && Math.abs(c.lat - focusContact.lat) < 0.5 && Math.abs(c.lng - focusContact.lng) < 0.5
        );
        setSelected(nearby.length > 1 ? nearby : [focusContact]);
        map.setView([focusContact.lat, focusContact.lng], 7);
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
        youMarker.on('click', () => {
          map.setView([latitude, longitude], 9, { animate: true });
        });
      }, () => {});
    }
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
      if (!contact.lat || !contact.lng) return;
      const isVis = visibleIds.has(contact.id);
      const isWedding = contact.tags?.some(t => t.name === 'Invite for wedding');
      const blend = !isWedding ? blendTagColor(contact.tags) : null;
      const style = blend ? ` style="border-color:${blend}; box-shadow:0 0 0 2px ${blend}26"` : '';
      const dot = L.divIcon({
        html: `<div class="map-dot${isWedding ? ' map-dot-wedding' : ''}${!isVis ? ' map-dot-dim' : ''}"${style}></div>`,
        className: '', iconSize: [10, 10], iconAnchor: [5, 5],
      });
      const marker = L.marker([contact.lat, contact.lng], { icon: dot }).addTo(leafletRef.current);
      if (isVis) {
        marker.on('click', () => {
          const nearby = contacts.filter(c =>
            c.lat && c.lng && Math.abs(c.lat - contact.lat) < 0.5 && Math.abs(c.lng - contact.lng) < 0.5
          );
          setSelected(nearby.length > 1 ? nearby : [contact]);
          leafletRef.current.setView([contact.lat, contact.lng], 7, { animate: true });
        });
      }
      markersRef.current.push(marker);

      // City label — small, quiet, in whatever language/script was typed for this contact.
      // Hidden until zoomed in enough that nearby cities/countries won't collide.
      if (showCityLabels) {
        const cityIcon = L.divIcon({
          html: `<div class="map-label-city${!isVis ? ' map-label-dim' : ''}">${contact.city}</div>`,
          className: '', iconSize: [120, 16], iconAnchor: [-8, -2],
        });
        markersRef.current.push(L.marker([contact.lat, contact.lng], { icon: cityIcon, interactive: false }).addTo(leafletRef.current));
      }
    });
  }

  function handleSave(contact) {
    setContacts(prev => [contact, ...prev]);
    setAdding(false);
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

      <button className="map-add-btn" onClick={() => setAdding(true)}>+ Add</button>

      {adding && (
        <div className="map-add-overlay">
          <div className="map-add-panel">
            <h2 className="add-title">Add a new thread</h2>
            <ContactForm onSave={handleSave} onCancel={() => setAdding(false)} />
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
            {selected.map(c => (
              <div key={c.id} className="popup-contact">
                <h3 className="popup-name">{c.name}</h3>
                <p className="popup-location">{c.city}, {c.country}</p>
                {c.tags?.length > 0 && <div className="popup-tags">{c.tags.map(t => <TagPill key={t.id} tag={t} />)}</div>}
                {c.how_we_met && <p className="popup-story">{c.how_we_met.slice(0, 120)}{c.how_we_met.length > 120 ? '…' : ''}</p>}
                {c.contact_info && <p className="popup-contact-info">{c.contact_info}</p>}
                <button
                  className="popup-open-page"
                  onClick={() => navigate('/threads', { state: { openContactId: c.id } })}
                >
                  Open page
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
