"""
Combines feature_extraction/build_features.py + ml/pipeline.py into one
command, so after stopping a capture you run ONE script instead of two.

Usage:
    python ml/process_capture.py --backend-url http://localhost:8000
"""
import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def parse_args():
    parser = argparse.ArgumentParser(description="build_features.py + pipeline.py in one step")
    parser.add_argument("--backend-url", default="http://localhost:8000")
    parser.add_argument("--email", default="admin@local")
    parser.add_argument("--password", default="Admin123!")
    parser.add_argument("--threshold", type=float, default=0.5)
    return parser.parse_args()


def main():
    args = parse_args()
    python = sys.executable

    print("=== Building features from the latest capture ===")
    subprocess.run(
        [python, str(REPO_ROOT / "feature_extraction" / "build_features.py")],
        check=True,
    )

    print("\n=== Scoring + pushing to backend ===")
    subprocess.run(
        [
            python,
            str(REPO_ROOT / "ml" / "pipeline.py"),
            "--backend-url", args.backend_url,
            "--email", args.email,
            "--password", args.password,
            "--threshold", str(args.threshold),
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
