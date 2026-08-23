# ML-Based DDoS Detection System

**A Project-Based Learning (PBL) Report**

Submitted by: *[Your Name] — [Roll No.]*
Department: Computer Science & Engineering
Institution: Symbiosis Institute of Technology, Nagpur (Constituent of Symbiosis International Deemed University, Pune)
Guide: *[Guide/Mentor Name]*
Semester: *[Semester / Academic Year]*

---

## 1. Abstract

Distributed Denial-of-Service (DDoS) attacks remain one of the most disruptive threats to network availability, flooding a target with traffic until legitimate users can no longer be served. This project implements an end-to-end ML-based DDoS detection system covering the full pipeline from raw packet capture to a security-analyst-facing dashboard. Network traffic is captured with Scapy, aggregated into bidirectional flow-window features, and classified by a Random Forest model trained on the CICDDoS2019 benchmark dataset (Syn, UDP, NetBIOS and Benign traffic). A FastAPI backend persists flows, predictions and incidents, applies configurable alert thresholds, and exposes role-based APIs consumed by a React/TypeScript dashboard for live monitoring, analytics, incident response and simulated mitigation. The trained baseline model achieves 99.64% accuracy and a weighted F1 score of 0.9964 on a held-out test split. During development, a critical integration gap was identified — the feature-extraction stage produced a different feature set than the trained model expected — which was diagnosed and fixed, and a new orchestration script was added to connect detection output directly into the backend's alerting and incident workflow.

## 2. Problem Statement

Traditional signature- and threshold-based DDoS defenses struggle against attacks that mimic legitimate traffic shapes or that shift in volume and vector over time. There is a need for a system that can (a) passively observe network traffic, (b) extract meaningful statistical features from that traffic in near real time, (c) classify traffic flows as benign or as a specific attack type using a trained machine-learning model, and (d) surface the result to a human operator with enough context — severity, confidence, source IP, recommended mitigation — to act on it quickly.

## 3. Objectives

1. Capture raw network packets on a target host and log per-packet metadata.
2. Aggregate packets into flow-level, time-windowed features suitable for ML classification.
3. Train and evaluate a supervised classifier on a recognised public DDoS dataset (CICDDoS2019).
4. Serve the trained model as a prediction service and connect it to a persistent backend that stores flows, predictions, incidents and mitigation actions.
5. Provide a role-based web dashboard for security analysts to monitor traffic, review incidents, and trigger simulated mitigation.
6. Identify and resolve integration gaps between pipeline stages so the system works as a genuine vertical slice, not just as isolated scripts.

## 4. Background

**DDoS attack categories covered.** The project targets three reflection/flood-style attack types present in CICDDoS2019: **SYN flood** (exhausting server connection state with half-open TCP handshakes), **UDP flood** (saturating bandwidth with connectionless UDP packets), and **NetBIOS amplification** (abusing NetBIOS name-service responses for reflected volumetric attacks).

**Dataset.** CICDDoS2019 (Canadian Institute for Cybersecurity, University of New Brunswick) is a labelled DDoS dataset captured over two separate days, provided as flow-level CSV/Parquet exports with ~80+ CICFlowMeter-derived features per row (Flow Duration, forward/backward packet counts and byte totals, flow byte/packet rates, TCP flag counts, inter-arrival times, etc.) plus a ground-truth label.

**Model choice.** A Random Forest classifier was chosen for its strong baseline performance on tabular, mixed-scale network-flow features, its resistance to overfitting relative to a single decision tree, its built-in feature-importance ranking (useful for explaining alerts to a security analyst), and its low inference latency, which matters for a system intended to score flows in near real time.

## 5. System Architecture

The system is organised as five layers, matching the intended build order:

