import { useState, useEffect } from 'react';
import { TypeBadge, NatureBadge, LevelBadge } from './badges.jsx';

const BLANK = {
  title: '',
  area: '',
  category: '',
  type: 'Manual', // Execution
  testNature: 'Positive',
  testLevel: 'Regression',
  preconditions: '',
  testData: '',
  testSteps: '',
  expectedResult: '',
  comments: '',
  pinned: false,
  isNewFunctionality: false,
  sprint: '',
};

function userName(meta, email) {
  if (!email) return '—';
  const u = meta?.users?.find((x) => x.email === email);
  return u ? u.name : email;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function TestCasePanel({
  panel,
  setPanel,
  meta,
  currentUser,
  onSave,
  onDelete,
  onTogglePin,
  onDuplicate,
}) {
  const { mode, testCase } = panel;
  const isCreate = mode === 'create';
  const isEdit = mode === 'edit' || isCreate;

  const [form, setForm] = useState(() =>
    testCase ? { ...BLANK, ...testCase } : { ...BLANK }
  );
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);
  // "addingArea"/"addingCategory" let the user type a brand-new value inline.
  const [addingArea, setAddingArea] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);

  // Keep the form in sync if the underlying testCase changes (e.g. after save).
  useEffect(() => {
    if (mode === 'view' && testCase) setForm({ ...BLANK, ...testCase });
  }, [mode, testCase]);

  const set = (key) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: v }));
  };

  function close() {
    setPanel(null);
  }

  async function save() {
    if (!form.title.trim()) {
      window.alert('Title is required.');
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title,
      area: form.area,
      category: form.category,
      type: form.type,
      testNature: form.testNature,
      testLevel: form.testLevel,
      preconditions: form.preconditions,
      testData: form.testData,
      testSteps: form.testSteps,
      expectedResult: form.expectedResult,
      comments: form.comments,
      pinned: form.pinned,
      isNewFunctionality: form.isNewFunctionality,
      sprint: form.sprint,
    };
    if (!isCreate) payload.updatedAt = testCase.updatedAt;

    const result = await onSave(payload, isCreate ? undefined : testCase.id);
    setSaving(false);
    if (result?.conflict) {
      setConflict(result.conflict);
    }
  }

  // Conflict resolution: user chose to discard their edits and load the
  // latest server copy into the form to re-edit.
  function reloadFromServer() {
    setForm({ ...BLANK, ...conflict });
    setConflict(null);
  }

  // Esc closes the panel (in view mode) for keyboard-friendliness.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && mode === 'view') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="panel-overlay" onMouseDown={(e) => e.target === e.currentTarget && mode === 'view' && close()}>
      <aside className="panel" role="dialog" aria-modal="true">
        <header className="panel-header">
          <div className="panel-title-row">
            {!isCreate && <span className="mono panel-tcid">{testCase.tcId}</span>}
            <h2>{isCreate ? 'New test case' : isEdit ? 'Editing' : testCase.title}</h2>
          </div>
          <button className="icon-btn" onClick={close} title="Close">
            ✕
          </button>
        </header>

        {conflict && (
          <div className="conflict-banner">
            <strong>⚠ This test case changed since you opened it.</strong>
            <p>
              {userName(meta, conflict.updatedBy)} updated it at{' '}
              {fmtDate(conflict.updatedAt)}. Your changes were not saved.
            </p>
            <div className="conflict-actions">
              <button className="btn btn-small" onClick={reloadFromServer}>
                Load their version &amp; re-edit
              </button>
              <button
                className="btn btn-small btn-ghost"
                onClick={() => setConflict(null)}
              >
                Keep editing mine
              </button>
            </div>
          </div>
        )}

        <div className="panel-body">
          {isEdit ? (
            <EditForm
              form={form}
              set={set}
              setForm={setForm}
              meta={meta}
              addingArea={addingArea}
              setAddingArea={setAddingArea}
              addingCategory={addingCategory}
              setAddingCategory={setAddingCategory}
            />
          ) : (
            <ViewBody testCase={testCase} meta={meta} />
          )}
        </div>

        <footer className="panel-footer">
          {isEdit ? (
            <>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : isCreate ? 'Create test case' : 'Save changes'}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  isCreate ? close() : setPanel({ mode: 'view', testCase })
                }
                disabled={saving}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-primary"
                onClick={() => setPanel({ mode: 'edit', testCase })}
              >
                Edit
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => onDuplicate(testCase)}
                title="Create a copy of this test case"
              >
                ⧉ Duplicate
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => onTogglePin(testCase)}
              >
                {testCase.pinned ? '★ Unpin' : '☆ Pin to top'}
              </button>
              <div className="footer-spacer" />
              <button
                className="btn btn-danger-ghost"
                onClick={() => onDelete(testCase)}
              >
                Delete
              </button>
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}

// ── View mode ────────────────────────────────────────────────────────────────

