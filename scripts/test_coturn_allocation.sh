#!/usr/bin/env bash
# ==============================================================================
# Huddle: Staging Coturn Allocation Verification Script
#
# NOTE: This script is intended to be executed on or against the staging server.
# Transport flags below are reference-based (RFC 5766 / Coturn docs) and MUST be
# confirmed via 'turnutils_uclient --help' on the staging host.
#
# Security:
# Shared secret is read strictly from the COTURN_AUTH_SECRET environment variable.
# It is NEVER passed as a command-line argument to avoid exposure in process tables (/proc, ps).
# ==============================================================================

set -euo pipefail

TARGET_HOST="${1:-turn.joinhuddl.me}"
USER_ID="${2:-staging-verifier-uuid}"
TTL_SECONDS=3600

if [[ -z "${COTURN_AUTH_SECRET:-}" ]]; then
  echo "[ERROR] COTURN_AUTH_SECRET environment variable is unset." >&2
  echo "Usage: COTURN_AUTH_SECRET='your_secret' $0 <host> [user_id]" >&2
  exit 1
fi

echo "======================================================="
echo "HUDDLE COTURN ALLOCATION VERIFIER: ${TARGET_HOST}"
echo "======================================================="

# Generate dynamic timestamp and HMAC credentials using Python stdlib (avoiding secret in ps/argv)
EXPIRY_TIME=$(($(date +%s) + TTL_SECONDS))
USERNAME="${EXPIRY_TIME}:${USER_ID}"

PASSWORD=$(python3 -c '
import hmac, hashlib, os, base64

secret = os.environ.get("COTURN_AUTH_SECRET", "").encode("utf-8")
username = os.environ.get("USERNAME", "").encode("utf-8")
if not secret or not username:
    raise ValueError("Missing secret or username in environment")

digest = hmac.new(secret, username, hashlib.sha1).digest()
print(base64.b64encode(digest).decode("utf-8"))
' 2>/dev/null)

if [[ -z "${PASSWORD}" ]]; then
  echo "[ERROR] Failed to generate HMAC-SHA1 credential token." >&2
  exit 1
fi

echo "[INFO] Generated ephemeral TURN credentials:"
echo "       Username: ${USERNAME}"
echo "       Password: [REDACTED HMAC-SHA1 BASE64 TOKEN]"
echo "       Expires:  $(date -d "@${EXPIRY_TIME}" 2>/dev/null || date -r "${EXPIRY_TIME}" 2>/dev/null || echo "${EXPIRY_TIME}")"
echo ""

# Reference flag summary:
#   UDP: turnutils_uclient -u (UDP datagram transport to port 3478)
#   TCP: turnutils_uclient -t (TCP stream transport to port 3478)
#   TLS: turnutils_uclient -t -s -p 5349 (TLS stream transport over TCP to port 5349)
#
# On the staging server, check: turnutils_uclient --help to verify flag compatibility.

echo "[TEST 1/3] UDP Relay Allocation (Port 3478)..."
echo "Command (Reference): turnutils_uclient -u -y -p 3478 -u '${USERNAME}' -w '******' '${TARGET_HOST}'"

echo "[TEST 2/3] TCP Relay Allocation (Port 3478)..."
echo "Command (Reference): turnutils_uclient -t -y -p 3478 -u '${USERNAME}' -w '******' '${TARGET_HOST}'"

echo "[TEST 3/3] TLS Relay Allocation (Port 5349)..."
echo "Command (Reference): turnutils_uclient -t -s -y -p 5349 -u '${USERNAME}' -w '******' '${TARGET_HOST}'"

echo ""
echo "[INFO] Ready for execution on staging Linux host."

