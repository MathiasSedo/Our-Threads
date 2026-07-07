import db from './db.js';
import { randomBytes } from 'crypto';

export async function listTrips(req, res) {
  const trips = await db.prepare('SELECT * FROM trips WHERE user_id = ? ORDER BY date_start DESC, created_at DESC').all(req.userId);
  const result = [];
  for (const trip of trips) {
    const contacts = await db.prepare(
      'SELECT tc.contact_id, tc.order_index, c.name, c.lat, c.lng, c.home_lat, c.home_lng, c.city, c.home_city FROM trip_contacts tc JOIN contacts c ON c.id = tc.contact_id WHERE tc.trip_id = ? ORDER BY tc.order_index'
    ).all(trip.id);
    const waypoints = await db.prepare(
      'SELECT id, lat, lng, label, order_index FROM trip_waypoints WHERE trip_id = ? ORDER BY order_index'
    ).all(trip.id);
    result.push({ ...trip, contacts, waypoints });
  }
  res.json(result);
}

export async function createTrip(req, res) {
  const { title, date_start, date_end, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const row = await db.prepare(
    'INSERT INTO trips (user_id, title, date_start, date_end, description) VALUES (?, ?, ?, ?, ?) RETURNING *'
  ).get(req.userId, title, date_start || null, date_end || null, description || null);
  res.status(201).json({ ...row, contacts: [], waypoints: [] });
}

export async function updateTrip(req, res) {
  const { title, date_start, date_end, description } = req.body;
  await db.prepare(
    'UPDATE trips SET title=?, date_start=?, date_end=?, description=? WHERE id=? AND user_id=?'
  ).run(title, date_start || null, date_end || null, description || null, req.params.id, req.userId);
  res.json({ ok: true });
}

export async function deleteTrip(req, res) {
  await db.prepare('DELETE FROM trips WHERE id=? AND user_id=?').run(req.params.id, req.userId);
  res.json({ ok: true });
}

export async function addTripContact(req, res) {
  const { contact_id, order_index } = req.body;
  try {
    await db.prepare('INSERT INTO trip_contacts (trip_id, contact_id, order_index) VALUES (?, ?, ?)').run(req.params.id, contact_id, order_index ?? 0);
  } catch {
    await db.prepare('UPDATE trip_contacts SET order_index=? WHERE trip_id=? AND contact_id=?').run(order_index ?? 0, req.params.id, contact_id);
  }
  res.json({ ok: true });
}

export async function removeTripContact(req, res) {
  await db.prepare('DELETE FROM trip_contacts WHERE trip_id=? AND contact_id=?').run(req.params.id, req.params.contactId);
  res.json({ ok: true });
}

export async function updateOrder(req, res) {
  const { contacts = [], waypoints = [] } = req.body;
  for (const { id, order_index } of contacts) {
    await db.prepare('UPDATE trip_contacts SET order_index=? WHERE contact_id=? AND trip_id=?').run(order_index, id, req.params.id);
  }
  for (const { id, order_index } of waypoints) {
    await db.prepare('UPDATE trip_waypoints SET order_index=? WHERE id=? AND trip_id=?').run(order_index, id, req.params.id);
  }
  res.json({ ok: true });
}

export async function updateWaypointLabel(req, res) {
  const { label } = req.body;
  await db.prepare('UPDATE trip_waypoints SET label=? WHERE id=? AND trip_id=?').run(label || null, req.params.waypointId, req.params.id);
  res.json({ ok: true });
}

export async function addWaypoint(req, res) {
  const { lat, lng, label, order_index } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
  const row = await db.prepare(
    'INSERT INTO trip_waypoints (trip_id, lat, lng, label, order_index) VALUES (?, ?, ?, ?, ?) RETURNING *'
  ).get(req.params.id, lat, lng, label || null, order_index ?? 0);
  res.status(201).json(row);
}

export async function removeWaypoint(req, res) {
  await db.prepare('DELETE FROM trip_waypoints WHERE id = ? AND trip_id = ?').run(req.params.waypointId, req.params.id);
  res.json({ ok: true });
}

export async function inviteToTrip(req, res) {
  const trip = await db.prepare('SELECT * FROM trips WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  let share = await db.prepare('SELECT * FROM trip_shares WHERE trip_id=? AND active=1').get(req.params.id);
  if (!share) {
    const token = randomBytes(12).toString('hex');
    share = await db.prepare('INSERT INTO trip_shares (trip_id, invite_token) VALUES (?, ?) RETURNING *').get(req.params.id, token);
  }
  res.json({ token: share.invite_token });
}

export async function joinTrip(req, res) {
  const { token } = req.body;
  const share = await db.prepare('SELECT * FROM trip_shares WHERE invite_token=? AND active=1').get(token);
  if (!share) return res.status(404).json({ error: 'Invalid or expired invite' });
  const trip = await db.prepare('SELECT * FROM trips WHERE id=?').get(share.trip_id);
  if (trip.user_id === req.userId) return res.status(400).json({ error: 'This is your own trip' });
  if (share.joined_user_id && share.joined_user_id !== req.userId) return res.status(400).json({ error: 'Invite already used' });
  await db.prepare('UPDATE trip_shares SET joined_user_id=? WHERE id=?').run(req.userId, share.id);
  res.json({ trip_title: trip.title });
}

export async function listSharedContacts(req, res) {
  // Find all users co-traveling with me on an active share
  const partnerIds = new Set();
  const asOwner = await db.prepare(
    'SELECT ts.joined_user_id FROM trip_shares ts JOIN trips t ON t.id=ts.trip_id WHERE t.user_id=? AND ts.joined_user_id IS NOT NULL AND ts.active=1'
  ).all(req.userId);
  const asGuest = await db.prepare(
    'SELECT t.user_id FROM trip_shares ts JOIN trips t ON t.id=ts.trip_id WHERE ts.joined_user_id=? AND ts.active=1'
  ).all(req.userId);
  asOwner.forEach(r => partnerIds.add(r.joined_user_id));
  asGuest.forEach(r => partnerIds.add(r.user_id));
  if (partnerIds.size === 0) return res.json([]);

  const contacts = [];
  for (const uid of partnerIds) {
    const rows = await db.prepare('SELECT * FROM contacts WHERE user_id=?').all(uid);
    contacts.push(...rows.map(c => ({ ...c, shared: true })));
  }
  res.json(contacts);
}

export async function endTripShare(req, res) {
  await db.prepare('UPDATE trip_shares SET active=0 WHERE trip_id=? AND (SELECT user_id FROM trips WHERE id=trip_id)=?')
    .run(req.params.id, req.userId);
  res.json({ ok: true });
}
