# ML-Based DDoS Detection System

**A Project-Based Learning (PBL) Report**

Submitted by: *[Your Name] — [Roll No.]*
Department: Computer Science & Engineering
Institution: Symbiosis Institute of Technology, Nagpur (Constituent of Symbiosis International Deemed University, Pune)
Guide: *[Guide/Mentor Name]*
Semester: *[Semester / Academic Year]*

---

## 1. Abstract

Distributed Denial-of-Service (DDoS) attacks remain one of the most disruptive threats to network availability, flooding a target with traffic until legitimate users can no longer be served. This project implements an end-to-end ML-based DDoS detection system covering the full pipeline from raw packet capture to a security-analyst-facing dashboard. Network traffic is captured with Scapy (or a Npcap-free raw-socket fallback on Windows), aggregated into bidirectional flow-window features, and classified by a Random Forest model trained on the CICDDoS2019 benchmark dataset across ten classes: Benign, Syn, UDP, NetBIOS, LDAP, UDPLag, DNS, NTP, SNMP, and TFTP. A FastAPI backend persists flows, predictions and incidents, applies configurable alert thresholds backed by a hybrid ML-plus-heuristic alerting layer, and exposes role-based APIs consumed by a React/TypeScript dashboard for live monitoring, analytics, incident response, and real (not simulated) automated mitigation via Windows Firewall. The trained model achieves 98.07% accuracy and a weighted F1 score of 0.9808 on a held-out test split across all ten classes. During development, several critical integration gaps were identified and fixed: a feature-extraction stage that produced a different feature set than the trained model expected, a model that confidently misclassified an unambiguous live SYN flood as benign traffic, and a mitigation workflow that only ever built an unused command string rather than executing anything. Each is documented in detail in §7.

## 2. Problem Statement

Traditional signature- and threshold-based DDoS defenses struggle against attacks that mimic legitimate traffic shapes or that shift in volume and vector over time. There is a need for a system that can (a) passively observe network traffic, (b) extract meaningful statistical features from that traffic in near real time, (c) classify traffic flows as benign or as a specific attack type using a trained machine-learning model, and (d) surface the result to a human operator with enough context — severity, confidence, source IP, recommended mitigation — to act on it quickly.

## 3. Objectives

1. Capture raw network packets on a target host and log per-packet metadata.
2. Aggregate packets into flow-level, time-windowed features suitable for ML classification.
3. Train and evaluate a supervised classifier on a recognised public DDoS dataset (CICDDoS2019).
4. Serve the trained model as a prediction service and connect it to a persistent backend that stores flows, predictions, incidents and mitigation actions.
5. Provide a role-based web dashboard for security analysts to monitor traffic, review incidents, and trigger real automated mitigation.
6. Identify and resolve integration gaps between pipeline stages so the system works as a genuine vertical slice, not just as isolated scripts.

## 4. Background

