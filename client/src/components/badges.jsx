// Small colored pills. Colors are driven by data-* attributes so all styling
// lives in CSS.

// Execution method (Manual / Automated). UI label is "Execution".
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

// Test level / suite (Sanity / Smoke / Regression). UI label is "Type".
export function LevelBadge({ level }) {
  if (!level) return null;
  return (
    <span className="badge level-badge" data-level={level}>
      {level}
    </span>
  );
}