function ViewBody({ testCase, meta }) {
  const t = testCase;
  return (
    <div className="view-body">
      <h3 className="view-headline">{t.title}</h3>

      <div className="meta-grid">
        <Meta label="Area">{t.area ? <span className="area-tag">{t.area}</span> : '—'}</Meta>
        <Meta label="Category">
          {t.category ? <span className="category-tag plain">{t.category}</span> : '—'}
        </Meta>
        <Meta label="Type"><LevelBadge level={t.testLevel} /></Meta>
        <Meta label="Execution"><TypeBadge type={t.type} /></Meta>
        <Meta label="Nature"><NatureBadge nature={t.testNature} /></Meta>
        <Meta label="Sprint">
          {t.sprint ? <span className="sprint-tag">{t.sprint}</span> : '—'}
        </Meta>
        <Meta label="New functionality">
          {t.isNewFunctionality ? (
            <span className="new-chip">NEW</span>
          ) : (
            'No'
          )}
        </Meta>
        <Meta label="Pinned">{t.pinned ? '★ Yes' : 'No'}</Meta>
      </div>

      <Section title="Preconditions" text={t.preconditions} />
      <Section title="Test Data" text={t.testData} />
      <Section title="Test Steps" text={t.testSteps} />
      <Section title="Expected Result" text={t.expectedResult} />
      <Section title="Comments" text={t.comments} />

      <div className="audit">
        <div>Created by {userName(meta, t.createdBy)} · {fmtDate(t.createdAt)}</div>
        <div>Last updated by {userName(meta, t.updatedBy)} · {fmtDate(t.updatedAt)}</div>
      </div>
    </div>
  );
}

function Meta({ label, children }) {
  return (
    <div className="meta-item">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{children}</span>
    </div>
  );
}

function Section({ title, text }) {
  return (
    <div className="view-section">
      <h4>{title}</h4>
      {text && text.trim() ? (
        <pre className="prewrap">{text}</pre>
      ) : (
        <p className="muted">—</p>
      )}
    </div>
  );
}

// ── Edit mode ────────────────────────────────────────────────────────────────

function EditForm({
  form,
  set,
  setForm,
  meta,
  addingArea,
  setAddingArea,
  addingCategory,
  setAddingCategory,
}) {
  // Categories scoped to the currently-selected area (Area → Category).
  const categoriesForArea =
    (form.area && meta?.categoriesByArea?.[form.area]) || [];

  return (
    <div className="edit-form">
      <label className="field">
        <span>Title *</span>
        <input
          type="text"
          value={form.title}
          onChange={set('title')}
          placeholder="Short, descriptive summary"
          autoFocus
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Area</span>
          {addingArea ? (
            <div className="inline-add">
              <input
                type="text"
                value={form.area}
                onChange={set('area')}
                placeholder="New area name"
                autoFocus
              />
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={() => setAddingArea(false)}
              >
                Pick existing
              </button>
            </div>
          ) : (
            <div className="inline-add">
              <select
                value={form.area}
                onChange={(e) => {
                  // Changing area clears the category (it belongs to an area).
                  const area = e.target.value;
                  setForm((f) => ({ ...f, area, category: '' }));
                  setAddingCategory(false);
                }}
              >
                <option value="">— None —</option>
                {meta?.areas?.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={() => {
                  setForm((f) => ({ ...f, area: '', category: '' }));
                  setAddingArea(true);
                }}
              >
                + New
              </button>
            </div>
          )}
        </label>

        <label className="field">
          <span>Category</span>
          {addingCategory ? (
            <div className="inline-add">
              <input
                type="text"
                value={form.category}
                onChange={set('category')}
                placeholder="New category name"
                disabled={!form.area}
                autoFocus
              />
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={() => setAddingCategory(false)}
              >
                Pick existing
              </button>
            </div>
          ) : (
            <div className="inline-add">
              <select
                value={form.category}
                onChange={set('category')}
                disabled={!form.area}
                title={!form.area ? 'Pick an area first' : undefined}
              >
                <option value="">— None —</option>
                {categoriesForArea.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-small btn-ghost"
                disabled={!form.area}
                onClick={() => {
                  setForm((f) => ({ ...f, category: '' }));
                  setAddingCategory(true);
                }}
              >
                + New
              </button>
            </div>
          )}
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Type</span>
          <select value={form.testLevel} onChange={set('testLevel')}>
            {meta?.testLevels?.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Execution</span>
          <select value={form.type} onChange={set('type')}>
            {meta?.types?.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Test Nature</span>
          <select value={form.testNature} onChange={set('testNature')}>
            {meta?.testNatures?.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Sprint (optional)</span>
          <input
            type="text"
            list="sprint-options"
            value={form.sprint || ''}
            onChange={set('sprint')}
            placeholder="e.g. S23"
          />
          <datalist id="sprint-options">
            {meta?.sprints?.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={!!form.isNewFunctionality}
          onChange={set('isNewFunctionality')}
        />
        <span>Tag as “New functionality”</span>
      </label>

      <label className="checkbox-field">
        <input type="checkbox" checked={!!form.pinned} onChange={set('pinned')} />
        <span>★ Pin to top (team awareness)</span>
      </label>

      <TextArea label="Preconditions" value={form.preconditions} onChange={set('preconditions')} />
      <TextArea label="Test Data" value={form.testData} onChange={set('testData')} />
      <TextArea
        label="Test Steps"
        value={form.testSteps}
        onChange={set('testSteps')}
        rows={5}
        placeholder={'1. …\n2. …\n3. …'}
      />
      <TextArea label="Expected Result" value={form.expectedResult} onChange={set('expectedResult')} />
      <TextArea label="Comments" value={form.comments} onChange={set('comments')} />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 3, placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        value={value || ''}
        onChange={onChange}
        rows={rows}
        placeholder={placeholder}
      />
    </label>
  );
}
