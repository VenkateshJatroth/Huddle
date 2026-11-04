#!/usr/bin/env bash
# ==============================================================================
# Coturn Let's Encrypt Deploy Hook for Huddle TURN Infrastructure
# Path on Linux staging server: /etc/letsencrypt/renewal-hooks/deploy/coturn.sh
#
# Security & Operational Guarantees:
# 1. Exact domain matching on $RELEASES_DIR / $RENEWED_DOMAINS (turn.joinhuddl.me).
# 2. Strict process identity reconciliation (PID -> /proc/<pid>/status -> getent).
# 3. Contradiction halt (compares live UID/GID vs /etc/turnserver.conf vs systemd).
# 4. First-install safety (detects no previous release; avoids invalid rollback).
# 5. RFC 6125 hostname validation via 'openssl x509 -checkhost'.
# 6. Public key pair cryptographic verification before activation.
# 7. Atomic symlink replacement via 'ln -sfn' and 'mv -Tf'.
# 8. Controlled daemon restart and live TLS fingerprint probe on port 5349.
# 9. Clean rollback on update failure; safe diagnostic halt on first-install failure.
# 10. Clean trap handling on EXIT, INT, TERM, HUP.
# ==============================================================================

set -euo pipefail

TARGET_DOMAIN="turn.joinhuddl.me"
COTURN_SERVICE="coturn.service"
CONF_FILE="/etc/turnserver.conf"
CERTS_BASE="/etc/coturn/certs"
RELEASES_DIR="${CERTS_BASE}/releases"
CURRENT_LINK="${CERTS_BASE}/current"

# ------------------------------------------------------------------------------
# 1. Certbot Domain Filter (Exact Token Matching)
# ------------------------------------------------------------------------------
MATCHED=0
if [[ -n "${RENEWED_DOMAINS:-}" ]]; then
  for d in ${RENEWED_DOMAINS}; do
    if [[ "$d" == "$TARGET_DOMAIN" ]]; then
      MATCHED=1
      break
    fi
  done
  if [[ "$MATCHED" -eq 0 ]]; then
    echo "[INFO] Renewal event for [${RENEWED_DOMAINS}] does not match target ${TARGET_DOMAIN}. Skipping deploy hook."
    exit 0
  fi
else
  echo "[INFO] RENEWED_DOMAINS is unset; verifying standalone execution for ${TARGET_DOMAIN}..."
fi

CERT_LINEAGE="${RENEWED_LINEAGE:-/etc/letsencrypt/live/${TARGET_DOMAIN}}"
SRC_FULLCHAIN="${CERT_LINEAGE}/fullchain.pem"
SRC_PRIVKEY="${CERT_LINEAGE}/privkey.pem"

if [[ ! -f "$SRC_FULLCHAIN" || ! -f "$SRC_PRIVKEY" ]]; then
  echo "[ERROR] Source certificates not found in ${CERT_LINEAGE}." >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 2. Coturn Runtime Process Identity Discovery & Strict Reconciliation
# ------------------------------------------------------------------------------
echo "[INFO] Reconciling Coturn runtime process identity..."

# Retrieve MainPID of coturn service
MAIN_PID=$(systemctl show "${COTURN_SERVICE}" -p MainPID --value 2>/dev/null || true)
if [[ -z "${MAIN_PID}" || "${MAIN_PID}" == "0" ]]; then
  echo "[ERROR] Cannot determine Coturn MainPID. Is ${COTURN_SERVICE} running?" >&2
  exit 1
fi

# Verify executable is indeed the coturn binary
EXE_PATH=$(readlink -f "/proc/${MAIN_PID}/exe" 2>/dev/null || true)
if [[ ! "${EXE_PATH}" =~ turnserver$ ]]; then
  echo "[ERROR] MainPID ${MAIN_PID} executable (${EXE_PATH}) does not match 'turnserver'." >&2
  exit 1
