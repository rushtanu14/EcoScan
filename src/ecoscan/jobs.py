from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
import inspect
from threading import Lock
from typing import Dict, Optional
from uuid import uuid4


@dataclass
class JobRecord:
    job_id: str
    status: str = "queued"
    progress: int = 0
    stage: str = "queued"
    message: str = "Waiting to start"
    payload: Dict[str, object] = field(default_factory=dict)
    result: Dict[str, object] = field(default_factory=dict)
    error: str = ""
    report: Optional[Dict[str, object]] = None


_EXECUTOR = ThreadPoolExecutor(max_workers=2)
_LOCK = Lock()
_JOBS: Dict[str, JobRecord] = {}


def _set_job_state(job: JobRecord, *, status: Optional[str] = None, progress: Optional[int] = None, stage: Optional[str] = None, message: Optional[str] = None) -> None:
    with _LOCK:
        if status is not None:
            job.status = status
        if progress is not None:
            job.progress = max(0, min(int(progress), 100))
        if stage is not None:
            job.stage = stage
        if message is not None:
            job.message = message


def _runner_accepts_progress(runner) -> bool:
    try:
        signature = inspect.signature(runner)
    except (TypeError, ValueError):
        return False

    for parameter in signature.parameters.values():
        if parameter.kind == inspect.Parameter.VAR_KEYWORD:
            return True
    return "progress_callback" in signature.parameters


def create_job(payload: Dict[str, object], runner) -> JobRecord:
    job = JobRecord(job_id=uuid4().hex, payload=payload)
    with _LOCK:
        _JOBS[job.job_id] = job

    def _report_progress(progress: int, stage: str, message: str) -> None:
        _set_job_state(job, progress=progress, stage=stage, message=message)

    def _work() -> None:
        try:
            _set_job_state(job, status="running", progress=5, stage="initializing", message="Preparing analysis job")
            if _runner_accepts_progress(runner):
                job.result = runner(payload, progress_callback=_report_progress)
            else:
                job.result = runner(payload)
            _set_job_state(job, status="completed", progress=100, stage="completed", message="Analysis complete")
        except Exception as exc:
            with _LOCK:
                job.error = str(exc)
            _set_job_state(job, status="failed", stage="failed", message=str(exc))

    _EXECUTOR.submit(_work)
    return job


def get_job(job_id: str) -> Optional[JobRecord]:
    with _LOCK:
        return _JOBS.get(job_id)


def attach_report(job_id: str, report_payload: Dict[str, object]) -> Optional[JobRecord]:
    with _LOCK:
        job = _JOBS.get(job_id)
        if job:
            job.report = report_payload
        return job
