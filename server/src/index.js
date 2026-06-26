import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { register, login, requireAuth } from './auth.js';
import {
  listContacts, getContact, createContact, updateContact, updateContactLocation, deleteContact,
  addEncounter, deleteEncounter, listTags, createTag,
  listConnections, createConnection, deleteConnection
} from './contacts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({ origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Auth
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

// Contacts
app.get('/api/contacts', requireAuth, listContacts);
app.post('/api/contacts', requireAuth, createContact);
app.get('/api/contacts/:id', requireAuth, getContact);
app.put('/api/contacts/:id', requireAuth, updateContact);
app.patch('/api/contacts/:id/location', requireAuth, updateContactLocation);
app.delete('/api/contacts/:id', requireAuth, deleteContact);

// Encounters
app.post('/api/contacts/:id/encounters', requireAuth, addEncounter);
app.delete('/api/contacts/:id/encounters/:encounterId', requireAuth, deleteEncounter);

// Tags
app.get('/api/tags', requireAuth, listTags);
app.post('/api/tags', requireAuth, createTag);

// Connections
app.get('/api/connections', requireAuth, listConnections);
app.post('/api/connections', requireAuth, createConnection);
app.delete('/api/connections/:id', requireAuth, deleteConnection);

// In production, the client is built into client/dist and served by this
// same server — one process, one URL, no separate frontend host needed.
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Our Threads server running on :${PORT}`));
