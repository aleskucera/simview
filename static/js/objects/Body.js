import * as THREE from "three";
import { BODY_CONFIG, BODY_VECTOR_CONFIG } from "../config.js";
import {
  createGeometry,
  createMesh,
  createPoints,
  createWireframe,
  createContactPoints,
  createArrow,
} from "./utils.js";

export class Body {
  constructor(bodyData, app) {
    this.app = app;
    this.name = bodyData.name;
    this.batchSize = app.batchManager.batchSize;
    this.visualizations = new Map();

    // Arrays to store batch-specific data
    this.batchGroups = [];
    this.positions = Array(this.batchSize)
      .fill()
      .map(() => new THREE.Vector3());
    this.quaternions = Array(this.batchSize)
      .fill()
      .map(() => new THREE.Quaternion());
    this.rotations = Array(this.batchSize) // Still useful for debugging/display
      .fill()
      .map(() => new THREE.Euler());
    this.activeContacts = Array(this.batchSize)
      .fill()
      .map(() => new Set());

    // --- State Storage Initialization (Based on initial bodyData presence) ---
    this.availableVectors = new Set(); // Track which vectors are available

    // Position and Orientation are always expected, but vectors are optional
    if (bodyData.availableVectors) {
      this.availableVectors = new Set(bodyData.availableVectors);

      if (this.availableVectors.has("velocity")) {
        this.linearVelocities = Array(this.batchSize)
          .fill()
          .map(() => new THREE.Vector3());
        this.availableVectors.add("linearVelocity");
      }
      if (this.availableVectors.has("angularVelocity")) {
        this.angularVelocities = Array(this.batchSize)
          .fill()
          .map(() => new THREE.Vector3());
        this.availableVectors.add("angularVelocity");
      }
      if (this.availableVectors.has("force")) {
        this.linearForces = Array(this.batchSize)
          .fill()
          .map(() => new THREE.Vector3());
        this.availableVectors.add("linearForce");
      }
      if (this.availableVectors.has("torque")) {
        this.torques = Array(this.batchSize)
          .fill()
          .map(() => new THREE.Vector3());
        this.availableVectors.add("torque");
      }
    }
    // --- End State Storage Initialization ---

    this.initializeGroup();
    this.createBatchGroups(bodyData);
    // Removed the updateState call from constructor
  }

  initializeGroup() {
    this.group = new THREE.Group();
    this.group.name = this.name;
  }

  createBatchGroups(bodyData) {
    for (let i = 0; i < this.batchSize; i++) {
      const batchGroup = new THREE.Group();
      batchGroup.name = `${this.name}_batch_${i}`;
      this.group.add(batchGroup);
      this.batchGroups.push(batchGroup);

      this.createVisualRepresentations(batchGroup, bodyData);

      const axes = new THREE.AxesHelper(1);
      axes.visible = this.app.uiState.axesVisible;
      batchGroup.add(axes);

      if (bodyData.bodyPoints?.length) {
        this.initializeContactPoints(batchGroup, bodyData.bodyPoints, i);
      }

      // Only initialize visualization vectors that are available
      this.initializeBodyVectors(batchGroup, BODY_VECTOR_CONFIG, i);
    }
  }

  createVisualRepresentations(batchGroup, bodyData) {
    this.geometry = createGeometry(bodyData.shape, BODY_CONFIG.geometry);

    const representations = {
      mesh: { object: createMesh(this.geometry, BODY_CONFIG.mesh) },
      wireframe: {
        object: createWireframe(this.geometry, BODY_CONFIG.wireframe),
      },
      points: { object: createPoints(bodyData.bodyPoints, BODY_CONFIG.points) },
    };

    for (const [name, repr] of Object.entries(representations)) {
      if (repr.object) {
        repr.object.visible = name === this.app.uiState.bodyVisualizationMode;
        batchGroup.add(repr.object);
        if (!this.visualizations.has(name)) {
          this.visualizations.set(name, []);
        }
        this.visualizations.get(name).push(repr.object);
      }
    }
  }

