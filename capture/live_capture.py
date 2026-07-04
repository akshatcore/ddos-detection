"""
Step 1: Live packet capture script.
Run this on the TARGET VM to capture incoming traffic from the Kali attacker VM.
Requires: sudo (raw socket access), scapy

Usage:
    sudo python3 live_capture.py
"""

from scapy.all import sniff, IP, TCP, UDP
from datetime import datetime
import csv
import os

OUTPUT_FILE = "../data/raw_packets.csv"

# Ensure output file has headers
if not os.path.exists(OUTPUT_FILE):
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


if __name__ == "__main__":
    print("Starting packet capture... (Ctrl+C to stop)")
    print(f"Logging to {OUTPUT_FILE}")
    # Change 'eth0' to your actual host-only network interface (check with `ip a`)
    sniff(iface="eth0", prn=process_packet, store=False)
