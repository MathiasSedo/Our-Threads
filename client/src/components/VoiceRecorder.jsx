import { useState } from 'react';
import './VoiceRecorder.css';

// Mock mode: no real audio capture or API calls — lets you test the
// record → transcribe → extract flow by typing what you would have said.
function mockExtract(text) {
  return {
    how_we_met: text,
    suggested_tags: [],
  };
}

export default function VoiceRecorder({ onExtracted }) {
  const [state, setState] = useState('idle'); // idle | typing | processing | done
  const [draft, setDraft] = useState('');
  const [transcript, setTranscript] = useState('');

  function startRecording() {
    setDraft('');
    setState('typing');
  }

  function finishRecording() {
    if (!draft.trim()) { setState('idle'); return; }
    setState('processing');
    setTimeout(() => {
      const text = draft.trim();
      setTranscript(text);
      onExtracted(mockExtract(text), text);
      setState('done');
    }, 600);
  }

  return (
    <div className="voice-recorder">
      <p className="voice-mock-label">Voice recording (mock — no API keys needed yet)</p>

      {state === 'idle' && (
        <button type="button" className="record-btn" onClick={startRecording}>
          <span className="record-icon">●</span> Record
        </button>
      )}

      {state === 'typing' && (
        <div className="record-status" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.6rem' }}>
          <textarea
            className="voice-mock-textarea"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Type what you would say out loud — this stands in for the recording..."
            rows={3}
            autoFocus
          />
          <button type="button" className="record-btn recording" onClick={finishRecording}>
            <span className="waveform">
              {[...Array(5)].map((_, i) => <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />)}
            </span>
            Done speaking
          </button>
        </div>
      )}

      {state === 'processing' && (
        <div className="record-status">
          <span className="processing-dot" />
          Transcribing...
        </div>
      )}

      {state === 'done' && (
        <div className="record-done">
          <p className="transcript-label">Heard:</p>
          <p className="transcript-text">"{transcript}"</p>
          <button type="button" className="btn-ghost-small" onClick={() => { setState('idle'); setTranscript(''); setDraft(''); }}>
            Record again
          </button>
        </div>
      )}
    </div>
  );
}
