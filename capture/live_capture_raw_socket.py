"""
Fallback packet capture for Windows machines WITHOUT Npcap installed.

Uses Python's built-in raw socket support (SIO_RCVALL) instead of Scapy's
Npcap-backed sniff() - no extra driver install required. Trade-offs versus
capture/live_capture.py:
  - Windows only
  - Must run as Administrator
  - --bind-ip must be one of YOUR machine's own real interface IPs (e.g. the
    VirtualBox host-only adapter's address) - captures inbound IP traffic on
    that one interface, not "all interfaces" like Npcap's sniff() can.

Still uses Scapy's IP()/TCP()/UDP() classes to parse each packet's bytes
(that part doesn't need Npcap - only Scapy's sniff()/sendp() need a pcap
backend), so the output CSV is identical to live_capture.py's and works
unchanged with feature_extraction/build_features.py.

Usage (Administrator terminal):
    python capture/live_capture_raw_socket.py --bind-ip 192.168.56.1
"""

import argparse
import csv
import socket
import sys
import time
from datetime import datetime
from pathlib import Path

from scapy.all import IP, TCP, UDP

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
OUTPUT_FILE = REPO_ROOT / "data" / "raw_packets.csv"


def ensure_header():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, "w", newline="") as f:
            csv.writer(f).writerow([
                "timestamp", "src_ip", "dst_ip", "protocol",
                "src_port", "dst_port", "packet_size", "tcp_flags"
            ])


def process_raw(data: bytes, writer, csv_file):
    packet = IP(data)
    timestamp = datetime.now().isoformat()
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

    writer.writerow([timestamp, packet.src, packet.dst, protocol, src_port, dst_port, len(data), tcp_flags])
    # NOTE: no per-packet print()/flush() here on purpose - under a flood
    # (hundreds-to-thousands of packets/sec) those syscalls become the
    # bottleneck and capture falls badly behind real time, which is why
    # updates used to only show up once the flood ended and the backlog
    # drained. Status is now printed/flushed periodically instead (see main()).


def parse_args():
    parser = argparse.ArgumentParser(description="Windows raw-socket packet capture (no Npcap needed)")
    parser.add_argument("--bind-ip", required=True, help="Your machine's own IP on the interface to capture (e.g. the VirtualBox host-only adapter IP)")
    parser.add_argument("--count", type=int, default=0, help="Stop after N packets (0 = run until Ctrl+C)")
    parser.add_argument("--timeout", type=float, default=0, help="Stop automatically after N seconds (0 = run until Ctrl+C)")
    return parser.parse_args()


def main():
    if sys.platform != "win32":
        raise SystemExit("Windows-only fallback - use capture/live_capture.py (with Npcap) on Linux/macOS.")

    args = parse_args()
    ensure_header()

    s = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_IP)
    s.bind((args.bind_ip, 0))
    s.setsockopt(socket.IPPROTO_IP, socket.IP_HDRINCL, 1)
    # Bigger kernel receive buffer so a sudden flood doesn't drop packets
    # while this process is busy writing the previous batch.
    try:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 8 * 1024 * 1024)
    except OSError:
        pass
    s.ioctl(socket.SIO_RCVALL, socket.RCVALL_ON)

    stop_msg = f" or {args.timeout:.0f}s" if args.timeout else ""
    print(f"Starting raw-socket capture on {args.bind_ip} (Ctrl+C{stop_msg} to stop)")
    print(f"Logging to {OUTPUT_FILE}")

    # Always poll with a short timeout (even with no --timeout deadline) so
    # the periodic flush/status logic below runs regardless of packet flow.
    s.settimeout(1.0 if not args.timeout else 1.0)

    # Single persistent file handle for the whole run instead of opening and
    # closing the file on every packet - under a flood (easily 500-2000+
    # packets/sec from hping3) that open/close overhead was the real
    # bottleneck, causing capture to fall further and further behind and
    # only "catch up" once the flood stopped. We flush on a time interval
    # instead, which keeps live_monitor.py's incremental reads fresh
    # (sub-second lag) without paying a syscall per packet.
    FLUSH_INTERVAL = 0.5  # seconds
    csv_file = open(OUTPUT_FILE, "a", newline="")
    writer = csv.writer(csv_file)

    start_time = time.time()
    last_flush = time.time()
    last_status = time.time()
    count = 0
    count_since_status = 0
    try:
        while args.count == 0 or count < args.count:
            if args.timeout and (time.time() - start_time) >= args.timeout:
                print(f"\nTimeout ({args.timeout:.0f}s) reached, stopping capture.")
                break
            try:
                data, _ = s.recvfrom(65565)
            except socket.timeout:
                data = None
            if data is not None:
                try:
                    process_raw(data, writer, csv_file)
                    count += 1
                    count_since_status += 1
                except Exception as exc:  # keep capturing even if one packet fails to parse
                    print(f"(skipped unparseable packet: {exc})")

            now = time.time()
            if now - last_flush >= FLUSH_INTERVAL:
                csv_file.flush()
                last_flush = now
            if now - last_status >= 1.0:
                rate = count_since_status / (now - last_status)
                print(f"[capture] {count} packets total ({rate:.0f} pkt/s)")
                count_since_status = 0
                last_status = now
    except KeyboardInterrupt:
        print("\nStopping capture.")
    finally:
        csv_file.flush()
        csv_file.close()
        s.ioctl(socket.SIO_RCVALL, socket.RCVALL_OFF)
        s.close()


if __name__ == "__main__":
    main()
