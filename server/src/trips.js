import db from './db.js';

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
