"""Real Windows Firewall mitigation - NOT a simulation.

Previously this module only built an iptables command *string* and logged it
with status="simulated" - it never ran anything, and the command itself was
for the wrong OS (this project runs on Windows, not Linux). This version
actually executes a block via `netsh advfirewall`, the Windows equivalent,
and provides a matching revert path so a real block always has a real undo.

Requires the backend process to be running elevated. When launched via
start_project.bat, it is - that script self-elevates via UAC once at the top
and spawns the backend, frontend, and live-monitor windows underneath that
already-elevated session, so the inherited token carries through. If the
backend is started manually from a non-elevated terminal instead, netsh will
fail with an access-denied error - this module catches that and reports it
as a failed action rather than pretending to succeed.
"""

import logging
import re
import subprocess
from datetime import datetime

logger = logging.getLogger(__name__)

RULE_PREFIX = "DDoS-Detection-Block"

# Addresses we refuse to ever block, regardless of what a flow record claims -
# guards against a malformed/placeholder src_ip (e.g. "unknown", "0.0.0.0",
# or a loopback artifact from local testing) turning an automated action
# into a self-inflicted denial of service.
_NEVER_BLOCK_PREFIXES = ("127.", "0.", "255.255.255.255")


def is_safe_to_block(src_ip: str) -> bool:
    if not src_ip or not src_ip.strip() or src_ip.strip().lower() == "unknown":
        return False
    if src_ip.startswith(_NEVER_BLOCK_PREFIXES) or src_ip == "::1":
        return False
    return True


def _rule_name(src_ip: str) -> str:
    # netsh rule names can't contain characters like ':' (IPv6) safely across
    # all shells/quoting - normalize to something always safe to pass through.
    safe_ip = re.sub(r"[^0-9a-zA-Z.]", "_", src_ip)
    return f"{RULE_PREFIX}-{safe_ip}"


def generate_windows_block_command(src_ip: str) -> list[str]:
    """Returns an argument list, not a shell string - passed to subprocess
    with shell=False, so there is no shell-injection surface even though
    src_ip ultimately originates from attacker-controlled packet data."""
    return [
        "netsh", "advfirewall", "firewall", "add", "rule",
        f"name={_rule_name(src_ip)}",
        "dir=in",
        "action=block",
        f"remoteip={src_ip}",
    ]


def generate_windows_unblock_command(src_ip: str) -> list[str]:
    return [
        "netsh", "advfirewall", "firewall", "delete", "rule",
        f"name={_rule_name(src_ip)}",
    ]


def _run_netsh(command: list[str]) -> tuple[bool, str]:
    """Best-effort execution - never raises. Fails closed (success=False) on
    any problem: netsh missing (e.g. developing on Linux/macOS), access
    denied (backend not running elevated), or a timeout - all real
    possibilities, not edge cases to wave away."""
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=10, shell=False)
        output = (result.stdout or result.stderr or "").strip()
        return result.returncode == 0, output[:500]
    except FileNotFoundError:
        return False, "netsh not found - not running on Windows, or PATH is broken"
    except subprocess.TimeoutExpired:
        return False, "netsh command timed out after 10s"
    except Exception as exc:  # noqa: BLE001 - must never crash the mitigate endpoint
        return False, f"unexpected error running netsh: {exc}"


def build_mitigation_payload(src_ip: str, reason: str) -> dict[str, str]:
    """Executes a real Windows Firewall block. Returns a dict matching the
    shape incidents.py stores into MitigationAction - kept as a plain dict
    (not a new DB column) since this project has no migration tooling and
    the live Supabase table already exists; adding a column here would break
    against the deployed schema. The full command + result is packed into
    the existing `command` Text field instead."""
    if not is_safe_to_block(src_ip):
        return {
            "action_type": "firewall_block",
            "command": f"(refused) refused to block unsafe/invalid address: {src_ip!r}",
            "status": "refused",
            "executed_at": datetime.utcnow().isoformat(),
            "reason": reason,
        }

    command = generate_windows_block_command(src_ip)
    success, output = _run_netsh(command)
    status = "active" if success else "failed"

    logger.log(
        logging.CRITICAL if success else logging.ERROR,
        "Firewall block %s for %s: %s",
        "succeeded" if success else "FAILED", src_ip, output,
    )

    return {
        "action_type": "firewall_block",
        "command": f"{' '.join(command)} | RESULT: {output or ('OK' if success else 'unknown failure')}",
        "status": status,
        "executed_at": datetime.utcnow().isoformat(),
        "reason": reason,
    }


def build_unmitigation_payload(src_ip: str, reason: str) -> dict[str, str]:
    """Removes a previously-added block rule. Same execute-and-report shape
    as build_mitigation_payload, so a revert leaves an equally real audit
    trail rather than just deleting the earlier record."""
    command = generate_windows_unblock_command(src_ip)
    success, output = _run_netsh(command)
    status = "removed" if success else "failed"

    logger.log(
        logging.WARNING if success else logging.ERROR,
        "Firewall block removal %s for %s: %s",
        "succeeded" if success else "FAILED", src_ip, output,
    )

    return {
        "action_type": "firewall_unblock",
        "command": f"{' '.join(command)} | RESULT: {output or ('OK' if success else 'unknown failure')}",
        "status": status,
        "executed_at": datetime.utcnow().isoformat(),
        "reason": reason,
    }
