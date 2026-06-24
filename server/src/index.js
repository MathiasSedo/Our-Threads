import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { register, login, requireAuth } from './auth.js';
import {
  listContacts, getContact, createContact, updateContact, updateContactLocation, deleteContact,
  addEncounter, deleteEncounter, listTags, createTag,
  listConnections, createConnection, deleteConnection
} from './contacts.js';
import { processVoice } from './voice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ dest: path.join(__dirname, '../../uploads/') });

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
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

// Voice
app.post('/api/voice', requireAuth, upload.single('audio'), processVoice);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Our Threads server running on :${PORT}`));
