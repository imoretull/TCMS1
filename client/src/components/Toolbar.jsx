// The filter/search bar above the table. Filtering is purely client-side
// for instant feedback at the expected scale (hundreds–low-thousands of cases).

export default function Toolbar({
  meta,
  filters,
  setFilters,
  onClear,
  onNew,
  count,
}) {
  const set = (key) => (e) =>
    setFilters((f) => ({ ...f, [key]: e.target.value }));

  const hasActiveFilters =
    Object.entries(filters).some(([, v]) => v && v !== '');

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <div className="search-box">
          <span className="search-icon">⌕</span>
          <input
            type="search"
            placeholder="Search ID, title, area…"
            value={filters.search}
            onChange={set('search')}
          />
        </div>

        <select value={filters.area} onChange={set('area')} className="filter">
          <option value="">All areas</option>
          {meta?.areas?.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select value={filters.status} onChange={set('status')} className="filter">
          <option value="">All statuses</option>
          {meta?.statuses?.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select value={filters.priority} onChange={set('priority')} className="filter">
          <option value="">All priorities</option>
          {meta?.priorities?.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select value={filters.assignee} onChange={set('assignee')} className="filter">
          <option value="">All assignees</option>
          {meta?.users?.map((u) => (
            <option key={u.email} value={u.email}>
              {u.name}
            </option>
          ))}
        </select>

        <select value={filters.type} onChange={set('type')} className="filter">
          <option value="">All types</option>
          {meta?.types?.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button className="btn btn-ghost" onClick={onClear}>
            Clear
          </button>
        )}

        <div className="toolbar-spacer" />

        <span className="count-pill">{count} cases</span>
        <button className="btn btn-primary" onClick={onNew}>
          + New test case
        </button>
      </div>
    </div>
  );
}
