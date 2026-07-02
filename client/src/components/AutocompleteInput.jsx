import { useState, useRef, useEffect } from 'react';
import './AutocompleteInput.css';

export default function AutocompleteInput({ value, onChange, getSuggestions, placeholder, required, onPinHint }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [active, setActive] = useState(-1);
  const debounce = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    function close(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function handleChange(e) {
    const v = e.target.value;
    onChange(v);
    setActive(-1);
    clearTimeout(debounce.current);
    if (!v.trim()) { setSuggestions([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      const s = await getSuggestions(v);
      setSuggestions(s);
      setOpen(s.length > 0);
      setNoResults(s.length === 0);
    }, 220);
  }

  function pick(val) {
    onChange(val);
    setSuggestions([]);
    setOpen(false);
  }

  function handleKey(e) {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(suggestions[active]); }
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="autocomplete-wrap" ref={wrapRef}>
      <input
        value={value}
        onChange={handleChange}
        onKeyDown={handleKey}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {open && (
        <ul className="autocomplete-list">
          {suggestions.map((s, i) => (
            <li
              key={s}
              className={`autocomplete-item ${i === active ? 'active' : ''}`}
              onMouseDown={() => pick(s)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
      {noResults && value.trim().length >= 2 && onPinHint && (
        <p className="autocomplete-pin-hint">
          Can't find it? <button type="button" className="autocomplete-pin-btn" onMouseDown={onPinHint}>⊕ Pin on map</button>
        </p>
      )}
    </div>
  );
}
