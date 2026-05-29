import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import TestCaseTable from './components/TestCaseTable.jsx';
import TestCasePanel from './components/TestCasePanel.jsx';
import Toolbar from './components/Toolbar.jsx';
import BulkBar from './components/BulkBar.jsx';
import BulkEditDialog from './components/BulkEditDialog.jsx';
import DatasetSwitcher from './components/DatasetSwitcher.jsx';

const EMPTY_FILTERS = {
  search: '',
  area: '',
  category: '',
  type: '', // Execution: Manual/Automated
  testNature: '',
  testLevel: '', // Sanity/Smoke/Regression (inclusive)
  sprint: '',
  newFunctionality: '', // '', 'yes', or 'no'
};

export default function App() {
  const [user, setUser] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  const [meta, setMeta] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ key: null, dir: 'asc' });

  // Panel state: { mode: 'view' | 'edit' | 'create', testCase }
  const [panel, setPanel] = useState(null);
  const [toast, setToast] = useState(null);

  // Bulk selection: Set of selected test-case ids, and the bulk-edit dialog.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  // Active dataset name (drives the demo brand label in the header).
  const [datasetName, setDatasetName] = useState(null);

  // ── Bootstrap: are we already signed in? ──────────────────────────────────
  useEffect(() => {
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setBootstrapping(false));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [metaRes, cases] = await Promise.all([
        api.meta(),
        api.listTestCases(),
      ]);
      setMeta(metaRes);
      setTestCases(cases);
    } catch (err) {
      if (err.status === 401) setUser(null);
      else showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  function showToast(message, kind = 'info') {
    setToast({ message, kind });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 4000);
  }

  // Dataset switched server-wide: reset view state and reload from the new DB.
  async function handleDatasetSwitched(name) {
    setDatasetName(name);
    setPanel(null);
    clearSelection();
    setBulkEditOpen(false);
    setFilters(EMPTY_FILTERS);
    setSort({ key: null, dir: 'asc' });
    await loadData();
    showToast(
      `Switched to ${name.charAt(0).toUpperCase() + name.slice(1)} dataset.`,
      'success'
    );
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setTestCases([]);
    setMeta(null);
    setPanel(null);
    clearSelection();
  }

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  async function handleSave(data, id) {
    try {
      if (id) {
        const updated = await api.updateTestCase(id, data);
        setTestCases((prev) => prev.map((t) => (t.id === id ? updated : t)));
        showToast(`${updated.tcId} saved.`, 'success');
        setPanel({ mode: 'view', testCase: updated });
      } else {
        const created = await api.createTestCase(data);
        setTestCases((prev) => [created, ...prev]);
        showToast(`${created.tcId} created.`, 'success');
        setPanel({ mode: 'view', testCase: created });
      }
      // Refresh meta so any new area appears in filters.
      api.meta().then(setMeta).catch(() => {});
    } catch (err) {
      if (err.status === 409) {
        // Conflict — surface the server's current copy to the panel.
        return { conflict: err.payload?.current };
      }
      showToast(err.message, 'error');
    }
    return {};
  }

  async function handleDelete(testCase) {
    if (
      !window.confirm(
        `Delete ${testCase.tcId} — "${testCase.title}"? This cannot be undone.`
      )
    )
      return;
    try {
      await api.deleteTestCase(testCase.id);
      setTestCases((prev) => prev.filter((t) => t.id !== testCase.id));
      showToast(`${testCase.tcId} deleted.`, 'success');
      setPanel(null);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleTogglePin(testCase) {
    try {
      const updated = await api.setPinned(testCase.id, !testCase.pinned);
      setTestCases((prev) => prev.map((t) => (t.id === testCase.id ? updated : t)));
      if (panel?.testCase?.id === updated.id) {
        setPanel((p) => ({ ...p, testCase: updated }));
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDuplicate(testCase) {
    try {
      const copy = await api.duplicateTestCase(testCase.id);
      setTestCases((prev) => [copy, ...prev]);
      showToast(`Duplicated as ${copy.tcId}.`, 'success');
      // Open the copy straight in edit mode so the user can tweak it.
      setPanel({ mode: 'edit', testCase: copy });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ── Bulk selection + actions ──────────────────────────────────────────────
  function clearSelection() {
    setSelectedIds(new Set());
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Replace the whole selection (used by the table's select-all of visible rows).
  function setSelection(ids) {
    setSelectedIds(new Set(ids));
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} selected test case(s)? This cannot be undone.`
      )
    )
      return;
    try {
      const { deleted } = await api.bulkDelete(ids);
      const idSet = new Set(ids);
      setTestCases((prev) => prev.filter((t) => !idSet.has(t.id)));
      clearSelection();
      if (panel && idSet.has(panel.testCase?.id)) setPanel(null);
      showToast(`Deleted ${deleted} test case(s).`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleBulkUpdate(patch) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    try {
      const { updated } = await api.bulkUpdate(ids, patch);
      // Refetch the affected rows simply by reloading the list (small scale).
      const fresh = await api.listTestCases();
      setTestCases(fresh);
      api.meta().then(setMeta).catch(() => {});
      setBulkEditOpen(false);
      clearSelection();
      showToast(`Updated ${updated} test case(s).`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (bootstrapping) {
    return <div className="centered muted">Loading…</div>;
  }

  if (!user) {
    return (
      <Login
        onLoggedIn={(u) => {
          setUser(u);
        }}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            {(datasetName || 'a').charAt(0).toLowerCase()}
          </span>
          <span className="brand-name">
            {datasetName
              ? datasetName.charAt(0).toUpperCase() + datasetName.slice(1)
              : 'TCMS'}
          </span>
          <span className="brand-sub">Test Case Management</span>
        </div>
        <div className="header-right">
          <DatasetSwitcher
            onInit={setDatasetName}
            onSwitched={handleDatasetSwitched}
            onError={(m) => showToast(m, 'error')}
          />
          <span className="header-divider" />
          <span className="current-user" title={user.email}>
            {user.name}
          </span>
          <button className="btn btn-ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <Toolbar
        meta={meta}
        filters={filters}
        setFilters={setFilters}
        onClear={() => setFilters(EMPTY_FILTERS)}
        onNew={() => setPanel({ mode: 'create', testCase: null })}
        count={testCases.length}
      />

      <main className="app-main">
        <TestCaseTable
          testCases={testCases}
          meta={meta}
          filters={filters}
          sort={sort}
          setSort={setSort}
          loading={loading}
          onRowClick={(tc) => setPanel({ mode: 'view', testCase: tc })}
          onTogglePin={handleTogglePin}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSetSelection={setSelection}
        />
      </main>

      {selectedIds.size > 0 && (
        <BulkBar
          count={selectedIds.size}
          onEdit={() => setBulkEditOpen(true)}
          onDelete={handleBulkDelete}
          onClear={clearSelection}
        />
      )}

      {bulkEditOpen && (
        <BulkEditDialog
          count={selectedIds.size}
          meta={meta}
          onApply={handleBulkUpdate}
          onClose={() => setBulkEditOpen(false)}
        />
      )}

      {panel && (
        <TestCasePanel
          key={panel.testCase?.id || 'new'}
          panel={panel}
          setPanel={setPanel}
          meta={meta}
          currentUser={user}
          onSave={handleSave}
          onDelete={handleDelete}
          onTogglePin={handleTogglePin}
          onDuplicate={handleDuplicate}
        />
      )}

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.message}</div>}
    </div>
  );
}
