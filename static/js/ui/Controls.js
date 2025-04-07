import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import { SELECTION_CONFIG } from "../config.js";
import { colorMapOptions } from "../../lib/js-colormaps.js";

export class UIControls {
  constructor(app) {
    this.app = app;
    this.vectorAvailability = this.determineVectorAvailability(); // Check which vectors are available
    this.gui = this.createDatGUI();
    this.keyboardControlsListener = null;
    this.setupKeyboardControls(app);
  }

  // Determine which vectors are available across all bodies
  determineVectorAvailability() {
    const vectorTypes = [
      "linearVelocity",
      "angularVelocity",
      "linearForce",
      "torque",
    ];
    const availability = {};

    // Initialize all vectors as unavailable
    vectorTypes.forEach((type) => {
      availability[type] = false;
    });

    // Check each body for available vectors
    this.app.bodies.forEach((body) => {
      const availableVectors = body.getAvailableVectors();
      vectorTypes.forEach((type) => {
        if (availableVectors.has(type)) {
          availability[type] = true;
        }
      });
    });

    return availability;
  }

  changeTargetBatch(key) {
    const { scene, batchManager } = this.app;
    const currentBatchTarget = batchManager.currentlyActiveBatch;
    const { row, col } =
      batchManager.getRowColFromBatchIndex(currentBatchTarget);
    const azimuth = scene.controls.getAzimuthalAngle();
    const cosAz = Math.cos(azimuth);
    const sinAz = Math.sin(azimuth);
    let dx, dy;
    if (Math.abs(cosAz) > Math.abs(sinAz)) {
      dx = cosAz > 0 ? 1 : -1;
      dy = 0;
    } else {
      dx = 0;
      dy = sinAz > 0 ? 1 : -1;
    }
    let newRow = row;
    let newCol = col;
    switch (key) {
      case "arrowright":
        newRow += dy;
        newCol += dx;
        break;
      case "arrowleft":
        newRow -= dy;
        newCol -= dx;
        break;
      case "arrowdown":
        newRow -= dx;
        newCol += dy;
        break;
      case "arrowup":
        newRow += dx;
        newCol -= dy;
        break;
    }
    batchManager.setActiveBatchByRowCol(newRow, newCol);
  }

  createDatGUI() {
    this.gui = new GUI();

    const controls = {
      bodyVisualizationMode: this.app.uiState.bodyVisualizationMode,
      showContactPoints: this.app.uiState.contactPointsVisible,
      showContactNormals: this.app.uiState.contactNormalsVisible,
      showAxes: this.app.uiState.axesVisible,
      showLinearVelocity: this.app.uiState.bodyVectorVisible.linearVelocity,
      showAngularVelocity: this.app.uiState.bodyVectorVisible.angularVelocity,
      showLinearForce: this.app.uiState.bodyVectorVisible.linearForce,
      showTorque: this.app.uiState.bodyVectorVisible.torque,
    };

    this.bodyFolder = this.gui.addFolder("Body Options");

    this.bodyFolder
      .add(controls, "bodyVisualizationMode", ["mesh", "wireframe", "points"])
      .name("Body Visualization Mode (B)")
      .onChange((value) => {
        this.updateVisualizationMode(value);
      });

    this.bodyFolder
      .add(controls, "showAxes")
      .name("Show Axes (A)")
      .onChange((value) => {
        this.updateAxesVisibility(value);
      });

    this.bodyFolder
      .add(controls, "showContactPoints")
      .name("Show Contact Points (C)")
      .onChange((value) => {
        this.updateContactPointsVisibility(value);
      });

    // Combined vector controls with availability check
    const vectorControls = [
      {
        property: "showLinearVelocity",
        name: "Show Linear Velocity (V)",
        type: "linearVelocity",
      },
      {
        property: "showAngularVelocity",
        name: "Show Angular Velocity (W)",
        type: "angularVelocity",
      },
      {
        property: "showLinearForce",
        name: "Show Linear Force (F)",
        type: "linearForce",
      },
      { property: "showTorque", name: "Show Torque (T)", type: "torque" },
    ];

    vectorControls.forEach((control) => {
      const controller = this.bodyFolder
        .add(controls, control.property)
        .name(control.name)
        .onChange((value) => {
          this.updateVectorVisibility(control.type, value);
        });

      // Disable the controller if the vector type is not available in any body
      if (!this.vectorAvailability[control.type]) {
        controller.disable();
      }
    });

    this.bodyFolder.open();

    // Terrain controls (unchanged)
    this.terrainFolder = this.gui.addFolder("Terrain Options");

    const terrainControls = {
      showSurface: this.app.uiState.terrainVisualizationModes?.surface ?? true,
      showWireframe:
        this.app.uiState.terrainVisualizationModes?.wireframe ?? false,
      showNormals: this.app.uiState.terrainVisualizationModes?.normals ?? false,
      colorMap: this.app.uiState?.terrainColorMap || "viridis",
    };

    this.terrainFolder
      .add(terrainControls, "showSurface")
      .name("Show Surface")
      .onChange((value) => {
        this.updateTerrainVisualization("surface", value);
      });

    this.terrainFolder
      .add(terrainControls, "showWireframe")
      .name("Show Wireframe")
      .onChange((value) => {
        this.updateTerrainVisualization("wireframe", value);
      });

    this.terrainFolder
      .add(terrainControls, "showNormals")
      .name("Show Normals")
      .onChange((value) => {
        this.updateTerrainVisualization("normals", value);
      });

    this.terrainFolder
      .add(terrainControls, "colorMap", colorMapOptions)
      .name("Color Map")
      .onChange((value) => {
        this.updateTerrainColorMap(value);
      });

    this.terrainFolder.open();

    const cameraFolder = this.gui.addFolder("Camera Options");
    const fovObj = {
      fov: this.app.scene.camera.fov,
    };
    cameraFolder
      .add(fovObj, "fov", 20, 120)
      .name("Field of View")
      .onChange((value) => {
        this.app.scene.camera.fov = value;
        this.app.scene.camera.updateProjectionMatrix();
      });

    return this.gui;
  }

