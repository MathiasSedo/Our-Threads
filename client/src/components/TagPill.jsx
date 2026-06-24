import './TagPill.css';

export default function TagPill({ tag, onRemove, onClick, active }) {
  const isWedding = typeof tag === 'string'
    ? tag === 'Invite for wedding'
    : tag.name === 'Invite for wedding';

  const name = typeof tag === 'string' ? tag : tag.name;

  return (
    <span
      className={`tag-pill ${isWedding ? 'tag-wedding' : ''} ${active ? 'tag-active' : ''} ${onClick ? 'tag-clickable' : ''}`}
      onClick={onClick}
    >
      {name}
      {onRemove && (
        <button className="tag-remove" onClick={(e) => { e.stopPropagation(); onRemove(name); }} aria-label={`Remove ${name}`}>
          ×
        </button>
      )}
    </span>
  );
}
