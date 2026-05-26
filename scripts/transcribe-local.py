#!/usr/bin/env python3
"""Bridge script: transcribe an audio file using Hermes' built-in faster-whisper.

Invoked by src/routes/api/transcribe.ts when stt.provider == "local". Reuses
the Hermes _transcribe_local implementation so model caching, CUDA detection,
CPU/int8 fallback, and ffmpeg conversion all match what the agent itself uses.

Usage:
  transcribe-local.py <audio_file> [--model NAME] [--language LANG]

Prints a single JSON object to stdout:
  {"ok": true,  "text": "..."}                     on success
  {"ok": false, "error": "human-readable message"} on failure

Always exits 0 — the JSON envelope carries the success/failure flag so the
Node caller can parse a single contract without juggling exit codes.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Locate the Hermes agent install so we can import its transcription module.
# Order: explicit env var > standard install path > die with a useful error.
_HERMES_ROOT = os.environ.get("HERMES_AGENT_ROOT") or str(
    Path.home() / ".hermes" / "hermes-agent"
)


def _emit(payload: dict) -> None:
    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    sys.stdout.flush()


def _fail(message: str) -> None:
    _emit({"ok": False, "error": message})
    sys.exit(0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio_file")
    parser.add_argument("--model", default="base")
    parser.add_argument("--language", default=None)
    args = parser.parse_args()

    audio_path = Path(args.audio_file)
    if not audio_path.exists():
        _fail(f"audio file not found: {audio_path}")

    if not Path(_HERMES_ROOT).is_dir():
        _fail(
            f"Hermes agent not found at {_HERMES_ROOT}. "
            "Set HERMES_AGENT_ROOT to override, or install hermes-agent."
        )

    # Hermes' tool modules import as top-level packages (tools, agent, ...)
    # because the venv puts the agent root on sys.path. Replicate that here
    # so we work whether or not we're invoked from the venv's python.
    sys.path.insert(0, _HERMES_ROOT)

    try:
        from tools.transcription_tools import _transcribe_local  # type: ignore
    except ImportError as exc:
        _fail(
            f"faster-whisper bridge unavailable: {exc}. "
            f"Run `~/.hermes/hermes-agent/venv/bin/pip install faster-whisper`."
        )

    # Hermes reads stt.local.language from config.yaml; for the web frontend
    # we let the request override per-call via --language.
    if args.language:
        os.environ["HERMES_LOCAL_STT_LANGUAGE"] = args.language

    try:
        result = _transcribe_local(str(audio_path), args.model)
    except Exception as exc:  # noqa: BLE001 — script boundary, surface anything
        _fail(f"transcription crashed: {exc}")

    if not isinstance(result, dict) or not result.get("success"):
        _fail(str(result.get("error") if isinstance(result, dict) else result))

    text = str(result.get("transcript") or "").strip()
    _emit({"ok": True, "text": text})


if __name__ == "__main__":
    main()
