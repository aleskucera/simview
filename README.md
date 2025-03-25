# SimView Visualizer

**SimView** is a visualization tool for simulating and analyzing 3D models and terrain data. This repository provides an interactive way to visualize models described in a predefined JSON format. 

## Features
- Visualizes complex models with multiple bodies and terrains.
- Supports various shapes for physical bodies.
- Easily extendable JSON input format.
- Real-time rendering and interaction.

---

## JSON Format Overview

SimView expects a JSON file with the following structure:

```json
{
  "model": {
    "simBatches": 1,
    "bodies": [
      {
        "name": "Body Name",
        "shape": {
          "type": 1,
          "hx": 1.0,
          "hy": 1.0,
          "hz": 1.0,
        },
        "bodyTransform": [[0, 0, 0, 1, 0, 0, 0]],
        "bodyPoints": [[0, 0, 0]],
        "scalarNames": ["property1", "property2"]
      }
    ],
    "terrain": {
      "dimensions": {
        "sizeX": 1.0,
        "sizeY": 1.0,
        "resolutionX": 100,
        "resolutionY": 100
      },
      "bounds": {
        "minX": 0.0,
        "maxX": 1.0,
        "minY": 0.0,
        "maxY": 1.0,
        "minZ": 0.0,
        "maxZ": 1.0
      },
      "heightData": [0.0, 0.1],
      "normals": [
        [0.0, 0.0, 1.0],
        [0.0, 0.0, 1.0]
      ]
    }
  }
}
```
