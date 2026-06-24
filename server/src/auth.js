import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

export function register(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const hash = bcrypt.hashSync(password, 10);
  try {
    const user = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id, email').get(email, hash);

    // Seed core tags for new user
    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (user_id, name, is_core) VALUES (?, ?, 1)');
    ['Visit', 'Work', 'Family', 'Invite for wedding'].forEach(name => insertTag.run(user.id, name));

    const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered' });
    throw e;
  }
}

export function login(req, res) {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email: user.email } });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(header.slice(7), SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
