import { Component, type ErrorInfo, type ReactNode } from "react";
import { FiAlertOctagon, FiRefreshCw } from "react-icons/fi";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string | null;
};

// Top-level safety net: without this, ANY uncaught render error anywhere in
// the tree (e.g. an unexpected value from the backend, a chart library
// hiccup) unmounts the entire app and every page looks "broken" at once.
// With it, a failure is contained to a friendly fallback instead of taking
// down the whole dashboard - directly addresses the report that generating
// a PDF once left every section appearing broken.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error caught by ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="glass-card" style={{ maxWidth: 460, textAlign: "center" }}>
            <div
              style={{
                width: 54,
                height: 54,
                margin: "0 auto 16px",
                borderRadius: 16,
                background: "rgba(239, 68, 68, 0.15)",
                color: "var(--accent-red)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
              }}
            >
              <FiAlertOctagon />
            </div>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong on this page</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginBottom: 18 }}>
              The rest of your data is safe - this only affects the current view. Reloading usually fixes it.
            </p>
            <button
              className="btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              onClick={() => window.location.reload()}
            >
              <FiRefreshCw /> Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
