// Small colored pills for status / priority / type. Colors are driven by
// data-* attributes so all styling lives in CSS.

export function StatusBadge({ status }) {
  return (
    <span className="badge status-badge" data-status={status}>
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  return (
    <span className="badge priority-badge" data-priority={priority}>
      {priority}
    </span>
  );
}

export function TypeBadge({ type }) {
  return (
    <span className="badge type-badge" data-type={type}>
      {type}
    </span>
  );
}

export function NatureBadge({ nature }) {
  if (!nature) return null;
  // Short glyph + label so it reads at a glance: + positive, − negative.
  const mark = nature === 'Negative' ? '−' : '+';
  return (
    <span className="badge nature-badge" data-nature={nature}>
      {mark} {nature}
    </span>
  );
}
