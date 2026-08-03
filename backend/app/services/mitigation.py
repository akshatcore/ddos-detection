from datetime import datetime


def generate_iptables_block_rule(src_ip: str, interface: str) -> str:
    return f"iptables -I INPUT -i {interface} -s {src_ip} -j DROP"


def build_mitigation_payload(src_ip: str, interface: str, reason: str) -> dict[str, str]:
    return {
        "action_type": "iptables_block",
        "command": generate_iptables_block_rule(src_ip, interface),
        "status": "simulated",
        "executed_at": datetime.utcnow().isoformat(),
        "reason": reason,
    }
