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
import re
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
    fallback_filter: str | None


def getenv_required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_config() -> Config:
    load_dotenv()
    ntfy_topic = os.getenv("NTFY_TOPIC", "").strip() or None
    fallback = os.getenv("NINA_FALLBACK_FILTER", "L").strip()
    if fallback.lower() in {"", "none", "off", "false", "no"}:
        fallback = None
    return Config(
        dso_app_url=getenv_required("DSO_APP_URL").rstrip("/"),
        ingest_token=getenv_required("NINA_INGEST_TOKEN"),
        nina_ws_url=os.getenv("NINA_WS_URL", "ws://localhost:1888/v2/socket").strip(),
        ntfy_server=(os.getenv("NTFY_SERVER", "https://ntfy.sh").strip().rstrip("/") if ntfy_topic else None),
        ntfy_topic=ntfy_topic,
        ntfy_token=os.getenv("NTFY_TOKEN", "").strip() or None,
        fallback_filter=fallback,
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


def first_non_empty(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text and text != "?" and text.lower() not in {"none", "null"}:
            return text
    return ""


def stats_filter(stats: dict[str, Any]) -> str:
    return first_non_empty(
        stats.get("Filter"),
        stats.get("FilterName"),
        stats.get("FilterWheel"),
        stats.get("FilterWheelName"),
        stats.get("FilterPositionName"),
        stats.get("FilterInfo"),
    )


def stats_filename(stats: dict[str, Any]) -> str:
    return first_non_empty(
        stats.get("Filename"),
        stats.get("FileName"),
        stats.get("FilePath"),
        stats.get("Path"),
        stats.get("ImagePath"),
        stats.get("SavedFilePath"),
    )


def apply_filter_fallback(config: Config, payload: dict[str, Any]) -> str:
    stats = payload["Response"]["ImageStatistics"]
    detected_filter = stats_filter(stats)
    if detected_filter:
        return detected_filter
    if config.fallback_filter:
        payload["filter"] = config.fallback_filter
        return config.fallback_filter
    return "?"


def handle_message(config: Config, message: str) -> None:
    payload = extract_image_save_payload(message)
    if payload is None:
        return

    stats = payload["Response"]["ImageStatistics"]
    target = first_non_empty(stats.get("TargetName"), stats.get("Target"), stats.get("ObjectName"), stats.get("Object")) or "?"
    filt = apply_filter_fallback(config, payload)
    exp = stats.get("ExposureTime") or "?"
    filename = stats_filename(stats)

    fallback_note = "" if stats_filter(stats) else (" fallback" if config.fallback_filter else "")
    log(f"IMAGE-SAVE: target={target} filter={filt}{fallback_note} exp={exp}s file={filename}")
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


def replay_log(config: Config, log_path: str, fallback_filter: str | None = None) -> None:
    check_app(config)
    path = os.path.abspath(log_path)
    image_save_pattern = re.compile(
        r"^(?P<date>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) IMAGE-SAVE: "
        r"target=(?P<target>.*?) filter=(?P<filter>.*?) exp=(?P<exp>[0-9.]+)s file=(?P<file>.*)$"
    )

    total = 0
    sent = 0
    ignored = 0
    failed = 0

    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            match = image_save_pattern.match(line.strip())
            if not match:
                continue
            total += 1
            filt = match.group("filter").strip()
            if (not filt or filt == "?") and fallback_filter:
                filt = fallback_filter
            elif not filt:
                filt = "?"

            payload = {
                "targetName": match.group("target").strip(),
                "filter": filt,
                "exposureTime": float(match.group("exp")),
                "subCount": 1,
                "filename": match.group("file").strip(),
                "capturedAt": match.group("date").replace(" ", "T") + "Z",
            }
            try:
                result = post_to_app(config, payload)
            except Exception as exc:
                failed += 1
                log(f"replay failed: {payload['targetName']} {payload['filter']} {payload['filename']}: {exc}")
                continue

            if result.get("duplicate"):
                ignored += 1
                continue
            if result.get("ignored"):
                ignored += 1
                log(f"replay ignored: {payload['targetName']} {payload['filter']} {payload['filename']}: {result.get('reason')}")
                continue
            if result.get("ok"):
                sent += 1
                log(
                    f"replay inserted: {result.get('targetName', payload['targetName'])} · "
                    f"{result.get('filter', payload['filter'])} +{result.get('added', str(payload['exposureTime']) + 's')}"
                )
            else:
                failed += 1
                log(f"replay unexpected response: {result}")

    log(f"replay summary: total IMAGE-SAVE={total}, inserted={sent}, ignored/duplicates={ignored}, failed={failed}")


def run_test(config: Config, target_name: str, filter_name: str, exposure_time: int, panel_index: int) -> None:
    check_app(config)
    safe_target = target_name.strip() or "M51"
    safe_filter = filter_name.strip() or "H-alpha"
    safe_panel = max(1, min(20, int(panel_index or 1)))
    payload = {
        "targetName": safe_target,
        "filter": safe_filter,
        "exposureTime": exposure_time,
        "subCount": 1,
        "panelIndex": safe_panel,
        "filename": f"{safe_target.replace(' ', '_')}_P{safe_panel}_TEST_NINA_{int(time.time())}.fits",
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
            ws = websocket.create_connection(config.nina_ws_url, timeout=10)
            # The connection timeout above also becomes the socket read timeout.
            # NINA may remain idle for long periods with no IMAGE-SAVE event; this
            # must not be treated as an error. Wake up occasionally only to check
            # whether the agent should stop.
            ws.settimeout(300)
            log("NINA websocket: connected")
            notify(config, "DSO Sync", "Connecté au WebSocket NINA", tags="satellite,telescope")

            while not stop:
                try:
                    message = ws.recv()
                except websocket.WebSocketTimeoutException:
                    # Normal idle period: no image was saved by NINA.
                    continue
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
    parser.add_argument("--replay-log", help="replay IMAGE-SAVE lines from an agent log file, useful after a filter/config fix")
    parser.add_argument("--fallback-filter", help="fallback filter to use for empty-filter IMAGE-SAVE events during --replay-log; default comes from NINA_FALLBACK_FILTER, usually L")
    parser.add_argument("--test-target", default="M51", help="target name used by --test; default: M51")
    parser.add_argument("--test-filter", default="H-alpha", help="filter name used by --test; default: H-alpha")
    parser.add_argument("--test-exposure", type=int, default=300, help="exposure time in seconds used by --test; default: 300")
    parser.add_argument("--test-panel", type=int, default=1, help="panel index used by --test; default: 1")
    args = parser.parse_args()

    try:
        config = load_config()
        if args.fallback_filter:
            config.fallback_filter = args.fallback_filter
        if args.replay_log:
            replay_filter = config.fallback_filter
            replay_log(config, args.replay_log, replay_filter)
        elif args.test:
            run_test(config, args.test_target, args.test_filter, args.test_exposure, args.test_panel)
        else:
            run_forever(config)
        return 0
    except Exception as exc:
        log(f"fatal: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
