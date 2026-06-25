import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import ContactCard from '../components/ContactCard.jsx';
import ContactForm from '../components/ContactForm.jsx';
import TagPill from '../components/TagPill.jsx';
import ThreadsWeb from '../components/ThreadsWeb.jsx';
import './ThreadsPage.css';

export default function ThreadsPage() {
  const api = useApi();
  const location = useLocation();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('All');
  const [adding, setAdding] = useState(false);
  const [allTags, setAllTags] = useState(['All']);
  const [view, setView] = useState('list'); // 'list' | 'web'
  const [openContactId, setOpenContactId] = useState(location.state?.openContactId ?? null);

  useEffect(() => {
    if (location.state?.openContactId) {
      setOpenContactId(location.state.openContactId);
      setView('list');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  const CORE_ORDER = ['Visit', 'Work', 'Family', 'Invite for wedding'];

  useEffect(() => {
    Promise.all([api.get('/contacts'), api.get('/tags'), api.get('/connections')]).then(([c, t, cn]) => {
      setContacts(c || []);
      const names = t.map(tag => tag.name);
      const ordered = [
        ...CORE_ORDER.filter(n => names.includes(n)),
        ...names.filter(n => !CORE_ORDER.includes(n)).sort(),
      ];
      setAllTags(['All', ...ordered]);
      setConnections(cn || []);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    let list = contacts;
    if (activeTag !== 'All') {
      list = list.filter(c => c.tags?.some(t => t.name === activeTag));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q) ||
        c.how_we_met?.toLowerCase().includes(q) ||
        c.what_they_mean?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [contacts, activeTag, search]);

  function handleSave(contact) {
    setContacts(prev => {
      const idx = prev.findIndex(c => c.id === contact.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = contact; return next; }
      return [contact, ...prev];
    });
    setAdding(false);
  }

  function handleDelete(id) {
    setContacts(prev => prev.filter(c => c.id !== id));
    setConnections(prev => prev.filter(cn => cn.contact_id_1 !== id && cn.contact_id_2 !== id));
  }

  function handleConnectionChange(newConnections) {
    setConnections(newConnections);
  }

  if (loading) return <div className="loading">Loading your threads...</div>;

  return (
    <div className="threads-page">
      <div className="threads-header">
        <div className="view-toggle">
          <button className={`toggle-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
            <svg className="toggle-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="2" y="1.5" width="12" height="13" rx="1" />
              <line x1="4.5" y1="5" x2="11.5" y2="5" />
              <line x1="4.5" y1="8" x2="11.5" y2="8" />
              <line x1="4.5" y1="11" x2="9" y2="11" />
            </svg>
            Pages
          </button>
          <button className={`toggle-btn ${view === 'web' ? 'active' : ''}`} onClick={() => setView('web')}>
            <svg className="toggle-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="3.5" cy="4" r="1.6" />
              <circle cx="12.5" cy="4" r="1.6" />
              <circle cx="8" cy="12.5" r="1.6" />
              <line x1="4.7" y1="4.8" x2="7" y2="11" />
              <line x1="11.3" y1="4.8" x2="9" y2="11" />
              <line x1="5.1" y1="4" x2="10.9" y2="4" />
            </svg>
            Web
          </button>
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}>+ Add</button>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name, city, or story..."
        className="search-input"
      />

      <div className="tag-filter">
        {allTags.map(tag => (
          <TagPill key={tag} tag={tag} active={activeTag === tag} onClick={() => setActiveTag(tag)} />
        ))}
      </div>

      {adding && (
        <div className="add-panel">
          <h2 className="add-title">Add a new thread</h2>
          <ContactForm onSave={handleSave} onCancel={() => setAdding(false)} />
        </div>
      )}

      {view === 'web' ? (
        <>
          <ThreadsWeb
            contacts={filtered}
            connections={connections}
            onConnectionChange={handleConnectionChange}
            onOpenContact={(id) => setOpenContactId(id)}
          />
          {openContactId != null && contacts.find(c => c.id === openContactId) && (
            <ContactCard
              key={openContactId}
              contact={contacts.find(c => c.id === openContactId)}
              allContacts={contacts}
              connections={connections}
              onUpdate={handleSave}
              onDelete={handleDelete}
              onConnectionChange={handleConnectionChange}
              autoOpen
              hideTile
              onClose={() => setOpenContactId(null)}
            />
          )}
        </>
      ) : (
        <>
          <div className="contacts-count">
            {filtered.length} {filtered.length === 1 ? 'thread' : 'threads'}
            {activeTag !== 'All' && ` · ${activeTag}`}
            {search && ` · "${search}"`}
          </div>
          <div className="contacts-list">
            {filtered.length === 0 && !adding && (
              <div className="empty-state">
                <p>No threads yet.</p>
                <p>Every connection begins somewhere.</p>
              </div>
            )}
            {filtered.map(contact => (
              <ContactCard
                key={contact.id}
                contact={contact}
                allContacts={contacts}
                connections={connections}
                onUpdate={handleSave}
                onDelete={handleDelete}
                onConnectionChange={handleConnectionChange}
                autoOpen={contact.id === openContactId}
                onClose={() => setOpenContactId(null)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
