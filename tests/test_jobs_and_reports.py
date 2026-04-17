import os
import time
import unittest
from pathlib import Path

from ecoscan.jobs import attach_report, create_job, get_job
from ecoscan.reports import create_report
from ecoscan.server import analyze_visual_payload


class JobAndReportTests(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["ECOSCAN_DISABLE_MODEL"] = "1"

    def test_analysis_job_completes(self) -> None:
        job = create_job({}, lambda payload: analyze_visual_payload(payload))
        for _ in range(40):
            current = get_job(job.job_id)
            if current and current.status in {"completed", "failed"}:
                break
            time.sleep(0.05)
        current = get_job(job.job_id)
        self.assertIsNotNone(current)
        self.assertEqual(current.status, "completed")
        self.assertIn("scan_model", current.result)

    def test_report_generation_writes_html(self) -> None:
        payload = analyze_visual_payload({})
        report = create_report("unit-test-job", payload)
        attach_report("unit-test-job", report)
        report_path = Path(report["report_path"])
        self.assertTrue(report_path.exists())
        html_body = report_path.read_text(encoding="utf-8")
        self.assertIn("EcoScan incident/action report", html_body)
        self.assertIn("Annotated scan snapshot", html_body)


if __name__ == "__main__":
    unittest.main()
