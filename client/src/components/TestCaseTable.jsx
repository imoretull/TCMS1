import { useMemo } from 'react';
import { StatusBadge, PriorityBadge, TypeBadge, NatureBadge } from './badges.jsx';

const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function userName(meta, email) {
  if (!email) return '—';
  const u = meta?.users?.find((x) => x.email === email);
  return u ? u.name : email;
}

// Apply client-side filtering.
function applyFilters(testCases, filters, meta) {
  const q = filters.search.trim().toLowerCase();
  return testCases.filter((t) => {
    if (filters.area && t.area !== filters.area) return false;
    if (filters.category && t.category !== filters.category) return false;
    if (filters.status && t.status !== filters.status) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.assignee && t.assigneeEmail !== filters.assignee) return false;
    if (filters.type && t.type !== filters.type) return false;
    if (filters.testNature && t.testNature !== filters.testNature) return false;
    if (filters.sprint && t.sprint !== filters.sprint) return false;
    if (filters.newFunctionality === 'yes' && !t.isNewFunctionality) return false;
    if (filters.newFunctionality === 'no' && t.isNewFunctionality) return false;
    if (q) {
      const assignee = userName(meta, t.assigneeEmail).toLowerCase();
      const haystack = [t.tcId, t.title, t.area, t.category, t.sprint, assignee]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// Apply sorting. Pinned cases always float to the top regardless of sort.
function applySort(rows, sort, meta) {
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
      case 'priority':
        return PRIORITY_RANK[t.priority] ?? 99;
      case 'assignee':
        return userName(meta, t.assigneeEmail).toLowerCase();
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
    const filtered = applyFilters(testCases, filters, meta);
    return applySort(filtered, sort, meta);
  }, [testCases, filters, sort, meta]);

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
            <SortHeader label="Area / Category" sortKey="area" sort={sort} setSort={setSort} className="col-area" />
            <SortHeader label="Status" sortKey="status" sort={sort} setSort={setSort} className="col-status" />
            <SortHeader label="Priority" sortKey="priority" sort={sort} setSort={setSort} className="col-priority" />
            <SortHeader label="Type" sortKey="type" sort={sort} setSort={setSort} className="col-type" />
            <SortHeader label="Nature" sortKey="testNature" sort={sort} setSort={setSort} className="col-nature" />
            <SortHeader label="Sprint" sortKey="sprint" sort={sort} setSort={setSort} className="col-sprint" />
            <SortHeader label="Assignee" sortKey="assignee" sort={sort} setSort={setSort} className="col-assignee" />
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
                {t.area ? (
                  <span className="area-cell">
                    <span className="area-tag">{t.area}</span>
                    {t.category && (
                      <span className="category-tag">{t.category}</span>
                    )}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="col-status">
                <StatusBadge status={t.status} />
              </td>
              <td className="col-priority">
                <PriorityBadge priority={t.priority} />
              </td>
              <td className="col-type">
                <TypeBadge type={t.type} />
              </td>
              <td className="col-nature">
                <NatureBadge nature={t.testNature} />
              </td>
              <td className="col-sprint">
                {t.sprint ? <span className="sprint-tag">{t.sprint}</span> : '—'}
              </td>
              <td className="col-assignee">{userName(meta, t.assigneeEmail)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
