const pptxgen = require("pptxgenjs");

// ---------- palette (cybersecurity SOC theme) ----------
const NAVY = "0B1E3D";      // primary — dark backgrounds, headers
const NAVY_2 = "132A52";    // slightly lighter navy for cards on dark bg
const TEAL = "00C2A8";      // secondary — data / tech accent
const RED = "FF3B5C";       // accent — alerts / attacks
const INK = "16233A";       // body text on light bg
const MUTE = "5B6B85";      // muted text
const LIGHT = "F4F7FB";     // light card bg
const WHITE = "FFFFFF";

const FONT_HEAD = "Cambria";
const FONT_BODY = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5 in

// ---------------- helpers ----------------
function darkSlide() {
  const s = pres.addSlide();
  s.background = { color: NAVY };
  return s;
}
function lightSlide() {
  const s = pres.addSlide();
  s.background = { color: WHITE };
  return s;
}
function title(s, text, opts = {}) {
  s.addText(text, {
    x: 0.6, y: 0.45, w: 12.1, h: 0.9,
    fontFace: FONT_HEAD, fontSize: 30, bold: true,
    color: opts.dark ? WHITE : NAVY, align: "left", margin: 0,
  });
}
function kicker(s, text, opts = {}) {
  s.addText(text.toUpperCase(), {
    x: 0.6, y: 0.18, w: 8, h: 0.3,
    fontFace: FONT_BODY, fontSize: 12, bold: true, charSpacing: 2,
    color: opts.dark ? TEAL : TEAL, align: "left", margin: 0,
  });
}
// icon-in-circle + heading + body row
function iconRow(s, x, y, w, glyph, heading, body, opts = {}) {
  const circleD = 0.5;
  s.addShape("ellipse", {
    x, y, w: circleD, h: circleD,
    fill: { color: opts.circleColor || NAVY },
    line: { type: "none" },
  });
  s.addText(glyph, {
    x, y, w: circleD, h: circleD,
    align: "center", valign: "middle",
    fontFace: FONT_BODY, fontSize: 18, bold: true, color: WHITE, margin: 0,
  });
  s.addText(heading, {
    x: x + circleD + 0.22, y: y - 0.05, w: w - circleD - 0.22, h: 0.32,
    fontFace: FONT_HEAD, fontSize: 14.5, bold: true, color: INK, margin: 0,
  });
  s.addText(body, {
    x: x + circleD + 0.22, y: y + 0.27, w: w - circleD - 0.22, h: 0.65,
    fontFace: FONT_BODY, fontSize: 11.5, color: MUTE, margin: 0, lineSpacingMultiple: 1.15,
  });
}
function statCard(s, x, y, w, h, value, label, color) {
  s.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.1,
    fill: { color: NAVY_2 }, line: { type: "none" },
    shadow: { type: "outer", color: "000000", opacity: 0.35, blur: 6, offset: 3, angle: 90 },
  });
  s.addText(value, {
    x, y: y + 0.18, w, h: h - 0.7, align: "center", valign: "middle",
    fontFace: FONT_HEAD, fontSize: 30, bold: true, color: color, margin: 0,
  });
  s.addText(label, {
    x: x + 0.1, y: y + h - 0.55, w: w - 0.2, h: 0.45, align: "center", valign: "top",
    fontFace: FONT_BODY, fontSize: 11, color: "C7D4E8", margin: 0,
  });
}
function pageNum(s, n) {
  s.addText(String(n).padStart(2, "0"), {
    x: 12.55, y: 7.08, w: 0.6, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10, color: MUTE, align: "right", margin: 0,
  });
}

