import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import './TripsPanel.css';

function formatDateRange(start, end) {
  const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en', { month: 'short', year: 'numeric' }) : null;
  const s = fmt(start), e = fmt(end);
  if (s && e && s !== e) return `${s} — ${e}`;
  return s || e || null;
}

function mergedStops(trip) {
  const contacts = (trip.contacts || []).map(c => ({ type: 'contact', order: c.order_index, rowId: c.id ?? c.contact_id, id: c.contact_id, name: c.name, sub: c.home_city || c.city }));
  const waypoints = (trip.waypoints || []).map(w => ({ type: 'waypoint', order: w.order_index, rowId: w.id, id: w.id, name: w.label || `${w.lat.toFixed(2)}°, ${w.lng.toFixed(2)}°`, sub: null }));
  return [...contacts, ...waypoints].sort((a, b) => a.order - b.order);
}

export default function TripsPanel({ trips, activeTripIds, tripPickMode, onTripsChange, onToggleTrip, onStartPick, onStopPick, onClose, onRemoveWaypoint, onReorder, onEndShare }) {
  const api = useApi();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: '', date_start: '', date_end: '' });
  const [inviteToken, setInviteToken] = useState(null);
  const [inviteTripId, setInviteTripId] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinMsg, setJoinMsg] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  function startCreate() {
    setForm({ title: '', date_start: '', date_end: '' });
    setCreating(true);
    setEditingId(null);
  }

  function startEdit(e, trip) {
    e.stopPropagation();
    setForm({ title: trip.title, date_start: trip.date_start || '', date_end: trip.date_end || '' });
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
      setCreating(false);
    }
  }

  async function deleteTrip(e, id) {
    e.stopPropagation();
    if (!confirm('Remove this trip?')) return;
    await api.del(`/trips/${id}`);
    onTripsChange(trips.filter(t => t.id !== id));
  }

  async function removeContact(trip, contactId) {
    await api.del(`/trips/${trip.id}/contacts/${contactId}`);
    const updated = { ...trip, contacts: trip.contacts.filter(c => c.contact_id !== contactId) };
    onTripsChange(trips.map(t => t.id === trip.id ? updated : t));
  }

  async function removeWaypoint(trip, waypointId) {
    await api.del(`/trips/${trip.id}/waypoints/${waypointId}`);
    onRemoveWaypoint(trip.id, waypointId);
    const updated = { ...trip, waypoints: trip.waypoints.filter(w => w.id !== waypointId) };
    onTripsChange(trips.map(t => t.id === trip.id ? updated : t));
  }

  async function getInvite(e, trip) {
    e.stopPropagation();
    const { token } = await api.post(`/trips/${trip.id}/invite`);
    setInviteToken(token);
    setInviteTripId(trip.id);
  }

  async function submitJoin() {
    if (!joinCode.trim()) return;
    try {
      const res = await api.post('/trips/join', { token: joinCode.trim() });
      setJoinMsg(`Joined "${res.trip_title}" — partner's contacts are now visible on the map.`);
      setJoinCode('');
    } catch (err) {
      setJoinMsg(err.message || 'Invalid code');
    }
  }

  const inviteUrl = inviteToken ? `${window.location.origin}/?join=${inviteToken}` : null;

  return (
    <div className="trips-panel">
      <div className="trips-header">
        <span className="trips-title">Travels</span>
        <div className="trips-header-actions">
          <button className="trips-new-btn" onClick={startCreate}>+ New</button>
          <button className="trips-new-btn" onClick={() => { setShowJoin(v => !v); setJoinMsg(''); }}>Join</button>
          <button className="trips-close-btn" onClick={onClose}>×</button>
        </div>
      </div>

      {showJoin && (
        <div className="trip-join-box">
          <p className="trip-join-hint">Enter a partner's invite code to sync their contacts during a trip.</p>
          <div className="trip-join-row">
            <input className="trip-input" placeholder="Invite code" value={joinCode} onChange={e => setJoinCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitJoin()} />
            <button className="trip-btn-primary" onClick={submitJoin}>Join</button>
          </div>
          {joinMsg && <p className="trip-join-msg">{joinMsg}</p>}
        </div>
      )}

      {inviteToken && inviteTripId && (
        <div className="trip-invite-box">
          <p className="trip-invite-hint">Share this code with your partner:</p>
          <div className="trip-invite-code" onClick={() => navigator.clipboard?.writeText(inviteToken)}>
            {inviteToken}
          </div>
          <p className="trip-invite-hint" style={{ fontSize: '0.68rem' }}>Tap to copy · their contacts appear on your map while the share is active</p>
          <button className="trip-btn-ghost" style={{ marginTop: 4 }} onClick={() => { setInviteToken(null); setInviteTripId(null); }}>Close</button>
        </div>
      )}

      {creating && (
        <form className="trip-form" onSubmit={saveTrip}>
          <input className="trip-input" placeholder="Trip name" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus required />
          <div className="trip-dates">
            <input className="trip-input" type="month" value={form.date_start} onChange={e => setForm(f => ({ ...f, date_start: e.target.value }))} />
            <span>—</span>
            <input className="trip-input" type="month" value={form.date_end} onChange={e => setForm(f => ({ ...f, date_end: e.target.value }))} />
          </div>
          <div className="trip-form-actions">
            <button type="button" className="trip-btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" className="trip-btn-primary">Create</button>
          </div>
        </form>
      )}

      <div className="trips-list">
        {trips.length === 0 && !creating && <p className="trips-empty">No travels yet.</p>}
        {trips.map(trip => {
          const isActive = activeTripIds.has(trip.id);
          const isPickingThis = tripPickMode && isActive;
          const stops = mergedStops(trip);

          if (editingId === trip.id) {
            return (
              <div key={trip.id} className="trip-item active">
                <form className="trip-form" onSubmit={saveTrip}>
                  <input className="trip-input" placeholder="Trip name" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus required />
                  <div className="trip-dates">
                    <input className="trip-input" type="month" value={form.date_start} onChange={e => setForm(f => ({ ...f, date_start: e.target.value }))} />
                    <span>—</span>
                    <input className="trip-input" type="month" value={form.date_end} onChange={e => setForm(f => ({ ...f, date_end: e.target.value }))} />
                  </div>
                  <div className="trip-form-actions">
                    <button type="button" className="trip-btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                    <button type="submit" className="trip-btn-primary">Save</button>
                  </div>
                </form>
              </div>
            );
          }

          return (
            <div key={trip.id} className={`trip-item${isActive ? ' active' : ''}`}>
              <div className="trip-item-header" onClick={() => onToggleTrip(trip, !isActive)}>
                <div className="trip-route-dot" style={{ background: isActive ? 'var(--ink)' : 'transparent' }} />
                <div className="trip-item-info">
                  <span className="trip-item-title">{trip.title}</span>
                  {formatDateRange(trip.date_start, trip.date_end) && (
                    <span className="trip-item-date">{formatDateRange(trip.date_start, trip.date_end)}</span>
                  )}
                </div>
                <div className="trip-item-actions">
                  <button className="trip-icon-btn" title="Invite partner" onClick={e => getInvite(e, trip)}>⇗</button>
                  <button className="trip-icon-btn" onClick={e => startEdit(e, trip)}>✎</button>
                  <button className="trip-icon-btn" onClick={e => deleteTrip(e, trip.id)}>×</button>
                </div>
              </div>

              {isActive && (
                <div className="trip-contacts">
                  {stops.map((stop, i) => (
                    <div key={`${stop.type}-${stop.id}`} className="trip-contact-row">
                      <div className="trip-reorder-btns">
                        <button className="trip-reorder-btn" disabled={i === 0} onClick={() => onReorder(trip, stops, i, -1)}>↑</button>
                        <button className="trip-reorder-btn" disabled={i === stops.length - 1} onClick={() => onReorder(trip, stops, i, 1)}>↓</button>
                      </div>
                      <span className={`trip-contact-name${stop.type === 'waypoint' ? ' trip-waypoint-name' : ''}`}>{stop.name}</span>
                      {stop.sub && <span className="trip-contact-city">{stop.sub}</span>}
                      <button className="trip-icon-btn" onClick={() =>
                        stop.type === 'contact' ? removeContact(trip, stop.id) : removeWaypoint(trip, stop.id)
                      }>×</button>
                    </div>
                  ))}
                  <div className="trip-add-contact">
                    {isPickingThis
                      ? <button className="trip-pick-active-btn" onClick={onStopPick}>✓ Done adding</button>
                      : <button className="trip-pick-btn" onClick={() => onStartPick(trip)}>+ Tap dots or map to add</button>
                    }
                  </div>
                  <button className="trip-end-share-btn" onClick={() => { if (confirm('End the sync for this trip? Partner contacts will disappear from your map.')) onEndShare(trip.id); }}>
                    End travel sync
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
