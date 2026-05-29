import { useEffect, useState } from 'react';
import { api } from '../api.js';

// A friendly label for a dataset name (capitalize the file stem).
function label(name) {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Header control to switch the active dataset (the underlying SQLite file).
 * Switching is global/server-wide; on success we tell the parent to reload.
 */
export default function DatasetSwitcher({ onInit, onSwitched, onError }) {
  const [datasets, setDatasets] = useState([]);
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listDatasets()
      .then((res) => {
        setDatasets(res.datasets);
        setCurrent(res.current);
        onInit?.(res.current);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function change(e) {
    const name = e.target.value;
    if (name === current) return;
    setBusy(true);
    try {
      const res = await api.switchDataset(name);
      setCurrent(res.current);
      onSwitched?.(res.current);
    } catch (err) {
      onError?.(err.message || 'Could not switch dataset.');
    } finally {
      setBusy(false);
    }
  }

  if (datasets.length <= 1) {
    // Nothing to switch to — show the current dataset as a static label.
    return current ? (
      <span className="dataset-static" title="Active dataset">
        {label(current)}
      </span>
    ) : null;
  }

  return (
    <label className="dataset-switcher" title="Switch dataset (database file)">
      <span className="dataset-icon">🗄</span>
      <select value={current || ''} onChange={change} disabled={busy}>
        {datasets.map((d) => (
          <option key={d} value={d}>
            {label(d)}
          </option>
        ))}
      </select>
    </label>
  );
}
