import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import TagPill from './TagPill.jsx';
import AutocompleteInput from './AutocompleteInput.jsx';
import VoiceRecorder from './VoiceRecorder.jsx';
import { getCountrySuggestions, getCitySuggestions } from '../hooks/useGeo.js';
import { geocode } from '../utils/geocode.js';
import './ContactForm.css';

const CORE_TAGS = ['Visit', 'Work', 'Family', 'Invite for wedding'];

export default function ContactForm({ initial = {}, onSave, onCancel }) {
  const api = useApi();
  const [form, setForm] = useState({
    name: '',
    city: '',
    country: '',
    date_met: '',
    how_we_met: '',
    contact_info: '',
    ...initial,
    tags: initial.tags?.map(t => t.name || t) || [],
  });
  const [customTag, setCustomTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name || !form.city || !form.country) {
      setError('Name, city, and country are required.');
      return;
    }
    setSaving(true);
    try {
      const coords = await geocode(form.city, form.country);
      if (!coords) {
        setError("Couldn't find that city on the map — check the spelling and try again.");
        return;
      }
      const result = initial.id
        ? await api.put(`/contacts/${initial.id}`, form)
        : await api.post('/contacts', form);
      api.patch(`/contacts/${result.id}/location`, coords).catch(() => {});
      onSave({ ...result, ...coords });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleExtracted(extracted) {
    setForm(f => ({
      ...f,
      ...Object.fromEntries(Object.entries(extracted || {}).filter(([k, v]) => v && k !== 'suggested_tags')),
      tags: extracted?.suggested_tags?.length
        ? [...new Set([...f.tags, ...extracted.suggested_tags])]
        : f.tags,
    }));
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <div className="form-section story-section">
        <VoiceRecorder onExtracted={handleExtracted} />
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
          <label>City *</label>
          <AutocompleteInput
            value={form.city}
            onChange={v => setForm(f => ({ ...f, city: v }))}
            getSuggestions={getCitySuggestions}
            placeholder="City"
            required
          />
        </div>
        <div className="form-group">
          <label>Country *</label>
          <AutocompleteInput
            value={form.country}
            onChange={v => setForm(f => ({ ...f, country: v }))}
            getSuggestions={getCountrySuggestions}
            placeholder="Country"
            required
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

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        )}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save to the map'}
        </button>
      </div>
    </form>
  );
}