  initializeContactPoints(batchGroup, bodyPoints, batchIndex) {
    if (!bodyPoints?.length) return;

    const contactPoints = createContactPoints(
      bodyPoints,
      BODY_CONFIG.contactPoints
    );
    if (!contactPoints) return;

    const pointCount = bodyPoints.length;
    const contactPointSizes = new Float32Array(pointCount);
    contactPointSizes.fill(0);

    contactPoints.geometry.setAttribute(
      "size",
      new THREE.Float32BufferAttribute(contactPointSizes, 1)
    );

    batchGroup.add(contactPoints);
    contactPoints.visible = this.app.uiState.contactPointsVisible;

    if (!this.contactPoints) this.contactPoints = [];
    this.contactPoints[batchIndex] = contactPoints;

    if (!this.contactPointSizes) this.contactPointSizes = [];
    this.contactPointSizes[batchIndex] = contactPointSizes;
  }

  initializeBodyVectors(batchGroup, vectorConfigs, batchIndex) {
    if (!this.bodyVectors) {
      this.bodyVectors = Array(this.batchSize)
        .fill()
        .map(() => new Map());
    }

    // Only create vectors visualizations that are available in this body
    for (const [name, config] of Object.entries(vectorConfigs)) {
      // Map config names to available vector names if they differ
      // (e.g., if config uses 'velocity' but we store 'linearVelocity')
      // Assuming direct mapping for now: linearVelocity, angularVelocity, linearForce, torque
      if (this.availableVectors.has(name)) {
        const vector = createArrow(
          new THREE.Vector3(),
          new THREE.Vector3(0, 1, 0), // Initial direction, will be updated
          config
        );
        // Ensure visibility state is correctly retrieved (handle potential missing keys)
        vector.visible = this.app.uiState.bodyVectorVisible?.[name] || false;
        vector.userData = { scale: config.scale };

        batchGroup.add(vector);
        this.bodyVectors[batchIndex].set(name, vector);
      }
    }
  }

  // --- NEW Setter Methods ---

  setPosition(positionData, batchIndex = 0) {
    if (!positionData || positionData.length < 3) return;
    if (batchIndex >= this.batchSize || !this.batchGroups[batchIndex]) return;

    const [x, y, z] = positionData;
    this.positions[batchIndex].set(x, y, z);

    // Store original position for offset calculations
    const originalPosition = { x, y, z };
    this.batchGroups[batchIndex].userData.originalPosition = originalPosition;

    // Apply offset if batch manager exists
    if (this.app.batchManager) {
      const offset = this.app.batchManager.getBatchOffset(batchIndex);
      this.batchGroups[batchIndex].position.set(
        x + offset.x,
        y + offset.y,
        z + offset.z
      );
    } else {
      this.batchGroups[batchIndex].position.set(x, y, z);
    }
  }

  setOrientation(orientationData, batchIndex = 0) {
    if (!orientationData || orientationData.length < 4) return;
    if (batchIndex >= this.batchSize || !this.batchGroups[batchIndex]) return;
    const [qw, qx, qy, qz] = orientationData;
    this.quaternions[batchIndex].set(qx, qy, qz, qw);
    this.rotations[batchIndex].setFromQuaternion(this.quaternions[batchIndex]);
    this.batchGroups[batchIndex].quaternion.copy(this.quaternions[batchIndex]);
  }

  setLinearVelocity(velocityData, batchIndex = 0) {
    if (!this.availableVectors.has("linearVelocity") || !this.linearVelocities)
      return;
    if (!velocityData || velocityData.length < 3) return;
    if (batchIndex >= this.batchSize) return;

    this.linearVelocities[batchIndex].fromArray(velocityData);
    this.updateBodyVector(
      "linearVelocity",
      this.linearVelocities[batchIndex],
      batchIndex
    );
  }

  setAngularVelocity(angularVelocityData, batchIndex = 0) {
    if (
      !this.availableVectors.has("angularVelocity") ||
      !this.angularVelocities
    )
      return;
    if (!angularVelocityData || angularVelocityData.length < 3) return;
    if (batchIndex >= this.batchSize) return;

    this.angularVelocities[batchIndex].fromArray(angularVelocityData);
    this.updateBodyVector(
      "angularVelocity",
      this.angularVelocities[batchIndex],
      batchIndex
    );
  }

  setLinearForce(forceData, batchIndex = 0) {
    if (!this.availableVectors.has("linearForce") || !this.linearForces) return;
    if (!forceData || forceData.length < 3) return;
    if (batchIndex >= this.batchSize) return;

    this.linearForces[batchIndex].fromArray(forceData);
    this.updateBodyVector(
      "linearForce",
      this.linearForces[batchIndex],
      batchIndex
    );
  }

