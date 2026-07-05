import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import './TripsPanel.css';

function formatDateRange(start, end) {
  const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en', { month: 'short', year: 'numeric' }) : null;
  const s = fmt(start), e = fmt(end);
  if (s && e && s !== e) return `${s} — ${e}`;
  return s || e || null;
}

export default function TripsPanel({ trips, onTripsChange, activeTrip, tripPickMode, onSelectTrip, onStartPick, onStopPick }) {
  const api = useApi();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: '', date_start: '', date_end: '', description: '' });

  function startCreate() {
    setForm({ title: '', date_start: '', date_end: '', description: '' });
    setCreating(true);
    setEditingId(null);
  }

  function startEdit(trip) {
    setForm({ title: trip.title, date_start: trip.date_start || '', date_end: trip.date_end || '', description: trip.description || '' });
    setEditingId(trip.id);
    setCreating(false);
  }

  async function saveTrip(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (editingId) {
      await api.put(`/trips/${editingId}`, form);
      onTripsChange(trips.map(t => t.id === editingId ? { ...t, ...form } : t));
      setEditingId(null);
    } else {
      const created = await api.post('/trips', form);
      onTripsChange([created, ...trips]);
      onSelectTrip(created);
      setCreating(false);
    }
  }

  async function deleteTrip(id) {
    if (!confirm('Remove this trip?')) return;
    await api.del(`/trips/${id}`);
    onTripsChange(trips.filter(t => t.id !== id));
    if (activeTrip?.id === id) onSelectTrip(null);
  }

  async function removeContact(trip, contactId) {
    await api.del(`/trips/${trip.id}/contacts/${contactId}`);
    const updated = { ...trip, contacts: trip.contacts.filter(c => c.contact_id !== contactId).map((c, i) => ({ ...c, order_index: i })) };
    onTripsChange(trips.map(t => t.id === trip.id ? updated : t));
    if (activeTrip?.id === trip.id) onSelectTrip(updated);
  }


  return (
    <div className="trips-panel">
      <div className="trips-header">
        <span className="trips-title">Travels</span>
        <button className="trips-new-btn" onClick={startCreate}>+ New</button>
      </div>

      {(creating || editingId) && (
        <form className="trip-form" onSubmit={saveTrip}>
          <input className="trip-input" placeholder="Trip name" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus required />
          <div className="trip-dates">
            <input className="trip-input" type="month" value={form.date_start} onChange={e => setForm(f => ({ ...f, date_start: e.target.value }))} />
            <span>—</span>
            <input className="trip-input" type="month" value={form.date_end} onChange={e => setForm(f => ({ ...f, date_end: e.target.value }))} />
          </div>
          <div className="trip-form-actions">
            <button type="button" className="trip-btn-ghost" onClick={() => { setCreating(false); setEditingId(null); }}>Cancel</button>
            <button type="submit" className="trip-btn-primary">{editingId ? 'Save' : 'Create'}</button>
          </div>
        </form>
      )}

      <div className="trips-list">
        {trips.length === 0 && !creating && <p className="trips-empty">No travels yet.</p>}
        {trips.map(trip => (
          <div key={trip.id} className={`trip-item ${activeTrip?.id === trip.id ? 'active' : ''}`}>
            <div className="trip-item-header" onClick={() => onSelectTrip(activeTrip?.id === trip.id ? null : trip)}>
              <div className="trip-item-info">
                <span className="trip-item-title">{trip.title}</span>
                {formatDateRange(trip.date_start, trip.date_end) && (
                  <span className="trip-item-date">{formatDateRange(trip.date_start, trip.date_end)}</span>
                )}
              </div>
              <div className="trip-item-actions">
                <button className="trip-icon-btn" onClick={e => { e.stopPropagation(); startEdit(trip); }}>✎</button>
                <button className="trip-icon-btn" onClick={e => { e.stopPropagation(); deleteTrip(trip.id); }}>×</button>
              </div>
            </div>

            {activeTrip?.id === trip.id && (
              <div className="trip-contacts">
                {trip.contacts.map((c, i) => (
                  <div key={c.contact_id} className="trip-contact-row">
                    <span className="trip-contact-idx">{i + 1}</span>
                    <span className="trip-contact-name">{c.name}</span>
                    <span className="trip-contact-city">{c.home_city || c.city}</span>
                    <button className="trip-icon-btn" onClick={() => removeContact(trip, c.contact_id)}>×</button>
                  </div>
                ))}
                <div className="trip-add-contact">
                  {tripPickMode
                    ? <button className="trip-pick-active-btn" onClick={onStopPick}>✓ Done adding</button>
                    : <button className="trip-pick-btn" onClick={() => onStartPick(trip)}>+ Tap dots on map</button>
                  }
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
