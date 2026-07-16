#!/usr/bin/env python3
"""Keep Hermes' oMLX provider config aligned with local oMLX state."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from copy import deepcopy
from pathlib import Path
from typing import Any

from ruamel.yaml import YAML


HOME = Path.home()
DEFAULT_HERMES_CONFIG = HOME / ".hermes" / "config.yaml"
DEFAULT_OMLX_SETTINGS = HOME / ".omlx" / "settings.json"
DEFAULT_OMLX_MODEL_SETTINGS = HOME / ".omlx" / "model_settings.json"
DEFAULT_STATE = HOME / ".hermes" / "omlx-hermes-sync.state.json"
DEFAULT_BASE_URL = "http://127.0.0.1:8000/v1"
DEFAULT_INTERVAL = 3.0


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception as exc:
        print(f"warn: failed to read {path}: {exc}", file=sys.stderr)
        return {}


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def atomic_write_yaml(path: Path, data: Any, yaml: YAML) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        yaml.dump(data, f)
    tmp.replace(path)


def model_ids_from_response(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        raw = payload.get("data", [])
    else:
        raw = payload
    out: list[dict[str, Any]] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if isinstance(item, dict) and item.get("id"):
            out.append(item)
        elif isinstance(item, str):
            out.append({"id": item})
    return out


def fetch_models(base_url: str, api_key: str, timeout: float) -> list[dict[str, Any]]:
    url = base_url.rstrip("/") + "/models"
    req = urllib.request.Request(url)
    if api_key:
        req.add_header("Authorization", f"Bearer {api_key}")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return model_ids_from_response(payload)


def first_default_model(model_settings: dict[str, Any]) -> str:
    models = model_settings.get("models")
    if not isinstance(models, dict):
        return ""
    for model_id, cfg in models.items():
        if isinstance(cfg, dict) and cfg.get("is_default") is True:
            return str(model_id)
    return ""


def int_or_none(value: Any) -> int | None:
    try:
        ivalue = int(value)
    except (TypeError, ValueError):
        return None
    return ivalue if ivalue > 0 else None


def model_setting(model_settings: dict[str, Any], model_id: str, key: str) -> int | None:
    models = model_settings.get("models")
    if not isinstance(models, dict):
        return None
    cfg = models.get(model_id)
    if not isinstance(cfg, dict):
        return None
    return int_or_none(cfg.get(key))


def effective_context(
    model_id: str,
    model_settings: dict[str, Any],
    omlx_settings: dict[str, Any],
    model_meta: dict[str, Any],
) -> int | None:
    per_model = model_setting(model_settings, model_id, "max_context_window")
    if per_model:
        return per_model
    sampling = omlx_settings.get("sampling")
    if isinstance(sampling, dict):
        global_ctx = int_or_none(sampling.get("max_context_window"))
        if global_ctx:
            return global_ctx
    return int_or_none(model_meta.get("max_model_len"))


def effective_max_tokens(
    model_id: str,
    model_settings: dict[str, Any],
    omlx_settings: dict[str, Any],
) -> int | None:
    per_model = model_setting(model_settings, model_id, "max_tokens")
    if per_model:
        return per_model
    sampling = omlx_settings.get("sampling")
    if isinstance(sampling, dict):
        return int_or_none(sampling.get("max_tokens"))
    return None


def sync_once(args: argparse.Namespace) -> bool:
    yaml = YAML()
    yaml.preserve_quotes = True

    omlx_settings = load_json(args.omlx_settings)
    model_settings = load_json(args.omlx_model_settings)

    with args.hermes_config.open(encoding="utf-8") as f:
        hermes = yaml.load(f) or {}
    if not isinstance(hermes, dict):
        raise RuntimeError(f"invalid Hermes config shape: {args.hermes_config}")

    providers = hermes.setdefault("providers", {})
    if not isinstance(providers, dict):
        providers = {}
        hermes["providers"] = providers

    provider_cfg = providers.setdefault("omlx", {})
    if not isinstance(provider_cfg, dict):
        provider_cfg = {}
        providers["omlx"] = provider_cfg

    base_url = str(provider_cfg.get("base_url") or args.base_url or DEFAULT_BASE_URL).rstrip("/")
    api_key = str(
        provider_cfg.get("api_key")
        or omlx_settings.get("auth", {}).get("api_key", "")
        or ""
    )

    live_models = fetch_models(base_url, api_key, args.timeout)
    if not live_models:
        return False

    live_by_id = {str(item["id"]): item for item in live_models if item.get("id")}
    live_ids = list(live_by_id)
    current_default = str(hermes.get("model", {}).get("default") or "")
    omlx_default = first_default_model(model_settings)
    target_default = (
        omlx_default
        if omlx_default in live_by_id
        else current_default
        if current_default in live_by_id
        else live_ids[0]
    )

    old = deepcopy(hermes)

    if args.remove_legacy_local:
        providers.pop("local-localhost:8080", None)

    provider_cfg["name"] = "oMLX"
    provider_cfg["base_url"] = base_url
    if api_key:
        provider_cfg["api_key"] = api_key
    provider_cfg["api_mode"] = "chat_completions"
    provider_cfg["default_model"] = target_default
    provider_cfg["discover_models"] = True

    existing_models = provider_cfg.get("models")
    if not isinstance(existing_models, dict):
        existing_models = {}
    next_models: dict[str, Any] = {}
    for model_id in live_ids:
        cfg = existing_models.get(model_id)
        if not isinstance(cfg, dict):
            cfg = {}
        ctx = effective_context(model_id, model_settings, omlx_settings, live_by_id[model_id])
        if ctx:
            cfg["context_length"] = ctx
        next_models[model_id] = cfg
    provider_cfg["models"] = next_models

    model_cfg = hermes.setdefault("model", {})
    if not isinstance(model_cfg, dict):
        model_cfg = {}
        hermes["model"] = model_cfg
    model_cfg["provider"] = "omlx"
    model_cfg["base_url"] = base_url
    model_cfg["default"] = target_default
    model_cfg["supports_vision"] = False
    active_ctx = effective_context(
        target_default, model_settings, omlx_settings, live_by_id[target_default]
    )
    if active_ctx:
        model_cfg["context_length"] = active_ctx
    active_max_tokens = effective_max_tokens(target_default, model_settings, omlx_settings)
    if args.sync_max_tokens and active_max_tokens:
        model_cfg["max_tokens"] = active_max_tokens

    changed = hermes != old
    snapshot = {
        "synced_at": int(time.time()),
        "base_url": base_url,
        "model_count": len(live_ids),
        "default_model": target_default,
        "model.context_length": model_cfg.get("context_length"),
        "model.max_tokens": model_cfg.get("max_tokens"),
        "sync_max_tokens": bool(args.sync_max_tokens),
        "changed": changed,
    }
    if changed:
        atomic_write_yaml(args.hermes_config, hermes, yaml)
        print(f"synced oMLX -> Hermes: {snapshot}", flush=True)
    else:
        print(f"oMLX -> Hermes already synced: {snapshot}", flush=True)
    atomic_write_json(args.state, snapshot)
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-config", type=Path, default=DEFAULT_HERMES_CONFIG)
    parser.add_argument("--omlx-settings", type=Path, default=DEFAULT_OMLX_SETTINGS)
    parser.add_argument("--omlx-model-settings", type=Path, default=DEFAULT_OMLX_MODEL_SETTINGS)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--interval", type=float, default=DEFAULT_INTERVAL)
    parser.add_argument("--timeout", type=float, default=2.5)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--sync-max-tokens", action="store_true")
    parser.add_argument("--remove-legacy-local", action="store_true", default=True)
    args = parser.parse_args()

    while True:
        try:
            sync_once(args)
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"warn: oMLX unavailable: {exc}", file=sys.stderr, flush=True)
        except Exception as exc:
            print(f"error: sync failed: {exc}", file=sys.stderr, flush=True)
        if args.once:
            return 0
        time.sleep(max(1.0, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