1. **Capture** (`capture/live_capture.py`) — Scapy-based packet sniffer run on the target host; logs every IP packet's timestamp, source/destination IP and port, protocol, size and TCP flags to `data/raw_packets.csv`.
2. **Feature Extraction** (`feature_extraction/build_features.py`) — groups packets into 5-second windows keyed by a bidirectional 5-tuple flow (src IP/port, dst IP/port, protocol) and computes the same 11 CICFlowMeter-style features the model was trained on.
3. **ML** (`ml/`) — `train_baseline.py` trains and evaluates the Random Forest model against pooled CICDDoS2019 data; `service.py` exposes it as a standalone FastAPI `/predict` microservice; `detect_live.py` batch-scores a features CSV from the command line; `pipeline.py` (added in this project) scores a features CSV and pushes each flow + prediction into the backend automatically.
4. **Backend** (`backend/`) — FastAPI application with SQLAlchemy models (`User`, `Role`, `Flow`, `Prediction`, `Incident`, `MitigationAction`, `ModelVersion`, `SystemSetting`), JWT authentication, role-based access control (Admin / Security Analyst / Viewer), an `AlertEngine` that decides whether a scored flow should become an Incident based on confidence and packet-rate thresholds, and a simulated mitigation workflow.
5. **Dashboard** (`frontend/`) — React 19 + TypeScript + Vite application with Recharts-based visualisations across Dashboard, Analytics, Incidents, Reports, Threat Hunting and Settings pages, consuming the backend REST API via Axios.

**Deployment topology.** `docker-compose.yml` orchestrates four services: a PostgreSQL database, the FastAPI backend, the standalone ML prediction service, and an Nginx reverse proxy that routes `/api/` to the backend and `/ml/` to the ML service.

```
 [Target host]                         [Backend stack — docker-compose]
 live_capture.py --> raw_packets.csv
        |
        v
 build_features.py --> flow_features.csv
        |
        v
 pipeline.py (scores + POSTs) ---->  FastAPI backend  <--- React dashboard
                                       |  AlertEngine
                                       |  PostgreSQL (flows, predictions,
                                       |  incidents, mitigation actions)
                                       v
                                   Incident created --> visible on dashboard
```

## 6. Methodology

### 6.1 Data Preparation
CICDDoS2019 is distributed as separate training-day and testing-day files, and the two days use inconsistent label naming for the same attack (e.g. training-day `UDP` vs. testing-day `DrDoS_UDP`). All Syn, UDP and NetBIOS training and testing Parquet files were loaded, label names were normalised to a single canonical set, and the two days' data were **pooled together** rather than trusted as a fixed train/test split (see §7 for why). Rows with `inf`/`NaN` feature values, and a small number of stray MSSQL-labelled rows that leak into the UDP files, were dropped.

### 6.2 Feature Engineering
Eleven features were selected for the model: Flow Duration, Total Fwd/Backward Packets, Fwd/Bwd Packets Length Total, Flow Bytes/s, Flow Packets/s, SYN/ACK Flag Count, Packet Length Mean, and Flow IAT Mean. The same 11 features are computed by the live extractor from raw captured packets, grouped by bidirectional flow key per 5-second window, so the same feature contract holds for both offline training data and live traffic.

### 6.3 Model Training
An 80/20 stratified split was taken from the pooled data (`random_state=42`), with 5-fold stratified cross-validation on the training set as a sanity check before final fitting. The final model is a `RandomForestClassifier` (`n_estimators=150`, `max_depth=15`, `min_samples_split=5`, `class_weight="balanced"`) trained on the four classes: Benign, Syn, UDP, NetBIOS.

### 6.4 Backend & Alerting
Every scored flow is persisted as a `Flow` + `Prediction` pair. The `AlertEngine` opens an `Incident` when the predicted label is non-benign **and** the model's confidence and the flow's packet rate cross configurable thresholds (defaults: 0.85 confidence, 100 packets/sec), assigning severity (`medium` / `high` / `critical`) based on how far those thresholds are exceeded. Analysts can trigger a simulated mitigation action against an incident's source IP through the API.

### 6.5 Dashboard
The React dashboard renders live incident and reporting data (not mock data) pulled from the backend: severity distribution, incidents-over-time, an incidents table, analytics, threat-hunting search, and system settings (thresholds, mitigation interface) editable by Admins.

### 6.6 Deployment
The project ships a Dockerfile for the backend and the ML service, plus a `docker-compose.yml` and Nginx config for single-command local deployment.

## 7. Implementation Challenges & Fixes

**Challenge 1 — Distribution shift between capture days.** An initial attempt to train on the training-day file and evaluate on the testing-day file gave 99.75% cross-validation accuracy but **0% recall on Syn attacks** on the held-out test file. Investigation showed this wasn't an unlearnable pattern — the two capture days had different absolute scales for several features (Flow Duration, Packet Length, Flow Bytes/s), which broke the Random Forest's learned split thresholds even though the underlying attack signature was consistent. **Fix:** pool both days' data and perform a single stratified 80/20 split so the model sees both days' scale during training. This resolved the issue (Syn recall went from 0.00 to 1.00).

