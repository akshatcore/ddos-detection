# Presentation Outline — ML-Based DDoS Detection System
*(To be built as a .pptx once environment access is back — draft content below)*

**Slide 1 — Title**
ML-Based DDoS Detection System
[Your Name] · [Roll No.] · Symbiosis Institute of Technology, Nagpur
Guide: [Guide Name] · [Semester/Year]

**Slide 2 — Problem Statement**
- DDoS attacks flood targets until legitimate traffic can't get through
- Signature/threshold defenses struggle against attacks that mimic normal traffic shape
- Need: passive capture → real-time classification → analyst-actionable alert

**Slide 3 — Objectives**
- Capture live network traffic
- Extract flow-level features in near real time
- Train & evaluate an ML classifier on a public DDoS dataset
- Serve predictions, alert on attacks, manage incidents
- Provide a role-based analyst dashboard

**Slide 4 — System Architecture** *(use the pipeline diagram from docs/PBL_Report.md §5)*
Capture → Feature Extraction → ML Model → Backend (alerts/incidents) → Dashboard

**Slide 5 — Dataset**
- CICDDoS2019 (CIC/UNB), Parquet flow exports, 2 capture days
- Attack types modeled: SYN flood, UDP flood, NetBIOS amplification + Benign
- MSSQL excluded (only 145 rows — insufficient for reliable training)

**Slide 6 — Feature Engineering**
- 11 CICFlowMeter-style features: Flow Duration, Fwd/Bwd packet & byte totals,
  Flow Bytes/s & Packets/s, SYN/ACK flag counts, Packet Length Mean, Flow IAT Mean
- Same features computed live from captured packets, per bidirectional flow, per 5s window

**Slide 7 — Model Training**
- RandomForestClassifier (150 trees, max_depth 15, class_weight="balanced")
- Pooled + stratified 80/20 split (not the dataset's native day-based split — see Slide 10)
- 5-fold stratified cross-validation before final fit

**Slide 8 — Results**
- Accuracy 99.64% · Precision 99.65% · Recall 99.64% · F1 99.64%
- Classes: Benign, Syn, UDP, NetBIOS (held-out test split)

**Slide 9 — Backend & Alerting**
- FastAPI + SQLAlchemy + JWT auth, role-based access (Admin/Analyst/Viewer)
- AlertEngine: confidence + packet-rate thresholds → severity-graded Incidents
- Simulated mitigation actions per incident

**Slide 10 — Dashboard**
- React 19 + TypeScript + Recharts: Dashboard, Analytics, Incidents,
  Threat Hunting, Reports, Settings — all backed by live API data

**Slide 11 — Challenges & Fixes**
1. Day-shift distribution break (0% Syn recall) → pooled + re-split the data
2. Feature-schema mismatch silently broke capture→model handoff → rebuilt
   the extractor to match the model's exact 11 features
3. No automatic path from detection to dashboard → added pipeline.py to
   close the loop via POST /alerts/evaluate

**Slide 12 — Deployment**
- Docker Compose: PostgreSQL + FastAPI backend + ML service + Nginx reverse proxy
- `docker-compose up` for one-command local stack

**Slide 13 — Future Work**
- Persist per-class metrics/confusion matrix with the model
- Train remaining CICDDoS2019 attack types
- Validate fixed pipeline against real two-VM lab traffic
- Real (sandboxed) mitigation instead of simulation
- Model-drift monitoring

**Slide 14 — Conclusion / Thank You**
- Working end-to-end ML DDoS detection: capture → features → model → alerting → dashboard
- Closed real integration gaps, not just built isolated components
- Questions?
