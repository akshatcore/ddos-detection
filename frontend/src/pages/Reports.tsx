import "../styles/Reports.css";
import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { getReportSummary, type ReportSummary } from "../services/reports";
import { getIncidents, type Incident } from "../services/incidents";

function Reports() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [summaryData, incidentsData] = await Promise.all([
          getReportSummary(),
          getIncidents(),
        ]);
        setSummary(summaryData);
        setIncidents(incidentsData);
      } catch (err) {
        setError("Failed to load report data from the backend.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const generatePDF = () => {
    if (!summary) return;

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

    doc.save("DDoS_Security_Report.pdf");
  };

  return (
    <div className="reports">
      <h1>📄 Security Reports</h1>

      {loading && <p>Loading report data...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && summary && (
        <>
          <div className="report-cards">
            <div className="report-card">
              <h3>🚨 Total Incidents</h3>
              <p>{summary.incidents}</p>
            </div>
            <div className="report-card">
              <h3>🔓 Open Incidents</h3>
              <p>{summary.open_incidents}</p>
            </div>
            <div className="report-card">
              <h3>🔒 Mitigations</h3>
              <p>{summary.mitigations}</p>
            </div>
            <div className="report-card">
              <h3>🌐 Flows Analyzed</h3>
              <p>{summary.flows}</p>
            </div>
          </div>

          <div className="generate-box">
            <h2>Generate Security Report</h2>
            <p>Download a PDF report built from live backend data.</p>
            <button onClick={generatePDF}>Generate PDF Report</button>
          </div>
        </>
      )}
    </div>
  );
}

export default Reports;