fi

# Extract effective UID and GID from /proc/<pid>/status (field 3: real, eff, saved, fs)
EFF_UID=$(awk '/^Uid:/ { print $3 }' "/proc/${MAIN_PID}/status" 2>/dev/null || true)
EFF_GID=$(awk '/^Gid:/ { print $3 }' "/proc/${MAIN_PID}/status" 2>/dev/null || true)

if [[ -z "${EFF_UID}" || -z "${EFF_GID}" ]]; then
  echo "[ERROR] Failed to read effective UID/GID for PID ${MAIN_PID} from /proc/${MAIN_PID}/status." >&2
  exit 1
fi

# Resolve names using POSIX getent (avoid id utility flags with numeric IDs)
EFF_USER=$(getent passwd "${EFF_UID}" | cut -d: -f1 || true)
EFF_GROUP=$(getent group "${EFF_GID}" | cut -d: -f1 || true)

if [[ -z "${EFF_USER}" ]]; then
  echo "[ERROR] Failed to resolve username for numeric effective UID ${EFF_UID} via getent passwd." >&2
  exit 1
fi
if [[ -z "${EFF_GROUP}" ]]; then
  echo "[ERROR] Failed to resolve groupname for numeric effective GID ${EFF_GID} via getent group." >&2
  exit 1
fi

echo "[INFO] Live Coturn process (PID ${MAIN_PID}) running with effective identity ${EFF_USER}:${EFF_GROUP} (UID: ${EFF_UID}, GID: ${EFF_GID})."

# Independent inspection of configured proc-user and proc-group
CONF_PROC_USER=""
CONF_PROC_GROUP=""
if [[ -f "${CONF_FILE}" ]]; then
  CONF_PROC_USER=$(grep -E '^[[:space:]]*proc-user[[:space:]=]' "${CONF_FILE}" | sed -E 's/^[[:space:]]*proc-user[[:space:]=]+//' | tr -d ' "' || true)
  CONF_PROC_GROUP=$(grep -E '^[[:space:]]*proc-group[[:space:]=]' "${CONF_FILE}" | sed -E 's/^[[:space:]]*proc-group[[:space:]=]+//' | tr -d ' "' || true)
fi

# Independent inspection of systemd User= and Group=
SYSTEMD_USER=$(systemctl show "${COTURN_SERVICE}" -p User --value 2>/dev/null || true)
SYSTEMD_GROUP=$(systemctl show "${COTURN_SERVICE}" -p Group --value 2>/dev/null || true)

# Reconcile User
if [[ -n "${CONF_PROC_USER}" ]]; then
  RESOLVED_CONF_UID=$(getent passwd "${CONF_PROC_USER}" | cut -d: -f3 || true)
  if [[ -z "${RESOLVED_CONF_UID}" ]]; then
    echo "[ERROR] Configured proc-user '${CONF_PROC_USER}' cannot be resolved via getent." >&2
    exit 1
  fi
  if [[ "${RESOLVED_CONF_UID}" != "${EFF_UID}" ]]; then
    echo "[CONTRADICTION] Live process UID (${EFF_UID}) does not match configured proc-user '${CONF_PROC_USER}' (UID ${RESOLVED_CONF_UID}). Halting." >&2
    exit 1
  fi
elif [[ -n "${SYSTEMD_USER}" && "${SYSTEMD_USER}" != "root" && "${SYSTEMD_USER}" != "0" ]]; then
  RESOLVED_SYS_UID=$(getent passwd "${SYSTEMD_USER}" | cut -d: -f3 || true)
  if [[ "${RESOLVED_SYS_UID}" != "${EFF_UID}" ]]; then
    echo "[CONTRADICTION] Live process UID (${EFF_UID}) does not match systemd User '${SYSTEMD_USER}' (UID ${RESOLVED_SYS_UID}). Halting." >&2
    exit 1
  fi
fi

