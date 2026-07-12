import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import TagPill from './TagPill.jsx';
import ContactForm from './ContactForm.jsx';
import { useApi } from '../hooks/useApi.js';
import { TAG_COLORS, blendTagColor } from '../utils/tagColors.js';
import { compressImage } from '../utils/compressImage.js';
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

  // Restore edit form if returning from map pin flow
  const [restoredForm, setRestoredForm] = useState(null);
  const [pinnedCoords, setPinnedCoords] = useState(null);
  useEffect(() => {
    const key = `pinForm_${contact.id}`;
    const saved = sessionStorage.getItem(key);
    if (saved) {
      sessionStorage.removeItem(key);
      setRestoredForm(JSON.parse(saved));
      setOpen(true);
      setEditing(true);
    }
    const coordsKey = `pinCoords_${contact.id}`;
    const savedCoords = sessionStorage.getItem(coordsKey);
    if (savedCoords) {
      sessionStorage.removeItem(coordsKey);
      setPinnedCoords(JSON.parse(savedCoords));
    }
  }, [contact.id]);

  const [editing, setEditing] = useState(false);
  const [encounters] = useState(contact.encounters || []);
  const [deleting, setDeleting] = useState(false);
  const [connectingTo, setConnectingTo] = useState('');
  const [connectSearch, setConnectSearch] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) api.get(`/contacts/${contact.id}/files`).then(setFiles).catch(() => {});
  }, [open, contact.id]);

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
    setConnectSearch('');
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
                initial={restoredForm ? { ...contact, ...restoredForm } : contact}
                onSave={(u) => { setRestoredForm(null); setPinnedCoords(null); onUpdate(u); setEditing(false); }}
                onCancel={() => { setRestoredForm(null); setPinnedCoords(null); setEditing(false); }}
                manualCoords={pinnedCoords}
                allContacts={allContacts}
                onConnectionsCreated={(rows) => onConnectionChange([...connections, ...rows])}
              />
            ) : (
              <div className="card-body">
                <div className="card-main">
                  <h3 className="card-name">{contact.name}</h3>
                  <p className="card-location">
                    {contact.home_city
                      ? <>{contact.home_city}, {contact.home_country}</>
                      : <>{contact.city}, {contact.country}</>
                    }
                  </p>
                  {(contact.city || contact.date_met) && (
                    <p className="card-met-in">
                      {contact.home_city && contact.city ? `met in ${contact.city}, ${contact.country}` : ''}
                      {contact.date_met && (contact.home_city && contact.city ? ` — ${formatDate(contact.date_met)}` : formatDate(contact.date_met))}
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
                      <div className="connection-search-wrap">
                        <input
                          className="connection-search"
                          placeholder="Search by name..."
                          value={connectSearch}
                          onChange={e => { setConnectSearch(e.target.value); setConnectOpen(true); setConnectingTo(''); }}
                          onFocus={() => setConnectOpen(true)}
                          onBlur={() => setTimeout(() => setConnectOpen(false), 150)}
                        />
                        {connectOpen && (
                          <ul className="connection-dropdown">
                            {available
                              .filter(c => c.name.toLowerCase().includes(connectSearch.toLowerCase()))
                              .sort((a, b) => {
                                const aMatch = a.country === contact.country;
                                const bMatch = b.country === contact.country;
                                return bMatch - aMatch;
                              })
                              .map(c => (
                                <li
                                  key={c.id}
                                  className="connection-option"
                                  onMouseDown={() => { setConnectingTo(String(c.id)); setConnectSearch(c.name); setConnectOpen(false); }}
                                >
                                  <span className="connection-name">{c.name}</span>
                                  {c.city && <span className="connection-loc">{c.city}</span>}
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                      <button className="btn-ghost" onClick={addConnection} disabled={!connectingTo}>Tie thread</button>
                    </div>
                  )}
                </div>

                <div className="card-files">
                  {files.map(f => (
                    <div key={f.id} className="card-file-thumb" onClick={() => setLightbox(f)}>
                      {f.mime_type.startsWith('image/') ? (
                        <img src={`/api/contacts/${contact.id}/files/${f.id}`} alt={f.filename} />
                      ) : (
                        <span className="card-file-icon">📎 {f.filename}</span>
                      )}
                      <button className="card-file-del" onClick={e => {
                        e.stopPropagation();
                        api.del(`/contacts/${contact.id}/files/${f.id}`).then(() => setFiles(fs => fs.filter(x => x.id !== f.id)));
                      }}>×</button>
                    </div>
                  ))}
                  <button className="card-file-add" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? '…' : '+'}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    e.target.value = '';
                    setUploading(true);
                    try {
                      const { data, mime_type } = await compressImage(file);
                      const row = await api.post(`/contacts/${contact.id}/files`, { filename: file.name, mime_type, data });
                      setFiles(fs => [...fs, row]);
                    } finally { setUploading(false); }
                  }} />
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

      {lightbox && (
        <div className="card-lightbox" onClick={() => setLightbox(null)}>
          {lightbox.mime_type.startsWith('image/') ? (
            <img src={`/api/contacts/${contact.id}/files/${lightbox.id}`} alt={lightbox.filename} onClick={e => e.stopPropagation()} />
          ) : (
            <a href={`/api/contacts/${contact.id}/files/${lightbox.id}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
              {lightbox.filename}
            </a>
          )}
          <button className="lightbox-close" onClick={() => setLightbox(null)}>×</button>
        </div>
      )}
    </>
  );
}
