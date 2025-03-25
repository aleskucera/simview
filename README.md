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
    "bodies": [
      {
        "name": string,           // Name of the body
        "shape": {},                // Serialized shape information (range: 0-custom, 1-box, 2-sphere, 3-cylinder)
        "body_transform": [7],      // Transformation of the body as a list [x, y, z, w, qx, qy, qz]
        "body_points": [[3]],       // Collision points for the body in the body frame (list of [x, y, z])
        "scalar_names": [string]  // List of scalar property names (e.g., ["energy"])
      }
    ],
    "terrain": {
      "dimensions": {
        "size_x": float,
        "size_y": float,
        "resolution_x": int,
        "resolution_y": int
      },
      "bounds": {
        "minX": float,
        "maxX": float,
        "minY": float,
        "maxY": float
        "minZ": float,
        "maxZ": float
      }
      "heightData": [float],
      "normals": [[3]]
    }
  }
}
```
