from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from threading import Lock
from typing import Dict, Optional
from uuid import uuid4


@dataclass
class JobRecord:
    job_id: str
    status: str = "queued"
    payload: Dict[str, object] = field(default_factory=dict)
    result: Dict[str, object] = field(default_factory=dict)
    error: str = ""
    report: Optional[Dict[str, object]] = None


_EXECUTOR = ThreadPoolExecutor(max_workers=2)
_LOCK = Lock()
_JOBS: Dict[str, JobRecord] = {}


def create_job(payload: Dict[str, object], runner) -> JobRecord:
    job = JobRecord(job_id=uuid4().hex, payload=payload)
    with _LOCK:
        _JOBS[job.job_id] = job

    def _work() -> None:
        try:
            job.status = "running"
            job.result = runner(payload)
            job.status = "completed"
        except Exception as exc:
            job.error = str(exc)
            job.status = "failed"

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
