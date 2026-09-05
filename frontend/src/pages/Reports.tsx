import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FiAlertTriangle, FiUnlock, FiShield, FiWifi, FiDownload, FiFileText } from "react-icons/fi";

import { getReportSummary, type ReportSummary } from "../services/reports";
import { getIncidents, type Incident } from "../services/incidents";
import { StatCard } from "../components/StatCard";

function Reports() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    async function loadData(isFirstLoad: boolean) {
      try {
        const [summaryData, incidentsData] = await Promise.all([
          getReportSummary(),
          getIncidents(),
        ]);
        setSummary(summaryData);
        setIncidents(incidentsData);
        setError(null);
        setStale(false);
      } catch (err) {
        if (isFirstLoad) {
          setError("Failed to load report data from the backend.");
        } else {
          setStale(true);
        }
      } finally {
        if (isFirstLoad) setLoading(false);
      }
    }
    loadData(true);
    // Live-refresh every 3s so the summary cards (and any PDF you generate
    // afterward) reflect the latest incidents without a manual page reload.
    const intervalId = setInterval(() => loadData(false), 3000);
    return () => clearInterval(intervalId);
  }, []);

  // Wrapped defensively: PDF generation is 100% client-side (jsPDF never
  // talks to the backend), but a rendering hiccup here used to be able to
  // take the whole app down with it since nothing caught the error. Now a
  // failure here just shows a banner - it can never break the rest of the
  // dashboard, and the app-level ErrorBoundary is a second safety net on
  // top of this for anything unexpected elsewhere.
  const generatePDF = () => {
    if (!summary) return;
    setPdfError(null);
    setGenerating(true);

    try {
      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text("ML-Based DDoS Detection Security Report", 20, 20);

      doc.setFontSize(12);
      doc.text("Generated: " + new Date().toLocaleString(), 20, 30);

      // Every figure below comes directly from the live backend /reports
      // endpoint - nothing here is a placeholder value.
      doc.text(`Total Incidents: ${summary.incidents}`, 20, 45);
      doc.text(`Open Incidents: ${summary.open_incidents}`, 20, 55);
      doc.text(`Mitigations Applied: ${summary.mitigations}`, 20, 65);
      doc.text(`Flows Analyzed: ${summary.flows}`, 20, 75);
      doc.text(`Predictions Made: ${summary.predictions}`, 20, 85);
      doc.text(`Active Models: ${summary.active_models}`, 20, 95);

      autoTable(doc, {
        startY: 105,
        head: [["Time", "Title", "Severity", "Status"]],
        body: incidents.map((item) => [
          new Date(item.created_at).toLocaleString(),
          item.title,
          item.severity,
          item.status,
        ]),
      });

      // Page border - drawn last, on every page autoTable produced (not just
      // the first), so it still frames the page even if the incident table
      // spills onto page 2+.
      const pageCount = doc.getNumberOfPages();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(37, 99, 235);
        doc.setLineWidth(0.6);
        doc.rect(8, 8, pageWidth - 16, pageHeight - 16);
      }

      doc.save("DDoS_Security_Report.pdf");
    } catch (err) {
      setPdfError("Could not generate the PDF. Your dashboard data is unaffected - please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 2, display: "flex", alignItems: "center", gap: 10 }}>
            <FiFileText /> Security Reports
          </h1>
          <div className="subtitle">Live figures pulled straight from the backend</div>
        </div>
      </div>

      {error && <div className="banner-error">{error}</div>}
      {!error && stale && (
        <div className="banner-error" style={{ background: "var(--accent-yellow, #b45309)" }}>
          Lost connection to the backend - showing the last data received. Retrying every 3s...
        </div>
      )}
      {pdfError && <div className="banner-error">{pdfError}</div>}
      {loading && <p style={{ color: "var(--text-secondary)" }}>Loading report data...</p>}

      {!loading && !error && summary && (
        <>
          <div className="stat-grid">
            <StatCard label="Total Incidents" value={summary.incidents} icon={<FiAlertTriangle />} iconClass="icon-red" />
            <StatCard label="Open Incidents" value={summary.open_incidents} icon={<FiUnlock />} iconClass="icon-yellow" />
            <StatCard label="Mitigations" value={summary.mitigations} icon={<FiShield />} iconClass="icon-purple" />
            <StatCard label="Flows Analyzed" value={summary.flows} icon={<FiWifi />} iconClass="icon-blue" />
          </div>

          <div className="glass-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 17, marginBottom: 6 }}>Generate Security Report</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>
                Download a PDF report built from live backend data, including every incident on record.
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={generatePDF}
              disabled={generating}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <FiDownload /> {generating ? "Generating..." : "Generate PDF Report"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default Reports;