  setupKeyboardControls(app) {
    this.keyboardControlsListener = window.addEventListener(
      "keydown",
      (event) => {
        switch (event.key.toLowerCase()) {
          case "b":
            const modes = ["mesh", "wireframe", "points"];
            const currentIndex = modes.indexOf(
              this.app.uiState.bodyVisualizationMode
            );
            const nextIndex = (currentIndex + 1) % modes.length;
            this.updateVisualizationMode(modes[nextIndex]);
            const controller = this.findController("bodyVisualizationMode");
            if (controller) controller.setValue(modes[nextIndex]);
            break;
          case "a":
            this.toggleControl("showAxes");
            break;
          case "c":
            this.toggleControl("showContactPoints");
            break;
          case "v":
            if (this.vectorAvailability.linearVelocity)
              this.toggleControl("showLinearVelocity");
            break;
          case "w":
            if (this.vectorAvailability.angularVelocity)
              this.toggleControl("showAngularVelocity");
            break;
          case "f":
            if (this.vectorAvailability.linearForce)
              this.toggleControl("showLinearForce");
            break;
          case "t":
            if (this.vectorAvailability.torque)
              this.toggleControl("showTorque");
            break;
          case "arrowup":
          case "arrowdown":
          case "arrowleft":
          case "arrowright":
            if (event[SELECTION_CONFIG.BATCH.key]) {
              this.changeTargetBatch(event.key.toLowerCase());
            }
            break;
        }
      }
    );
  }

  findController(property) {
    for (const controller of this.bodyFolder.controllers) {
      if (controller.property === property) {
        return controller;
      }
    }
    return null;
  }

  toggleControl(property) {
    const controller = this.findController(property);
    if (controller) {
      controller.setValue(!controller.getValue());
    }
  }

  updateVisualizationMode(mode) {
    this.app.bodies.forEach((body) => {
      body.updateVisualizationMode(mode);
    });
    this.app.uiState.bodyVisualizationMode = mode;
  }

  updateAxesVisibility(show) {
    this.app.bodies.forEach((body) => {
      body.toggleAxes(show);
    });
    this.app.uiState.axesVisible = show;
  }

  updateContactPointsVisibility(show) {
    this.app.bodies.forEach((body) => {
      body.toggleContactPoints(show);
    });
    this.app.uiState.contactPointsVisible = show;
  }

  updateVectorVisibility(vectorType, show) {
    this.app.bodies.forEach((body) => {
      body.toggleBodyVector(vectorType, show);
    });
    this.app.uiState.bodyVectorVisible[vectorType] = show;
  }

  updateTerrainVisualization(type, visible) {
    if (this.app.terrain) {
      this.app.terrain.toggleVisualization(type, visible);
      if (!this.app.uiState.terrainVisualizationModes) {
        this.app.uiState.terrainVisualizationModes = {};
      }
      this.app.uiState.terrainVisualizationModes[type] = visible;
    }
  }

  updateTerrainNormals(show) {
    if (this.app.terrain) {
      this.app.terrain.toggleNormalVectors(show);
      this.app.terrainVisualizationModes.normals = show;
    }
  }

  updateTerrainColorMap(colorMap) {
    if (this.app.terrain) {
      this.app.terrain.setColorMap(colorMap);
    }
  }

  dispose() {
    this.gui.destroy();
    this.gui = null;
    if (this.keyboardControlsListener) {
      window.removeEventListener("keydown", this.keyboardControlsListener);
      this.keyboardControlsListener = null;
    }
  }
}