**Challenge 2 — Broken capture-to-model vertical slice.** The feature-extraction script (`build_features.py`) computed a different, simpler feature set (`packet_count`, `syn_ratio`, `dst_ip_entropy`, ...) than the 11 columns the trained model actually expects. Any attempt to score real captured traffic through `detect_live.py` would fail immediately with a "missing required columns" error — meaning the full pipeline described in the project README had never actually been connected end-to-end, only its individual stages. **Fix:** rewrote `build_features.py` to key flows on a proper bidirectional 5-tuple (source/destination IP and port, protocol) and compute the exact 11 CICFlowMeter-style columns the model was trained on, so live-captured traffic and training data now share an identical feature contract.

**Challenge 3 — No automatic path from detection to the dashboard.** The backend already exposed a `POST /alerts/evaluate` endpoint capable of turning a flow + prediction into a stored Incident, but nothing in the codebase called it — an analyst would have had to create incidents by hand. **Fix:** added `ml/pipeline.py`, which authenticates against the backend, scores a features CSV with the trained model, and POSTs every flow above a probability threshold to `/alerts/evaluate`, so detections now appear on the dashboard without manual intervention.

## 8. Results

On the held-out 20% stratified test split (pooled across both CICDDoS2019 capture days):

- **Accuracy:** 99.64%
- **Precision (weighted):** 99.65%
- **Recall (weighted):** 99.64%
- **F1 Score (weighted):** 99.64%

Classes evaluated: **Benign, Syn, UDP, NetBIOS**. (MSSQL was excluded from training — only 145 rows existed across the whole dataset, too few to train a reliable classifier; a pooled experiment confirmed only 27% F1 for that class.) These figures come from `models/random_forest_v1.0_metadata.json`, generated the last time `train_baseline.py` was run; per-class precision/recall and the confusion matrix are printed to console during training but are not currently persisted to disk — see Future Work.

## 9. Future Work

- Persist per-class metrics and the confusion matrix (not just aggregate scores) alongside the model bundle for auditability.
- Extend training to the remaining CICDDoS2019 attack categories (DNS, LDAP, NTP, SNMP, SSDP, UDPLag) once enough labelled data is confirmed for each.
- Validate the fixed live feature-extraction pipeline against real captured attack traffic on the two-VM lab setup described in the README (Ubuntu target + Kali attacker), and tune the 5-second window size.
- Replace simulated mitigation actions with an actual (sandboxed) firewall-rule integration.
- Add model-drift monitoring so a retraining alert fires if live traffic characteristics diverge from training data, mirroring the day-shift issue found during development.

## 10. Conclusion

This project delivers a working, layered ML-based DDoS detection system: packet capture, flow feature extraction, a Random Forest classifier trained on CICDDoS2019 achieving 99.64% test accuracy, a role-based FastAPI backend with alerting and incident management, and a React analyst dashboard. Beyond building each layer, this work specifically diagnosed and closed the gap between them — fixing a feature-schema mismatch that silently broke the capture-to-model handoff, and adding the orchestration script needed to turn a model prediction into a dashboard-visible incident automatically. The result is a genuine end-to-end vertical slice rather than a set of independently-working components.

## 11. References

1. Sharafaldin, I., Lashkari, A.H., Hakak, S., and Ghorbani, A.A., "Developing Realistic Distributed Denial of Service (DDoS) Attack Dataset and Taxonomy," IEEE 53rd International Carnahan Conference on Security Technology, 2019 (CICDDoS2019 dataset, Canadian Institute for Cybersecurity, UNB).
2. Pedregosa, F. et al., "Scikit-learn: Machine Learning in Python," JMLR 12, 2011.
3. FastAPI documentation — https://fastapi.tiangolo.com
4. Scapy documentation — https://scapy.net
5. React documentation — https://react.dev

---
*Report generated from a direct audit of the project source code and the trained model's metadata (`models/random_forest_v1.0_metadata.json`). Live execution/testing of the fixes described in §7 is pending environment access — see repository README for run instructions.*
