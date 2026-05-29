import { useMemo } from 'react';
import { TypeBadge, NatureBadge, LevelBadge, LayerBadge } from './badges.jsx';

// Test levels nest: Sanity ⊆ Smoke ⊆ Regression. Rank by breadth so that
// filtering inclusively (a case matches if its level is at or below the
// selected one) is a simple comparison.
const LEVEL_RANK = { Sanity: 0, Smoke: 1, Regression: 2 };

// Apply client-side filtering.
function applyFilters(testCases, filters) {
  const q = filters.search.trim().toLowerCase();
  const selectedLevelRank =
    filters.testLevel !== '' ? LEVEL_RANK[filters.testLevel] : null;
  return testCases.filter((t) => {
    if (filters.area && t.area !== filters.area) return false;
    if (filters.category && t.category !== filters.category) return false;
    if (filters.layer && t.layer !== filters.layer) return false;
    if (filters.type && t.type !== filters.type) return false;
    if (filters.testNature && t.testNature !== filters.testNature) return false;
    // Inclusive test-level filter: a case shows if its level is at or below the
    // selected one (Regression -> all, Smoke -> Smoke+Sanity, Sanity -> Sanity).
    if (selectedLevelRank !== null) {
      const caseRank = LEVEL_RANK[t.testLevel] ?? LEVEL_RANK.Regression;
      if (caseRank > selectedLevelRank) return false;
    }
    if (filters.sprint && t.sprint !== filters.sprint) return false;
    if (filters.newFunctionality === 'yes' && !t.isNewFunctionality) return false;
    if (filters.newFunctionality === 'no' && t.isNewFunctionality) return false;
    if (q) {
      const haystack = [t.tcId, t.title, t.area, t.category, t.sprint]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// Apply sorting. Pinned cases always float to the top regardless of sort.
function applySort(rows, sort) {
  if (!sort.key) {
    return [...rows].sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        new Date(b.updatedAt) - new Date(a.updatedAt)
    );
  }

  const dir = sort.dir === 'asc' ? 1 : -1;
  const val = (t) => {
    switch (sort.key) {
      case 'testLevel':
        return LEVEL_RANK[t.testLevel] ?? 99;
      case 'updatedAt':
        return new Date(t.updatedAt).getTime();
      default:
        return String(t[sort.key] ?? '').toLowerCase();
    }
  };

  return [...rows].sort((a, b) => {
    // Pinned first, always.
    const pin = Number(b.pinned) - Number(a.pinned);
    if (pin !== 0) return pin;
    const av = val(a);
    const bv = val(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function SortHeader({ label, sortKey, sort, setSort, className }) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '';
  return (
    <th
      className={`sortable ${className || ''} ${active ? 'sorted' : ''}`}
      onClick={() =>
        setSort((s) =>
          s.key === sortKey
            ? { key: sortKey, dir: s.dir === 'asc' ? 'desc' : 'asc' }
            : { key: sortKey, dir: 'asc' }
        )
      }
    >
      {label} <span className="sort-arrow">{arrow}</span>
    </th>
  );
}

export default function TestCaseTable({
  testCases,
  meta,
  filters,
  sort,
  setSort,
  loading,
  onRowClick,
  onTogglePin,
  selectedIds,
  onToggleSelect,
  onSetSelection,
}) {
  const rows = useMemo(() => {
    const filtered = applyFilters(testCases, filters);
    return applySort(filtered, sort);
  }, [testCases, filters, sort]);

  // Select-all operates on the currently-visible (filtered) rows.
  const visibleIds = rows.map((r) => r.id);
  const selectedVisible = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisible === visibleIds.length;
  const someVisibleSelected =
    selectedVisible > 0 && selectedVisible < visibleIds.length;

  function toggleSelectAll() {
    if (allVisibleSelected) {
      // Deselect the visible rows, keep any selection outside the filter.
      const visible = new Set(visibleIds);
      onSetSelection([...selectedIds].filter((id) => !visible.has(id)));
    } else {
      // Add all visible rows to the selection.
      onSetSelection([...new Set([...selectedIds, ...visibleIds])]);
    }
  }

  if (loading) {
    return <div className="table-empty muted">Loading test cases…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="table-empty">
        <p className="muted">No test cases match your filters.</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="tc-table">
        <thead>
          <tr>
            <th className="col-select">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someVisibleSelected;
                }}
                onChange={toggleSelectAll}
                title="Select all (filtered)"
              />
            </th>
            <th className="col-pin" title="Pinned"></th>
            <SortHeader label="TC ID" sortKey="tcId" sort={sort} setSort={setSort} className="col-id" />
            <SortHeader label="Title" sortKey="title" sort={sort} setSort={setSort} className="col-title" />
            <SortHeader label="Area" sortKey="area" sort={sort} setSort={setSort} className="col-area" />
            <SortHeader label="Category" sortKey="category" sort={sort} setSort={setSort} className="col-category" />
            <SortHeader label="Layer" sortKey="layer" sort={sort} setSort={setSort} className="col-layer" />
            <SortHeader label="Type" sortKey="testLevel" sort={sort} setSort={setSort} className="col-level" />
            <SortHeader label="Execution" sortKey="type" sort={sort} setSort={setSort} className="col-type" />
            <SortHeader label="Nature" sortKey="testNature" sort={sort} setSort={setSort} className="col-nature" />
            <SortHeader label="Sprint" sortKey="sprint" sort={sort} setSort={setSort} className="col-sprint" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.id}
              className={`${t.pinned ? 'row-pinned' : ''} ${
                selectedIds.has(t.id) ? 'row-selected' : ''
              }`}
              onClick={() => onRowClick(t)}
            >
              <td className="col-select" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(t.id)}
                  onChange={() => onToggleSelect(t.id)}
                />
              </td>
              <td className="col-pin">
                <button
                  className={`pin-btn ${t.pinned ? 'pinned' : ''}`}
                  title={t.pinned ? 'Unpin' : 'Pin to top'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(t);
                  }}
                >
                  {t.pinned ? '★' : '☆'}
                </button>
              </td>
              <td className="col-id mono">{t.tcId}</td>
              <td className="col-title">
                {t.isNewFunctionality && (
                  <span className="new-chip" title="New functionality">
                    NEW
                  </span>
                )}
                {t.title}
              </td>
              <td className="col-area">
                {t.area ? <span className="area-tag">{t.area}</span> : '—'}
              </td>
              <td className="col-category">
                {t.category ? (
                  <span className="category-tag plain">{t.category}</span>
                ) : (
                  '—'
                )}
              </td>
              <td className="col-layer">
                <LayerBadge layer={t.layer} />
              </td>
              <td className="col-level">
                <LevelBadge level={t.testLevel} />
              </td>
              <td className="col-type">
                <TypeBadge type={t.type} />
              </td>
              <td className="col-nature">
                <NatureBadge nature={t.testNature} compact />
              </td>
              <td className="col-sprint">
                {t.sprint ? <span className="sprint-tag">{t.sprint}</span> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
