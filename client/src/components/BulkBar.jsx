// Floating action bar shown when one or more rows are selected.
export default function BulkBar({ count, onEdit, onDelete, onClear }) {
  return (
    <div className="bulk-bar">
      <span className="bulk-count">{count} selected</span>
      <div className="bulk-actions">
        <button className="btn btn-small" onClick={onEdit}>
          Edit…
        </button>
        <button className="btn btn-small btn-danger-ghost" onClick={onDelete}>
          Delete
        </button>
        <button className="btn btn-small btn-ghost" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