# Reconcile Group
if [[ -n "${CONF_PROC_GROUP}" ]]; then
  RESOLVED_CONF_GID=$(getent group "${CONF_PROC_GROUP}" | cut -d: -f3 || true)
  if [[ -z "${RESOLVED_CONF_GID}" ]]; then
    echo "[ERROR] Configured proc-group '${CONF_PROC_GROUP}' cannot be resolved via getent." >&2
    exit 1
  fi
  if [[ "${RESOLVED_CONF_GID}" != "${EFF_GID}" ]]; then
    echo "[CONTRADICTION] Live process GID (${EFF_GID}) does not match configured proc-group '${CONF_PROC_GROUP}' (GID ${RESOLVED_CONF_GID}). Halting." >&2
    exit 1
  fi
elif [[ -n "${SYSTEMD_GROUP}" && "${SYSTEMD_GROUP}" != "root" && "${SYSTEMD_GROUP}" != "0" ]]; then
  RESOLVED_SYS_GID=$(getent group "${SYSTEMD_GROUP}" | cut -d: -f3 || true)
  if [[ "${RESOLVED_SYS_GID}" != "${EFF_GID}" ]]; then
    echo "[CONTRADICTION] Live process GID (${EFF_GID}) does not match systemd Group '${SYSTEMD_GROUP}' (GID ${RESOLVED_SYS_GID}). Halting." >&2
    exit 1
  fi
fi

RUNTIME_USER="${EFF_USER}"
RUNTIME_GROUP="${EFF_GROUP}"
echo "[INFO] Identity reconciliation confirmed: Coturn runtime group is '${RUNTIME_GROUP}'."

# ------------------------------------------------------------------------------
# 3. Detect First-Install State vs Existing Release
# ------------------------------------------------------------------------------
mkdir -p "${RELEASES_DIR}"
chmod 0750 "${CERTS_BASE}"
chmod 0750 "${RELEASES_DIR}"
chown root:"${RUNTIME_GROUP}" "${CERTS_BASE}"
chown root:"${RUNTIME_GROUP}" "${RELEASES_DIR}"

PREV_TARGET=""
IS_FIRST_INSTALL=0
if [[ -L "${CURRENT_LINK}" ]]; then
  PREV_TARGET=$(readlink -f "${CURRENT_LINK}" || true)
fi

if [[ -z "${PREV_TARGET}" || ! -d "${PREV_TARGET}" || ! -f "${PREV_TARGET}/fullchain.pem" || ! -f "${PREV_TARGET}/privkey.pem" ]]; then
  IS_FIRST_INSTALL=1
  echo "[NOTICE] First-time deployment detected: No previous known-good certificate release exists."
  echo "[NOTICE] Automatic rollback is unavailable for this run. If validation or startup fails, setup will abort safely."
else
  echo "[INFO] Existing known-good certificate release found at ${PREV_TARGET} (available for rollback)."
fi

# ------------------------------------------------------------------------------
# 4. Prepare Staging Release Directory & Set Trap Cleanup
# ------------------------------------------------------------------------------
RELEASE_DIR=$(mktemp -d -p "${RELEASES_DIR}" v_XXXXXX)
DEPLOY_SUCCESS=0

