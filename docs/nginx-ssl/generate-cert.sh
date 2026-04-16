#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/certs"
KEY="${CERT_DIR}/key.pem"
CRT="${CERT_DIR}/cert.pem"

if [[ "${1:-}" == "" ]]; then
  echo "Usage: $0 <LAN_IP>" >&2
  echo "Example: $0 192.168.1.100" >&2
  exit 1
fi

IP="$1"
mkdir -p "${CERT_DIR}"

openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout "${KEY}" \
  -out "${CRT}" \
  -subj "/CN=audio-jois-local" \
  -addext "subjectAltName=IP:127.0.0.1,IP:${IP},DNS:localhost"

chmod 600 "${KEY}"
echo "OK: ${CRT} and ${KEY}"
echo "Open in browser: https://${IP}:8443/ (compose maps host 8443 -> container 443)"
echo "If the IP of this machine changes, run this script again and restart https-proxy."
