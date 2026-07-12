import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Turso (libSQL) — a free, hosted, SQLite-compatible database. Unlike a local
// SQLite file on Render's free tier, this data survives redeploys, since it
// lives outside the app's own ephemeral disk. Locally, with no Turso env
// vars set, this falls back to a plain local file so dev doesn't need a
// Turso account at all.
const client = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, '../../our-threads.db')}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

function prepare(sql) {
  return {
    async get(...args) {
      const res = await client.execute({ sql, args });
      return res.rows[0] ? rowToObject(res.rows[0], res.columns) : undefined;
    },
    async all(...args) {
      const res = await client.execute({ sql, args });
      return res.rows.map(r => rowToObject(r, res.columns));
    },
    async run(...args) {
      const res = await client.execute({ sql, args });
      return { changes: res.rowsAffected, lastInsertRowid: res.lastInsertRowid };
    },
  };
}

export async function initDb() {
  // Add new columns to existing tables (safe to run multiple times — errors ignored)
  for (const sql of [
    `ALTER TABLE contacts ADD COLUMN home_city TEXT`,
    `ALTER TABLE contacts ADD COLUMN home_country TEXT`,
    `ALTER TABLE contacts ADD COLUMN home_lat REAL`,
    `ALTER TABLE contacts ADD COLUMN home_lng REAL`,
  ]) {
    await client.execute(sql).catch(() => {});
  }

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      country TEXT NOT NULL,
      lat REAL,
      lng REAL,
      date_met TEXT,
      how_we_met TEXT,
      what_they_mean TEXT,
      contact_info TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_core INTEGER DEFAULT 0,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS contact_tags (
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (contact_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS encounters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      note TEXT NOT NULL,
      encounter_date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_id_1 INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      contact_id_2 INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      UNIQUE(user_id, contact_id_1, contact_id_2)
    );

    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      date_start TEXT,
      date_end TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trip_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      order_index INTEGER DEFAULT 0,
      UNIQUE(trip_id, contact_id)
    );

    CREATE TABLE IF NOT EXISTS contact_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trip_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      invite_token TEXT UNIQUE NOT NULL,
      joined_user_id INTEGER REFERENCES users(id),
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trip_waypoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      label TEXT,
      order_index INTEGER DEFAULT 0
    );
  `);
}

const db = { prepare };
export default db;