// ================= SLIDE 1 — TITLE =================
{
  const s = darkSlide();
  s.addText("ML-BASED DDoS DETECTION SYSTEM", {
    x: 0.9, y: 2.55, w: 11.5, h: 1.3,
    fontFace: FONT_HEAD, fontSize: 40, bold: true, color: WHITE, margin: 0,
  });
  s.addText("A Project-Based Learning Report — Machine Learning for Network Intrusion Detection", {
    x: 0.9, y: 3.55, w: 11.0, h: 0.5,
    fontFace: FONT_BODY, fontSize: 15, color: TEAL, margin: 0,
  });
  s.addShape("rect", { x: 0.9, y: 4.25, w: 2.2, h: 0.03, fill: { color: "22314F" }, line: { type: "none" } });
  s.addText(
    [
      { text: "[Your Name]", options: { bold: true, color: WHITE } },
      { text: "  ·  [Roll No.]\n", options: { color: "AEBBD4" } },
      { text: "Symbiosis Institute of Technology, Nagpur\n", options: { color: "AEBBD4" } },
      { text: "Guide: [Guide/Mentor Name]  ·  [Semester / Academic Year]", options: { color: "AEBBD4" } },
    ],
    { x: 0.9, y: 4.5, w: 10, h: 1.1, fontFace: FONT_BODY, fontSize: 13, margin: 0, lineSpacingMultiple: 1.4 }
  );
  s.addText("01", { x: 12.3, y: 6.9, w: 0.8, h: 0.4, fontFace: FONT_BODY, fontSize: 11, color: "3C4A6B", align: "right", margin: 0 });
}

// ================= SLIDE 2 — PROBLEM STATEMENT =================
{
  const s = lightSlide();
  kicker(s, "The Problem");
  title(s, "DDoS attacks overwhelm targets faster than humans can react");
  const rows = [
    ["!", "Volumetric flooding", "Attackers flood a target with traffic until legitimate users can no longer be served."],
    ["✕", "Signatures fall short", "Threshold and signature-based defenses struggle against attacks that mimic normal traffic shape."],
    ["↻", "Attacks shift over time", "Volume and vector change mid-attack, so static rules quickly go stale."],
  ];
  let y = 2.0;
  rows.forEach((r) => { iconRow(s, 0.7, y, 6.4, r[0], r[1], r[2], { circleColor: RED }); y += 1.15; });

  s.addShape("roundRect", { x: 7.6, y: 2.0, w: 5.1, h: 3.6, rectRadius: 0.1, fill: { color: NAVY }, line: { type: "none" } });
  s.addText("What's needed", { x: 7.95, y: 2.3, w: 4.4, h: 0.35, fontFace: FONT_BODY, fontSize: 12, bold: true, color: TEAL, margin: 0 });
  s.addText(
    "Passive capture  →  real-time flow classification  →  an alert an analyst can act on — with confidence, severity and source IP attached.",
    { x: 7.95, y: 2.75, w: 4.4, h: 2.6, fontFace: FONT_BODY, fontSize: 16, bold: true, color: WHITE, margin: 0, lineSpacingMultiple: 1.4 }
  );
  pageNum(s, 2);
}

// ================= SLIDE 3 — OBJECTIVES =================
{
  const s = lightSlide();
  kicker(s, "Goals");
  title(s, "Six objectives, one vertical slice");
  const objs = [
    ["1", "Capture", "Capture raw network packets on a target host and log per-packet metadata."],
    ["2", "Extract", "Aggregate packets into flow-level, time-windowed features for ML."],
    ["3", "Train", "Train & evaluate a classifier on CICDDoS2019, a recognised public dataset."],
    ["4", "Serve & Alert", "Serve predictions and connect them to a persistent, alerting backend."],
    ["5", "Dashboard", "Give analysts a role-based web UI to monitor and respond to incidents."],
    ["6", "Close the loop", "Find and fix the integration gaps between stages — not just build each in isolation."],
  ];
  let cx = 0.7, cy = 2.05;
  objs.forEach((o, i) => {
    iconRow(s, cx, cy, 5.9, o[0], o[1], o[2], { circleColor: TEAL });
    if (i % 2 === 0) { cx = 6.9; } else { cx = 0.7; cy += 1.55; }
  });
  pageNum(s, 3);
}

