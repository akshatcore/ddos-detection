"""
Step 1: Live packet capture script.
Run this on the TARGET VM to capture incoming traffic from the Kali attacker VM.
Requires: sudo/Administrator (raw socket access), scapy (+ Npcap on Windows)

Usage:
    sudo python3 capture/live_capture.py                    # Linux, default iface
    python capture/live_capture.py --iface "Npcap Loopback Adapter"   # Windows, admin terminal

List available interface names first with:
    python -c "from scapy.all import get_if_list; print(get_if_list())"          # Linux/macOS
    python -c "from scapy.all import get_windows_if_list; import pprint; pprint.pprint(get_windows_if_list())"  # Windows

BUG FIX (documented for the project report):
    The original version hardcoded iface="eth0" and wrote to the relative
    path "../data/raw_packets.csv", which only worked if you first `cd`'d
    into capture/ - contradicting the README's own instruction to run this
    as `sudo python3 capture/live_capture.py` from the repo root, and only
    ever worked on Linux. Fixed to resolve the output path relative to the
    script's own location (matching feature_extraction/build_features.py's
    convention) and to accept --iface / --count / --timeout on the command
    line so it works on Windows too.
"""

import argparse
import csv
import os
from datetime import datetime
from pathlib import Path

from scapy.all import sniff, IP, TCP, UDP

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
OUTPUT_FILE = REPO_ROOT / "data" / "raw_packets.csv"

# Ensure output file has headers
OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
if not OUTPUT_FILE.exists():
    with open(OUTPUT_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "timestamp", "src_ip", "dst_ip", "protocol",
            "src_port", "dst_port", "packet_size", "tcp_flags"
        ])


def process_packet(packet):
    if IP in packet:
        timestamp = datetime.now().isoformat()
        src_ip = packet[IP].src
        dst_ip = packet[IP].dst
        packet_size = len(packet)
        protocol = "OTHER"
        src_port = dst_port = None
        tcp_flags = ""

        if TCP in packet:
            protocol = "TCP"
            src_port = packet[TCP].sport
            dst_port = packet[TCP].dport
            tcp_flags = str(packet[TCP].flags)
        elif UDP in packet:
            protocol = "UDP"
            src_port = packet[UDP].sport
            dst_port = packet[UDP].dport

        row = [timestamp, src_ip, dst_ip, protocol, src_port, dst_port, packet_size, tcp_flags]

        with open(OUTPUT_FILE, "a", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(row)

        print(f"[{timestamp}] {src_ip} -> {dst_ip} | {protocol} | size={packet_size} | flags={tcp_flags}")


def parse_args():
    parser = argparse.ArgumentParser(description="Capture packets to data/raw_packets.csv")
    parser.add_argument(
        "--iface",
        default=None,
        help="Interface name to sniff on (e.g. 'eth0' on Linux, "
        "'Npcap Loopback Adapter' on Windows for 127.0.0.1 traffic). "
        "Omit to let Scapy sniff on its default interface.",
    )
    parser.add_argument("--count", type=int, default=0, help="Stop after N packets (0 = run until Ctrl+C)")
    parser.add_argument("--timeout", type=float, default=None, help="Stop after N seconds")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    print("Starting packet capture... (Ctrl+C to stop)")
    print(f"Logging to {OUTPUT_FILE}")
    print(f"Interface: {args.iface or '(scapy default)'}")
    sniff(iface=args.iface, prn=process_packet, store=False, count=args.count, timeout=args.timeout)
