"""Desktop launcher for EcoScan using a native app window (pywebview)."""

from __future__ import annotations

import argparse
import atexit
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional


ROOT_DIR = Path(__file__).resolve().parents[2]
DESKTOP_PID_FILE = ROOT_DIR / ".ecoscan.desktop.pid"
DESKTOP_BACKEND_PID_FILE = ROOT_DIR / ".ecoscan.desktop.backend.pid"


def _write_pid(path: Path, pid: int) -> None:
    path.write_text(f"{pid}\n", encoding="utf-8")


def _remove_pid(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def _wait_for_backend(url: str, timeout_seconds: float = 12.0) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=0.9):
                return True
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.25)
    return False


class DesktopApp:
    def __init__(self, port: int, data_dir: str, backend_extra_args: list[str]) -> None:
        self.port = port
        self.data_dir = data_dir
        self.backend_extra_args = backend_extra_args
        self.backend_proc: Optional[subprocess.Popen[str]] = None

    @property
    def health_url(self) -> str:
        return f"http://127.0.0.1:{self.port}/health"

    @property
    def app_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start_backend(self) -> None:
        env = os.environ.copy()
        src_path = str(ROOT_DIR / "src")
        existing = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = src_path if not existing else f"{src_path}{os.pathsep}{existing}"

        cmd = [
            sys.executable,
            "-m",
            "ecoscan.cli",
            "serve",
            "--data-dir",
            self.data_dir,
            "--port",
            str(self.port),
            *self.backend_extra_args,
        ]
        self.backend_proc = subprocess.Popen(cmd, cwd=str(ROOT_DIR), env=env)
        _write_pid(DESKTOP_BACKEND_PID_FILE, self.backend_proc.pid)

        if not _wait_for_backend(self.health_url):
            raise RuntimeError(f"Backend failed to start on port {self.port}")

    def stop_backend(self) -> None:
        if not self.backend_proc:
            _remove_pid(DESKTOP_BACKEND_PID_FILE)
            return

        if self.backend_proc.poll() is None:
            self.backend_proc.terminate()
            try:
                self.backend_proc.wait(timeout=5.0)
            except subprocess.TimeoutExpired:
                self.backend_proc.kill()
                self.backend_proc.wait(timeout=2.0)

        _remove_pid(DESKTOP_BACKEND_PID_FILE)
        self.backend_proc = None

    def cleanup(self) -> None:
        self.stop_backend()
        _remove_pid(DESKTOP_PID_FILE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Launch EcoScan in a native desktop window.")
    parser.add_argument("--port", type=int, default=8000, help="Backend port (default: 8000)")
    parser.add_argument(
        "--data-dir",
        default="data/sample_inputs",
        help="Path to input data directory (default: data/sample_inputs)",
    )
    parser.add_argument(
        "backend_args",
        nargs=argparse.REMAINDER,
        help="Additional args forwarded to ecoscan.cli serve",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.backend_args and args.backend_args[0] == "--":
        args.backend_args = args.backend_args[1:]

    app = DesktopApp(port=args.port, data_dir=args.data_dir, backend_extra_args=args.backend_args)
    _write_pid(DESKTOP_PID_FILE, os.getpid())
    atexit.register(app.cleanup)

    def _handle_signal(_signum: int, _frame: object) -> None:
        app.cleanup()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    try:
        app.start_backend()
    except Exception as exc:  # pragma: no cover - startup guard
        app.cleanup()
        print(f"EcoScan desktop launcher error: {exc}", file=sys.stderr)
        return 1

    try:
        import webview
    except ImportError:
        app.cleanup()
        print(
            "pywebview is not installed.\n"
            "Install it with: python3 -m pip install pywebview",
            file=sys.stderr,
        )
        return 1

    print(f"EcoScan desktop window opening at {app.app_url}")
    window = webview.create_window(
        "EcoScan",
        app.app_url,
        width=1320,
        height=900,
        min_size=(980, 640),
        background_color="#05070c",
    )
    webview.start(debug=False)
    app.cleanup()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
