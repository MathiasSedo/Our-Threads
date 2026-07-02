import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import TagPill from './TagPill.jsx';
import AutocompleteInput from './AutocompleteInput.jsx';
import { getCountrySuggestions, getCitySuggestions } from '../hooks/useGeo.js';
import { geocodeCandidates } from '../utils/geocode.js';
import './ContactForm.css';

const CORE_TAGS = ['Visit', 'Work', 'Family', 'Invite for wedding'];

export default function ContactForm({ initial = {}, onSave, onCancel, onStartPin, allContacts = [], onConnectionsCreated, manualCoords = null }) {
  const api = useApi();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    city: '',
    country: '',
    home_city: '',
    home_country: '',
    date_met: '',
    how_we_met: '',
    contact_info: '',
    ...initial,
    tags: initial.tags?.map(t => t.name || t) || [],
  });
  const [customTag, setCustomTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [locationOptions, setLocationOptions] = useState(null);
  const [connectTo, setConnectTo] = useState([]);
  const [connectSelect, setConnectSelect] = useState('');
  const [connectSearch, setConnectSearch] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);

  const isNew = !initial.id;
  const connectAvailable = allContacts.filter(c => !connectTo.some(t => t.id === c.id));

  function addConnectTo() {
    if (!connectSelect) return;
    const target = allContacts.find(c => c.id === parseInt(connectSelect));
    if (target) setConnectTo(prev => [...prev, target]);
    setConnectSelect('');
  }

  function removeConnectTo(id) {
    setConnectTo(prev => prev.filter(c => c.id !== id));
  }

  function set(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  function toggleTag(name) {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(name) ? f.tags.filter(t => t !== name) : [...f.tags, name],
    }));
  }

  function addCustomTag(e) {
    e.preventDefault();
    const t = customTag.trim();
    if (t && !form.tags.includes(t)) {
      setForm(f => ({ ...f, tags: [...f.tags, t] }));
    }
    setCustomTag('');
  }

  function sameSpot(a, b) {
    return Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lng - b.lng) < 0.01;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name) {
      setError('Name is required.');
      return;
    }
    const hasCoords = manualCoords || (initial.lat && initial.lng);
    if (!hasCoords && (!form.city || !form.country)) {
      setError('City and country are required — or tap ⊕ Pin location on the map to place it manually.');
      return;
    }
    setSaving(true);
    try {
      // Manual pin placement takes priority
      if (manualCoords) {
        await finishSave(manualCoords);
        return;
      }
      const locationUnchanged = initial.id
        && form.city === initial.city
        && form.country === initial.country
        && initial.lat != null && initial.lng != null;
      if (locationUnchanged) {
        await finishSave({ lat: initial.lat, lng: initial.lng });
        return;
      }
      const candidates = await geocodeCandidates(form.city, form.country);
      if (candidates.length === 0) {
        setError("Couldn't find that city — check spelling, or use ⊕ Pin location on the map.");
        setSaving(false);
        return;
      }
      await finishSave(candidates[0]);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  async function finishSave(coords) {
    setLocationOptions(null);
    setSaving(true);
    try {
      const result = initial.id
        ? await api.put(`/contacts/${initial.id}`, form)
        : await api.post('/contacts', form);
      api.patch(`/contacts/${result.id}/location`, coords).catch(() => {});

      const { lookupCoords } = await import('../hooks/useGeo.js');
      const homeCoords = (form.home_city && form.home_country)
        ? lookupCoords(form.home_city, form.home_country)
        : null;
      api.patch(`/contacts/${result.id}/home-location`, homeCoords ?? { lat: null, lng: null }).catch(() => {});

      if (isNew && connectTo.length) {
        const created = [];
        for (const target of connectTo) {
          try {
            const cn = await api.post('/connections', { contact_id_1: result.id, contact_id_2: target.id });
            created.push({ ...cn, name_1: result.name, name_2: target.name });
          } catch { /* already connected or invalid — skip */ }
        }
        if (created.length) onConnectionsCreated?.(created);
      }

      onSave({ ...result, lat: coords.lat, lng: coords.lng });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <div className="form-section story-section">
        <div className="form-group">
          <label>What is the story?</label>
          <textarea
            placeholder="How you met, what happened, what they mean to you..."
            value={form.how_we_met}
            onChange={set('how_we_met')}
            rows={5}
          />
        </div>
      </div>

      <div className="form-divider" />

      <div className="form-row">
        <div className="form-group">
          <label>Name *</label>
          <input value={form.name} onChange={set('name')} placeholder="Full name" required />
        </div>
        <div className="form-group">
          <label>Date met</label>
          <input type="month" value={form.date_met} onChange={set('date_met')} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>{manualCoords ? 'Met in — city' : 'Met in — city *'}</label>
          <AutocompleteInput
            value={form.city}
            onChange={v => setForm(f => ({ ...f, city: v }))}
            getSuggestions={q => getCitySuggestions(q, form.country)}
            placeholder="City"
            onPinHint={onStartPin ? () => onStartPin(form) : null}
          />
        </div>
        <div className="form-group">
          <label>{manualCoords ? 'Country' : 'Country *'}</label>
          <AutocompleteInput
            value={form.country}
            onChange={v => setForm(f => ({ ...f, country: v }))}
            getSuggestions={getCountrySuggestions}
            placeholder="Country"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Visit in — city</label>
          <AutocompleteInput
            value={form.home_city}
            onChange={v => setForm(f => ({ ...f, home_city: v }))}
            getSuggestions={q => getCitySuggestions(q, form.home_country)}
            placeholder="Where to visit them"
          />
        </div>
        <div className="form-group">
          <label>Country</label>
          <AutocompleteInput
            value={form.home_country}
            onChange={v => setForm(f => ({ ...f, home_country: v }))}
            getSuggestions={getCountrySuggestions}
            placeholder="Country"
          />
        </div>
      </div>

      <div className="form-group">
        <label>Contact info</label>
        <input
          value={form.contact_info}
          onChange={set('contact_info')}
          placeholder="Email, phone, Instagram, whatever fits..."
        />
      </div>

      <div className="form-group">
        <label>Tags</label>
        <div className="tag-selector">
          {CORE_TAGS.map(name => (
            <TagPill
              key={name}
              tag={name}
              active={form.tags.includes(name)}
              onClick={() => toggleTag(name)}
            />
          ))}
          {form.tags.filter(t => !CORE_TAGS.includes(t)).map(name => (
            <TagPill
              key={name}
              tag={name}
              active
              onRemove={() => toggleTag(name)}
            />
          ))}
        </div>
        <div className="custom-tag-row">
          <input
            value={customTag}
            onChange={e => setCustomTag(e.target.value)}
            placeholder="Add custom tag..."
            style={{ width: 'auto', flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && addCustomTag(e)}
          />
          <button type="button" className="btn-ghost" onClick={addCustomTag}>Add</button>
        </div>
      </div>

      {isNew && allContacts.length > 0 && (
        <div className="form-group">
          <label>Threads woven to this one</label>
          {connectTo.length > 0 && (
            <ul className="connections-list">
              {connectTo.map(c => (
                <li key={c.id} className="connection-item">
                  <span className="connection-stitch" aria-hidden="true" />
                  <span className="connection-name">{c.name}</span>
                  <span className="connection-loc">{c.city}</span>
                  <button type="button" className="encounter-del" onClick={() => removeConnectTo(c.id)}>×</button>
                </li>
              ))}
            </ul>
          )}
          {connectAvailable.length > 0 && (
            <div className="connection-add">
              <div className="connection-search-wrap">
                <input
                  className="connection-search"
                  placeholder="Search by name..."
                  value={connectSearch}
                  onChange={e => { setConnectSearch(e.target.value); setConnectOpen(true); setConnectSelect(''); }}
                  onFocus={() => setConnectOpen(true)}
                  onBlur={() => setTimeout(() => setConnectOpen(false), 150)}
                />
                {connectOpen && (
                  <ul className="connection-dropdown">
                    {connectAvailable
                      .filter(c => c.name.toLowerCase().includes(connectSearch.toLowerCase()))
                      .map(c => (
                        <li
                          key={c.id}
                          className="connection-option"
                          onMouseDown={() => { setConnectSelect(String(c.id)); setConnectSearch(c.name); setConnectOpen(false); }}
                        >
                          <span className="connection-name">{c.name}</span>
                          {c.city && <span className="connection-loc">{c.city}</span>}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
              <button type="button" className="btn-ghost" onClick={() => { addConnectTo(); setConnectSearch(''); }} disabled={!connectSelect}>Tie thread</button>
            </div>
          )}
        </div>
      )}

      {locationOptions && (
        <div className="location-picker">
          <p className="location-picker-label">
            More than one {form.city} in {form.country} — which one did you mean?
          </p>
          {locationOptions.map((c, i) => (
            <button
              key={i}
              type="button"
              className="btn-ghost location-option"
              onClick={() => finishSave(c)}
            >
              {c.name}{c.admin2 ? `, ${c.admin2}` : ''}{c.admin1 && c.admin1 !== c.admin2 ? `, ${c.admin1}` : ''}
            </button>
          ))}
          <button type="button" className="btn-ghost" onClick={() => setLocationOptions(null)}>Cancel</button>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        )}
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            if (onStartPin) {
              onStartPin(form);
            } else if (initial.id) {
              sessionStorage.setItem(`pinForm_${initial.id}`, JSON.stringify(form));
              onCancel?.();
              navigate(`/map?pinFor=${initial.id}`);
            }
          }}
        >
          ⊕ Pin on map
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save to the map'}
        </button>
      </div>
    </form>
  );
}
