"""Quick diagnostic: show exactly what the model predicts for the biggest
captured flows, to see why they aren't triggering incidents."""
import joblib
import pandas as pd

bundle = joblib.load("../models/random_forest_v1.0.joblib")
model = bundle["model"]
feature_columns = bundle["features"]
label_encoder = bundle.get("label_encoder")

df = pd.read_csv("../data/flow_features.csv")
big = df[df["Total Fwd Packets"] > 50].copy()

X = big[feature_columns]
probs = model.predict_proba(X)
preds = model.predict(X)
classes = list(label_encoder.classes_) if label_encoder is not None else list(range(probs.shape[1]))
labels = label_encoder.inverse_transform(preds) if label_encoder is not None else preds

for i, (_, row) in enumerate(big.iterrows()):
    print("---")
    print("features:", {c: row[c] for c in feature_columns})
    print("predicted_label:", labels[i])
    print("class probabilities:", dict(zip(classes, probs[i].round(4))))
