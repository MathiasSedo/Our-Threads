import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi.js';
import TagPill from '../components/TagPill.jsx';
import ContactForm from '../components/ContactForm.jsx';
import WorldMap from '../components/WorldMap.jsx';
import { lookupCoords } from '../hooks/useGeo.js';
import './MapPage.css';

export default function MapPage() {
  const api = useApi();
  const [contacts, setContacts] = useState([]);
  const [allTags, setAllTags] = useState(['All']);
  const [activeTag, setActiveTag] = useState('All');
  const [stats, setStats] = useState({ people: 0, cities: 0, countries: 0 });
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [placingPin, setPlacingPin] = useState(false);
  const [manualCoords, setManualCoords] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);

  const CORE_ORDER = ['Visit', 'Work', 'Family', 'Invite for wedding'];

  useEffect(() => {
    Promise.all([api.get('/contacts'), api.get('/tags')]).then(([cs, ts]) => {
      const list = cs || [];
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
      const names = ts.map(t => t.name);
      const ordered = [
        ...CORE_ORDER.filter(n => names.includes(n)),
        ...names.filter(n => !CORE_ORDER.includes(n)).sort(),
      ];
      setAllTags(['All', ...ordered]);
      updateStats(filled);
      setLoading(false);
    });
  }, []);

  function updateStats(list) {
    const cities = new Set(list.map(c => `${c.city},${c.country}`));
    const countries = new Set(list.map(c => c.country));
    setStats({ people: list.length, cities: cities.size, countries: countries.size });
  }

  const visible = activeTag === 'All'
    ? contacts
    : contacts.filter(c => c.tags?.some(t => t.name === activeTag));

  function handleSave(contact) {
    const next = [contact, ...contacts];
    setContacts(next);
    updateStats(next);
    setAdding(false);
    setManualCoords(null);
  }

  function handlePlacePin(coords) {
    setManualCoords(coords);
    setPlacingPin(false);
    setAdding(true);
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
          onClick={() => setPlacingPin(p => !p)}
        >
          {placingPin ? 'Tap the map…' : '⊕ Pin location'}
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
              onSave={handleSave}
              onCancel={() => { setAdding(false); setManualCoords(null); }}
              allContacts={contacts}
              manualCoords={manualCoords}
            />
          </div>
        </div>
      )}

      {selectedContact && (
        <div className="map-add-overlay" onClick={() => setSelectedContact(null)}>
          <div className="map-add-panel map-contact-panel" onClick={e => e.stopPropagation()}>
            <button className="popup-close" onClick={() => setSelectedContact(null)}>×</button>
            <h3 className="popup-name">{selectedContact.name}</h3>
            <p className="popup-location">{selectedContact.city}, {selectedContact.country}</p>
            {selectedContact.tags?.length > 0 && (
              <div className="popup-tags">{selectedContact.tags.map(t => <TagPill key={t.id} tag={t} />)}</div>
            )}
            {selectedContact.how_we_met && <p className="popup-story">{selectedContact.how_we_met}</p>}
          </div>
        </div>
      )}

      <div className="map-frame">
        <div className="map-corner tl" /><div className="map-corner tr" />
        <div className="map-corner bl" /><div className="map-corner br" />
        {loading
          ? <div className="map-loading">Placing your threads on the map...</div>
          : <WorldMap
              contacts={visible}
              onSelectContact={setSelectedContact}
              onPlacePin={handlePlacePin}
              placingPin={placingPin}
            />
        }
      </div>
    </div>
  );
}
