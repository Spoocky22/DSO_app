#!/usr/bin/env python3
"""
DSO/NINA raw acquisition sync agent.

Runs on the Windows PC where N.I.N.A. is running, listens to the Advanced API
WebSocket IMAGE-SAVE event, and pushes each saved light frame to the DSO app.
It can also send an end-of-night ntfy summary after a configurable idle time.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import sys
import time
from dataclasses import dataclass, field
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
    ntfy_notify_each_image: bool
    ntfy_notify_connection: bool
    ntfy_notify_errors: bool
    ntfy_end_of_night_summary: bool
    ntfy_night_idle_seconds: int
    fallback_filter: str | None


@dataclass
class NightFrame:
    target_name: str
    panel_index: int
    filter_name: str
    seconds: int
    sub_count: int


@dataclass
class NightSummary:
    frames: list[NightFrame] = field(default_factory=list)
    first_activity_at: float | None = None
    last_activity_at: float | None = None
    summary_sent: bool = False

    def record(self, frame: NightFrame, idle_seconds: int) -> None:
        now = time.time()
        # If a previous night was already summarized and a new frame appears long
        # after it, start a new night summary rather than accumulating forever.
        if self.summary_sent and self.last_activity_at and now - self.last_activity_at >= idle_seconds:
            self.frames.clear()
            self.first_activity_at = None

        if not self.frames:
            self.first_activity_at = now

        self.frames.append(frame)
        self.last_activity_at = now
        self.summary_sent = False

    def should_send(self, idle_seconds: int) -> bool:
        if not self.frames or self.summary_sent or self.last_activity_at is None:
            return False
        return time.time() - self.last_activity_at >= idle_seconds


def getenv_required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name, "").strip().lower()
    if not value:
        return default
    if value in {"1", "true", "yes", "y", "on", "oui"}:
        return True
    if value in {"0", "false", "no", "n", "off", "non"}:
        return False
    return default


def env_int(name: str, default: int, minimum: int = 1, maximum: int | None = None) -> int:
    try:
        value = int(float(os.getenv(name, "").strip()))
    except Exception:
        value = default
    value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
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
        ntfy_notify_each_image=env_bool("NTFY_NOTIFY_EACH_IMAGE", False),
        ntfy_notify_connection=env_bool("NTFY_NOTIFY_CONNECTION", False),
        ntfy_notify_errors=env_bool("NTFY_NOTIFY_ERRORS", True),
        ntfy_end_of_night_summary=env_bool("NTFY_END_OF_NIGHT_SUMMARY", True),
        ntfy_night_idle_seconds=env_int("NTFY_NIGHT_IDLE_MINUTES", 45, minimum=5, maximum=24 * 60) * 60,
        fallback_filter=fallback,
    )


def log(message: str) -> None:
    print(time.strftime("%Y-%m-%d %H:%M:%S"), message, flush=True)


def format_duration(total_seconds: int | float) -> str:
    seconds = max(0, int(round(total_seconds)))
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h}h {m:02d}m" if m else f"{h}h"
    if m > 0:
        return f"{m}m {s:02d}s" if s else f"{m}m"
    return f"{s}s"

def normalize_filter_name(raw: Any) -> str | None:
    value = str(raw or "").strip()
    compact = re.sub(r"[\s_\-]+", "", value.lower())
    if compact in {"l", "lum", "luminance", "clear", "empty", "?"}:
        return "L"
    if compact in {"r", "red", "rouge"}:
        return "R"
    if compact in {"g", "green", "vert", "verte", "v", "visual", "johnsonv", "photometricv"}:
        return "G"
    if compact in {"b", "blue", "bleu", "bleue"}:
        return "B"
    if compact in {"h", "ha", "halpha", "hα", "hydrogenalpha", "hydrogen-alpha"}:
        return "H-alpha"
    if compact in {"o", "oiii", "o3", "oxygen", "oxygeniii", "oxygen3"}:
        return "OIII"
    if compact in {"s", "sii", "s2", "sulfur", "sulfurii", "sulphur", "sulphurii", "soufre", "soufreii"}:
        return "SII"
    return None


def detect_filter_from_text(*values: str) -> str | None:
    combined = "/".join(value for value in values if value)
    if not combined:
        return None
    tokens = [token for token in re.split(r"[\\/\s_\-.()[\]{}]+", combined) if token]

    # Narrowband first. A single isolated O/S token in the NINA filename is a
    # shorthand for OIII/SII in this setup.
    for token in tokens:
        normalized = normalize_filter_name(token)
        if normalized and normalized not in {"L", "R", "G", "B"}:
            return normalized

    for token in tokens:
        normalized = normalize_filter_name(token)
        if normalized in {"L", "R", "G", "B", "OIII", "SII"}:
            return normalized
    return None


def parse_loose_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    text = str(value).strip().replace(",", ".")
    if not text or text == "?" or text.lower() == "nan":
        return None
    try:
        return float(text)
    except Exception:
        pass
    match = re.search(r"[-+]?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except Exception:
        return None


def first_number(*values: Any) -> float | None:
    for value in values:
        parsed = parse_loose_number(value)
        if parsed is not None:
            return parsed
    return None


def numeric_from_text(label: str, *values: str) -> float | None:
    combined = " ".join(value for value in values if value)
    if not combined:
        return None
    patterns = [
        rf"(?:^|[^A-Za-z0-9]){re.escape(label)}(?:[^0-9+\-]{{0,12}})(\d+(?:[.,]\d+)?)",
        rf"(?:^|[^A-Za-z0-9]){re.escape(label)}[-_ ]*(\d+(?:[.,]\d+)?)",
    ]
    for pattern in patterns:
        match = re.search(pattern, combined, flags=re.IGNORECASE)
        if match:
            return parse_loose_number(match.group(1))
    return None




def strip_extension(path: str) -> str:
    name = os.path.basename(str(path or ""))
    # NINA events sometimes omit the extension. This is harmless if absent.
    return re.sub(r"\.(?:fit|fits|xisf|tif|tiff|raw|cr2|cr3|nef|arw)$", "", name, flags=re.IGNORECASE)


def extract_quality_from_positional_filename(filename: str) -> dict[str, float | None]:
    """Parse NINA filename patterns ending in ..._$FRAMENR$_$HFR$_$SQM$.

    Example from NINA preview:
      M33_LIGHT_2016-01-01_12-00-00_L_-15_1600_10.21_0001_3.25_21.83

    The last five fields are then expected to be:
      exposure, frame number, HFR, SQM
    with sensor temperature / gain just before them. We only accept the parse
    when the frame-number field looks like an integer, to avoid misreading old
    filenames that end with ..._EXPOSURE_FRAMENR.
    """
    stem = strip_extension(filename)
    tokens = [t.strip() for t in stem.split("_") if t.strip()]
    result: dict[str, float | None] = {"hfr": None, "fwhm": None, "sqm": None}
    if len(tokens) < 5:
        return result

    frame_token = tokens[-3]
    exposure_token = tokens[-4]
    hfr_token = tokens[-2]
    sqm_token = tokens[-1]

    # Frame number is usually 0001. Exposure should be positive. These checks
    # prevent old names like ..._B_-10.00_126_180.00_0041 from being parsed as
    # HFR/SQM.
    if not re.fullmatch(r"\d+", frame_token):
        return result
    exposure = parse_loose_number(exposure_token)
    if exposure is None or exposure <= 0:
        return result

    hfr = parse_loose_number(hfr_token)
    sqm = parse_loose_number(sqm_token)
    if hfr is not None and 0 < hfr < 50:
        result["hfr"] = hfr
    if sqm is not None and 0 < sqm < 40:
        result["sqm"] = sqm
    return result

def extract_quality(stats: dict[str, Any], filename: str) -> dict[str, float | None]:
    positional = extract_quality_from_positional_filename(filename)
    hfr = first_number(
        stats.get("HFR"), stats.get("Hfr"), stats.get("HFD"), stats.get("Hfd"),
        stats.get("HalfFluxRadius"), stats.get("HalfFluxDiameter"),
        numeric_from_text("HFR", filename), numeric_from_text("HFD", filename), positional.get("hfr"),
    )
    fwhm = first_number(
        stats.get("FWHM"), stats.get("Fwhm"), stats.get("StarFWHM"), stats.get("StarFwhm"),
        stats.get("STARFWHM"), numeric_from_text("FWHM", filename), positional.get("fwhm"),
    )
    sqm = first_number(
        stats.get("SQM"), stats.get("Sqm"), stats.get("SkyQuality"),
        stats.get("SkyQualityMagnitude"), stats.get("SkyBrightness"), numeric_from_text("SQM", filename), positional.get("sqm"),
    )
    return {
        "hfr": hfr if hfr is not None and hfr > 0 else None,
        "fwhm": fwhm if fwhm is not None and fwhm > 0 else None,
        "sqm": sqm if sqm is not None and sqm > 0 else None,
    }


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
    if config.ntfy_notify_connection:
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
    filename = stats_filename(stats)
    # Le fichier est prioritaire : le champ filtre de l'évènement peut être vide
    # ou valoir "?", alors que le pattern de sauvegarde contient _O_, _S_, _B_, etc.
    detected_filter = detect_filter_from_text(filename) or normalize_filter_name(stats_filter(stats))
    if detected_filter:
        payload["filter"] = detected_filter
        return detected_filter
    if config.fallback_filter:
        payload["filter"] = config.fallback_filter
        return config.fallback_filter
    return "?"


def record_summary_from_result(summary: NightSummary, result: dict[str, Any], fallback_target: str, fallback_filter: str, fallback_exp: Any, config: Config) -> None:
    if not result.get("ok") or not result.get("inserted"):
        return

    try:
        added_seconds = int(result.get("addedSeconds") or result.get("subExposure") or fallback_exp or 0)
    except Exception:
        added_seconds = 0
    try:
        sub_count = int(result.get("subCount") or 1)
    except Exception:
        sub_count = 1

    if added_seconds <= 0:
        return

    try:
        panel_index = int(result.get("panelIndex") or 1)
    except Exception:
        panel_index = 1

    summary.record(
        NightFrame(
            target_name=str(result.get("targetName") or fallback_target or "?").strip() or "?",
            panel_index=max(1, panel_index),
            filter_name=str(result.get("filter") or fallback_filter or "?").strip() or "?",
            seconds=added_seconds,
            sub_count=max(1, sub_count),
        ),
        idle_seconds=config.ntfy_night_idle_seconds,
    )


def summarize_frames(frames: list[NightFrame]) -> str:
    total_seconds = sum(frame.seconds for frame in frames)
    total_subs = sum(frame.sub_count for frame in frames)

    by_filter: dict[str, tuple[int, int]] = {}
    by_target: dict[str, tuple[int, int]] = {}

    for frame in frames:
        f_seconds, f_subs = by_filter.get(frame.filter_name, (0, 0))
        by_filter[frame.filter_name] = (f_seconds + frame.seconds, f_subs + frame.sub_count)

        target_key = f"{frame.target_name} P{frame.panel_index}" if frame.panel_index > 1 else frame.target_name
        t_seconds, t_subs = by_target.get(target_key, (0, 0))
        by_target[target_key] = (t_seconds + frame.seconds, t_subs + frame.sub_count)

    filter_lines = [
        f"- {name}: {format_duration(seconds)} ({subs} poses)"
        for name, (seconds, subs) in sorted(by_filter.items(), key=lambda item: item[1][0], reverse=True)
    ]
    target_lines = [
        f"- {name}: {format_duration(seconds)} ({subs} poses)"
        for name, (seconds, subs) in sorted(by_target.items(), key=lambda item: item[1][0], reverse=True)[:8]
    ]

    message = [
        f"Total NINA brut: {format_duration(total_seconds)} ({total_subs} poses)",
        "",
        "Par filtre:",
        *(filter_lines or ["- aucun filtre"]),
    ]
    if target_lines:
        message.extend(["", "Par cible:", *target_lines])
    return "\n".join(message)


def maybe_send_idle_summary(config: Config, summary: NightSummary) -> None:
    if not config.ntfy_end_of_night_summary or not config.ntfy_topic:
        return
    if not summary.should_send(config.ntfy_night_idle_seconds):
        return

    idle_minutes = config.ntfy_night_idle_seconds // 60
    message = summarize_frames(summary.frames)
    notify(
        config,
        f"DSO fin de nuit · idle {idle_minutes} min",
        message,
        tags="bar_chart,telescope,night_with_stars",
        priority="4",
    )
    log("end-of-night ntfy summary sent")
    summary.summary_sent = True


def handle_message(config: Config, message: str, summary: NightSummary) -> None:
    payload = extract_image_save_payload(message)
    if payload is None:
        return

    stats = payload["Response"]["ImageStatistics"]
    target = first_non_empty(stats.get("TargetName"), stats.get("Target"), stats.get("ObjectName"), stats.get("Object")) or "?"
    filt = apply_filter_fallback(config, payload)
    exp = stats.get("ExposureTime") or "?"
    filename = stats_filename(stats)
    quality = extract_quality(stats, filename)
    if any(value is not None for value in quality.values()):
        payload["imageQuality"] = quality

    fallback_note = "" if stats_filter(stats) or detect_filter_from_text(filename) else (" fallback" if config.fallback_filter else "")
    quality_note = ""
    if quality.get("hfr") is not None:
        quality_note += f" hfr={quality['hfr']:.2f}"
    if quality.get("fwhm") is not None:
        quality_note += f" fwhm={quality['fwhm']:.2f}"
    if quality.get("sqm") is not None:
        quality_note += f" sqm={quality['sqm']:.2f}"
    log(f"IMAGE-SAVE: target={target} filter={filt}{fallback_note} exp={exp}s file={filename}{quality_note}")
    try:
        result = post_to_app(config, payload)
    except Exception as exc:
        log(f"ingest failed: {exc}")
        if config.ntfy_notify_errors:
            notify(config, "DSO Sync erreur", f"Import NINA impossible: {exc}", tags="warning,telescope", priority="4")
        return

    if result.get("ignored") and not result.get("duplicate"):
        reason = result.get("reason", "ignored")
        log(f"ignored by app: {reason}")
        return

    if result.get("duplicate"):
        log("duplicate frame ignored by app")
        return

    if result.get("ok"):
        record_summary_from_result(summary, result, target, filt, exp, config)
        msg = (
            f"{result.get('targetName', target)} · {result.get('filter', filt)} +{result.get('added', str(exp) + 's')}\n"
            f"NINA brut filtre: {result.get('rawFilter', '?')}\n"
            f"Validé filtre: {result.get('validatedFilter', '?')}"
        )
        log(msg.replace("\n", " | "))
        if config.ntfy_notify_each_image:
            notify(config, "DSO Sync NINA", msg, tags="white_check_mark,telescope")
    else:
        log(f"app returned unexpected response: {result}")


def replay_log(config: Config, log_path: str, fallback_filter: str | None = None) -> None:
    check_app(config)
    path = os.path.abspath(log_path)
    image_save_pattern = re.compile(
        r"^(?P<date>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) IMAGE-SAVE: "
        r"target=(?P<target>.*?) filter=(?P<filter>.*?) exp=(?P<exp>[0-9.]+)s file=(?P<file>.*?)(?:\s+hfr=(?P<hfr>[0-9.,]+))?(?:\s+fwhm=(?P<fwhm>[0-9.,]+))?(?:\s+sqm=(?P<sqm>[0-9.,]+))?$"
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
            file_name = match.group("file").strip()
            if not filt or filt == "?" or filt.endswith(" fallback"):
                filt = detect_filter_from_text(file_name) or fallback_filter or "?"
            else:
                filt = normalize_filter_name(filt.replace(" fallback", "")) or detect_filter_from_text(file_name) or fallback_filter or filt

            quality = {
                "hfr": parse_loose_number(match.group("hfr")),
                "fwhm": parse_loose_number(match.group("fwhm")),
                "sqm": parse_loose_number(match.group("sqm")),
            }
            if not any(value is not None and value > 0 for value in quality.values()):
                quality = extract_quality({}, file_name)

            payload = {
                "targetName": match.group("target").strip(),
                "filter": filt,
                "exposureTime": float(match.group("exp")),
                "subCount": 1,
                "filename": file_name,
                "capturedAt": match.group("date").replace(" ", "T") + "Z",
            }
            if any(value is not None and value > 0 for value in quality.values()):
                payload["imageQuality"] = quality
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
    summary = NightSummary()
    last_ws_error_notify_at = 0.0

    def on_signal(_signum: int, _frame: Any) -> None:
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    while not stop:
        ws: websocket.WebSocket | None = None
        connected_once = False
        try:
            log(f"connecting to NINA websocket: {config.nina_ws_url}")
            ws = websocket.create_connection(config.nina_ws_url, timeout=10)
            # NINA may remain idle for long periods. Use a moderate timeout only
            # to wake up and check whether an end-of-night summary must be sent.
            ws.settimeout(60)
            connected_once = True
            log("NINA websocket: connected")
            if config.ntfy_notify_connection:
                notify(config, "DSO Sync", "Connecté au WebSocket NINA", tags="satellite,telescope")

            while not stop:
                try:
                    message = ws.recv()
                except websocket.WebSocketTimeoutException:
                    maybe_send_idle_summary(config, summary)
                    continue
                if isinstance(message, bytes):
                    message = message.decode("utf-8", errors="replace")
                handle_message(config, message, summary)
                maybe_send_idle_summary(config, summary)
        except Exception as exc:
            if stop:
                break
            log(f"NINA websocket error: {exc}")
            now = time.time()
            if config.ntfy_notify_errors and (connected_once or now - last_ws_error_notify_at > 15 * 60):
                notify(config, "DSO Sync erreur", f"NINA WebSocket non joignable: {exc}", tags="warning,telescope", priority="4")
                last_ws_error_notify_at = now
            time.sleep(10)
        finally:
            if ws is not None:
                try:
                    ws.close()
                except Exception:
                    pass

    maybe_send_idle_summary(config, summary)
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
