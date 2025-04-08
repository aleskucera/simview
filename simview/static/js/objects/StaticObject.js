import * as THREE from "three";

export class StaticObject {
  constructor(objectData, app) {
    this.app = app;
    this.name = objectData.name;
    this.type = objectData.type;
    this.batchSize = app.batchSize;
    this.visualizations = []; // Array to store visual objects for each batch

    // Validate input data
    if (this.type !== "mesh" && this.type !== "pointcloud") {
      throw new Error(
        `Invalid type: ${this.type}. Must be "mesh" or "pointcloud".`
      );
    }
    const points = objectData.points;
    if (!Array.isArray(points) || points.length === 0) {
      throw new Error("Points array is required and must not be empty.");
    }
    let faces = null;
    if (this.type === "mesh") {
      faces = objectData.faces || objectData.vertices;
      if (!Array.isArray(faces) || faces.length === 0) {
        throw new Error("Faces array is required for mesh type.");
      }
    }
    const color = objectData.color || "#ffffff"; // Default to white

    // Create the Three.js group and representations
    this.initializeGroup();
    const geometry = this.createGeometry(points, faces);
    const material = this.createMaterial(color);
    const centroid = this.computeCentroid(geometry);
    const labelTexture = this.createLabelTexture(this.name);
    this.createBatchGroups(geometry, material, centroid, labelTexture);
  }

  /** Initialize the main Three.js group */
  initializeGroup() {
    this.group = new THREE.Group();
    this.group.name = this.name;
  }

  /** Create geometry from points and faces, then discard the input */
  createGeometry(points, faces) {
    if (this.type === "mesh") {
      const positions = new Float32Array(points.flat());
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      const indices = new Uint16Array(faces.flat());
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();
      return geometry;
    } else if (this.type === "pointcloud") {
      const positions = new Float32Array(points.flat());
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      return geometry;
    }
  }

  /** Create material based on type and color */
  createMaterial(color) {
    const { color: threeColor, alpha } = this.parseColor(color);
    if (this.type === "mesh") {
      return new THREE.MeshBasicMaterial({
        color: threeColor,
        transparent: alpha < 1,
        opacity: alpha,
      });
    } else if (this.type === "pointcloud") {
      return new THREE.PointsMaterial({
        color: threeColor,
        size: 0.1, // Adjustable point size
        transparent: alpha < 1,
        opacity: alpha,
      });
    }
  }

  /** Parse color input into Three.js color and alpha */
  parseColor(color) {
    let threeColor = new THREE.Color(0xffffff);
    let alpha = 1.0;
    if (typeof color === "string") {
      threeColor.set(color);
    } else if (Array.isArray(color)) {
      if (color.length === 3) {
        threeColor.setRGB(color[0], color[1], color[2]);
      } else if (color.length === 4) {
        threeColor.setRGB(color[0], color[1], color[2]);
        alpha = color[3];
      }
    }
    return { color: threeColor, alpha };
  }

  /** Compute the centroid for label positioning */
  computeCentroid(geometry) {
    const positions = geometry.attributes.position.array;
    const count = positions.length / 3;
    let x = 0,
      y = 0,
      z = 0;
    for (let i = 0; i < count; i++) {
      x += positions[i * 3];
      y += positions[i * 3 + 1];
      z += positions[i * 3 + 2];
    }
    return new THREE.Vector3(x / count, y / count, z / count);
  }

  /** Create a texture for the object’s label */
  createLabelTexture(text) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const fontSize = 48;
    context.font = `${fontSize}px Arial`;
    const textWidth = context.measureText(text).width;
    canvas.width = textWidth + 20; // Padding
    canvas.height = fontSize + 20;
    context.fillStyle = "rgba(0, 0, 0, 0.5)"; // Semi-transparent background
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = `${fontSize}px Arial`;
    context.fillStyle = "white";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    return new THREE.CanvasTexture(canvas);
  }

  /** Create batch groups with visual objects and labels */
  createBatchGroups(geometry, material, centroid, labelTexture) {
    this.batchGroups = [];
    for (let i = 0; i < this.batchSize; i++) {
      const batchGroup = new THREE.Group();
      batchGroup.name = `${this.name}_batch_${i}`;
      this.group.add(batchGroup);
      this.batchGroups.push(batchGroup);

      // Create the Three.js object (mesh or points)
      const object =
        this.type === "mesh"
          ? new THREE.Mesh(geometry, material)
          : new THREE.Points(geometry, material);
      batchGroup.add(object);
      this.visualizations.push(object);

      // Add a hovering label
      const spriteMaterial = new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.copy(centroid);
      sprite.position.y += 0.5; // Offset above the object
      sprite.scale.set(1, 0.5, 1); // Adjust scale as needed
      batchGroup.add(sprite);
    }
  }

  /** Return the Three.js group for scene integration */
  getObject3D() {
    return this.group;
  }

  /** Clean up resources when the object is no longer needed */
  dispose() {
    if (this.group) {
      this.app.scene.removeObject3D(this.group);
      this.group.traverse((child) => {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (child.material.map) {
            child.material.map.dispose();
          }
          child.material.dispose();
        }
      });
      this.group = null;
    }
  }
}
