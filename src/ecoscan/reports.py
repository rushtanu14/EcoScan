import html
from pathlib import Path
from typing import Dict, Sequence
from uuid import uuid4


REPORT_DIR = Path("/tmp/ecoscan-reports")
REPORT_DIR.mkdir(parents=True, exist_ok=True)


def _render_scan_svg(scan_model: Sequence[Dict[str, object]]) -> str:
    cells_markup = []
    for cell in scan_model[:10]:
        points = []
        for x, y in cell.get("projected_polygon", []):
            px = 100 + x * 620 + y * 140
            py = 400 + y * 180 - x * 64 - float(cell.get("canopy_height", 0.0)) * 90
            points.append((px, py))
        if not points:
            continue
        point_string = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
        label = html.escape(cell.get("lead_species", "species"))
        cells_markup.append(
            f'<polygon points="{point_string}" fill="rgba(81,117,95,0.45)" stroke="#fff7ef" stroke-width="2"></polygon>'
            f'<text x="{points[0][0] + 10:.2f}" y="{points[0][1] - 8:.2f}" font-size="14" fill="#2a2620">{label}</text>'
        )
    return (
        '<svg viewBox="0 0 1000 620" width="100%" height="320" xmlns="http://www.w3.org/2000/svg">'
        '<rect width="1000" height="620" fill="#f5ede1"></rect>'
        '<polygon points="100,470 730,350 910,470 280,590" fill="#e0cfb7"></polygon>'
        + "".join(cells_markup)
        + "</svg>"
    )


def create_report(job_id: str, payload: Dict[str, object]) -> Dict[str, object]:
    filename = f"{job_id}-{uuid4().hex[:8]}.html"
    report_path = REPORT_DIR / filename
    evidence_cards = []
    for item in payload.get("uploaded_evidence", [])[:12]:
        image = item.get("preview_url", "")
        title = html.escape(item.get("species_name", "Species"))
        note = html.escape(item.get("note", ""))
        actions = "".join(f"<li>{html.escape(action)}</li>" for action in item.get("action_items", []))
        evidence_cards.append(
            f"""
            <article class="evidence-card">
              <img src="{image}" alt="{title}" />
              <div>
                <h3>{title}</h3>
                <p>{note}</p>
                <ul>{actions}</ul>
              </div>
            </article>
            """
        )

    scan_svg = _render_scan_svg(payload.get("scan_model", []))
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>EcoScan Incident Report</title>
  <style>
    body {{ font-family: 'Avenir Next', Arial, sans-serif; background: #f7f2ea; color: #1f241f; margin: 0; padding: 32px; }}
    .shell {{ max-width: 1080px; margin: 0 auto; display: grid; gap: 24px; }}
    .panel {{ background: white; border-radius: 24px; padding: 24px; box-shadow: 0 24px 64px rgba(0,0,0,0.08); }}
    .evidence-card {{ display: grid; grid-template-columns: 220px 1fr; gap: 18px; margin-top: 16px; }}
    .evidence-card img {{ width: 100%; height: 180px; object-fit: cover; border-radius: 18px; }}
    ul {{ margin: 12px 0 0; }}
  </style>
</head>
<body>
  <div class="shell">
    <section class="panel">
      <p>EcoScan incident/action report</p>
      <h1>Species-risk evidence package</h1>
      <p>Job ID: {html.escape(job_id)}</p>
    </section>
    <section class="panel">
      <h2>Annotated scan snapshot</h2>
      {scan_svg}
    </section>
    <section class="panel">
      <h2>Annotated photo evidence</h2>
      {''.join(evidence_cards) or '<p>No uploaded photo evidence was attached to this job.</p>'}
    </section>
  </div>
</body>
</html>"""
    report_path.write_text(html_body, encoding="utf-8")
    return {"report_id": filename, "report_path": str(report_path), "report_url": f"/reports/{filename}"}
