import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FiX, FiBookOpen } from "react-icons/fi";

import { renderMarkdown } from "../utils/markdown";

type DocumentationModalProps = {
  open: boolean;
  onClose: () => void;
};

export function DocumentationModal({ open, onClose }: DocumentationModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    // Fetches the project's real README - not fabricated in-app content -
    // so this always reflects the actual documented setup/attack-demo/API steps.
    fetch("/README.md")
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.text();
      })
      .then(setContent)
      .catch(() => setError("Could not load the documentation file."));

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Rendered via a portal straight into document.body - mounting a fixed-
  // position modal deep inside the sidebar's DOM subtree is fragile because
  // ancestors like the sticky sidebar establish their own stacking context,
  // which can make the modal paint BEHIND the main content instead of on
  // top of everything. A portal sidesteps that entirely.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FiBookOpen />
            <h3>Documentation</h3>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close" type="button">
            <FiX />
          </button>
        </div>
        <div className="modal-body">
          {error && <p style={{ color: "var(--accent-red)" }}>{error}</p>}
          {!error && !content && <p style={{ color: "var(--text-muted)" }}>Loading documentation...</p>}
          {!error && content && <div className="md-content">{renderMarkdown(content)}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
