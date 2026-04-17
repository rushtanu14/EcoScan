import unittest
from pathlib import Path

from ecoscan.dataio import load_input_bundle, load_raster_cells_csv, load_sensor_readings_csv
from ecoscan.demo import build_demo_map, generate_demo_grid, generate_demo_sensors
from ecoscan.pipeline import (
    build_habitat_model,
    build_scan_model,
    classify_habitat_health,
    summarize_habitat_zones,
    summarize_species_catalog,
)


class HabitatModelingTests(unittest.TestCase):
    def test_file_loaders_read_sample_inputs(self) -> None:
        data_dir = Path("data/sample_inputs")
        cells = load_raster_cells_csv(data_dir / "habitats.csv")
        sensors = load_sensor_readings_csv(data_dir / "sensors.csv")
        _, _, map_data = load_input_bundle(data_dir=str(data_dir))

        self.assertEqual(len(cells), 12)
        self.assertEqual(len(sensors), 4)
        self.assertIn("cell-0-0", map_data["cell_polygons"])
        self.assertTrue(map_data["data_sources"])
        self.assertEqual(map_data["sensor_profiles"][0]["sensor_id"], "coyote-creek-outdoor-classroom")

    def test_demo_pipeline_returns_sorted_habitats(self) -> None:
        cells = generate_demo_grid(rows=4, cols=4, seed=5)
        sensors = generate_demo_sensors(seed=13)
        map_data = build_demo_map(rows=4, cols=4)

        habitats = build_habitat_model(cells, sensors, cell_polygons=map_data["cell_polygons"])

        self.assertEqual(len(habitats), 16)
        self.assertGreaterEqual(habitats[0].risk_score, habitats[-1].risk_score)
        self.assertIn(habitats[0].health_label, {"fragile", "stressed", "thriving"})
        self.assertGreaterEqual(habitats[0].species_pressures[0].vulnerability_score, 0.0)
        self.assertTrue(habitats[0].polygon)
        self.assertTrue(habitats[0].habitat_story)
        self.assertTrue(habitats[0].species_pressures[0].source_url.startswith("https://"))

    def test_health_thresholds_are_stable(self) -> None:
        self.assertEqual(classify_habitat_health(0.2), "thriving")
        self.assertEqual(classify_habitat_health(0.45), "stressed")
        self.assertEqual(classify_habitat_health(0.8), "fragile")

    def test_summary_contains_expected_keys(self) -> None:
        habitats = build_habitat_model(
            generate_demo_grid(rows=3, cols=3),
            generate_demo_sensors(),
            cell_polygons=build_demo_map(rows=3, cols=3)["cell_polygons"],
        )
        summary = summarize_habitat_zones(habitats)

        self.assertIn("avg_biodiversity_score", summary)
        self.assertIn("top_species_at_risk", summary)
        self.assertTrue(summary["priority_actions"])

    def test_species_catalog_rolls_up_pressure(self) -> None:
        habitats = build_habitat_model(
            generate_demo_grid(rows=3, cols=3),
            generate_demo_sensors(),
            cell_polygons=build_demo_map(rows=3, cols=3)["cell_polygons"],
        )
        catalog = summarize_species_catalog(habitats)

        self.assertGreaterEqual(len(catalog), 6)
        self.assertIn("status_label", catalog[0])
        self.assertIn("source_url", catalog[0])
        self.assertIn("image_asset", catalog[0])
        self.assertTrue(catalog[0]["example_images"])
        self.assertTrue(catalog[0]["action_items"])

    def test_scan_model_contains_annotations(self) -> None:
        map_data = build_demo_map(rows=3, cols=3)
        habitats = build_habitat_model(
            generate_demo_grid(rows=3, cols=3),
            generate_demo_sensors(),
            cell_polygons=map_data["cell_polygons"],
        )
        scan_model = build_scan_model(habitats, map_data["study_area"]["bounds"])

        self.assertEqual(len(scan_model), len(habitats))
        self.assertTrue(scan_model[0].projected_polygon)
        self.assertEqual(len(scan_model[0].detections), 2)
        self.assertTrue(scan_model[0].detections[0].action_items)


if __name__ == "__main__":
    unittest.main()
