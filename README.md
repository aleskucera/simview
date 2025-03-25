# SimView Visualizer

**SimView** is a visualization tool for simulating and analyzing 3D models and terrain data. This repository provides an interactive way to visualize models described in a predefined JSON format, supporting batched simulations (multiple instances of bodies in the same environment).

---

## JSON Format Specification

### Structure Overview
```json
{
  "model": {
    "simBatches": 1,
    "scalarNames": ["property1", "property2"],
    "bodies": [
      {
        "name": "Body Name",
        "shape": {
          "type": 1,
          "hx": 1.0,
          "hy": 1.0,
          "hz": 1.0
        },
        "bodyTransform": [[0, 0, 0, 1, 0, 0, 0]],
        "bodyPoints": [[0, 0, 0]]
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

---

### Field Descriptions

#### **Model (Static)**
- `simBatches` *(integer)*:  
  Number of simulation batches (instances) to visualize. Each batch shares the same terrain but can have unique body transforms.
- `scalarNames` *(array[string])*:  
    Names of scalar properties (e.g., `["energy", "reward"]`). 
- `bodies` *(array)*: List of physical bodies in the simulation.  
  Each body includes:  
  - `name` *(string)*: Identifier for the body.  
  - `shape` *(object)*: Geometry definition.  
    - `type` *(integer)*: Shape type:  
      - `0` = Custom (user-defined)  
      - `1` = Box (requires `hx`, `hy`, `hz`)  
      - `2` = Sphere (requires `radius`)  
      - `3` = Cylinder (requires `radius`, `height`)  
    - `hx`, `hy`, `hz` *(float)*: Half-lengths for `BOX_SHAPE`.  
    - `radius` *(float)*: Required for `SPHERE_SHAPE` or `CYLINDER_SHAPE`.  
    - `height` *(float)*: Required for `CYLINDER_SHAPE`.  
  - `bodyTransform` *(array[array[7]])*:  
    **Batched transforms** for each simulation instance. Each sub-array is `[x, y, z, w, qx, qy, qz]` (position + quaternion rotation).  
    Example for 2 batches:  
    ```json
    "bodyTransform": [
      [0, 0, 0, 1, 0, 0, 0],  // Batch 1
      [1, 0, 0, 1, 0, 0, 0]   // Batch 2
    ]
    ```
  - `bodyPoints` *(array[array[3]])*:  
    Collision points in the body’s local frame (`[[x, y, z], ...]`).  
- `terrain` *(object)*: Shared across all batches.  
  - `dimensions` *(object)*:  
    - `sizeX`, `sizeY` *(float)*: Physical size of the terrain.  
    - `resolutionX`, `resolutionY` *(integer)*: Grid resolution.  
  - `bounds` *(object)*: Spatial boundaries (min/max for X, Y, Z).  
  - `heightData` *(array[float])*:  
    Flattened 2D array of height values (row-major order). Length must match `resolutionX * resolutionY`.  
  - `normals` *(array[array[3]])*:  
    Surface normals for each vertex (`[[nx, ny, nz], ...]`). Length must match `heightData`.  

#### **State (Time-Dependent)**
- `time` *(float)*: Current simulation time.  
- `bodies` *(array)*: Per-body dynamic properties for each batch:  
  - `bodyTransform` *(array[array[7]])*:  
    Batched `[x, y, z, w, qx, qy, qz]` (position + quaternion rotation).  
  - `bodyVelocity` *(array[array[6]])*:  
    Batched `[vx, vy, vz, ωx, ωy, ωz]` (linear + angular velocity).  
  - `bodyForce` *(array[array[6]])*:  
    Batched `[fx, fy, fz, τx, τy, τz]` (force + torque).  
  - `contacts` *(array[integer])*:  
    Indices of `bodyPoints` currently in contact (empty if none).  
  - `scalarName` *(array[float])*:  
    Time-varying scalar values (e.g., `"energy"`). Names must match `model.scalarNames`.  

---

### Key Features
- **Batched Simulations**: Visualize multiple instances of bodies with independent transforms (`bodyTransform`).  
- **Shared Terrain**: Efficiently reuse terrain data across batches.  
- **Shape Flexibility**: Supports boxes, spheres, cylinders, and custom shapes.  

---

### Minimal Example (Model - 2 Batches)
```json
{
  "model": {
    "simBatches": 2,
    "scalarNames": ["energy"],
    "bodies": [
      {
        "name": "Box",
        "shape": { "type": 1, "hx": 1.0, "hy": 1.0, "hz": 1.0 },
        "bodyTransform": [
          [0, 0, 0, 1, 0, 0, 0],  // Batch 1
          [2, 0, 0, 1, 0, 0, 0]   // Batch 2
        ],
        "bodyPoints": [[0, 0, 0]]
      }
    ],
    "terrain": {
      "dimensions": { "sizeX": 10.0, "sizeY": 10.0, "resolutionX": 10, "resolutionY": 10 },
      "bounds": { "minX": -5.0, "maxX": 5.0, "minY": -5.0, "maxY": 5.0, "minZ": 0.0, "maxZ": 2.0 },
      "heightData": [0.0, 0.1, /* ... 98 more values */],
      "normals": [[0, 0, 1], /* ... */]
    }
  }
}
```

### Minimal Example (State - 2 Batches)
```json
{
  "time": 1.5,
  "bodies": [
    {
      "name": "Box",
      "bodyTransform": [
        [0, 0, 1, 1, 0, 0, 0],  // Batch 1
        [2, 0, 0, 1, 0, 0, 0]   // Batch 2
      ],
      "bodyVelocity": [
        [0, 0, -0.1, 0, 0, 0],  // Batch 1
        [0, 0, 0, 0, 0, 0, 0]   // Batch 2
      ],
      "bodyForce": [
        [0, 0, 9.8, 0, 0, 0],  // Batch 1
        [0, 0, 9.8, 0, 0, 0]   // Batch 2
      ],
      "contacts": [
        [0, 3],  // Batch 1
        []       // Batch 2
      ],
      "energy": [1.2, 0.1]   // Matches model.scalarNames
    }
  ]
}
```

---

### Notes
- **Quaternion Format**: `[w, x, y, z]` (scalar-first convention).  
- **Terrain Data**: Ensure `heightData` and `normals` arrays match the grid resolution (`resolutionX * resolutionY`).  
- **Batching**: All bodies must provide the same number of transforms (`simBatches`).  
