import { useState, useRef, useEffect, useCallback } from 'react';
import { feature } from 'topojson-client';
import worldData from 'world-atlas/countries-110m.json';
import { blendTagColor } from '../utils/tagColors.js';
import './WorldMap.css';

// Equirectangular projection: lng [-180,180] → x, lat [-90,90] → y
function project(lat, lng, w, h) {
  const x = ((lng + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return [x, y];
}

function unproject(x, y, w, h) {
  const lng = (x / w) * 360 - 180;
  const lat = 90 - (y / h) * 180;
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

// Convert a GeoJSON geometry ring to SVG path string
function ringToPath(coords, w, h) {
  return coords.map((pt, i) => {
    const [x, y] = project(pt[1], pt[0], w, h);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

function geomToPath(geom, w, h) {
  if (!geom) return '';
  const rings = geom.type === 'Polygon' ? geom.coordinates
    : geom.type === 'MultiPolygon' ? geom.coordinates.flat()
    : [];
  return rings.map(r => ringToPath(r, w, h)).join(' ');
}

const WORLD_W = 960;
const WORLD_H = 480;

// Pre-compute country paths once
const countries = feature(worldData, worldData.objects.countries).features;
const countryPaths = countries.map(f => geomToPath(f.geometry, WORLD_W, WORLD_H));

export default function WorldMap({ contacts = [], onSelectContact, onPlacePin, placingPin = false }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null); // { x, y, contacts[] }
  const [pinCursor, setPinCursor] = useState(null); // { x, y } in SVG coords

  // Group contacts by proximity for clustering
  const dotGroups = useCallback(() => {
    const groups = [];
    const used = new Set();
    for (let i = 0; i < contacts.length; i++) {
      if (used.has(i)) continue;
      const c = contacts[i];
      if (!c.lat || !c.lng) continue;
      const [cx, cy] = project(c.lat, c.lng, WORLD_W, WORLD_H);
      const group = [c];
      used.add(i);
      for (let j = i + 1; j < contacts.length; j++) {
        if (used.has(j)) continue;
        const d = contacts[j];
        if (!d.lat || !d.lng) continue;
        const [dx, dy] = project(d.lat, d.lng, WORLD_W, WORLD_H);
        if (Math.abs(dx - cx) < 6 && Math.abs(dy - cy) < 6) {
          group.push(d);
          used.add(j);
        }
      }
      groups.push({ cx, cy, contacts: group });
    }
    return groups;
  }, [contacts]);

  function svgCoords(e) {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = ((clientX - rect.left) / rect.width) * WORLD_W;
    const y = ((clientY - rect.top) / rect.height) * WORLD_H;
    return { x, y };
  }

  function handleMapClick(e) {
    if (!placingPin) return;
    const { x, y } = svgCoords(e);
    const coords = unproject(x, y, WORLD_W, WORLD_H);
    onPlacePin?.(coords);
  }

  function handleMouseMove(e) {
    if (!placingPin) return;
    const { x, y } = svgCoords(e);
    setPinCursor({ x, y });
  }

  function handleMouseLeave() {
    setPinCursor(null);
  }

  const groups = dotGroups();

  return (
    <div className={`world-map-wrap${placingPin ? ' placing-pin' : ''}`}>
      <svg
        ref={svgRef}
        className="world-map-svg"
        viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchEnd={e => { e.preventDefault(); handleMapClick(e.changedTouches ? { ...e, clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY } : e); }}
      >
        {/* Ocean background */}
        <rect width={WORLD_W} height={WORLD_H} className="map-ocean" />

        {/* Country fills */}
        {countryPaths.map((d, i) => (
          <path key={i} d={d} className="map-country" />
        ))}

        {/* Contact dots */}
        {groups.map(({ cx, cy, contacts: gc }, i) => {
          const blend = blendTagColor(gc.flatMap(c => c.tags || []));
          const isMulti = gc.length > 1;
          return (
            <g
              key={i}
              className="map-dot-group"
              onClick={e => { e.stopPropagation(); setTooltip(t => t && t.contacts === gc ? null : { x: cx, y: cy, contacts: gc }); }}
            >
              <circle
                cx={cx} cy={cy} r={isMulti ? 5 : 4}
                className="map-contact-dot"
                style={blend ? { fill: blend, stroke: blend } : {}}
              />
              {isMulti && (
                <text x={cx} y={cy - 6} className="map-dot-count">{gc.length}</text>
              )}
            </g>
          );
        })}

        {/* Pin cursor while placing */}
        {placingPin && pinCursor && (
          <g className="map-pin-cursor">
            <line x1={pinCursor.x} y1={pinCursor.y - 8} x2={pinCursor.x} y2={pinCursor.y + 8} />
            <line x1={pinCursor.x - 8} y1={pinCursor.y} x2={pinCursor.x + 8} y2={pinCursor.y} />
          </g>
        )}
      </svg>

      {/* Tooltip popup */}
      {tooltip && (
        <div
          className="map-tooltip"
          style={{
            left: `${(tooltip.x / WORLD_W) * 100}%`,
            top: `${(tooltip.y / WORLD_H) * 100}%`,
          }}
        >
          <button className="map-tooltip-close" onClick={() => setTooltip(null)}>×</button>
          {tooltip.contacts.map(c => (
            <div key={c.id} className="map-tooltip-contact" onClick={() => onSelectContact?.(c)}>
              <span className="map-tooltip-name">{c.name}</span>
              <span className="map-tooltip-loc">{c.city}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
