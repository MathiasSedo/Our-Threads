import { useState, useRef, useCallback, useEffect } from 'react';
import { feature } from 'topojson-client';
import worldData from 'world-atlas/countries-110m.json';
import { blendTagColor } from '../utils/tagColors.js';
import './WorldMap.css';

const WORLD_W = 960;
const WORLD_H = 480;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;

function project(lat, lng) {
  return [((lng + 180) / 360) * WORLD_W, ((90 - lat) / 180) * WORLD_H];
}

function unproject(x, y) {
  return {
    lat: Math.round((90 - (y / WORLD_H) * 180) * 100) / 100,
    lng: Math.round(((x / WORLD_W) * 360 - 180) * 100) / 100,
  };
}

function ringToPath(coords) {
  return coords.map((pt, i) => {
    const [x, y] = project(pt[1], pt[0]);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

function geomToPath(geom) {
  if (!geom) return '';
  const rings = geom.type === 'Polygon' ? geom.coordinates
    : geom.type === 'MultiPolygon' ? geom.coordinates.flat() : [];
  return rings.map(ringToPath).join(' ');
}

// Pre-compute once at module load
const countries = feature(worldData, worldData.objects.countries).features;
const countryPaths = countries.map(f => geomToPath(f.geometry));

export default function WorldMap({ contacts = [], onSelectContact, onPlacePin, placingPin = false }) {
  const wrapRef = useRef(null);
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 });
  const [tooltip, setTooltip] = useState(null);
  const [pinCursor, setPinCursor] = useState(null);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);

  // Clamp translation so map never drifts fully off screen
  function clamp(tx, ty, scale) {
    const w = (wrapRef.current?.clientWidth || WORLD_W);
    const h = (wrapRef.current?.clientHeight || WORLD_H);
    const mapW = WORLD_W * scale * (w / WORLD_W);
    const mapH = WORLD_H * scale * (w / WORLD_W);
    const maxTx = 0;
    const minTx = Math.min(0, w - mapW);
    const maxTy = 0;
    const minTy = Math.min(0, h - mapH);
    return {
      tx: Math.max(minTx, Math.min(maxTx, tx)),
      ty: Math.max(minTy, Math.min(maxTy, ty)),
      scale,
    };
  }

  // Convert client coords → SVG viewBox coords (accounting for current zoom/pan)
  function clientToSvg(clientX, clientY) {
    const wrap = wrapRef.current;
    if (!wrap) return { x: 0, y: 0 };
    const rect = wrap.getBoundingClientRect();
    const { tx, ty, scale } = view;
    const displayW = rect.width;
    const svgScale = displayW / WORLD_W; // SVG viewBox → display pixels
    const totalScale = svgScale * scale;
    const x = (clientX - rect.left - tx) / totalScale;
    const y = (clientY - rect.top - ty) / totalScale;
    return { x, y };
  }

  // Zoom around a point (in client coords)
  function zoomAt(clientX, clientY, factor) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.scale * factor));
    // Keep the point under cursor fixed
    const ox = clientX - rect.left;
    const oy = clientY - rect.top;
    const newTx = ox - (ox - view.tx) * (newScale / view.scale);
    const newTy = oy - (oy - view.ty) * (newScale / view.scale);
    setView(clamp(newTx, newTy, newScale));
    setTooltip(null);
  }

  // Mouse wheel zoom
  function handleWheel(e) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [view]);

  // Mouse drag
  function handleMouseDown(e) {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX - view.tx, startY: e.clientY - view.ty, moved: false };
  }

  function handleMouseMove(e) {
    if (placingPin) {
      const { x, y } = clientToSvg(e.clientX, e.clientY);
      setPinCursor({ x, y });
    }
    if (!dragRef.current) return;
    const tx = e.clientX - dragRef.current.startX;
    const ty = e.clientY - dragRef.current.startY;
    if (Math.abs(tx - view.tx) > 2 || Math.abs(ty - view.ty) > 2) {
      dragRef.current.moved = true;
    }
    setView(v => clamp(tx, ty, v.scale));
    setTooltip(null);
  }

  function handleMouseUp(e) {
    if (!dragRef.current) return;
    const moved = dragRef.current.moved;
    dragRef.current = null;
    if (!moved && placingPin) {
      const { x, y } = clientToSvg(e.clientX, e.clientY);
      onPlacePin?.(unproject(x, y));
    }
  }

  // Touch: single finger drag, two-finger pinch zoom
  function handleTouchStart(e) {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      dragRef.current = { startX: t.clientX - view.tx, startY: t.clientY - view.ty, moved: false };
    } else if (e.touches.length === 2) {
      dragRef.current = null;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = {
        dist: Math.hypot(dx, dy),
        midX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        midY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        scale: view.scale,
        tx: view.tx,
        ty: view.ty,
      };
    }
  }

  function handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / pinchRef.current.dist;
      const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchRef.current.scale * factor));
      const wrap = wrapRef.current;
      const rect = wrap.getBoundingClientRect();
      const ox = pinchRef.current.midX - rect.left;
      const oy = pinchRef.current.midY - rect.top;
      const newTx = ox - (ox - pinchRef.current.tx) * (newScale / pinchRef.current.scale);
      const newTy = oy - (oy - pinchRef.current.ty) * (newScale / pinchRef.current.scale);
      setView(clamp(newTx, newTy, newScale));
      setTooltip(null);
    } else if (e.touches.length === 1 && dragRef.current) {
      const t = e.touches[0];
      const tx = t.clientX - dragRef.current.startX;
      const ty = t.clientY - dragRef.current.startY;
      if (Math.abs(tx - view.tx) > 3 || Math.abs(ty - view.ty) > 3) {
        dragRef.current.moved = true;
      }
      setView(v => clamp(tx, ty, v.scale));
      setTooltip(null);
    }
  }

  function handleTouchEnd(e) {
    pinchRef.current = null;
    if (dragRef.current && !dragRef.current.moved && placingPin && e.changedTouches.length) {
      const t = e.changedTouches[0];
      const { x, y } = clientToSvg(t.clientX, t.clientY);
      onPlacePin?.(unproject(x, y));
    }
    if (e.touches.length === 0) dragRef.current = null;
  }

  // Cluster contacts that are very close at current zoom level
  const groups = useCallback(() => {
    const threshold = 8 / view.scale;
    const result = [];
    const used = new Set();
    for (let i = 0; i < contacts.length; i++) {
      if (used.has(i)) continue;
      const c = contacts[i];
      if (!c.lat || !c.lng) continue;
      const [cx, cy] = project(c.lat, c.lng);
      const group = [c];
      used.add(i);
      for (let j = i + 1; j < contacts.length; j++) {
        if (used.has(j)) continue;
        const d = contacts[j];
        if (!d.lat || !d.lng) continue;
        const [dx, dy] = project(d.lat, d.lng);
        if (Math.abs(dx - cx) < threshold && Math.abs(dy - cy) < threshold) {
          group.push(d);
          used.add(j);
        }
      }
      result.push({ cx, cy, contacts: group });
    }
    return result;
  }, [contacts, view.scale])();

  // Dot size stays visually consistent regardless of zoom
  const dotR = 4 / view.scale;
  const strokeW = 1.2 / view.scale;

  const { tx, ty, scale } = view;

  return (
    <div
      ref={wrapRef}
      className={`world-map-wrap${placingPin ? ' placing-pin' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { dragRef.current = null; setPinCursor(null); }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'none' }}
    >
      <svg
        className="world-map-svg"
        viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: '0 0' }}
      >
        <rect width={WORLD_W} height={WORLD_H} className="map-ocean" />
        {countryPaths.map((d, i) => <path key={i} d={d} className="map-country" />)}

        {groups.map(({ cx, cy, contacts: gc }, i) => {
          const blend = blendTagColor(gc.flatMap(c => c.tags || []));
          const isMulti = gc.length > 1;
          return (
            <g
              key={i}
              className="map-dot-group"
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                if (!placingPin) setTooltip(t => t?.key === i ? null : { key: i, x: cx, y: cy, contacts: gc });
              }}
            >
              <circle
                cx={cx} cy={cy}
                r={isMulti ? dotR * 1.35 : dotR}
                className="map-contact-dot"
                strokeWidth={strokeW}
                style={blend ? { fill: blend, stroke: blend } : {}}
              />
              {isMulti && (
                <text x={cx} y={cy} className="map-dot-count" fontSize={dotR * 1.4} dy="0.35em">{gc.length}</text>
              )}
            </g>
          );
        })}

        {placingPin && pinCursor && (
          <g className="map-pin-cursor">
            <line x1={pinCursor.x} y1={pinCursor.y - 10 / scale} x2={pinCursor.x} y2={pinCursor.y + 10 / scale} strokeWidth={1.5 / scale} />
            <line x1={pinCursor.x - 10 / scale} y1={pinCursor.y} x2={pinCursor.x + 10 / scale} y2={pinCursor.y} strokeWidth={1.5 / scale} />
          </g>
        )}
      </svg>

      {/* Zoom controls */}
      <div className="map-zoom-btns">
        <button onClick={() => zoomAt(
          (wrapRef.current?.clientWidth || 0) / 2,
          (wrapRef.current?.clientHeight || 0) / 2, 1.5
        )}>+</button>
        <button onClick={() => zoomAt(
          (wrapRef.current?.clientWidth || 0) / 2,
          (wrapRef.current?.clientHeight || 0) / 2, 1 / 1.5
        )}>−</button>
        <button onClick={() => setView({ tx: 0, ty: 0, scale: 1 })} title="Reset view">⊙</button>
      </div>

      {tooltip && (() => {
        const wrap = wrapRef.current;
        const rect = wrap?.getBoundingClientRect();
        const displayW = rect?.width || WORLD_W;
        const svgScale = displayW / WORLD_W;
        const totalScale = svgScale * scale;
        const leftPx = tooltip.x * totalScale + tx;
        const topPx = tooltip.y * totalScale + ty;
        return (
          <div
            className="map-tooltip"
            style={{ left: leftPx, top: topPx }}
            onMouseDown={e => e.stopPropagation()}
          >
            <button className="map-tooltip-close" onClick={() => setTooltip(null)}>×</button>
            {tooltip.contacts.map(c => (
              <div key={c.id} className="map-tooltip-contact" onClick={() => onSelectContact?.(c)}>
                <span className="map-tooltip-name">{c.name}</span>
                <span className="map-tooltip-loc">{c.city}</span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