// ================= SLIDE 4 — SYSTEM ARCHITECTURE =================
{
  const s = lightSlide();
  kicker(s, "Architecture");
  title(s, "Five layers, wired end to end");
  const stages = ["Capture", "Feature\nExtraction", "ML\nModel", "Backend\n(Alerts)", "Dashboard"];
  const colors = [NAVY, "1B3A63", TEAL, "0E8C7A", NAVY];
  const boxW = 2.05, gap = 0.35, startX = 0.7, y = 2.5, boxH = 1.3;
  stages.forEach((label, i) => {
    const x = startX + i * (boxW + gap);
    s.addShape("roundRect", { x, y, w: boxW, h: boxH, rectRadius: 0.08, fill: { color: colors[i] }, line: { type: "none" } });
    s.addText(label, { x, y, w: boxW, h: boxH, align: "center", valign: "middle", fontFace: FONT_HEAD, fontSize: 14, bold: true, color: WHITE, margin: 0 });
    if (i < stages.length - 1) {
      s.addText("→", { x: x + boxW, y, w: gap, h: boxH, align: "center", valign: "middle", fontFace: FONT_BODY, fontSize: 20, bold: true, color: MUTE, margin: 0 });
    }
  });
  s.addText(
    "Every stage already existed as a script — the real engineering work was making sure their outputs and inputs actually matched (see Slide 11).",
    { x: 0.7, y: 4.3, w: 11.5, h: 0.6, fontFace: FONT_BODY, fontSize: 13, color: MUTE, margin: 0 }
  );
  s.addShape("roundRect", { x: 0.7, y: 5.05, w: 11.5, h: 1.55, rectRadius: 0.08, fill: { color: LIGHT }, line: { color: "E4E9F1", width: 1 } });
  s.addText(
    [
      { text: "Deployment:  ", options: { bold: true, color: INK } },
      { text: "docker-compose orchestrates PostgreSQL + FastAPI backend + a standalone ML prediction service + an Nginx reverse proxy (", options: { color: MUTE } },
      { text: "/api/", options: { color: TEAL, bold: true } },
      { text: " → backend, ", options: { color: MUTE } },
      { text: "/ml/", options: { color: TEAL, bold: true } },
      { text: " → ML service).", options: { color: MUTE } },
    ],
    { x: 0.95, y: 5.3, w: 11.0, h: 1.05, fontFace: FONT_BODY, fontSize: 13, margin: 0, lineSpacingMultiple: 1.3 }
  );
  pageNum(s, 4);
}

// ================= SLIDE 5 — DATASET =================
{
  const s = darkSlide();
  kicker(s, "Training Data", { dark: true });
  title(s, "CICDDoS2019", { dark: true });
  s.addText("Canadian Institute for Cybersecurity, University of New Brunswick", { x: 0.6, y: 1.25, w: 10, h: 0.4, fontFace: FONT_BODY, fontSize: 13, color: "AEBBD4", margin: 0 });

  statCard(s, 0.7, 2.2, 2.75, 2.0, "2", "capture days pooled\nfor training", TEAL);
  statCard(s, 3.65, 2.2, 2.75, 2.0, "3", "attack types modeled:\nSyn, UDP, NetBIOS", TEAL);
  statCard(s, 6.6, 2.2, 2.75, 2.0, "145", "MSSQL rows total —\nexcluded (too few to train)", RED);
  statCard(s, 9.55, 2.2, 2.75, 2.0, "4", "classes in the\nfinal model incl. Benign", TEAL);

  s.addText(
    "Each capture day uses slightly different label names for the same attack (e.g. training-day “UDP” vs. testing-day “DrDoS_UDP”) — normalized before training.",
    { x: 0.7, y: 4.6, w: 11.6, h: 0.7, fontFace: FONT_BODY, fontSize: 13, color: "C7D4E8", margin: 0, lineSpacingMultiple: 1.3 }
  );
  pageNum(s, 5);
}

