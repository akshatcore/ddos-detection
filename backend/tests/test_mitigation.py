"""Tests for the real (non-simulated) Windows Firewall mitigation module.

Prior to this, the only verification of services/mitigation.py was a
one-off manual check run by hand during development. These pin the same
behavior down as real, repeatable pytest assertions: the safety guard
against blocking loopback/invalid addresses, the exact netsh command shape,
and the fail-closed behavior when netsh can't run (missing, denied, or
times out) - all done via mocking subprocess.run so these pass identically
on Linux CI and on a real Windows dev machine, without ever touching the
actual firewall.
"""

from unittest.mock import patch

import pytest

from backend.app.services.mitigation import (
    build_mitigation_payload,
    build_unmitigation_payload,
    generate_windows_block_command,
    generate_windows_unblock_command,
    is_safe_to_block,
)


# --- is_safe_to_block --------------------------------------------------------

@pytest.mark.parametrize(
    "src_ip",
    ["127.0.0.1", "0.0.0.0", "255.255.255.255", "::1", "", None, "unknown", "UNKNOWN", "  "],
)
def test_unsafe_addresses_are_refused(src_ip):
    assert is_safe_to_block(src_ip) is False


@pytest.mark.parametrize("src_ip", ["10.0.0.5", "192.168.1.100", "203.0.113.7"])
def test_normal_addresses_are_safe(src_ip):
    assert is_safe_to_block(src_ip) is True


# --- command construction ---------------------------------------------------

def test_block_command_shape():
    command = generate_windows_block_command("10.0.0.5")
    assert command[:4] == ["netsh", "advfirewall", "firewall", "add"]
    assert "remoteip=10.0.0.5" in command
    assert "action=block" in command
    assert any(part.startswith("name=DDoS-Detection-Block-10.0.0.5") for part in command)


def test_unblock_command_mirrors_block_rule_name():
    block_cmd = generate_windows_block_command("10.0.0.5")
    unblock_cmd = generate_windows_unblock_command("10.0.0.5")
    block_name = next(p for p in block_cmd if p.startswith("name="))
    unblock_name = next(p for p in unblock_cmd if p.startswith("name="))
    # The unblock command MUST target the exact same rule name the block
    # command created, or the revert path silently does nothing.
    assert block_name == unblock_name


def test_rule_name_sanitizes_ipv6_colons():
    command = generate_windows_block_command("::1")  # would be refused upstream, but the
    name = next(p for p in command if p.startswith("name="))  # sanitizer itself must still be safe
    assert ":" not in name


# --- build_mitigation_payload: safety guard never reaches subprocess --------

def test_refused_ip_never_calls_subprocess():
    with patch("backend.app.services.mitigation.subprocess.run") as mock_run:
        payload = build_mitigation_payload("127.0.0.1", "test")
    mock_run.assert_not_called()
    assert payload["status"] == "refused"
    assert payload["action_type"] == "firewall_block"


# --- build_mitigation_payload: success / failure / exceptions (mocked) -----

def test_successful_block_reports_active():
    with patch("backend.app.services.mitigation.subprocess.run") as mock_run:
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "Ok.\n"
        mock_run.return_value.stderr = ""
        payload = build_mitigation_payload("10.0.0.5", "syn flood")

    assert payload["status"] == "active"
    assert "netsh advfirewall firewall add rule" in payload["command"]
    mock_run.assert_called_once()
    called_command = mock_run.call_args[0][0]
    assert called_command == generate_windows_block_command("10.0.0.5")


def test_nonzero_returncode_reports_failed_not_active():
    with patch("backend.app.services.mitigation.subprocess.run") as mock_run:
        mock_run.return_value.returncode = 1
        mock_run.return_value.stdout = ""
        mock_run.return_value.stderr = "Access is denied.\n"
        payload = build_mitigation_payload("10.0.0.5", "syn flood")

    assert payload["status"] == "failed"
    assert "Access is denied" in payload["command"]


def test_missing_netsh_fails_closed():
    """Real, verified case: running on Linux/macOS, or PATH is broken."""
    with patch("backend.app.services.mitigation.subprocess.run", side_effect=FileNotFoundError):
        payload = build_mitigation_payload("10.0.0.5", "syn flood")
    assert payload["status"] == "failed"
    assert "not running on Windows" in payload["command"] or "netsh not found" in payload["command"]


def test_timeout_fails_closed():
    import subprocess

    with patch("backend.app.services.mitigation.subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="netsh", timeout=10)):
        payload = build_mitigation_payload("10.0.0.5", "syn flood")
    assert payload["status"] == "failed"


def test_unexpected_exception_fails_closed_not_raises():
    """This function backs an API endpoint - it must never raise and crash
    the request; a total surprise must still degrade to status=failed."""
    with patch("backend.app.services.mitigation.subprocess.run", side_effect=RuntimeError("boom")):
        payload = build_mitigation_payload("10.0.0.5", "syn flood")
    assert payload["status"] == "failed"


# --- unmitigation mirrors the same fail-closed contract ----------------------

def test_successful_unblock_reports_removed():
    with patch("backend.app.services.mitigation.subprocess.run") as mock_run:
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "Ok.\n"
        mock_run.return_value.stderr = ""
        payload = build_unmitigation_payload("10.0.0.5", "resolved")

    assert payload["status"] == "removed"
    assert payload["action_type"] == "firewall_unblock"


def test_failed_unblock_reports_failed():
    with patch("backend.app.services.mitigation.subprocess.run") as mock_run:
        mock_run.return_value.returncode = 1
        mock_run.return_value.stdout = ""
        mock_run.return_value.stderr = "No rules match the specified criteria.\n"
        payload = build_unmitigation_payload("10.0.0.5", "resolved")

    assert payload["status"] == "failed"