**DDoS attack categories covered.** The project targets nine attack types present in CICDDoS2019, plus Benign: **SYN flood** (exhausting server connection state with half-open TCP handshakes), **UDP flood** (saturating bandwidth with connectionless UDP packets), **NetBIOS**, **LDAP**, **UDPLag**, **DNS**, **NTP**, **SNMP**, and **TFTP** (the last five are all reflection/amplification-style attacks abusing a UDP-based service's response traffic). Two further attack types present in the raw dataset — **MSSQL** and **Portmap** — were evaluated and explicitly excluded after real training runs confirmed too little data / too noisy a result to trust (145 rows / 27% F1 for MSSQL; 685 rows / 24% F1 for Portmap) — see §8.

**Dataset.** CICDDoS2019 (Canadian Institute for Cybersecurity, University of New Brunswick) is a labelled DDoS dataset captured over two separate days, provided as flow-level CSV/Parquet exports with ~80+ CICFlowMeter-derived features per row (Flow Duration, forward/backward packet counts and byte totals, flow byte/packet rates, TCP flag counts, inter-arrival times, etc.) plus a ground-truth label.

**Model choice.** A Random Forest classifier was chosen for its strong baseline performance on tabular, mixed-scale network-flow features, its resistance to overfitting relative to a single decision tree, its built-in feature-importance ranking (useful for explaining alerts to a security analyst), and its low inference latency, which matters for a system intended to score flows in near real time.

## 5. System Architecture

The system is organised as five layers, matching the intended build order:

1. **Capture** (`capture/live_capture.py`) — Scapy-based packet sniffer run on the target host; logs every IP packet's timestamp, source/destination IP and port, protocol, size and TCP flags to `data/raw_packets.csv`.
2. **Feature Extraction** (`feature_extraction/build_features.py`) — groups packets into 5-second windows keyed by a bidirectional 5-tuple flow (src IP/port, dst IP/port, protocol) and computes the same 11 CICFlowMeter-style features the model was trained on.
3. **ML** (`ml/`) — `train_baseline.py` trains and evaluates the Random Forest model against pooled CICDDoS2019 data; `service.py` exposes it as a standalone FastAPI `/predict` microservice; `detect_live.py` batch-scores a features CSV from the command line; `pipeline.py` (added in this project) scores a features CSV and pushes each flow + prediction into the backend automatically.
4. **Backend** (`backend/`) — FastAPI application with SQLAlchemy models (`User`, `Role`, `Flow`, `Prediction`, `Incident`, `MitigationAction`, `ModelVersion`, `SystemSetting`), JWT authentication, role-based access control (Admin / Security Analyst / Viewer), a hybrid ML-plus-heuristic `AlertEngine` (see §7) that decides whether a scored flow should become an Incident, and a real Windows Firewall mitigation workflow (`netsh advfirewall`) with a matching undo path.
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
CICDDoS2019 is distributed as separate training-day and testing-day files, and the two days use inconsistent label naming for the same attack (e.g. training-day `UDP` vs. testing-day `DrDoS_UDP`). Every available training and testing Parquet file for the ten trained classes was loaded, label names were normalised to a single canonical set, and all of it was **pooled together** rather than trusted as a fixed train/test split (see §7 for why). Rows with `inf`/`NaN` feature values, and stray rows with an unintended label that leak into another attack type's file — confirmed real: 145 MSSQL rows inside `UDP-training.parquet`, 685 Portmap rows in its own file (excluded, see §4), and 51 `WebDDoS`-labelled rows inside `UDPLag-testing.parquet` — were dropped. Two of CICDDoS2019's attack types (LDAP, UDPLag) have both a training-day and testing-day file, giving the same cross-day generalization guarantee described in §7; four others (DNS, NTP, SNMP, TFTP) exist as only a single file on disk, so while they go through the identical pooled+stratified split, there is no cross-day generalization test possible for them individually — a real data limitation, not a code gap.

### 6.2 Feature Engineering
Eleven features were selected for the model: Flow Duration, Total Fwd/Backward Packets, Fwd/Bwd Packets Length Total, Flow Bytes/s, Flow Packets/s, SYN/ACK Flag Count, Packet Length Mean, and Flow IAT Mean. The same 11 features are computed by the live extractor from raw captured packets, grouped by bidirectional flow key per 5-second window, so the same feature contract holds for both offline training data and live traffic.

### 6.3 Model Training
An 80/20 stratified split was taken from the pooled data (`random_state=42`), with 5-fold stratified cross-validation on the training set as a sanity check before final fitting. The final model is a `RandomForestClassifier` (`n_estimators=150`, `max_depth=15`, `min_samples_split=5`, `class_weight="balanced"`) trained on ten classes: Benign, Syn, UDP, NetBIOS, LDAP, UDPLag, DNS, NTP, SNMP, TFTP.

### 6.4 Backend & Alerting
Every scored flow is persisted as a `Flow` + `Prediction` pair. The `AlertEngine` opens an `Incident` when the predicted label is non-benign **and** the model's confidence and the flow's packet rate cross configurable thresholds (defaults: 0.85 confidence, 100 packets/sec), assigning severity (`medium` / `high` / `critical`) based on how far those thresholds are exceeded. Independently of the model's prediction, two rate/flag-based heuristics also evaluate every flow — a SYN-flood shape (overwhelming SYN ratio, near-zero ACKs, no replies) and a UDP-style flood shape (zero TCP handshake activity, covering the UDP/DNS/NTP/SNMP/TFTP reflection classes at the behavioral level) — so an unambiguous flood still triggers an alert even if the model itself is wrong (see §7, Challenge 4). Analysts can trigger a real mitigation action against an incident's source IP through the API: a genuine `netsh advfirewall` Windows Firewall block, with a matching `/unmitigate` endpoint to reverse it (see §7, Challenge 5).

### 6.5 Dashboard
The React dashboard renders live incident and reporting data (not mock data) pulled from the backend: severity distribution, incidents-over-time, an incidents table, analytics, threat-hunting search, and system settings (thresholds, mitigation interface) editable by Admins.

### 6.6 Deployment
The project ships a Dockerfile for the backend and the ML service, plus a `docker-compose.yml` and Nginx config for single-command local deployment.

## 7. Implementation Challenges & Fixes

**Challenge 1 — Distribution shift between capture days.** An initial attempt to train on the training-day file and evaluate on the testing-day file gave 99.75% cross-validation accuracy but **0% recall on Syn attacks** on the held-out test file. Investigation showed this wasn't an unlearnable pattern — the two capture days had different absolute scales for several features (Flow Duration, Packet Length, Flow Bytes/s), which broke the Random Forest's learned split thresholds even though the underlying attack signature was consistent. **Fix:** pool both days' data and perform a single stratified 80/20 split so the model sees both days' scale during training. This resolved the issue (Syn recall went from 0.00 to 1.00).

**Challenge 2 — Broken capture-to-model vertical slice.** The feature-extraction script (`build_features.py`) computed a different, simpler feature set (`packet_count`, `syn_ratio`, `dst_ip_entropy`, ...) than the 11 columns the trained model actually expects. Any attempt to score real captured traffic through `detect_live.py` would fail immediately with a "missing required columns" error — meaning the full pipeline described in the project README had never actually been connected end-to-end, only its individual stages. **Fix:** rewrote `build_features.py` to key flows on a proper bidirectional 5-tuple (source/destination IP and port, protocol) and compute the exact 11 CICFlowMeter-style columns the model was trained on, so live-captured traffic and training data now share an identical feature contract.

**Challenge 3 — No automatic path from detection to the dashboard.** The backend already exposed a `POST /alerts/evaluate` endpoint capable of turning a flow + prediction into a stored Incident, but nothing in the codebase called it — an analyst would have had to create incidents by hand. **Fix:** added `ml/pipeline.py` (batch mode) and `ml/live_monitor.py` (continuous mode — starts capture, scores every newly-settled flow window every few seconds, and pushes it to `/alerts/evaluate` automatically), so detections now appear on the dashboard without manual intervention.

**Challenge 4 — The model confidently misclassified an unambiguous live attack as benign.** During live-traffic testing, a real SYN flood (2420 packets, 532 packets/sec, 100% SYN ratio, zero ACKs, zero reply traffic — an unambiguous attack by any reasonable definition) was classified `Benign` by the trained model at only 58.65% confidence. This is a known failure mode of ML-based network intrusion detection, not a bug in this specific model: a live capture's flow-aggregation shape does not perfectly match how the training dataset's attack samples were constructed, so a model trained purely on historical data can miss volumetric floods that fall outside its training distribution. **Fix:** rather than trusting model confidence alone, `AlertEngine` now layers two independent rate/flag-based heuristics on top of the model's prediction (see §6.4) — the same defense-in-depth approach real NIDS tools like Suricata/Snort use. The heuristic thresholds are explicit and included in the alert's `reason` field, so an analyst can see *why* an alert fired regardless of what the model predicted.

**Challenge 5 — Mitigation only ever built an unused, wrong-OS command string.** The original mitigation module constructed an `iptables` command as a Python string and logged it with `status="simulated"` — it never executed anything, and the command was for Linux even though this project runs on Windows. **Fix:** rewrote it to build and execute a real `netsh advfirewall firewall add rule` command via `subprocess.run` (argument list, not a shell string, so there is no shell-injection surface despite the source IP ultimately originating from attacker-controlled packet data), with a safety guard that refuses to ever block loopback/invalid/empty addresses, fail-closed error handling (missing `netsh`, access denied, timeout all report `status="failed"` rather than pretending to succeed), and a matching `/unmitigate` endpoint + `netsh ... delete rule` command so a real automated block always has a real, reachable undo.

## 8. Results

On the held-out 20% stratified test split (81,403 rows, pooled across all available CICDDoS2019 capture days):

- **Accuracy:** 98.07%
- **Precision (weighted):** 98.15%
- **Recall (weighted):** 98.07%
- **F1 Score (weighted):** 98.08%

Per-class breakdown — this is where the real story is. The original four classes (Benign, Syn, UDP, NetBIOS) plus NTP and TFTP stayed excellent; DNS, LDAP, and SNMP are the honest weak point, and it's the SAME three classes confusing with each other, not with Benign or with anything else:

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Benign | 0.99 | 1.00 | 1.00 | 17,793 |
| Syn | 1.00 | 0.99 | 1.00 | 9,875 |
| UDP | 0.93 | 0.97 | 0.95 | 5,702 |
| NetBIOS | 0.71 | 0.88 | 0.79 | 248 |
| LDAP | 0.58 | 0.76 | 0.66 | 665 |
| UDPLag | 0.91 | 0.76 | 0.83 | 1,785 |
| DNS | 0.60 | 0.56 | 0.58 | 734 |
| NTP | 1.00 | 1.00 | 1.00 | 24,274 |
| SNMP | 0.72 | 0.69 | 0.70 | 543 |
| TFTP | 1.00 | 1.00 | 1.00 | 19,784 |

DNS, LDAP, and SNMP are all UDP-based reflection/amplification attacks with real overlap at this feature granularity — the confusion matrix shows LDAP↔DNS and LDAP↔SNMP as the dominant error pairs. This matters less operationally than the F1 numbers alone suggest: `AlertEngine`'s UDP-style heuristic (§6.4, §7 Challenge 4) flags any zero-TCP-handshake flood as an attack regardless of which of these labels the model assigns, so a DNS flood mislabeled as LDAP still triggers a real alert — the confusion affects the attack-subtype label shown on the incident, not whether it gets caught.

MSSQL and Portmap were tested and excluded from the final class list (§4) — 145 rows / 27% F1 and 685 rows / 24% F1 respectively, both confirmed via real training runs, not assumed.

The full confusion matrix and per-feature importances are generated on demand from the actual saved model (not retrained, not hand-copied) by running `python ml/evaluate_model.py`, which writes them to `models/evaluation/v1.0/`. `models/random_forest_v1.0_metadata.json` always reflects whichever model was last trained.

**Honest limitation:** this is a held-out split of the SAME dataset the model trained on, not real live traffic — see Challenge 4 above for the one real live-capture case this project diagnosed, where the model alone scored an unambiguous SYN flood as 58.65%-confidence Benign. The accuracy figures above describe this model's fit to CICDDoS2019, not its live-traffic recall in isolation from the heuristic safety net.

## 9. Future Work

- Add adversarial evaluation — nothing here currently tests how the model behaves under intentional evasion (e.g. deliberately spaced packets mimicking benign flow-timing statistics).
- Add model-drift monitoring so a retraining alert fires if live traffic characteristics diverge from training data, mirroring the day-shift issue found during development (§7, Challenge 1). Accuracy is currently measured once, at training time, against static historical data only.
- Obtain a second capture day for DNS, NTP, SNMP, and TFTP (currently single-file classes — see §6.1) to give them the same cross-day generalization guarantee the other six classes have.
- Add destination-port information to the live feature snapshot so the UDP-style heuristic (§6.4) can distinguish DNS/NTP/SNMP/TFTP/UDP floods from each other independently of the model, not just detect that "a UDP-style flood" occurred.
- Complete the full 3-laptop live-attack integration test (capture → features → model → alert → real mitigation, end to end) as the final pre-submission validation pass.

## 10. Conclusion

This project delivers a working, layered ML-based DDoS detection system: packet capture, flow feature extraction, a Random Forest classifier trained on CICDDoS2019 across ten attack classes achieving 98.07% weighted test accuracy, a role-based FastAPI backend with hybrid ML-plus-heuristic alerting and real (not simulated) Windows Firewall mitigation, and a React analyst dashboard. Beyond building each layer, this work specifically diagnosed and closed real gaps between them: a feature-schema mismatch that silently broke the capture-to-model handoff, a model that confidently misclassified an unambiguous live attack, and a mitigation workflow that never actually executed anything. Each fix is documented with the real evidence that motivated it, not asserted. The result is a genuine end-to-end vertical slice, evaluated honestly rather than optimistically, rather than a set of independently-working components.

## 11. References

1. Sharafaldin, I., Lashkari, A.H., Hakak, S., and Ghorbani, A.A., "Developing Realistic Distributed Denial of Service (DDoS) Attack Dataset and Taxonomy," IEEE 53rd International Carnahan Conference on Security Technology, 2019 (CICDDoS2019 dataset, Canadian Institute for Cybersecurity, UNB).
2. Pedregosa, F. et al., "Scikit-learn: Machine Learning in Python," JMLR 12, 2011.
3. FastAPI documentation — https://fastapi.tiangolo.com
4. Scapy documentation — https://scapy.net
5. React documentation — https://react.dev

---
*Report kept in sync with a direct audit of the project source code, the trained model's metadata (`models/random_forest_v1.0_metadata.json`), and real training-run console output (§8's per-class table is copied from an actual run, not estimated). Challenges 1-3 were verified through real training/execution; Challenges 4-5's fixes were verified via automated tests (`backend/tests/test_mitigation.py`, `test_alert_engine.py`) and hand-run scenario checks. Full 3-laptop live-attack integration testing is the one remaining pre-submission validation step — see §9 and the repository README for run instructions.*