cleanup() {
  local exit_code=$?
  if [[ "${DEPLOY_SUCCESS}" -ne 1 && -n "${RELEASE_DIR:-}" && -d "${RELEASE_DIR}" ]]; then
    echo "[CLEANUP] Removing unverified/failed release directory ${RELEASE_DIR}..."
    rm -rf "${RELEASE_DIR}"
  fi
  rm -f "${CURRENT_LINK}.tmp" "${CURRENT_LINK}.rollback" 2>/dev/null || true
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM HUP

# Stage certificates
cp -L "${SRC_FULLCHAIN}" "${RELEASE_DIR}/fullchain.pem"
cp -L "${SRC_PRIVKEY}" "${RELEASE_DIR}/privkey.pem"

if [[ ! -s "${RELEASE_DIR}/fullchain.pem" || ! -s "${RELEASE_DIR}/privkey.pem" ]]; then
  echo "[ERROR] Staged certificate files are empty or unreadable." >&2
  exit 1
fi

# Apply restrictive permissions: root owner, runtime group read-only
chown root:"${RUNTIME_GROUP}" "${RELEASE_DIR}"
chmod 0750 "${RELEASE_DIR}"

chown root:"${RUNTIME_GROUP}" "${RELEASE_DIR}/fullchain.pem"
chmod 0644 "${RELEASE_DIR}/fullchain.pem"

chown root:"${RUNTIME_GROUP}" "${RELEASE_DIR}/privkey.pem"
chmod 0640 "${RELEASE_DIR}/privkey.pem"

# ------------------------------------------------------------------------------
# 5. Cryptographic & Hostname Validation
# ------------------------------------------------------------------------------
echo "[INFO] Validating certificate hostname and cryptographic keypair..."

# Strict RFC 6125 hostname verification
if ! openssl x509 -in "${RELEASE_DIR}/fullchain.pem" -noout -checkhost "${TARGET_DOMAIN}" >/dev/null 2>&1; then
  echo "[ERROR] Hostname verification failed: Certificate does not cover ${TARGET_DOMAIN}." >&2
  exit 1
fi

# Verify Certificate and Private Key match
CERT_PUBKEY_HASH=$(openssl x509 -in "${RELEASE_DIR}/fullchain.pem" -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256)
KEY_PUBKEY_HASH=$(openssl pkey -in "${RELEASE_DIR}/privkey.pem" -pubout | openssl pkey -pubin -outform DER | openssl dgst -sha256)

if [[ "${CERT_PUBKEY_HASH}" != "${KEY_PUBKEY_HASH}" ]]; then
  echo "[ERROR] Cryptographic mismatch: Certificate public key does not match private key!" >&2
  exit 1
fi

# Verify certificate is not expired and has at least 24h validity remaining
if ! openssl x509 -in "${RELEASE_DIR}/fullchain.pem" -checkend 86400 -noout >/dev/null 2>&1; then
  echo "[ERROR] Staged certificate is expired or expiring in less than 24 hours." >&2
  exit 1
fi

# Verify service account readability without assuming sudo
if command -v runuser >/dev/null 2>&1; then
  if ! runuser -u "${RUNTIME_USER}" -- test -r "${RELEASE_DIR}/privkey.pem"; then
    echo "[ERROR] Runtime user '${RUNTIME_USER}' cannot read staged private key ${RELEASE_DIR}/privkey.pem!" >&2
    exit 1
  fi
elif command -v su >/dev/null 2>&1; then
  if ! su -s /bin/sh "${RUNTIME_USER}" -c "test -r '${RELEASE_DIR}/privkey.pem'"; then
    echo "[ERROR] Runtime user '${RUNTIME_USER}' cannot read staged private key ${RELEASE_DIR}/privkey.pem!" >&2
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# 6. Rollback Handler
# ------------------------------------------------------------------------------
trigger_rollback() {
  local reason="$1"
  echo "[FAILURE] ${reason}" >&2

  if [[ "${IS_FIRST_INSTALL}" -eq 1 ]]; then
    echo "[CRITICAL] Deployment failed during first install. Automatic rollback unavailable because no previous known-good release exists." >&2
    rm -f "${CURRENT_LINK}" 2>/dev/null || true
    echo "[OPERATOR ACTION] Check 'journalctl -u ${COTURN_SERVICE} -n 50' and deploy a valid baseline certificate." >&2
    exit 1
  fi

  echo "[ROLLBACK] Reverting symlink to previous release: ${PREV_TARGET}..." >&2
  ln -sfn "${PREV_TARGET}" "${CURRENT_LINK}.rollback"
  mv -Tf "${CURRENT_LINK}.rollback" "${CURRENT_LINK}"

  echo "[ROLLBACK] Restarting Coturn with restored certificate..." >&2
  systemctl restart "${COTURN_SERVICE}" || true
  sleep 2

  if systemctl is-active --quiet "${COTURN_SERVICE}"; then
    PREV_FINGERPRINT=$(openssl x509 -in "${PREV_TARGET}/fullchain.pem" -outform DER | openssl dgst -sha256 -binary | openssl enc -base64)
    ROLLBACK_SERVED=$(echo | openssl s_client -connect 127.0.0.1:5349 -servername "${TARGET_DOMAIN}" 2>/dev/null | openssl x509 -outform DER 2>/dev/null | openssl dgst -sha256 -binary | openssl enc -base64 || true)

    if [[ -n "${ROLLBACK_SERVED}" && "${ROLLBACK_SERVED}" == "${PREV_FINGERPRINT}" ]]; then
      echo "[ROLLBACK SUCCESS] Coturn restored to previous release ${PREV_TARGET} and serving valid TLS." >&2
      exit 1
    fi
  fi

  echo "[FATAL] Automatic rollback to ${PREV_TARGET} failed! Coturn is DOWN or in degraded state." >&2
  echo "[FATAL] Immediate manual operator intervention required!" >&2
  exit 2
}

# ------------------------------------------------------------------------------
# 7. Atomic Symlink Switch & Controlled Restart
# ------------------------------------------------------------------------------
echo "[INFO] Activating release ${RELEASE_DIR} atomically..."
ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}.tmp"
mv -Tf "${CURRENT_LINK}.tmp" "${CURRENT_LINK}"

