# ML-Based DDoS Detection — Starter Project

## Build Order (do NOT parallelize blindly — build this vertical slice first)

1. `capture/` → capture raw packets on target VM (Scapy/tshark)
2. `feature_extraction/` → turn raw packets into flow-window features
3. `ml/` → train a model on CICDDoS2019, test it against your extracted features
4. `backend/` → wrap prediction as an API, log incidents to DB
5. `dashboard/` → display live results
6. Only once steps 1-4 work end-to-end (even ugly) do you polish each layer

## Environment Setup

### On target VM (Ubuntu Server, host-only network)
```bash
sudo apt update && sudo apt install -y python3-pip tshark tcpdump
pip3 install scapy pandas numpy scikit-learn fastapi uvicorn sqlalchemy psycopg2-binary python-jose passlib bcrypt
```

### On attacker VM (Kali — comes preinstalled with tools)
```bash
sudo apt update && sudo apt install -y hping3
pip3 install scapy
git clone https://github.com/MHProDev/MHDDoS.git  # optional, extra attack scripts
```

### Find your host-only network IPs
```bash
ip a   # run on both VMs, note the host-only adapter IP (usually 192.168.56.x)
```

## Step 1 — Test packet capture (do this FIRST, before writing any ML code)

On target VM:
```bash
sudo python3 capture/live_capture.py
```

On Kali VM, in another terminal, generate test traffic:
```bash
# Normal traffic test
curl http://<target_ip>

# SYN flood test (short burst first — don't run --flood for more than 10-15 sec while testing)
sudo hping3 -S -p 80 -i u1000 <target_ip>
```

If `live_capture.py` prints packets, your lab network is wired correctly. Move to Step 2.

## Step 2 — Download dataset for training
```bash
# CICDDoS2019 CSV subset (not full 80GB pcaps)
# Download link: https://www.unb.ca/cic/datasets/ddos-2019.html
# Place CSVs in data/cicddos2019/
```

## Step 3 — Train baseline model
```bash
cd ml
python3 train_baseline.py
```
A trained bundle already ships in `models/random_forest_v1.0.joblib` (see
`models/random_forest_v1.0_metadata.json` for its test metrics), so you can
skip straight to Step 4 unless you want to retrain.

## Step 4 — Extract features and score them
```bash
cd feature_extraction
python3 build_features.py          # raw_packets.csv -> flow_features.csv

cd ../ml
python3 detect_live.py             # scores flow_features.csv, prints alerts to console
```
> Note: `build_features.py` previously produced a different feature set
> (packet_count, syn_ratio, ...) than the model was trained on (Flow Duration,
> Total Fwd Packets, ...), so `detect_live.py` failed with a "missing
> required columns" error. It now computes the same 11 CICFlowMeter-style
> columns the model expects, per bidirectional flow, per 5-second window.

## Step 5 — Push detections into the backend/dashboard automatically
```bash
# with the backend running (uvicorn backend.app.main:app --reload)
cd ml
python3 pipeline.py --backend-url http://localhost:8000
```
`pipeline.py` scores `flow_features.csv` and POSTs each flow + prediction to
`POST /alerts/evaluate`. The backend's `AlertEngine` decides whether to open
an Incident, which then shows up immediately on the React dashboard
(Incidents / Threat Hunting pages) — this is what actually closes the loop
described in "Build Order" above.

## Repo Structure
```
ddos-detection/
├── capture/              # packet capture scripts (Scapy/tshark)
├── feature_extraction/   # flow-window feature builder
├── ml/                   # training scripts, saved models, pipeline.py (features -> backend)
├── backend/              # FastAPI app, DB models, auth
├── frontend/              # React + Vite dashboard
├── scripts/              # attack simulation helper scripts (Kali side)
├── data/                 # datasets (gitignored except .gitkeep)
├── models/               # exported .pkl/.joblib models (gitignored, or use Git LFS)
└── docs/                 # architecture notes, schema docs
```

## Git setup
```bash
git init
git add .
git commit -m "Initial project skeleton"
git remote add origin https://github.com/akshatcore/ddos-detection.git
git push -u origin main
```

## Safety reminder
All attack traffic stays on the host-only network between your two VMs. Never point hping3/Scapy at any real IP, college network, or shared Wi-Fi.
