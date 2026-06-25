import { useState } from "react";
import { IconCheck, IconCloseLg, IconSavedBookmarkFilled } from "./icons";

// Save Search modal. Visual stub: input name + see saved searches list +
// delete a saved search. Local state only, no backend.

interface SavedSearch {
  id: number;
  name: string;
  filters: string[];
  saved: string;
}

const SEED_SEARCHES: SavedSearch[] = [
  { id: 1, name: "Remote Senior Design Roles", filters: ["Remote", "Senior", "$100k+", "Full-time"], saved: "2 days ago" },
  { id: 2, name: "NYC Product Design",         filters: ["New York, NY", "Full-time", "Product Designer"], saved: "5 days ago" },
  { id: 3, name: "Startup Quick Apply",        filters: ["Quick Apply", "$80k+", "Full-time", "Startup"], saved: "1 week ago" },
];

interface SaveSearchModalProps {
  open: boolean;
  onClose: () => void;
  currentFilters: string[];
}

export function SaveSearchModal({ open, onClose, currentFilters }: SaveSearchModalProps) {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [searches, setSearches] = useState<SavedSearch[]>(SEED_SEARCHES);

  if (!open) return null;

  function handleSave() {
    if (!name.trim()) return;
    setSearches((prev) => [
      {
        id: Date.now(),
        name: name.trim(),
        filters: currentFilters.length > 0 ? currentFilters : ["Remote", "Full-time"],
        saved: "Just now",
      },
      ...prev,
    ]);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setName("");
      onClose();
    }, 1400);
  }

  return (
    <>
      <div className="jb-overlay" onClick={onClose} />
      <div className="jb-modal">
        <div className="jb-modal-head">
          <div>
            <h2>Saved Searches</h2>
            <p>{searches.length} saved search{searches.length === 1 ? "" : "es"}</p>
          </div>
          <button className="jb-modal-close" onClick={onClose} type="button">
            <IconCloseLg />
          </button>
        </div>

        <div className="jb-modal-section">
          {saved ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 10,
            }}>
              <div style={{
                width: 24, height: 24, background: "#dcfce7",
                borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center",
                flexShrink: 0, color: "#1a6b2e",
              }}>
                <IconCheck />
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: "#1a6b2e" }}>
                "{name}" saved!
              </span>
            </div>
          ) : (
            <div className="jb-modal-input-row">
              <input
                autoFocus
                type="text"
                placeholder="Name this search, e.g. Remote Senior Roles"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={!name.trim()}
              >
                Save Search
              </button>
            </div>
          )}

          <div className="jb-modal-filterpills">
            {(currentFilters.length > 0 ? currentFilters : ["Remote", "Full-time", "$100k+", "Quick Apply"]).map((f) => (
              <span key={f} className="jb-modal-filterpill">{f}</span>
            ))}
          </div>
        </div>

        <div className="jb-modal-list">
          {searches.length === 0 && (
            <div style={{ padding: "32px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              No saved searches yet.
            </div>
          )}
          {searches.map((s) => (
            <div className="jb-modal-row" key={s.id}>
              <div className="jb-modal-row-icon" style={{ color: "#3b82f6" }}>
                <IconSavedBookmarkFilled />
              </div>
              <div className="jb-modal-row-body">
                <div className="jb-modal-row-headline">
                  <span className="ttl">{s.name}</span>
                  <span className="age">{s.saved}</span>
                </div>
                <div className="jb-modal-row-filters">
                  {s.filters.map((f) => (
                    <span key={f} className="jb-modal-row-filter">{f}</span>
                  ))}
                </div>
              </div>
              <button
                className="jb-modal-row-x"
                type="button"
                onClick={() => setSearches((prev) => prev.filter((x) => x.id !== s.id))}
              >
                <IconCloseLg />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