  setTorque(torqueData, batchIndex = 0) {
    if (!this.availableVectors.has("torque") || !this.torques) return;
    if (!torqueData || torqueData.length < 3) return;
    if (batchIndex >= this.batchSize) return;

    this.torques[batchIndex].fromArray(torqueData);
    this.updateBodyVector("torque", this.torques[batchIndex], batchIndex);
  }

  // --- End NEW Setter Methods ---

  updateBodyVector(type, vector, batchIndex = 0) {
    if (
      !this.bodyVectors ||
      !this.bodyVectors[batchIndex] ||
      !this.availableVectors.has(type) // Also check availability
    )
      return;

    const arrow = this.bodyVectors[batchIndex].get(type);
    if (!arrow) return; // Skip if the vector visualization doesn't exist

    const scale = arrow.userData.scale || 1.0; // Default scale if not set
    const length = vector.length() * scale;

    // Avoid issues with zero vectors
    if (length < 1e-6) {
      arrow.setLength(0); // Or make invisible: arrow.visible = false;
      return;
    }
    // arrow.visible = true; // Ensure visible if previously hidden

    const normalizedVector = vector.clone().normalize();

    arrow.setDirection(normalizedVector);
    // Adjust head length/width relative to total length for better visuals
    const headLength = Math.min(length * 0.2, 0.5); // Prevent overly large heads
    const headWidth = Math.min(length * 0.1, 0.25);
    arrow.setLength(length, headLength, headWidth);
  }

  updateContactPointsVisibility(contactIndices, batchIndex = 0) {
    if (
      !this.contactPoints ||
      !this.contactPoints[batchIndex] ||
      !this.contactPointSizes ||
      !this.contactPointSizes[batchIndex]
    )
      return;

    // Reset sizes
    this.contactPointSizes[batchIndex].fill(0);
    // Clear active contacts for this batch before updating
    this.activeContacts[batchIndex]?.clear();

    if (contactIndices && Array.isArray(contactIndices)) {
      contactIndices.forEach((index) => {
        if (index >= 0 && index < this.contactPointSizes[batchIndex].length) {
          this.contactPointSizes[batchIndex][index] =
            BODY_CONFIG.contactPoints.size;
          this.activeContacts[batchIndex]?.add(index);
        }
      });
    }

    const sizeAttribute =
      this.contactPoints[batchIndex].geometry.getAttribute("size");
    sizeAttribute.array = this.contactPointSizes[batchIndex];
    sizeAttribute.needsUpdate = true;
  }

  applyBatchOffset(batchIndex) {
    if (
      !this.app.batchManager ||
      batchIndex < 0 ||
      batchIndex >= this.batchSize ||
      !this.batchGroups ||
      !this.batchGroups[batchIndex]
    )
      return;

    const offset = this.app.batchManager.getBatchOffset(batchIndex);
    const group = this.batchGroups[batchIndex];

    // Use the internally stored position as the 'original'
    const originalPos = this.positions[batchIndex];

    // If originalPosition was stored on userData, prefer that
    // const originalPos = group.userData.originalPosition || this.positions[batchIndex];

    group.position.set(
      originalPos.x + offset.x,
      originalPos.y + offset.y,
      originalPos.z + offset.z
    );
  }

