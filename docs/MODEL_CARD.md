# Model Card: DDoS Detection RandomForest v1.0

This documents the model actually shipped in this project
(`models/random_forest_v1.0.joblib`), trained by `ml/train_baseline.py`.
All numbers below are the real, saved values from
`models/random_forest_v1.0_metadata.json` and a real training run's console
output - nothing here is estimated or aspirational. Originally trained
2026-07-05 on 4 classes; expanded and retrained since to the 10 classes
listed below.

## Overview

| | |
|---|---|
| Task | Multi-class network-flow classification (DDoS attack type detection) |
| Algorithm | `sklearn.ensemble.RandomForestClassifier` |
| Classes | `Benign`, `Syn`, `UDP`, `NetBIOS`, `LDAP`, `UDPLag`, `DNS`, `NTP`, `SNMP`, `TFTP` |
| Input | 11 CICFlowMeter-style features, computed per 5-second flow window |
| Dataset | CICDDoS2019 (Canadian Institute for Cybersecurity) |
| Version | v1.0 |

## Dataset and the day-split bug

CICDDoS2019 was captured over two separate days: one day producing the
`*-training.parquet` files, a second day producing the `*-testing.parquet`
files, for each attack type. The dataset ships with that as its intended
train/test split.

That fixed day-split was tried first and failed badly: the model reached
99.75% cross-validation accuracy during training, but **Syn attack recall on
the held-out testing-day file was 0.00** - the model missed every single
Syn attack it hadn't seen the previous day's version of.

`ml/diagnose_syn_mismatch.py` (archived, see below) was used to compare
feature distributions between the training-day and testing-day Syn capture
files. It confirmed this wasn't an unlearnable attack pattern - it was a
**distribution shift between the two capture days**, which changed the
absolute scale of several features (`Flow Duration`, packet length stats,
`Flow Bytes/s`) enough to break RandomForest's learned split thresholds,
even though the underlying attack signature was consistent both days.

**Fix** (validated in `ml/train_pooled_experiment.py`, archived, then made
production in `ml/train_baseline.py`): pool the training-day and
testing-day files together for every attack type, then perform our own
stratified random 80/20 split, instead of trusting the dataset's fixed
day-based split. This exposes the model to both capture days during
training. Result:

| Metric | Before (day-split) | After (pooled + stratified split) |
|---|---|---|
| Syn recall | 0.00 | 1.00 |
| UDP recall | - | 0.99 |
| Benign recall | - | 1.00 |

This is the single most consequential decision in this model's history -
without it, the model would not detect the flagship SYN-flood attack type
at all on unseen traffic.

## Classes, and the two that were tested and excluded

`data/cicddos2019/` holds parquet files for more attack types than this
model predicts. `ml/train_baseline.py`'s `ATTACK_TYPES` list covers 9 of
them (`Syn`, `UDP`, `NetBIOS`, `LDAP`, `UDPLag`, `DNS`, `NTP`, `SNMP`,
`TFTP`) plus the inherent `Benign` class - 10 classes total. Two attack
types were tested and explicitly excluded, both for the same reason
(confirmed too small/noisy to trust, not excluded on a hunch):

- **MSSQL** - only 145 total rows across the entire dataset. A pooled
  experiment run against it scored only 27% F1.
- **Portmap** - 685 rows. Included in an initial expansion training run,
  then removed after the real result came back at 17% precision / 40%
  recall / 24% F1 - worse than the MSSQL bar - mostly confused with
  NetBIOS and Syn in the confusion matrix.

`LDAP` and `UDPLag` have both a `-training.parquet` and `-testing.parquet`
file (two capture days), so they get the exact same pooled+stratified
cross-day treatment as the original 3 classes. `DNS`, `NTP`, `SNMP`, and
`TFTP` each have only ONE file on disk - there's no second day to pool for
these specifically, so while they go through the same pooled+stratified
80/20 split as everything else, there's no cross-day generalization test
possible for them individually (see Limitations).

A stray-label filter drops any row whose label isn't one of the intended
classes, wherever it leaks in from - confirmed real during these runs: the
145 MSSQL rows inside `UDP-training.parquet`, the 685 Portmap rows in
`Portmap-training.parquet`, and 51 `WebDDoS` rows found inside
`UDPLag-testing.parquet` (a label never part of this project's intended
attack set at all).

## Features (11, in the order the model expects them)

All CICFlowMeter-style features, computed identically by both
`feature_extraction/build_features.py` (offline) and
`ml/live_monitor.py` (live capture), so training and inference always see
the same feature definitions:

1. `Flow Duration`
2. `Total Fwd Packets`
3. `Total Backward Packets`
4. `Fwd Packets Length Total`
5. `Bwd Packets Length Total`
6. `Flow Bytes/s`
7. `Flow Packets/s`
8. `SYN Flag Count`
9. `ACK Flag Count`
10. `Packet Length Mean`
11. `Flow IAT Mean`