// ================= SLIDE 6 — FEATURE ENGINEERING =================
{
  const s = lightSlide();
  kicker(s, "Feature Engineering");
  title(s, "11 flow-level features, shared by training & live traffic");
  const feats = [
    "Flow Duration", "Total Fwd Packets", "Total Backward Packets",
    "Fwd Packets Length Total", "Bwd Packets Length Total", "Flow Bytes/s",
    "Flow Packets/s", "SYN Flag Count", "ACK Flag Count",
    "Packet Length Mean", "Flow IAT Mean",
  ];
  let fx = 0.7, fy = 2.05;
  feats.forEach((f, i) => {
    s.addShape("roundRect", { x: fx, y: fy, w: 3.55, h: 0.55, rectRadius: 0.06, fill: { color: LIGHT }, line: { color: "E4E9F1", width: 1 } });
    s.addText(f, { x: fx + 0.15, y: fy, w: 3.25, h: 0.55, valign: "middle", fontFace: FONT_BODY, fontSize: 11.5, color: INK, margin: 0 });
    fy += 0.68;
    if ((i + 1) % 6 === 0) { fx += 3.85; fy = 2.05; }
  });
  s.addShape("roundRect", { x: 8.45, y: 2.05, w: 4.15, h: 4.6, rectRadius: 0.1, fill: { color: NAVY }, line: { type: "none" } });
  s.addText("Same contract, both sides", { x: 8.75, y: 2.35, w: 3.6, h: 0.4, fontFace: FONT_BODY, fontSize: 12, bold: true, color: TEAL, margin: 0 });
  s.addText(
    "Live packets are grouped into a bidirectional 5-tuple flow (src/dst IP + port, protocol), windowed every 5 seconds, and reduced to these exact 11 columns — identical to what the model saw during training.",
    { x: 8.75, y: 2.85, w: 3.6, h: 3.6, fontFace: FONT_BODY, fontSize: 13, color: "DCE5F2", margin: 0, lineSpacingMultiple: 1.35 }
  );
  pageNum(s, 6);
}

// ================= SLIDE 7 — MODEL TRAINING =================
{
  const s = lightSlide();
  kicker(s, "Model Training");
  title(s, "Random Forest, pooled and stratified");
  const rows = [
    ["⚙", "RandomForestClassifier", "150 trees, max depth 15, min_samples_split 5, class_weight=“balanced”."],
    ["⇄", "Pooled + re-split", "Both capture days pooled, then an 80/20 stratified split — not the dataset's native day-based split."],
    ["✓", "Cross-validated", "5-fold stratified cross-validation on the training set as a sanity check before the final fit."],
  ];
  let y = 2.1;
  rows.forEach((r) => { iconRow(s, 0.7, y, 6.6, r[0], r[1], r[2], { circleColor: NAVY }); y += 1.25; });

  s.addShape("roundRect", { x: 7.7, y: 2.1, w: 5.0, h: 3.75, rectRadius: 0.1, fill: { color: LIGHT }, line: { color: "E4E9F1", width: 1 } });
  s.addText("Why Random Forest?", { x: 8.0, y: 2.35, w: 4.4, h: 0.35, fontFace: FONT_HEAD, fontSize: 14, bold: true, color: INK, margin: 0 });
  s.addText(
    "Strong baseline on tabular, mixed-scale flow features · resistant to overfitting vs. a single tree · built-in feature importance to explain alerts · fast enough for near-real-time scoring.",
    { x: 8.0, y: 2.8, w: 4.4, h: 2.9, fontFace: FONT_BODY, fontSize: 13, color: MUTE, margin: 0, lineSpacingMultiple: 1.35 }
  );
  pageNum(s, 7);
}

