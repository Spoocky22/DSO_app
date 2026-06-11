#!/usr/bin/env python3
"""
DSO/NINA raw acquisition sync agent.

It runs on the Windows PC where N.I.N.A. is running, listens to the Advanced API
WebSocket IMAGE-SAVE event, and pushes each saved light frame to the DSO app.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from dataclasses import dataclass
from typing import Any

import requests
import websocket
from dotenv import load_dotenv


@dataclass
class Config:
    dso_app_url: str
    ingest_token: str
    nina_ws_url: str
    ntfy_server: str | None
    ntfy_topic: str | None
    ntfy_token: str | None


def getenv_required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_config() -> Config:
    load_dotenv()
    ntfy_topic = os.getenv("NTFY_TOPIC", "").strip() or None
    return Config(
        dso_app_url=getenv_required("DSO_APP_URL").rstrip("/"),
        ingest_token=getenv_required("NINA_INGEST_TOKEN"),
        nina_ws_url=os.getenv("NINA_WS_URL", "ws://localhost:1888/v2/socket").strip(),
        ntfy_server=(os.getenv("NTFY_SERVER", "https://ntfy.sh").strip().rstrip("/") if ntfy_topic else None),
        ntfy_topic=ntfy_topic,
        ntfy_token=os.getenv("NTFY_TOKEN", "").strip() or None,
    )


def log(message: str) -> None:
    print(time.strftime("%Y-%m-%d %H:%M:%S"), message, flush=True)


def ingest_url(config: Config) -> str:
    return f"{config.dso_app_url}/api/nina/ingest"


def request_headers(config: Config) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {config.ingest_token}",
        "Content-Type": "application/json",
    }


def notify(config: Config, title: str, message: str, tags: str = "telescope", priority: str = "3") -> None:
    if not config.ntfy_topic or not config.ntfy_server:
        return
    url = f"{config.ntfy_server}/{config.ntfy_topic}"
    headers = {
        "Title": title,
        "Tags": tags,
        "Priority": priority,
    }
    if config.ntfy_token:
        headers["Authorization"] = f"Bearer {config.ntfy_token}"
    try:
        requests.post(url, headers=headers, data=message.encode("utf-8"), timeout=10)
    except Exception as exc:  # notification failure must not stop sync
        log(f"ntfy notification failed: {exc}")


def check_app(config: Config) -> None:
    resp = requests.get(ingest_url(config), headers=request_headers(config), timeout=15)
    if not resp.ok:
        raise RuntimeError(f"DSO app check failed: HTTP {resp.status_code} {resp.text}")
    log("DSO app ingest endpoint: OK")
    notify(config, "DSO Sync", "Connexion à l'app DSO OK", tags="white_check_mark,telescope")


def post_to_app(config: Config, payload: dict[str, Any]) -> dict[str, Any]:
    resp = requests.post(ingest_url(config), headers=request_headers(config), json=payload, timeout=20)
    try:
        data = resp.json()
    except Exception:
        data = {"ok": False, "error": resp.text}
    if not resp.ok:
        raise RuntimeError(f"HTTP {resp.status_code}: {data}")
    return data


def extract_image_save_payload(message: str) -> dict[str, Any] | None:
    try:
        event = json.loads(message)
    except json.JSONDecodeError:
        return None

    response = event.get("Response") or {}
    if response.get("Event") != "IMAGE-SAVE":
        return None

    stats = response.get("ImageStatistics") or {}
    if not isinstance(stats, dict):
        return None

    return {"Response": {"Event": "IMAGE-SAVE", "ImageStatistics": stats}}


def handle_message(config: Config, message: str) -> None:
    payload = extract_image_save_payload(message)
    if payload is None:
        return

    stats = payload["Response"]["ImageStatistics"]
    target = stats.get("TargetName") or "?"
    filt = stats.get("Filter") or "?"
    exp = stats.get("ExposureTime") or "?"
    filename = stats.get("Filename") or ""

    log(f"IMAGE-SAVE: target={target} filter={filt} exp={exp}s file={filename}")
    try:
        result = post_to_app(config, payload)
    except Exception as exc:
        log(f"ingest failed: {exc}")
        notify(config, "DSO Sync erreur", f"Import NINA impossible: {exc}", tags="warning,telescope", priority="4")
        return

    if result.get("ignored"):
        reason = result.get("reason", "ignored")
        log(f"ignored by app: {reason}")
        return

    if result.get("duplicate"):
        log("duplicate frame ignored by app")
        return

    if result.get("ok"):
        msg = (
            f"{result.get('targetName', target)} · {result.get('filter', filt)} +{result.get('added', str(exp) + 's')}\n"
            f"NINA brut filtre: {result.get('rawFilter', '?')}\n"
            f"Validé filtre: {result.get('validatedFilter', '?')}"
        )
        log(msg.replace("\n", " | "))
        notify(config, "DSO Sync NINA", msg, tags="white_check_mark,telescope")
    else:
        log(f"app returned unexpected response: {result}")


def run_test(config: Config) -> None:
    check_app(config)
    payload = {
        "targetName": "M51 test NINA",
        "filter": "H-alpha",
        "exposureTime": 300,
        "subCount": 1,
        "filename": f"M51_test_NINA_{int(time.time())}.fits",
        "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    result = post_to_app(config, payload)
    log(f"test ingest response: {json.dumps(result, ensure_ascii=False)}")
    notify(config, "DSO Sync test", "Image test envoyée à l'app DSO", tags="test_tube,telescope")


def run_forever(config: Config) -> None:
    check_app(config)
    stop = False

    def on_signal(_signum: int, _frame: Any) -> None:
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    while not stop:
        ws: websocket.WebSocket | None = None
        try:
            log(f"connecting to NINA websocket: {config.nina_ws_url}")
            ws = websocket.create_connection(config.nina_ws_url, timeout=30)
            log("NINA websocket: connected")
            notify(config, "DSO Sync", "Connecté au WebSocket NINA", tags="satellite,telescope")

            while not stop:
                message = ws.recv()
                if isinstance(message, bytes):
                    message = message.decode("utf-8", errors="replace")
                handle_message(config, message)
        except Exception as exc:
            if stop:
                break
            log(f"NINA websocket error: {exc}")
            notify(config, "DSO Sync erreur", f"NINA WebSocket non joignable: {exc}", tags="warning,telescope", priority="4")
            time.sleep(10)
        finally:
            if ws is not None:
                try:
                    ws.close()
                except Exception:
                    pass

    log("stopped")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync NINA IMAGE-SAVE events to DSO Exposure Tracker")
    parser.add_argument("--test", action="store_true", help="send a fake test image to the DSO app and exit")
    args = parser.parse_args()

    try:
        config = load_config()
        if args.test:
            run_test(config)
        else:
            run_forever(config)
        return 0
    except Exception as exc:
        log(f"fatal: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
