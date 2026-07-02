import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TagPill from './TagPill.jsx';
import ContactForm from './ContactForm.jsx';
import { useApi } from '../hooks/useApi.js';
import { TAG_COLORS, blendTagColor } from '../utils/tagColors.js';
import './ContactCard.css';

function formatDate(d) {
  if (!d) return null;
  const [y, m] = d.split('-');
  return new Date(y, m - 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
}

export default function ContactCard({ contact, allContacts = [], connections = [], onUpdate, onDelete, onConnectionChange, autoOpen = false, hideTile = false, onClose }) {
  const api = useApi();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);
  const [editing, setEditing] = useState(false);
  const [encounters] = useState(contact.encounters || []);
  const [deleting, setDeleting] = useState(false);
  const [connectingTo, setConnectingTo] = useState('');

  const myConnections = connections.filter(
    cn => cn.contact_id_1 === contact.id || cn.contact_id_2 === contact.id
  );
  const connectedIds = new Set(myConnections.map(cn =>
    cn.contact_id_1 === contact.id ? cn.contact_id_2 : cn.contact_id_1
  ));
  const available = allContacts.filter(c => c.id !== contact.id && !connectedIds.has(c.id));

  const allEncounters = contact.encounters?.length ? contact.encounters : encounters;
  const wordCount = (contact.how_we_met || '').trim().split(/\s+/).filter(Boolean).length
    + allEncounters.reduce((sum, e) => sum + (e.note || '').trim().split(/\s+/).filter(Boolean).length, 0);
  const richness = Math.min(1, wordCount / 40);
  const stampWidth = 22 + wordCount * 0.5;
  const stampOpacity = 0.18 + richness * 0.18;
  const stampColor = blendTagColor(contact.tags) || '#c8bfad';

  async function handleDelete() {
    if (!confirm(`Remove ${contact.name} from your threads?`)) return;
    setDeleting(true);
    try { await api.del(`/contacts/${contact.id}`); onDelete(contact.id); }
    catch { setDeleting(false); }
  }

  async function addConnection() {
    if (!connectingTo) return;
    const cn = await api.post('/connections', {
      contact_id_1: contact.id,
      contact_id_2: parseInt(connectingTo),
    });
    const target = allContacts.find(c => c.id === parseInt(connectingTo));
    onConnectionChange([...connections, { ...cn, name_1: contact.name, name_2: target?.name }]);
    setConnectingTo('');
  }

  async function removeConnection(cnId) {
    await api.del(`/connections/${cnId}`);
    onConnectionChange(connections.filter(cn => cn.id !== cnId));
  }

  return (
    <>
      {!hideTile && (
        <button className="page-tile" onClick={() => setOpen(true)}>
          <span
            className="page-stamp"
            aria-hidden="true"
            style={{ width: `${stampWidth}%`, opacity: stampOpacity, backgroundColor: stampColor }}
          />
          <div className="page-top">
            {contact.date_met && <span className="page-date">{formatDate(contact.date_met)}</span>}
          </div>
          <h3 className="page-name">{contact.name}</h3>
          <p className="page-location">
            {(contact.home_city || contact.city)?.toUpperCase()} · {(contact.home_country || contact.country)?.toUpperCase()}
          </p>
          <div className="page-divider" aria-hidden="true" />
          {contact.tags?.length > 0 && (
            <div className="page-tags">
              {contact.tags.slice(0, 3).map(t => {
                const isWedding = t.name === 'Invite for wedding';
                const color = TAG_COLORS[t.name];
                return (
                  <span
                    key={t.id}
                    className={`page-tag ${isWedding ? 'page-tag-wedding' : ''}`}
                    style={color ? { color } : undefined}
                  >
                    {t.name}
                  </span>
                );
              })}
            </div>
          )}
          {contact.how_we_met && <p className="page-story">{contact.how_we_met}</p>}
        </button>
      )}

      {open && (
        <div className="page-overlay" onClick={() => { setOpen(false); setEditing(false); onClose?.(); }}>
          <div className="page-detail" onClick={e => e.stopPropagation()}>
            <button className="page-close" onClick={() => { setOpen(false); setEditing(false); onClose?.(); }}>×</button>

            {editing ? (
              <ContactForm
                initial={contact}
                onSave={(u) => { onUpdate(u); setEditing(false); }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <div className="card-body">
                <div className="card-main">
                  <h3 className="card-name">{contact.name}</h3>
                  <p className="card-location">
                    {contact.home_city
                      ? <>{contact.home_city}, {contact.home_country}</>
                      : <>{contact.city}, {contact.country}
                          {contact.date_met && <span className="card-date"> — {formatDate(contact.date_met)}</span>}
                        </>
                    }
                  </p>
                  {(contact.home_city || contact.date_met) && (contact.city || contact.date_met) && (
                    <p className="card-met-in">
                      {contact.home_city && contact.city ? `met in ${contact.city}, ${contact.country}` : ''}
                      {contact.date_met && <span className="card-date"> — {formatDate(contact.date_met)}</span>}
                    </p>
                  )}
                </div>

                {contact.how_we_met && (
                  <div className="story-block">
                    <p className="story-label">The story</p>
                    <p className="story-text">{contact.how_we_met}</p>
                  </div>
                )}
                {contact.tags?.length > 0 && (
                  <div className="card-tags">{contact.tags.map(t => <TagPill key={t.id} tag={t} />)}</div>
                )}
                {contact.contact_info && <p className="card-contact-info">{contact.contact_info}</p>}

                <div className="connections-section">
                  <h4 className="section-title">Threads woven to this one</h4>
                  {myConnections.length > 0 ? (
                    <ul className="connections-list">
                      {myConnections.map(cn => {
                        const otherId = cn.contact_id_1 === contact.id ? cn.contact_id_2 : cn.contact_id_1;
                        const otherName = cn.contact_id_1 === contact.id ? cn.name_2 : cn.name_1;
                        const other = allContacts.find(c => c.id === otherId);
                        return (
                          <li key={cn.id} className="connection-item">
                            <span className="connection-stitch" aria-hidden="true" />
                            <span className="connection-name">{otherName || other?.name}</span>
                            {other && <span className="connection-loc">{other.city}</span>}
                            <button className="encounter-del" onClick={() => removeConnection(cn.id)}>×</button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="encounter-empty">No threads tying this person to another, yet.</p>}
                  {available.length > 0 && (
                    <div className="connection-add">
                      <select value={connectingTo} onChange={e => setConnectingTo(e.target.value)} className="connection-select">
                        <option value="">Tie a thread to...</option>
                        {available.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button className="btn-ghost" onClick={addConnection} disabled={!connectingTo}>Tie thread</button>
                    </div>
                  )}
                </div>

                <div className="card-actions">
                  <button className="btn-ghost" onClick={() => navigate(`/map?contact=${contact.id}`)}>View on map</button>
                  <button className="btn-ghost" onClick={() => setEditing(true)}>Edit</button>
                  <button className="btn-ghost btn-danger" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