// ================= SLIDE 8 — RESULTS =================
{
  const s = darkSlide();
  kicker(s, "Held-out Test Split", { dark: true });
  title(s, "99.64% accuracy on pooled, stratified test data", { dark: true });
  const stats = [["99.64%", "Accuracy"], ["99.65%", "Precision (weighted)"], ["99.64%", "Recall (weighted)"], ["99.64%", "F1 Score (weighted)"]];
  const w = 2.75, gap = 0.28, startX = 0.7;
  stats.forEach((st, i) => statCard(s, startX + i * (w + gap), 2.3, w, 2.15, st[0], st[1], TEAL));
  s.addText(
    "Classes evaluated: Benign, Syn, UDP, NetBIOS. MSSQL excluded from training (145 rows total; a pooled experiment confirmed only 27% F1 — too noisy to trust).",
    { x: 0.7, y: 4.85, w: 11.6, h: 0.7, fontFace: FONT_BODY, fontSize: 13, color: "C7D4E8", margin: 0, lineSpacingMultiple: 1.3 }
  );
  pageNum(s, 8);
}

// ================= SLIDE 9 — BACKEND & ALERTING =================
{
  const s = lightSlide();
  kicker(s, "Backend");
  title(s, "FastAPI backend turns predictions into incidents");
  const rows = [
    ["A", "Auth & RBAC", "JWT authentication with three roles: Admin, Security Analyst, Viewer."],
    ["⚠", "AlertEngine", "Opens an Incident when the predicted label is non-benign and confidence + packet-rate thresholds are crossed — graded medium / high / critical."],
    ["M", "Mitigation", "Analysts can trigger a (simulated) mitigation action against an incident's source IP."],
  ];
  let y = 2.05;
  rows.forEach((r) => { iconRow(s, 0.7, y, 11.6, r[0], r[1], r[2], { circleColor: NAVY }); y += 1.15; });
  s.addShape("roundRect", { x: 0.7, y: 5.6, w: 11.6, h: 1.0, rectRadius: 0.08, fill: { color: LIGHT }, line: { color: "E4E9F1", width: 1 } });
  s.addText(
    [
      { text: "Data model:  ", options: { bold: true, color: INK } },
      { text: "User · Role · Flow · Prediction · Incident · MitigationAction · ModelVersion · SystemSetting", options: { color: MUTE } },
    ],
    { x: 0.95, y: 5.6, w: 11.1, h: 1.0, valign: "middle", fontFace: FONT_BODY, fontSize: 13, margin: 0 }
  );
  pageNum(s, 9);
}

// ================= SLIDE 10 — DASHBOARD =================
{
  const s = lightSlide();
  kicker(s, "Frontend");
  title(s, "A React dashboard for security analysts");
  s.addText("React 19 + TypeScript + Vite + Recharts — all pages consume live backend data via Axios, not mock data.", { x: 0.7, y: 1.35, w: 11.5, h: 0.4, fontFace: FONT_BODY, fontSize: 13, color: MUTE, margin: 0 });
  const pages = [
    ["D", "Dashboard", "Severity distribution & incidents-over-time"],
    ["A", "Analytics", "Traffic and detection trend analysis"],
    ["!", "Incidents", "Open / mitigated incident queue"],
    ["T", "Threat Hunting", "Search and investigate flows"],
    ["R", "Reports", "Exportable summaries (jsPDF)"],
    ["⚙", "Settings", "Thresholds & mitigation interface"],
  ];
  let px = 0.7, py = 2.05;
  pages.forEach((p, i) => {
    s.addShape("roundRect", { x: px, y: py, w: 3.75, h: 1.55, rectRadius: 0.1, fill: { color: LIGHT }, line: { color: "E4E9F1", width: 1 } });
    s.addShape("ellipse", { x: px + 0.25, y: py + 0.25, w: 0.55, h: 0.55, fill: { color: NAVY }, line: { type: "none" } });
    s.addText(p[0], { x: px + 0.25, y: py + 0.25, w: 0.55, h: 0.55, align: "center", valign: "middle", fontFace: FONT_BODY, fontSize: 18, bold: true, color: WHITE, margin: 0 });
    s.addText(p[1], { x: px + 0.25, y: py + 0.9, w: 3.3, h: 0.3, fontFace: FONT_HEAD, fontSize: 13.5, bold: true, color: INK, margin: 0 });
    s.addText(p[2], { x: px + 0.25, y: py + 1.18, w: 3.3, h: 0.35, fontFace: FONT_BODY, fontSize: 10.5, color: MUTE, margin: 0 });
    px += 4.05;
    if ((i + 1) % 3 === 0) { px = 0.7; py += 1.85; }
  });
  pageNum(s, 10);
}

