"""
Local attack simulator - stands in for the README's Kali attacker VM when
you're testing on a single machine instead of the two-VM lab.

Fires a rapid burst of TCP connections at your OWN localhost backend to
produce genuinely SYN-flood-shaped traffic (many short-lived connections,
high packet rate, low per-connection byte count) for live_capture.py to
capture. This never touches any host other than 127.0.0.1 - it is not
usable against any remote target.

Usage (run this WHILE live_capture.py is capturing in another terminal):
    python capture/simulate_flood.py
    python capture/simulate_flood.py --target http://127.0.0.1:8000/health --requests 500 --workers 50
"""

import argparse
import socket
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse


def hammer(host: str, port: int, path: str, n: int):
    """Open a raw TCP connection, send a minimal HTTP GET, close immediately -
    mimics a burst of short, rapid connections rather than normal browsing
    traffic."""
    sent = 0
    for _ in range(n):
        try:
            with socket.create_connection((host, port), timeout=1) as s:
                s.sendall(f"GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n".encode())
                s.recv(256)
            sent += 1
        except OSError:
            pass
    return sent


def parse_args():
    parser = argparse.ArgumentParser(description="Simulate a local flood against your own backend")
    parser.add_argument("--target", default="http://127.0.0.1:8000/health", help="URL to flood (must be local)")
    parser.add_argument("--requests", type=int, default=500, help="Total connection attempts")
    parser.add_argument("--workers", type=int, default=50, help="Concurrent worker threads")
    return parser.parse_args()


def main():
    args = parse_args()
    parsed = urlparse(args.target)

    if parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit(
            f"Refusing to run: target host '{parsed.hostname}' is not localhost. "
            "This tool is only for flooding your own local test backend."
        )

    host = parsed.hostname
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = parsed.path or "/"

    per_worker = max(args.requests // args.workers, 1)
    print(f"Flooding {host}:{port}{path} - {args.requests} connections across {args.workers} workers...")

    start = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(hammer, host, port, path, per_worker) for _ in range(args.workers)]
        total_sent = sum(f.result() for f in futures)
    elapsed = time.time() - start

    print(f"Sent {total_sent} connections in {elapsed:.2f}s ({total_sent / elapsed:.1f} conn/s)")
    print("Stop live_capture.py (Ctrl+C) now, then run feature_extraction/build_features.py.")


if __name__ == "__main__":
    main()
