import { useEffect, useRef, useState, useCallback } from 'react';
import { blendTagColor } from '../utils/tagColors.js';
import './ThreadsWeb.css';

const NODE_R = 30;
const CANVAS_W = 1600;
const CANVAS_H = 1000;
const POSITIONS_KEY = 'ot_web_positions';
const BENDS_KEY = 'ot_web_bends';

function loadPositions() {
  try { return JSON.parse(localStorage.getItem(POSITIONS_KEY)) || {}; } catch { return {}; }
}

function savePositions(positions) {
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
}

function loadBends() {
  try { return JSON.parse(localStorage.getItem(BENDS_KEY)) || {}; } catch { return {}; }
}

function saveBends(bends) {
  localStorage.setItem(BENDS_KEY, JSON.stringify(bends));
}

function runForceLayout(nodes, connections, w, h, iterations = 220) {
  const pos = nodes.map(n => ({ ...n }));
  const idIndex = Object.fromEntries(pos.map((n, i) => [n.id, i]));
  const vel = pos.map(() => ({ vx: 0, vy: 0 }));
  const repulsion = 9000;
  const spring = 0.012;
  const centerPull = 0.0025;
  const damping = 0.82;
  const cx = w / 2, cy = h / 2;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
        const distSq = Math.max(dx * dx + dy * dy, 25);
        const dist = Math.sqrt(distSq);
        const force = repulsion / distSq;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        vel[i].vx += fx; vel[i].vy += fy;
        vel[j].vx -= fx; vel[j].vy -= fy;
      }
    }
    connections.forEach(cn => {
      const i = idIndex[cn.contact_id_1], j = idIndex[cn.contact_id_2];
      if (i == null || j == null) return;
      const dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y;
      vel[i].vx += dx * spring; vel[i].vy += dy * spring;
      vel[j].vx -= dx * spring; vel[j].vy -= dy * spring;
    });
    pos.forEach((p, i) => {
      vel[i].vx += (cx - p.x) * centerPull;
      vel[i].vy += (cy - p.y) * centerPull;
    });
    pos.forEach((p, i) => {
      vel[i].vx *= damping; vel[i].vy *= damping;
      p.x += vel[i].vx * 0.025;
      p.y += vel[i].vy * 0.025;
      p.x = Math.max(NODE_R + 12, Math.min(w - NODE_R - 12, p.x));
      p.y = Math.max(NODE_R + 12, Math.min(h - NODE_R - 12, p.y));
    });
  }
  return pos;
}