// ================= SLIDE 11 — CHALLENGES & FIXES =================
{
  const s = lightSlide();
  kicker(s, "Real Engineering Work");
  title(s, "Three integration gaps found — and closed");
  const cards = [
    ["Distribution shift", "Training on day 1 / testing on day 2 gave 0% Syn recall despite 99.75% CV accuracy.", "Pooled both days, then re-split 80/20 stratified. Syn recall: 0.00 → 1.00."],
    ["Feature-schema mismatch", "The live feature extractor produced a different column set than the trained model expected.", "Rebuilt it to compute the exact same 11 CICFlowMeter-style features, per bidirectional flow."],
    ["No path to the dashboard", "A working /alerts/evaluate endpoint existed, but nothing ever called it — incidents needed manual entry.", "Added ml/pipeline.py: scores flows and posts them to the backend automatically."],
  ];
  const w = 3.83, gap = 0.15, startX = 0.7, y = 2.1, h = 4.2;
  cards.forEach((c, i) => {
    const x = startX + i * (w + gap);
    s.addShape("roundRect", { x, y, w, h, rectRadius: 0.1, fill: { color: NAVY }, line: { type: "none" } });
    s.addShape("roundRect", { x: x + 0.28, y: y + 0.3, w: 0.5, h: 0.5, rectRadius: 0.08, fill: { color: RED }, line: { type: "none" } });
    s.addText(String(i + 1), { x: x + 0.28, y: y + 0.3, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: FONT_HEAD, fontSize: 16, bold: true, color: WHITE, margin: 0 });
    s.addText(c[0], { x: x + 0.28, y: y + 0.95, w: w - 0.56, h: 0.65, fontFace: FONT_HEAD, fontSize: 15.5, bold: true, color: WHITE, margin: 0 });
    s.addText("PROBLEM", { x: x + 0.28, y: y + 1.65, w: w - 0.56, h: 0.25, fontFace: FONT_BODY, fontSize: 9.5, bold: true, color: RED, margin: 0, charSpacing: 1 });
    s.addText(c[1], { x: x + 0.28, y: y + 1.9, w: w - 0.56, h: 1.05, fontFace: FONT_BODY, fontSize: 11, color: "C7D4E8", margin: 0, lineSpacingMultiple: 1.25 });
    s.addText("FIX", { x: x + 0.28, y: y + 2.95, w: w - 0.56, h: 0.25, fontFace: FONT_BODY, fontSize: 9.5, bold: true, color: TEAL, margin: 0, charSpacing: 1 });
    s.addText(c[2], { x: x + 0.28, y: y + 3.2, w: w - 0.56, h: 0.95, fontFace: FONT_BODY, fontSize: 11, color: WHITE, margin: 0, lineSpacingMultiple: 1.25 });
  });
  pageNum(s, 11);
}