  // --- REFACTORED updateState Method ---
  updateState(bodyState) {
    // Position
    if (bodyState.position) {
      if (Array.isArray(bodyState.position[0])) {
        // Check if it's an array of arrays (multi-batch)
        for (
          let i = 0;
          i < Math.min(this.batchSize, bodyState.position.length);
          i++
        ) {
          this.setPosition(bodyState.position[i], i);
        }
      } else if (bodyState.position.length >= 3) {
        // Single batch
        this.setPosition(bodyState.position, 0);
      }
    }

    // Orientation
    if (bodyState.orientation) {
      if (Array.isArray(bodyState.orientation[0])) {
        // Multi-batch
        for (
          let i = 0;
          i < Math.min(this.batchSize, bodyState.orientation.length);
          i++
        ) {
          this.setOrientation(bodyState.orientation[i], i);
        }
      } else if (bodyState.orientation.length >= 4) {
        // Single batch
        this.setOrientation(bodyState.orientation, 0);
      }
    }

    // Linear Velocity
    if (bodyState.velocity) {
      // Property name kept as 'velocity' for input compatibility
      if (Array.isArray(bodyState.velocity[0])) {
        // Multi-batch
        for (
          let i = 0;
          i < Math.min(this.batchSize, bodyState.velocity.length);
          i++
        ) {
          this.setLinearVelocity(bodyState.velocity[i], i);
        }
      } else if (bodyState.velocity.length >= 3) {
        // Single batch
        this.setLinearVelocity(bodyState.velocity, 0);
      }
    }

    // Angular Velocity
    if (bodyState.angularVelocity) {
      if (Array.isArray(bodyState.angularVelocity[0])) {
        // Multi-batch
        for (
          let i = 0;
          i < Math.min(this.batchSize, bodyState.angularVelocity.length);
          i++
        ) {
          this.setAngularVelocity(bodyState.angularVelocity[i], i);
        }
      } else if (bodyState.angularVelocity.length >= 3) {
        // Single batch
        this.setAngularVelocity(bodyState.angularVelocity, 0);
      }
    }

    // Linear Force
    if (bodyState.force) {
      // Property name kept as 'force' for input compatibility
      if (Array.isArray(bodyState.force[0])) {
        // Multi-batch
        for (
          let i = 0;
          i < Math.min(this.batchSize, bodyState.force.length);
          i++
        ) {
          this.setLinearForce(bodyState.force[i], i);
        }
      } else if (bodyState.force.length >= 3) {
        // Single batch
        this.setLinearForce(bodyState.force, 0);
      }
    }

    // Torque
    if (bodyState.torque) {
      if (Array.isArray(bodyState.torque[0])) {
        // Multi-batch
        for (
          let i = 0;
          i < Math.min(this.batchSize, bodyState.torque.length);
          i++
        ) {
          this.setTorque(bodyState.torque[i], i);
        }
      } else if (bodyState.torque.length >= 3) {
        // Single batch
        this.setTorque(bodyState.torque, 0);
      }
    }

    // Contacts
    if (bodyState.contacts) {
      // Check if the first element is an array to determine multi-batch vs single-batch
      // This handles cases like [[1, 2], [3]] (multi) vs [1, 2, 3] (single)
      if (Array.isArray(bodyState.contacts[0])) {
        // Multi-batch
        for (
          let i = 0;
          i < Math.min(this.batchSize, bodyState.contacts.length);
          i++
        ) {
          this.updateContactPointsVisibility(bodyState.contacts[i] || [], i); // Pass empty array if null/undefined
        }
      } else {
        // Single batch (or potentially empty array for single batch)
        this.updateContactPointsVisibility(bodyState.contacts, 0);
      }
    }
  }
  // --- END REFACTORED updateState Method ---

  updateVisualizationMode(mode) {
    for (const [type, objects] of this.visualizations.entries()) {
      for (const object of objects) {
        object.visible = type === mode;
      }
    }
  }

  toggleContactPoints(visible) {
    if (!this.contactPoints) return;

    for (let i = 0; i < this.batchSize; i++) {
      if (this.contactPoints[i]) {
        this.contactPoints[i].visible = visible;
      }
    }
  }

  toggleAxes(visible) {
    if (!this.batchGroups) return;

    for (const group of this.batchGroups) {
      const axes = group.children.find(
        (child) => child instanceof THREE.AxesHelper
      );
      if (axes) axes.visible = visible;
    }
  }

  toggleBodyVector(type, visible) {
    if (!this.bodyVectors || !this.availableVectors.has(type)) return;

    for (let i = 0; i < this.batchSize; i++) {
      if (this.bodyVectors[i]) {
        // Check if batch map exists
        const vector = this.bodyVectors[i].get(type);
        if (vector) vector.visible = visible;
      }
    }
  }

  getObject3D() {
    return this.group;
  }

  // Method to expose available vectors for UIControls to check
  getAvailableVectors() {
    return this.availableVectors;
  }

  dispose() {
    if (this.group && this.app?.scene) {
      // Check if app and scene exist
      // Robust disposal: remove group first
      if (this.group.parent) {
        this.group.parent.remove(this.group);
      }

      this.group.traverse((child) => {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          // Handle potential array of materials
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
          } else {
            child.material.dispose();
          }
        }
        // Remove children explicitly? Might not be necessary if group is removed.
        // if (child !== this.group) {
        //    child.removeFromParent();
        // }
      });
    }
    // Clear internal references
    this.group = null;
    this.batchGroups = [];
    this.visualizations.clear();
    this.bodyVectors = [];
    this.contactPoints = [];
    // etc. for other arrays if needed
  }
}
