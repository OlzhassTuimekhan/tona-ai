import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)


def send_webhook(url: str, payload: dict[str, Any], secret: str = "") -> bool:
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Webhook-Secret"] = secret

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=15)
        resp.raise_for_status()
        logger.info(f"Webhook sent: {url} -> {resp.status_code}")
        return True
    except Exception as e:
        logger.error(f"Webhook failed: {url} -> {e}")
        return False