export default function ThreadsWeb({ contacts, connections, onOpenContact }) {
  const svgRef = useRef(null);
  const posRef = useRef(loadPositions()); // id -> {x,y} in canvas space, persisted across reloads
  const loadedPositionsRef = useRef(null); // snapshot of positions as they were when this page was loaded
  const [nodes, setNodes] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [viewSize, setViewSize] = useState({ w: 800, h: 520 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 }); // pan/zoom transform
  const [bends, setBends] = useState(loadBends()); // connection id -> control-point offset (canvas units)
  const bendsRef = useRef(bends);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const lineDragRef = useRef(null);

  useEffect(() => {
    function measure() {
      if (svgRef.current) {
        const { width, height } = svgRef.current.getBoundingClientRect();
        setViewSize({ w: width || 800, h: height || 520 });
      }
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Initial centering: scale canvas to fit view, centered, with a closer starting zoom
  useEffect(() => {
    const k = Math.min(viewSize.w / CANVAS_W, viewSize.h / CANVAS_H) * 1.6;
    setView({
      k,
      x: (viewSize.w - CANVAS_W * k) / 2,
      y: (viewSize.h - CANVAS_H * k) / 2,
    });
  }, [viewSize.w, viewSize.h]);

  useEffect(() => {
    if (!contacts.length) { setNodes([]); return; }
    const cols = Math.ceil(Math.sqrt(contacts.length * 1.5));
    const cellW = CANVAS_W / (cols + 1);
    const rows = Math.ceil(contacts.length / cols);
    const cellH = CANVAS_H / (rows + 1);

    const laid = contacts.map((c, i) => {
      if (posRef.current[c.id]) return { ...c, ...posRef.current[c.id] };
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jx = Math.sin(i * 13.7) * 0.28 * cellW;
      const jy = Math.cos(i * 7.3) * 0.28 * cellH;
      const pos = { x: cellW * (col + 1) + jx, y: cellH * (row + 1) + jy };
      posRef.current[c.id] = pos;
      return { ...c, ...pos };
    });
    if (loadedPositionsRef.current === null) {
      loadedPositionsRef.current = Object.fromEntries(laid.map(n => [n.id, { x: n.x, y: n.y }]));
    }
    setNodes(laid);
  }, [contacts]);

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const activeId = hovered;

  const connectedToActive = activeId != null
    ? new Set(
        connections
          .filter(cn => cn.contact_id_1 === activeId || cn.contact_id_2 === activeId)
          .flatMap(cn => [cn.contact_id_1, cn.contact_id_2])
      )
    : null;

  function isLineDimmed(cn) {
    return activeId != null && cn.contact_id_1 !== activeId && cn.contact_id_2 !== activeId;
  }
  function isLineActive(cn) {
    return activeId != null && (cn.contact_id_1 === activeId || cn.contact_id_2 === activeId);
  }
  function isNodeDimmed(id) {
    return activeId != null && !connectedToActive.has(id);
  }
  function isNodeHighlighted(id) {
    return activeId != null && connectedToActive.has(id);
  }

  const activeNode = activeId != null ? nodeMap[activeId] : null;
  const activeConnNames = activeId != null
    ? connections
        .filter(cn => cn.contact_id_1 === activeId || cn.contact_id_2 === activeId)
        .map(cn => nodeMap[cn.contact_id_1 === activeId ? cn.contact_id_2 : cn.contact_id_1]?.name)
        .filter(Boolean)
    : [];

  // client point -> local view pixel point
  function toLocalPoint(e) {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (viewSize.w / rect.width),
      y: (e.clientY - rect.top) * (viewSize.h / rect.height),
    };
  }

  // local view point -> canvas/world point (inverse of pan/zoom transform)
  function toWorldPoint(local) {
    return { x: (local.x - view.x) / view.k, y: (local.y - view.y) / view.k };
  }

  function handleNodeMouseDown(e, node) {
    e.stopPropagation();
    const local = toLocalPoint(e);
    const world = toWorldPoint(local);
    dragRef.current = {
      id: node.id, dx: world.x - node.x, dy: world.y - node.y,
      startX: local.x, startY: local.y, moved: false,
    };
    setHovered(node.id);
  }

  function handleBackgroundMouseDown(e) {
    const local = toLocalPoint(e);
    panRef.current = { startX: local.x, startY: local.y, startViewX: view.x, startViewY: view.y };
  }

  const handleMouseMove = useCallback((e) => {
    if (dragRef.current) {
      const local = toLocalPoint(e);
      const { id, dx, dy, startX, startY } = dragRef.current;
      if (Math.hypot(local.x - startX, local.y - startY) > 4) {
        dragRef.current.moved = true;
      }
      const world = toWorldPoint(local);
      const next = { x: world.x - dx, y: world.y - dy };
      posRef.current[id] = next;
      setNodes(prev => prev.map(n => n.id === id ? { ...n, ...next } : n));
      return;
    }
    if (lineDragRef.current) {
      const { id, a, b } = lineDragRef.current;
      const world = toWorldPoint(toLocalPoint(e));
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = -dy / dist, ny = dx / dist;
      const perp = (world.x - a.x) * nx + (world.y - a.y) * ny;
      const maxBend = dist * 0.6;
      const clamped = Math.max(-maxBend, Math.min(maxBend, perp));
      const next = { ...bendsRef.current, [id]: clamped };
      bendsRef.current = next;
      setBends(next);
      return;
    }
    if (panRef.current) {
      const local = toLocalPoint(e);
      const { startX, startY, startViewX, startViewY } = panRef.current;
      setView(v => ({ ...v, x: startViewX + (local.x - startX), y: startViewY + (local.y - startY) }));
    }
  }, [view, viewSize]);

  function handleMouseUp() {
    if (dragRef.current) {
      const { id, moved } = dragRef.current;
      dragRef.current = null;
      setHovered(null);
      if (moved) {
        savePositions(posRef.current);
      } else {
        onOpenContact?.(id);
      }
    }
    if (lineDragRef.current) {
      lineDragRef.current = null;
      saveBends(bendsRef.current);
    }
    panRef.current = null;
  }

  function handleLineMouseDown(e, cn, a, b) {
    e.stopPropagation();
    lineDragRef.current = { id: cn.id, a, b };
  }

  function handleWheel(e) {
    e.preventDefault();
    const local = toLocalPoint(e);
    const worldBefore = toWorldPoint(local);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newK = Math.max(0.25, Math.min(3, view.k * factor));
    setView({
      k: newK,
      x: local.x - worldBefore.x * newK,
      y: local.y - worldBefore.y * newK,
    });
  }

  function zoomBy(factor) {
    const cx = viewSize.w / 2, cy = viewSize.h / 2;
    const worldBefore = toWorldPoint({ x: cx, y: cy });
    const newK = Math.max(0.25, Math.min(3, view.k * factor));
    setView({ k: newK, x: cx - worldBefore.x * newK, y: cy - worldBefore.y * newK });
  }

  function resetView() {
    // "Reset" means back to how the web looked when this page was loaded —
    // not the original auto-generated layout.
    if (loadedPositionsRef.current) {
      posRef.current = { ...loadedPositionsRef.current };
      savePositions(posRef.current);
      setNodes(prev => prev.map(n => loadedPositionsRef.current[n.id] ? { ...n, ...loadedPositionsRef.current[n.id] } : n));
    }
    const k = Math.min(viewSize.w / CANVAS_W, viewSize.h / CANVAS_H);
    setView({ k, x: (viewSize.w - CANVAS_W * k) / 2, y: (viewSize.h - CANVAS_H * k) / 2 });
  }

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove]);

  function handleCluster() {
    const result = runForceLayout(nodes, connections, CANVAS_W, CANVAS_H);
    result.forEach(n => { posRef.current[n.id] = { x: n.x, y: n.y }; });
    savePositions(posRef.current);
    setNodes(result);
  }

  return (
    <div className="threads-web">
      {contacts.length === 0 && (
        <div className="web-empty">Add contacts to see the web of threads.</div>
      )}
      {contacts.length > 0 && (
        <div className="web-toolbar">
          <button className="web-tool-btn" onClick={handleCluster}>Cluster</button>
          <div className="web-zoom-group">
            <button className="web-tool-btn" onClick={() => zoomBy(1 / 1.3)}>−</button>
            <button className="web-tool-btn" onClick={resetView}>Reset</button>
            <button className="web-tool-btn" onClick={() => zoomBy(1.3)}>+</button>
          </div>
        </div>
      )}
      <svg
        ref={svgRef}
        className="web-svg"
        viewBox={`0 0 ${viewSize.w} ${viewSize.h}`}
        onMouseLeave={() => { if (!dragRef.current) setHovered(null); panRef.current = null; }}
        onMouseDown={handleBackgroundMouseDown}
        onWheel={handleWheel}
      >
        <defs>
          <pattern id="webWeaveA" width="70" height="70" patternUnits="userSpaceOnUse">
            <path
              d="M0 0 Q52 18 70 70 M70 0 Q52 52 0 70"
              className="web-weave-line"
            />
          </pattern>
          <pattern
            id="webWeaveB" width="113" height="113" patternUnits="userSpaceOnUse"
            patternTransform="rotate(31)"
          >
            <path
              d="M0 0 Q70 95 113 113 M113 0 Q43 18 0 113"
              className="web-weave-line"
            />
          </pattern>
        </defs>
        <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
          <rect
            x={-CANVAS_W} y={-CANVAS_H} width={CANVAS_W * 3} height={CANVAS_H * 3}
            fill="url(#webWeaveA)" className="web-weave-bg"
          />
          <rect
            x={-CANVAS_W} y={-CANVAS_H} width={CANVAS_W * 3} height={CANVAS_H * 3}
            fill="url(#webWeaveB)" className="web-weave-bg"
          />
          {connections.map(cn => {
            const a = nodeMap[cn.contact_id_1];
            const b = nodeMap[cn.contact_id_2];
            if (!a || !b) return null;
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 1;
            const ux = dx / dist, uy = dy / dist;
            const bend = bends[cn.id] ?? (dist * 0.12 * (cn.id % 2 === 0 ? 1 : -1));
            const midX = (a.x + b.x) / 2 + (-uy) * bend;
            const midY = (a.y + b.y) / 2 + ux * bend;
            const d = `M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`;
            return (
              <g key={cn.id}>
                <path
                  d={d}
                  fill="none"
                  className={`web-line ${isLineActive(cn) ? 'web-line-active' : ''} ${isLineDimmed(cn) ? 'web-line-dim' : ''}`}
                />
                <path
                  d={d}
                  className="web-line-hit"
                  onMouseDown={(e) => handleLineMouseDown(e, cn, a, b)}
                />
              </g>
            );
          })}

          {nodes.map(node => {
            const dimmed = isNodeDimmed(node.id);
            const highlighted = isNodeHighlighted(node.id);
            const isMe = node.id === activeId;
            const tagFill = blendTagColor(node.tags);
            const wordCount = (node.how_we_met || '').trim().split(/\s+/).filter(Boolean).length
              + (node.encounters || []).reduce((sum, e) => sum + (e.note || '').trim().split(/\s+/).filter(Boolean).length, 0);
            const richness = Math.min(1, wordCount / 40);
            const fillOpacity = tagFill ? 0.18 + richness * 0.18 : 1;
            return (
              <g
                key={node.id}
                className="web-node"
                style={{
                  opacity: dimmed ? 0.15 : 1,
                  transition: dragRef.current?.id === node.id ? 'none' : 'opacity 0.25s',
                  ...(tagFill ? { '--tag-fill': tagFill } : {}),
                }}
                onMouseEnter={() => !dragRef.current && setHovered(node.id)}
                onMouseLeave={() => !dragRef.current && setHovered(null)}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
              >
                <circle cx={node.x} cy={node.y} r={NODE_R} className="web-circle-mask" />
                <circle
                  cx={node.x} cy={node.y} r={NODE_R}
                  fillOpacity={isMe || highlighted ? 1 : fillOpacity}
                  className={`web-circle ${isMe ? 'web-circle-me' : ''} ${highlighted && !isMe ? 'web-circle-highlight' : ''}`}
                />
                <text x={node.x} y={node.y - 4} className="web-name" textAnchor="middle" dominantBaseline="middle">
                  {node.name.split(' ')[0]}
                </text>
                <text x={node.x} y={node.y + 13} className="web-city" textAnchor="middle">
                  {node.city}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {activeNode && (
        <div className="web-info">
          <span className="web-info-name">{activeNode.name}</span>
          <span className="web-info-loc">{activeNode.city}, {activeNode.country}</span>
          {activeConnNames.length > 0
            ? <span className="web-info-conn">— {activeConnNames.join(', ')}</span>
            : <span className="web-info-conn" style={{ opacity: 0.4 }}>no connections yet</span>
          }
        </div>
      )}
    </div>
  );
}