echo "[INFO] Restarting ${COTURN_SERVICE} to reload TLS certificates..."
if ! systemctl restart "${COTURN_SERVICE}"; then
  trigger_rollback "systemctl restart ${COTURN_SERVICE} failed."
fi

# Wait for Coturn TLS listener to bind
sleep 2

if ! systemctl is-active --quiet "${COTURN_SERVICE}"; then
  trigger_rollback "${COTURN_SERVICE} is not active after restart."
fi

# ------------------------------------------------------------------------------
# 8. Live Port 5349 TLS Verification
# ------------------------------------------------------------------------------
echo "[INFO] Probing live TLS listener on 127.0.0.1:5349..."
STAGED_FINGERPRINT=$(openssl x509 -in "${RELEASE_DIR}/fullchain.pem" -outform DER | openssl dgst -sha256 -binary | openssl enc -base64)

# Connect to local TLS listener
LIVE_SERVED_FINGERPRINT=$(echo | openssl s_client -connect 127.0.0.1:5349 -servername "${TARGET_DOMAIN}" 2>/dev/null | openssl x509 -outform DER 2>/dev/null | openssl dgst -sha256 -binary | openssl enc -base64 || true)

if [[ -z "${LIVE_SERVED_FINGERPRINT}" ]]; then
  trigger_rollback "Failed to connect to port 5349 or retrieve served TLS certificate."
fi

if [[ "${LIVE_SERVED_FINGERPRINT}" != "${STAGED_FINGERPRINT}" ]]; then
  trigger_rollback "Fingerprint mismatch! Served: ${LIVE_SERVED_FINGERPRINT}, Expected: ${STAGED_FINGERPRINT}."
fi

echo "[INFO] Live TLS fingerprint matches staged certificate."

# Prune old releases, retaining the 3 most recent
(
  cd "${RELEASES_DIR}"
  ls -dt v_* 2>/dev/null | tail -n +4 | xargs -r rm -rf 2>/dev/null || true
)

DEPLOY_SUCCESS=1
echo "[SUCCESS] Coturn certificate deployment and live TLS verification completed successfully for ${TARGET_DOMAIN}."
exit 0
