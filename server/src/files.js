import db from './db.js';

export async function listFiles(req, res) {
  const files = await db.prepare(
    'SELECT id, filename, mime_type, created_at FROM contact_files WHERE contact_id = ? ORDER BY created_at'
  ).all(req.params.id);
  res.json(files);
}

export async function getFile(req, res) {
  const file = await db.prepare(
    'SELECT * FROM contact_files WHERE id = ? AND contact_id = ?'
  ).get(req.params.fileId, req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  const buf = Buffer.from(file.data, 'base64');
  res.set('Content-Type', file.mime_type);
  res.set('Cache-Control', 'private, max-age=31536000');
  res.send(buf);
}

export async function uploadFile(req, res) {
  const { filename, mime_type, data } = req.body;
  if (!data || !mime_type) return res.status(400).json({ error: 'Missing data' });
  const row = await db.prepare(
    'INSERT INTO contact_files (contact_id, filename, mime_type, data) VALUES (?, ?, ?, ?) RETURNING id, filename, mime_type, created_at'
  ).get(req.params.id, filename || 'file', mime_type, data);
  res.status(201).json(row);
}

export async function deleteFile(req, res) {
  await db.prepare('DELETE FROM contact_files WHERE id = ? AND contact_id = ?').run(req.params.fileId, req.params.id);
  res.json({ ok: true });
}
