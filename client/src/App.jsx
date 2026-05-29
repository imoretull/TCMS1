import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import TestCaseTable from './components/TestCaseTable.jsx';
import TestCasePanel from './components/TestCasePanel.jsx';
import Toolbar from './components/Toolbar.jsx';

const EMPTY_FILTERS = {
  search: '',
  area: '',
  category: '',
  status: '',
  priority: '',
  assignee: '',
  type: '',
  testNature: '',
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

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setTestCases([]);
    setMeta(null);
    setPanel(null);
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
          <span className="brand-mark">✓</span>
          <span className="brand-name">TCMS</span>
          <span className="brand-sub">Test Case Management</span>
        </div>
        <div className="header-right">
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
        />
      </main>

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
        />
      )}

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.message}</div>}
    </div>
  );
}
