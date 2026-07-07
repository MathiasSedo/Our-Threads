import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../hooks/useAuth.jsx';

export default function JoinPage() {
  const { token } = useParams();
  const api = useApi();
  const { isAuthed } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('joining');
  const [tripTitle, setTripTitle] = useState('');

  useEffect(() => {
    if (!isAuthed) {
      sessionStorage.setItem('joinToken', token);
      navigate('/login', { replace: true });
      return;
    }
    api.post('/trips/join', { token })
      .then(res => {
        setTripTitle(res.trip_title);
        setStatus('success');
      })
      .catch(err => {
        setStatus(err.message || 'error');
      });
  }, [isAuthed]);

  if (!isAuthed) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: 'var(--font-mono)', padding: '2rem', textAlign: 'center', gap: '1rem' }}>
      {status === 'joining' && <p>Joining travel sync…</p>}
      {status === 'success' && (
        <>
          <p style={{ fontSize: '1.1rem' }}>Joined <strong>{tripTitle}</strong></p>
          <p style={{ color: 'var(--ink-faint)', fontSize: '0.85rem' }}>Your contacts are now visible on each other's maps for the duration of this trip.</p>
          <button onClick={() => navigate('/map')} style={{ marginTop: '1rem', border: '1px solid var(--ink)', background: 'none', padding: '8px 20px', fontFamily: 'var(--font-mono)', cursor: 'pointer', fontSize: '0.85rem' }}>
            Open the map →
          </button>
        </>
      )}
      {status !== 'joining' && status !== 'success' && (
        <>
          <p style={{ color: 'var(--ink-faint)' }}>Could not join: {status}</p>
          <button onClick={() => navigate('/map')} style={{ border: '1px solid var(--ink)', background: 'none', padding: '8px 20px', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>Back to map</button>
        </>
      )}
    </div>
  );
}