// ================= SLIDE 12 — DEPLOYMENT =================
{
  const s = lightSlide();
  kicker(s, "Deployment");
  title(s, "One-command local stack via Docker Compose");
  const svcs = [
    ["P", "PostgreSQL", "Persists flows, predictions, incidents, mitigation actions"],
    ["⚡", "FastAPI Backend", "Auth, alerting, incident & model-version APIs"],
    ["M", "ML Service", "Standalone /predict microservice for the trained model"],
    ["N", "Nginx", "Reverse proxy — /api/ → backend, /ml/ → ML service"],
  ];
  const gridX = [0.7, 6.8], colW = 5.85;
  svcs.forEach((sv, i) => {
    const sx = gridX[i % 2];
    const sy = 2.15 + Math.floor(i / 2) * 1.4;
    s.addShape("roundRect", { x: sx, y: sy, w: colW, h: 1.15, rectRadius: 0.08, fill: { color: LIGHT }, line: { color: "E4E9F1", width: 1 } });
    s.addShape("ellipse", { x: sx + 0.25, y: sy + 0.3, w: 0.55, h: 0.55, fill: { color: TEAL }, line: { type: "none" } });
    s.addText(sv[0], { x: sx + 0.25, y: sy + 0.3, w: 0.55, h: 0.55, align: "center", valign: "middle", fontFace: FONT_BODY, fontSize: 16, bold: true, color: NAVY, margin: 0 });
    s.addText(sv[1], { x: sx + 0.95, y: sy + 0.18, w: colW - 1.05, h: 0.35, fontFace: FONT_HEAD, fontSize: 14, bold: true, color: INK, margin: 0 });
    s.addText(sv[2], { x: sx + 0.95, y: sy + 0.55, w: colW - 1.05, h: 0.5, fontFace: FONT_BODY, fontSize: 11, color: MUTE, margin: 0 });
  });
  pageNum(s, 12);
}

// ================= SLIDE 13 — FUTURE WORK =================
{
  const s = lightSlide();
  kicker(s, "What's Next");
  title(s, "Future work");
  const items = [
    ["01", "Persist per-class metrics & the confusion matrix alongside the model bundle."],
    ["02", "Train the remaining CICDDoS2019 attack types (DNS, LDAP, NTP, SNMP, SSDP, UDPLag)."],
    ["03", "Validate the fixed pipeline against real traffic on the two-VM lab (Ubuntu + Kali)."],
    ["04", "Replace simulated mitigation with real, sandboxed firewall-rule integration."],
    ["05", "Add model-drift monitoring to catch distribution shifts automatically."],
  ];
  let y = 2.1;
  items.forEach((it) => {
    s.addText(it[0], { x: 0.7, y, w: 0.9, h: 0.8, fontFace: FONT_HEAD, fontSize: 24, bold: true, color: TEAL, margin: 0 });
    s.addText(it[1], { x: 1.65, y: y + 0.06, w: 10.6, h: 0.7, valign: "middle", fontFace: FONT_BODY, fontSize: 14, color: INK, margin: 0 });
    s.addShape("line", { x: 0.7, y: y + 0.85, w: 11.6, h: 0, line: { color: "E4E9F1", width: 1 } });
    y += 1.0;
  });
  pageNum(s, 13);
}

// ================= SLIDE 14 — CONCLUSION =================
{
  const s = darkSlide();
  kicker(s, "Conclusion", { dark: true });
  s.addText("A genuine end-to-end vertical slice", { x: 0.9, y: 1.5, w: 11, h: 0.9, fontFace: FONT_HEAD, fontSize: 34, bold: true, color: WHITE, margin: 0 });
  s.addText(
    "Capture → flow features → a 99.64%-accurate Random Forest classifier → a role-based alerting backend → a live analyst dashboard. Beyond building each layer, this project diagnosed and closed the real gaps between them.",
    { x: 0.9, y: 2.55, w: 9.8, h: 1.6, fontFace: FONT_BODY, fontSize: 16, color: "C7D4E8", margin: 0, lineSpacingMultiple: 1.4 }
  );
  s.addShape("roundRect", { x: 0.9, y: 4.5, w: 11.0, h: 1.7, rectRadius: 0.1, fill: { color: NAVY_2 }, line: { type: "none" } });
  s.addText("Thank you — questions?", { x: 0.9, y: 4.5, w: 11.0, h: 1.7, align: "center", valign: "middle", fontFace: FONT_HEAD, fontSize: 22, bold: true, color: TEAL, margin: 0 });
  pageNum(s, 14);
}

pres.writeFile({ fileName: "/tmp/render1/Presentation.pptx" }).then(() => {
  console.log("DONE");
});
