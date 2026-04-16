# EcoScan
satellite imagery + sensor data for spatial environment zone modeling 

run ```PYTHONPATH=src python3 -m ecoscan.cli serve```
Open ```http://127.0.0.1:8000```
That launches the full local demo: backend + map UI
Test Inputs

Right now the demo inputs come from ```src/ecoscan/demo.py```
Habitat raster-style inputs are generated in generate_demo_grid(...)
Sensor inputs are generated in generate_demo_sensors(...)
Study area bounds, landmarks, and map polygons are also defined there
The easiest way to test different inputs today is to edit those values and rerun the server
Test Outputs

For a raw JSON output, run ```PYTHONPATH=src python3 -m ecoscan.cli demo```
That prints the modeled results directly in the terminal: study area, overview, top habitats, species pressures, and recommendations
For the API response, open ```http://127.0.0.1:8000/api/demo-biodiversity```
For the visual output, use the browser map at ```http://127.0.0.1:8000```
Useful Files

Input generation: ```src/ecoscan/demo.py```
Modeling logic: ```src/ecoscan/pipeline.py```
Local server: ```src/ecoscan/server.py```
Frontend map: ```src/ecoscan/static/app.js```
Quick Checks

Run tests with ```PYTHONPATH=src python3 -m unittest discover -s tests -v```
If port 8000 is busy, use ```PYTHONPATH=src python3 -m ecoscan.cli serve --port 8123```