No port numbers, IP addresses, or protocol identity are fed to the model -
only flow-shape statistics. (This matters for the heuristic safety net
described under Limitations: those same 11 values are all
`backend/app/services/alert_engine.py` ever receives, so its heuristics
can't distinguish port-based attack subtypes either.)

## Model and hyperparameters

```python
RandomForestClassifier(
    n_estimators=150,
    max_depth=15,
    min_samples_split=5,
    class_weight="balanced",   # compensates for Benign/attack class imbalance
    random_state=42,
    n_jobs=-1,
)
```

`class_weight="balanced"` was used rather than manual class weights or
resampling (SMOTE, undersampling) - simpler, and sufficient given the
pooled dataset's class sizes weren't extreme once MSSQL (the only severely
underrepresented class) was dropped.

## Training procedure

1. Load and pool every `{attack}-training.parquet` and `{attack}-testing.parquet`
   file that exists for each of the 9 trained attack types, plus `Benign` rows.
2. Clean: drop rows with `inf`/`NaN` in any feature or label column,
   normalize CICDDoS2019's inconsistent label spelling (`DrDoS_UDP` -> `UDP`,
   etc. - the testing-day files prefix some labels with `DrDoS_` that the
   training-day files don't use for the same attack), drop any stray label
   outside the intended set (see the MSSQL/Portmap/WebDDoS examples above).
3. Stratified 80/20 train/test split, `random_state=42`.
4. 5-fold stratified cross-validation on the training set only, as a sanity
   check before final fit (not used for model selection - there was no
   hyperparameter search here; the hyperparameters above were chosen once
   and validated via CV, not tuned against the test set).
5. Fit the final model on the full training split.
6. Evaluate once on the held-out 20% test split - the numbers below.

## Results (held-out test set, real numbers)

Overall (81,403-row held-out test set):

| Metric | Value |
|---|---|
| Accuracy | 98.07% |
| Precision (weighted) | 98.15% |
| Recall (weighted) | 98.07% |
| F1 (weighted) | 98.08% |

Per class - this is where the real story is. The original 4 classes stayed
excellent; the reflection-attack additions (DNS/LDAP/SNMP) are the honest
weak point, and it's the SAME three classes confusing with each other, not
with Benign or with anything else:

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

DNS, LDAP, and SNMP are all UDP-based reflection/amplification attacks
with real overlap at this feature granularity: the confusion matrix shows
LDAP<->DNS and LDAP<->SNMP as the dominant error pairs, not confusion with
Benign traffic or with the original 3 classes. This matters operationally
less than the F1 numbers alone suggest: `alert_engine.py`'s heuristic layer
flags any zero-TCP-handshake flood as an attack regardless of which of
these labels the model assigns it, so a DNS flood mislabeled as LDAP still
triggers a real alert - the confusion affects the attack-subtype label
shown on the incident, not whether it gets caught.

Full confusion matrix, per-class precision/recall/F1, and a feature
importance ranking are **not hand-copied into this document** beyond the
table above - they're regenerated on demand as real files
(`confusion_matrix.png/.csv`, `feature_importances.png/.csv`,
`classification_report.txt/.json`) by running:

```bash
cd ml
python3 evaluate_model.py
```

which writes them to `models/evaluation/v1.0/` from the actual saved model,
without retraining. Attach those files (not this paragraph) to the project
report or viva slides - they reflect whatever is actually in
`models/random_forest_v1.0.joblib` right now, not a snapshot from whenever
this model card was last edited.

## Known limitations (honest, not viva-optimistic)

- **10 of CICDDoS2019's ~13 attack types are covered; MSSQL and Portmap
  were tested and excluded (too little data / too noisy - see above).**
  Anything outside these 10 (e.g. SSDP, WebDDoS - the latter confirmed
  present as stray rows in the raw data) would currently be scored against
  a class it doesn't belong to - likely misclassified, not correctly
  rejected.
- **DNS/LDAP/SNMP recall (56-76%) is the real weak point**, not a hidden
  one - see the per-class results table above. They're accurate enough to
  usually get the right subtype label, but a materially higher error rate
  than the other 7 classes, all confused with each other specifically.
- **98.07% accuracy is a held-out split of the SAME dataset the model
  trained on, not real live traffic.** The single real live-capture case
  this project diagnosed (`ml/debug_flood_score.py`, archived) found a live
  SYN flood - 2420 packets, 532 pkt/s, 100% SYN ratio, zero ACKs, an
  unambiguous attack by any reasonable definition - scored only 58.65%
  confidence and was classified `Benign` by this model. That's why
  `backend/app/services/alert_engine.py` layers rate/flag-based heuristics
  on top of the model rather than trusting model confidence alone; see that
  module's own docstring for the full explanation. The 98.07% figure
  describes this model's fit to CICDDoS2019, not its live-traffic recall,
  and those are not the same thing.
- **No adversarial evaluation.** Nothing here tests how the model behaves
  under intentional evasion (e.g. an attacker deliberately spacing packets
  to mimic benign flow-timing statistics).
- **No model monitoring or drift detection in production.** Accuracy is
  measured once, at training time, against static historical data; nothing
  in this project currently tracks live prediction confidence distributions
  or flags when the model's live-traffic behavior diverges from what it saw
  in training.
- **Single train/test split, single random seed.** Cross-validation was
  used as a training-time sanity check, but the reported test metrics come
  from one 80/20 split rather than averaged across multiple splits/seeds -
  the true variance of these numbers isn't characterized.

## Archived / exploratory scripts

These live in `ml/` alongside the production scripts and are kept for the
project report as a historical record of the investigation that produced
this model - each now carries a header comment identifying it as archived,
and none of them run as part of the automated pipeline (`start_project.bat`
never calls them):

| Script | What it was for |
|---|---|
| `ml/diagnose_syn_mismatch.py` | First identified the day-based distribution shift (see above) |
| `ml/train_pooled_experiment.py` | Validated that pooling + a stratified split fixes it, before that fix was made production in `train_baseline.py` |
| `ml/debug_flood_score.py` | Caught the real live-capture "confident Benign on an obvious SYN flood" failure that motivated `alert_engine.py`'s heuristic layer |

Production scripts, by contrast, are meant to be run as-is:
`ml/train_baseline.py` (train/retrain), `ml/evaluate_model.py` (regenerate
this report's confusion matrix / classification report / feature
importances from the already-saved model), and `ml/live_monitor.py`
(the live capture -> feature -> model -> alert loop).
