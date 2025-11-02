"""Spin up the full ChordLab stack (engine + Web UI) with one command."""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
WEB_UI_DIR = REPO_ROOT / "minilab-ui"

ENGINE_CMD = [sys.executable, str(REPO_ROOT / "run_engine.py"), "--auto"]
WEB_CMD = ["npm", "run", "dev"]

PAD_NOTES_DEFAULT = "36,37,38,39,40,41,42,43"


def ensure_node_modules() -> None:
    node_modules = WEB_UI_DIR / "node_modules"
    if node_modules.exists():
        return

    print("[setup] Installing npm dependencies for Web UI…")
    subprocess.run(["npm", "install"], cwd=WEB_UI_DIR, check=True)


def start_process(cmd: list[str], *, cwd: Path, env: dict[str, str]) -> subprocess.Popen:
    return subprocess.Popen(cmd, cwd=cwd, env=env)


def main() -> int:
    ensure_node_modules()

    env = os.environ.copy()
    env.setdefault("CHORDLAB_PAD_NOTES", PAD_NOTES_DEFAULT)

    print("[engine] Starting MiniLab chord engine (auto-detect ports)…")
    engine_proc = start_process(ENGINE_CMD, cwd=REPO_ROOT, env=env)

    # Give the engine a moment to discover ports so the UI can connect afterwards.
    time.sleep(2)

    print("[web] Starting WebMIDI UI (Vite dev server)…")
    web_proc = start_process(WEB_CMD, cwd=WEB_UI_DIR, env=env)

    # Attempt to open the UI in the default browser after Vite boots.
    ui_url = "http://localhost:5173/"
    print(f"[web] Opening {ui_url} in your default browser (Ctrl+C to stop everything)…")

    time.sleep(3)
    try:
        webbrowser.open(ui_url, new=2)
    except Exception as exc:  # pragma: no cover - browser failures not fatal
        print(f"[warn] Could not open browser automatically: {exc}")

    def shutdown() -> None:
        print("\n[shutdown] Stopping processes…")
        for proc, label in ((engine_proc, "engine"), (web_proc, "web")):
            if proc.poll() is None:
                try:
                    proc.send_signal(signal.SIGINT)
                    proc.wait(timeout=5)
                except Exception:
                    proc.kill()
        print("[shutdown] Done.")

    def handle_sigint(signum, frame):  # type: ignore[override]
        shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_sigint)
    signal.signal(signal.SIGTERM, handle_sigint)

    try:
        while True:
            if engine_proc.poll() is not None:
                print("[engine] exited unexpectedly")
                shutdown()
                return engine_proc.returncode or 1
            if web_proc.poll() is not None:
                print("[web] dev server exited (check terminal for logs)")
                shutdown()
                return web_proc.returncode or 1
            time.sleep(1)
    except KeyboardInterrupt:
        shutdown()
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
