import base64
import io
import os
import unittest
from unittest import mock

import laspy
from PIL import Image, ImageDraw

from ecoscan.demo import build_demo_map, generate_demo_grid, generate_demo_sensors
from ecoscan.pipeline import build_habitat_model
from ecoscan.scanio import ingest_scan, parse_scan_content
from ecoscan.vision import analyze_photos


def _photo_data_url() -> str:
    image = Image.new("RGB", (160, 120), (245, 160, 60))
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 140, 100), outline=(25, 25, 25), width=8)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


class VisualIngestTests(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["ECOSCAN_DISABLE_MODEL"] = "1"

    def _habitats(self):
        map_data = build_demo_map(rows=4, cols=4)
        habitats = build_habitat_model(
            generate_demo_grid(rows=4, cols=4),
            generate_demo_sensors(),
            cell_polygons=map_data["cell_polygons"],
        )
        return habitats

    def test_photo_analysis_returns_real_detections(self) -> None:
        detections = analyze_photos(
            [{"name": "orange-signal.png", "data_url": _photo_data_url()}],
            self._habitats(),
        )

        self.assertEqual(len(detections), 1)
        self.assertGreaterEqual(detections[0]["confidence"], 0.35)
        self.assertTrue(detections[0]["boxes"])
        self.assertIn(detections[0]["species_name"], {"Monarch butterfly", "California milkweed"})
        self.assertEqual(len(detections[0]["top_matches"]), 3)
        self.assertIn(detections[0]["explanation"]["detector_family"], {"fallback", "zero-shot", "fine-tuned"})

    @mock.patch("ecoscan.vision._active_detector_backend")
    def test_fine_tuned_detector_metadata_flows_into_results(self, mock_backend) -> None:
        mock_backend.return_value = {
            "kind": "fine-tuned",
            "model_name": "Coyote Valley Target Taxa Detector",
            "target_taxa": ["Monarch butterfly", "California milkweed"],
            "predict": lambda _image: [
                {
                    "label": "Monarch butterfly",
                    "source_label": "danaus plexippus",
                    "score": 0.93,
                    "box": {"xmin": 10.0, "ymin": 12.0, "xmax": 110.0, "ymax": 96.0},
                }
            ],
        }

        detections = analyze_photos(
            [{"name": "orange-signal.png", "data_url": _photo_data_url()}],
            self._habitats(),
        )

        self.assertEqual(detections[0]["species_name"], "Monarch butterfly")
        self.assertEqual(detections[0]["model_source"], "Coyote Valley Target Taxa Detector")
        self.assertEqual(detections[0]["explanation"]["detector_family"], "fine-tuned")
        self.assertEqual(detections[0]["explanation"]["source_label"], "danaus plexippus")
        self.assertIn("Monarch butterfly", detections[0]["explanation"]["target_taxa"])

    def test_scan_parser_reads_ascii_formats(self) -> None:
        points = parse_scan_content(
            "sample.obj",
            "\n".join(
                [
                    "v 0 0 0",
                    "v 1 0 0.2",
                    "v 0 1 0.4",
                    "v 1 1 0.6",
                ]
            ),
        )
        self.assertEqual(len(points), 4)

    def test_binary_las_parsing_is_supported(self) -> None:
        header = laspy.LasHeader(point_format=3, version="1.2")
        las = laspy.LasData(header)
        las.x = [100.0, 101.0, 102.0]
        las.y = [50.0, 50.5, 51.0]
        las.z = [5.0, 5.5, 6.0]
        buffer = io.BytesIO()
        las.write(buffer)

        result = ingest_scan(
            "sample.las",
            base64.b64encode(buffer.getvalue()).decode("ascii"),
            self._habitats(),
            metadata={"encoding": "base64", "study_area_bounds": build_demo_map(rows=4, cols=4)["study_area"]["bounds"]},
        )
        self.assertTrue(result["scan_model"])
        self.assertEqual(result["scan_summary"]["filename"], "sample.las")

    def test_scan_ingestion_creates_tiles(self) -> None:
        scan = """ply
format ascii 1.0
element vertex 8
property float x
property float y
property float z
end_header
0 0 0
1 0 0.2
0 1 0.4
1 1 0.6
0.2 0.2 0.9
0.8 0.2 0.7
0.2 0.8 0.65
0.8 0.8 1.0
"""
        result = ingest_scan("sample.ply", scan, self._habitats())

        self.assertGreaterEqual(result["scan_summary"]["point_count"], 8)
        self.assertTrue(result["scan_model"])
        self.assertTrue(result["scan_model"][0]["detections"])


if __name__ == "__main__":
    unittest.main()
