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

  // Changing the area resets the category (categories are scoped to an area).
  const setArea = (e) =>
    setFilters((f) => ({ ...f, area: e.target.value, category: '' }));

  // Category choices: scoped to the selected area, or the full union if no
  // area is chosen.
  const byArea = meta?.categoriesByArea || {};
  const categoryOptions = filters.area
    ? byArea[filters.area] || []
    : [...new Set(Object.values(byArea).flat())].sort((a, b) =>
        a.localeCompare(b)
      );

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

        <select value={filters.area} onChange={setArea} className="filter">
          <option value="">All areas</option>
          {meta?.areas?.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          value={filters.category}
          onChange={set('category')}
          className="filter"
        >
          <option value="">All categories</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select value={filters.testLevel} onChange={set('testLevel')} className="filter">
          <option value="">All types</option>
          {meta?.testLevels?.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <select value={filters.type} onChange={set('type')} className="filter">
          <option value="">All execution</option>
          {meta?.types?.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={filters.testNature}
          onChange={set('testNature')}
          className="filter"
        >
          <option value="">All natures</option>
          {meta?.testNatures?.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <select value={filters.sprint} onChange={set('sprint')} className="filter">
          <option value="">All sprints</option>
          {meta?.sprints?.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={filters.newFunctionality}
          onChange={set('newFunctionality')}
          className="filter"
        >
          <option value="">New &amp; existing</option>
          <option value="yes">New functionality</option>
          <option value="no">Existing only</option>
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
