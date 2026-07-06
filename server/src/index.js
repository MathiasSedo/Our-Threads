import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import { register, login, requireAuth } from './auth.js';
import {
  listContacts, getContact, createContact, updateContact, updateContactLocation, updateContactHomeLocation, deleteContact,
  addEncounter, deleteEncounter, listTags, createTag,
  listConnections, createConnection, deleteConnection
} from './contacts.js';
import { listTrips, createTrip, updateTrip, deleteTrip, addTripContact, removeTripContact, addWaypoint, removeWaypoint, updateOrder, updateWaypointLabel } from './trips.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Wraps an async route handler so a rejected promise is forwarded to
// Express's error handling instead of hanging the request or crashing
// the process as an unhandled rejection.
const ah = fn => (req, res, next) => fn(req, res, next).catch(next);

app.use(cors({ origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Auth
app.post('/api/auth/register', ah(register));
app.post('/api/auth/login', ah(login));

// Contacts
app.get('/api/contacts', requireAuth, ah(listContacts));
app.post('/api/contacts', requireAuth, ah(createContact));
app.get('/api/contacts/:id', requireAuth, ah(getContact));
app.put('/api/contacts/:id', requireAuth, ah(updateContact));
app.patch('/api/contacts/:id/location', requireAuth, ah(updateContactLocation));
app.patch('/api/contacts/:id/home-location', requireAuth, ah(updateContactHomeLocation));
app.delete('/api/contacts/:id', requireAuth, ah(deleteContact));

// Encounters
app.post('/api/contacts/:id/encounters', requireAuth, ah(addEncounter));
app.delete('/api/contacts/:id/encounters/:encounterId', requireAuth, ah(deleteEncounter));

// Tags
app.get('/api/tags', requireAuth, ah(listTags));
app.post('/api/tags', requireAuth, ah(createTag));

// Trips
app.get('/api/trips', requireAuth, ah(listTrips));
app.post('/api/trips', requireAuth, ah(createTrip));
app.put('/api/trips/:id', requireAuth, ah(updateTrip));
app.delete('/api/trips/:id', requireAuth, ah(deleteTrip));
app.post('/api/trips/:id/contacts', requireAuth, ah(addTripContact));
app.delete('/api/trips/:id/contacts/:contactId', requireAuth, ah(removeTripContact));
app.post('/api/trips/:id/waypoints', requireAuth, ah(addWaypoint));
app.patch('/api/trips/:id/waypoints/:waypointId', requireAuth, ah(updateWaypointLabel));
app.delete('/api/trips/:id/waypoints/:waypointId', requireAuth, ah(removeWaypoint));
app.put('/api/trips/:id/order', requireAuth, ah(updateOrder));

// Connections
app.get('/api/connections', requireAuth, ah(listConnections));
app.post('/api/connections', requireAuth, ah(createConnection));
app.delete('/api/connections/:id', requireAuth, ah(deleteConnection));

// In production, the client is built into client/dist and served by this
// same server — one process, one URL, no separate frontend host needed.
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 3001;
await initDb();
app.listen(PORT, () => console.log(`Our Threads server running on :${PORT}`));
