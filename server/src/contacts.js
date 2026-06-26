import db from './db.js';

export async function listContacts(req, res) {
  const contacts = await db.prepare(`
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

export async function getContact(req, res) {
  const contact = await db.prepare(`
    SELECT c.*, GROUP_CONCAT(t.name, '|||') as tag_names, GROUP_CONCAT(t.id, '|||') as tag_ids,
           GROUP_CONCAT(t.is_core, '|||') as tag_cores
    FROM contacts c
    LEFT JOIN contact_tags ct ON ct.contact_id = c.id
    LEFT JOIN tags t ON t.id = ct.tag_id
    WHERE c.id = ? AND c.user_id = ?
    GROUP BY c.id
  `).get(req.params.id, req.userId);
  if (!contact) return res.status(404).json({ error: 'Not found' });

  const encounters = await db.prepare('SELECT * FROM encounters WHERE contact_id = ? ORDER BY encounter_date DESC').all(contact.id);
  res.json({ ...formatContact(contact), encounters });
}

export async function createContact(req, res) {
  const { name, city, country, date_met, how_we_met, what_they_mean, contact_info, tags } = req.body;
  if (!name || !city || !country) return res.status(400).json({ error: 'Name, city, and country are required' });

  const contact = await db.prepare(`
    INSERT INTO contacts (user_id, name, city, country, lat, lng, date_met, how_we_met, what_they_mean, contact_info)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(req.userId, name, city, country, null, null, date_met || null, how_we_met || null, what_they_mean || null, contact_info || null);

  if (tags?.length) await saveTags(contact.id, req.userId, tags);

  res.status(201).json(await getContactById(contact.id, req.userId));
}

export async function updateContact(req, res) {
  const existing = await db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, city, country, date_met, how_we_met, what_they_mean, contact_info, tags } = req.body;
  await db.prepare(`
    UPDATE contacts SET name=?, city=?, country=?, date_met=?, how_we_met=?, what_they_mean=?,
    contact_info=?, updated_at=datetime('now') WHERE id=?
  `).run(name, city, country, date_met || null, how_we_met || null, what_they_mean || null, contact_info || null, req.params.id);

  if (tags !== undefined) {
    await db.prepare('DELETE FROM contact_tags WHERE contact_id = ?').run(req.params.id);
    if (tags?.length) await saveTags(req.params.id, req.userId, tags);
    await pruneUnusedTags(req.userId);
  }

  res.json(await getContactById(req.params.id, req.userId));
}

export async function updateContactLocation(req, res) {
  const existing = await db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'lat and lng are required' });

  await db.prepare('UPDATE contacts SET lat=?, lng=? WHERE id=?').run(lat, lng, req.params.id);
  res.json({ ok: true });
}

export async function deleteContact(req, res) {
  const result = await db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  await pruneUnusedTags(req.userId);
  res.json({ ok: true });
}

async function pruneUnusedTags(userId) {
  await db.prepare(`
    DELETE FROM tags
    WHERE user_id = ? AND is_core = 0
    AND id NOT IN (SELECT tag_id FROM contact_tags)
  `).run(userId);
}

export async function addEncounter(req, res) {
  const contact = await db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!contact) return res.status(404).json({ error: 'Not found' });

  const { note, encounter_date } = req.body;
  if (!note || !encounter_date) return res.status(400).json({ error: 'Note and date required' });

  const encounter = await db.prepare('INSERT INTO encounters (contact_id, note, encounter_date) VALUES (?, ?, ?) RETURNING *')
    .get(req.params.id, note, encounter_date);
  res.status(201).json(encounter);
}

export async function deleteEncounter(req, res) {
  const encounter = await db.prepare(`
    SELECT e.id FROM encounters e
    JOIN contacts c ON c.id = e.contact_id
    WHERE e.id = ? AND c.user_id = ?
  `).get(req.params.encounterId, req.userId);
  if (!encounter) return res.status(404).json({ error: 'Not found' });
  await db.prepare('DELETE FROM encounters WHERE id = ?').run(req.params.encounterId);
  res.json({ ok: true });
}

export async function listTags(req, res) {
  const tags = await db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY is_core DESC, name ASC').all(req.userId);
  res.json(tags);
}

export async function createTag(req, res) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const tag = await db.prepare('INSERT INTO tags (user_id, name, is_core) VALUES (?, ?, 0) RETURNING *').get(req.userId, name);
    res.status(201).json(tag);
  } catch {
    res.status(409).json({ error: 'Tag already exists' });
  }
}

async function saveTags(contactId, userId, tagNames) {
  for (const name of tagNames) {
    let tag = await db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?').get(userId, name);
    if (!tag) tag = await db.prepare('INSERT INTO tags (user_id, name, is_core) VALUES (?, ?, 0) RETURNING *').get(userId, name);
    await db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)').run(contactId, tag.id);
  }
}

async function getContactById(id, userId) {
  const contact = await db.prepare(`
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

export async function listConnections(req, res) {
  const rows = await db.prepare(`
    SELECT cn.id, cn.contact_id_1, cn.contact_id_2,
           c1.name as name_1, c2.name as name_2
    FROM connections cn
    JOIN contacts c1 ON c1.id = cn.contact_id_1
    JOIN contacts c2 ON c2.id = cn.contact_id_2
    WHERE cn.user_id = ?
  `).all(req.userId);
  res.json(rows);
}

export async function createConnection(req, res) {
  const { contact_id_1, contact_id_2 } = req.body;
  if (!contact_id_1 || !contact_id_2) return res.status(400).json({ error: 'Both contact IDs required' });
  const [a, b] = [Math.min(contact_id_1, contact_id_2), Math.max(contact_id_1, contact_id_2)];
  try {
    const row = await db.prepare('INSERT INTO connections (user_id, contact_id_1, contact_id_2) VALUES (?,?,?) RETURNING *').get(req.userId, a, b);
    res.status(201).json(row);
  } catch {
    res.status(409).json({ error: 'Connection already exists' });
  }
}

export async function deleteConnection(req, res) {
  const result = await db.prepare('DELETE FROM connections WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
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
