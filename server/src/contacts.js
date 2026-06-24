import db from './db.js';

function geocodeCity(city, country) {
  // Stub — in production, call a geocoding API. For now return null.
  return { lat: null, lng: null };
}

export function listContacts(req, res) {
  const contacts = db.prepare(`
    SELECT c.*, GROUP_CONCAT(t.name, '|||') as tag_names, GROUP_CONCAT(t.id, '|||') as tag_ids,
           GROUP_CONCAT(t.is_core, '|||') as tag_cores
    FROM contacts c
    LEFT JOIN contact_tags ct ON ct.contact_id = c.id
    LEFT JOIN tags t ON t.id = ct.tag_id
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all(req.userId);

  res.json(contacts.map(formatContact));
}

export function getContact(req, res) {
  const contact = db.prepare(`
    SELECT c.*, GROUP_CONCAT(t.name, '|||') as tag_names, GROUP_CONCAT(t.id, '|||') as tag_ids,
           GROUP_CONCAT(t.is_core, '|||') as tag_cores
    FROM contacts c
    LEFT JOIN contact_tags ct ON ct.contact_id = c.id
    LEFT JOIN tags t ON t.id = ct.tag_id
    WHERE c.id = ? AND c.user_id = ?
    GROUP BY c.id
  `).get(req.params.id, req.userId);
  if (!contact) return res.status(404).json({ error: 'Not found' });

  const encounters = db.prepare('SELECT * FROM encounters WHERE contact_id = ? ORDER BY encounter_date DESC').all(contact.id);
  res.json({ ...formatContact(contact), encounters });
}

export function createContact(req, res) {
  const { name, city, country, date_met, how_we_met, what_they_mean, contact_info, tags } = req.body;
  if (!name || !city || !country) return res.status(400).json({ error: 'Name, city, and country are required' });

  const { lat, lng } = geocodeCity(city, country);
  const contact = db.prepare(`
    INSERT INTO contacts (user_id, name, city, country, lat, lng, date_met, how_we_met, what_they_mean, contact_info)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(req.userId, name, city, country, lat, lng, date_met || null, how_we_met || null, what_they_mean || null, contact_info || null);

  if (tags?.length) saveTags(contact.id, req.userId, tags);

  res.status(201).json(getContactById(contact.id, req.userId));
}

export function updateContact(req, res) {
  const existing = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, city, country, date_met, how_we_met, what_they_mean, contact_info, tags } = req.body;
  db.prepare(`
    UPDATE contacts SET name=?, city=?, country=?, date_met=?, how_we_met=?, what_they_mean=?,
    contact_info=?, updated_at=datetime('now') WHERE id=?
  `).run(name, city, country, date_met || null, how_we_met || null, what_they_mean || null, contact_info || null, req.params.id);

  if (tags !== undefined) {
    db.prepare('DELETE FROM contact_tags WHERE contact_id = ?').run(req.params.id);
    if (tags?.length) saveTags(req.params.id, req.userId, tags);
    pruneUnusedTags(req.userId);
  }

  res.json(getContactById(req.params.id, req.userId));
}

export function updateContactLocation(req, res) {
  const existing = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'lat and lng are required' });

  db.prepare('UPDATE contacts SET lat=?, lng=? WHERE id=?').run(lat, lng, req.params.id);
  res.json({ ok: true });
}

export function deleteContact(req, res) {
  const result = db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  pruneUnusedTags(req.userId);
  res.json({ ok: true });
}

function pruneUnusedTags(userId) {
  db.prepare(`
    DELETE FROM tags
    WHERE user_id = ? AND is_core = 0
    AND id NOT IN (SELECT tag_id FROM contact_tags)
  `).run(userId);
}

export function addEncounter(req, res) {
  const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!contact) return res.status(404).json({ error: 'Not found' });

  const { note, encounter_date } = req.body;
  if (!note || !encounter_date) return res.status(400).json({ error: 'Note and date required' });

  const encounter = db.prepare('INSERT INTO encounters (contact_id, note, encounter_date) VALUES (?, ?, ?) RETURNING *')
    .get(req.params.id, note, encounter_date);
  res.status(201).json(encounter);
}

export function deleteEncounter(req, res) {
  const encounter = db.prepare(`
    SELECT e.id FROM encounters e
    JOIN contacts c ON c.id = e.contact_id
    WHERE e.id = ? AND c.user_id = ?
  `).get(req.params.encounterId, req.userId);
  if (!encounter) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM encounters WHERE id = ?').run(req.params.encounterId);
  res.json({ ok: true });
}

export function listTags(req, res) {
  const tags = db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY is_core DESC, name ASC').all(req.userId);
  res.json(tags);
}

export function createTag(req, res) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const tag = db.prepare('INSERT INTO tags (user_id, name, is_core) VALUES (?, ?, 0) RETURNING *').get(req.userId, name);
    res.status(201).json(tag);
  } catch {
    res.status(409).json({ error: 'Tag already exists' });
  }
}

function saveTags(contactId, userId, tagNames) {
  for (const name of tagNames) {
    let tag = db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?').get(userId, name);
    if (!tag) tag = db.prepare('INSERT INTO tags (user_id, name, is_core) VALUES (?, ?, 0) RETURNING *').get(userId, name);
    db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)').run(contactId, tag.id);
  }
}

function getContactById(id, userId) {
  const contact = db.prepare(`
    SELECT c.*, GROUP_CONCAT(t.name, '|||') as tag_names, GROUP_CONCAT(t.id, '|||') as tag_ids,
           GROUP_CONCAT(t.is_core, '|||') as tag_cores
    FROM contacts c
    LEFT JOIN contact_tags ct ON ct.contact_id = c.id
    LEFT JOIN tags t ON t.id = ct.tag_id
    WHERE c.id = ? AND c.user_id = ?
    GROUP BY c.id
  `).get(id, userId);
  return formatContact(contact);
}

export function listConnections(req, res) {
  const rows = db.prepare(`
    SELECT cn.id, cn.contact_id_1, cn.contact_id_2,
           c1.name as name_1, c2.name as name_2
    FROM connections cn
    JOIN contacts c1 ON c1.id = cn.contact_id_1
    JOIN contacts c2 ON c2.id = cn.contact_id_2
    WHERE cn.user_id = ?
  `).all(req.userId);
  res.json(rows);
}

export function createConnection(req, res) {
  const { contact_id_1, contact_id_2 } = req.body;
  if (!contact_id_1 || !contact_id_2) return res.status(400).json({ error: 'Both contact IDs required' });
  const [a, b] = [Math.min(contact_id_1, contact_id_2), Math.max(contact_id_1, contact_id_2)];
  try {
    const row = db.prepare('INSERT INTO connections (user_id, contact_id_1, contact_id_2) VALUES (?,?,?) RETURNING *').get(req.userId, a, b);
    res.status(201).json(row);
  } catch {
    res.status(409).json({ error: 'Connection already exists' });
  }
}

export function deleteConnection(req, res) {
  const result = db.prepare('DELETE FROM connections WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}

function formatContact(c) {
  const names = c.tag_names?.split('|||') || [];
  const ids = c.tag_ids?.split('|||') || [];
  const cores = c.tag_cores?.split('|||') || [];
  const tags = names.filter(Boolean).map((name, i) => ({
    id: parseInt(ids[i]),
    name,
    is_core: parseInt(cores[i]) === 1,
  }));
  const { tag_names, tag_ids, tag_cores, ...rest } = c;
  return { ...rest, tags };
}
