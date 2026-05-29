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

// Positive / Negative test nature. In `compact` mode (used in the table) we
// show an icon only — ✓ for Positive, ✕ for Negative — to save column width;
// the full word is in the title tooltip. Elsewhere (detail panel) the label is
// shown alongside.
export function NatureBadge({ nature, compact = false }) {
  if (!nature) return null;
  const icon = nature === 'Negative' ? '✕' : '✓';
  return (
    <span
      className={`badge nature-badge${compact ? ' nature-badge-compact' : ''}`}
      data-nature={nature}
      title={nature}
      aria-label={nature}
    >
      {compact ? icon : `${icon} ${nature}`}
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
