import { useState } from 'react';

/**
 * Bulk-edit modal. Only the fields whose "Change" box is ticked are sent in the
 * patch, so untouched fields are left as-is on every selected case.
 * Area and Category are set together (category is scoped to the chosen area).
 */
export default function BulkEditDialog({ count, meta, onApply, onClose }) {
  const [enabled, setEnabled] = useState({
    status: false,
    priority: false,
    assignee: false,
    area: false,
    sprint: false,
  });
  const [values, setValues] = useState({
    status: meta?.statuses?.[0] || '',
    priority: meta?.priorities?.[0] || '',
    assigneeEmail: '',
    area: '',
    category: '',
    sprint: '',
  });

  const toggle = (k) => () => setEnabled((e) => ({ ...e, [k]: !e[k] }));
  const setVal = (k) => (e) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const categoriesForArea =
    (values.area && meta?.categoriesByArea?.[values.area]) || [];

  const anyEnabled = Object.values(enabled).some(Boolean);

  function apply() {
    const patch = {};
    if (enabled.status) patch.status = values.status;
    if (enabled.priority) patch.priority = values.priority;
    if (enabled.assignee) patch.assigneeEmail = values.assigneeEmail;
    if (enabled.area) {
      patch.area = values.area;
      patch.category = values.category; // set together (may be '')
    }
    if (enabled.sprint) patch.sprint = values.sprint;
    onApply(patch);
  }

  return (
    <div className="dialog-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true">
        <header className="dialog-header">
          <h2>Edit {count} test case{count === 1 ? '' : 's'}</h2>
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </header>

        <div className="dialog-body">
          <p className="muted dialog-hint">
            Tick a field to change it on all selected cases. Unticked fields are
            left unchanged.
          </p>

          <BulkField
            label="Status"
            checked={enabled.status}
            onToggle={toggle('status')}
          >
            <select value={values.status} onChange={setVal('status')} disabled={!enabled.status}>
              {meta?.statuses?.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </BulkField>

          <BulkField
            label="Priority"
            checked={enabled.priority}
            onToggle={toggle('priority')}
          >
            <select value={values.priority} onChange={setVal('priority')} disabled={!enabled.priority}>
              {meta?.priorities?.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </BulkField>

          <BulkField
            label="Assignee"
            checked={enabled.assignee}
            onToggle={toggle('assignee')}
          >
            <select
              value={values.assigneeEmail}
              onChange={setVal('assigneeEmail')}
              disabled={!enabled.assignee}
            >
              <option value="">— Unassigned —</option>
              {meta?.users?.map((u) => (
                <option key={u.email} value={u.email}>{u.name}</option>
              ))}
            </select>
          </BulkField>

          <BulkField
            label="Area / Category"
            checked={enabled.area}
            onToggle={toggle('area')}
          >
            <div className="bulk-area-row">
              <select
                value={values.area}
                onChange={(e) =>
                  setValues((v) => ({ ...v, area: e.target.value, category: '' }))
                }
                disabled={!enabled.area}
              >
                <option value="">— None —</option>
                {meta?.areas?.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <select
                value={values.category}
                onChange={setVal('category')}
                disabled={!enabled.area || !values.area}
                title={!values.area ? 'Pick an area first' : undefined}
              >
                <option value="">— No category —</option>
                {categoriesForArea.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </BulkField>

          <BulkField
            label="Sprint"
            checked={enabled.sprint}
            onToggle={toggle('sprint')}
          >
            <input
              type="text"
              list="bulk-sprint-options"
              value={values.sprint}
              onChange={setVal('sprint')}
              placeholder="e.g. S23 (blank to clear)"
              disabled={!enabled.sprint}
            />
            <datalist id="bulk-sprint-options">
              {meta?.sprints?.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </BulkField>
        </div>

        <footer className="dialog-footer">
          <button className="btn btn-primary" onClick={apply} disabled={!anyEnabled}>
            Apply to {count}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}

function BulkField({ label, checked, onToggle, children }) {
  return (
    <div className={`bulk-field ${checked ? 'active' : ''}`}>
      <label className="bulk-field-toggle">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span>{label}</span>
      </label>
      <div className="bulk-field-control">{children}</div>
    </div>
  );
}
