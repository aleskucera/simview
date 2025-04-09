from pathlib import Path
import json
import torch
import gc
from simview.model import SimViewTerrain, SimViewModel, SimViewBody, BodyShapeType, OptionalBodyStateAttribute, SimViewStaticObject
from simview.state import SimViewBodyState
from simview.server import SimViewServer


CACHE_DIR = ".simview_cache"


class SimView:
    def __init__(
        self,
        run_name: str,
        batch_size: int,
        scalar_names: list[str],
        dt: float,
        collapse: bool,
        terrain: SimViewTerrain | None = None,
        bodies: dict[str, SimViewBody] | None = None,  # Renamed for clarity
        static_objects: dict[str, SimViewStaticObject] | None = None,  # Added static_objects
        use_cache: bool = True,
    ) -> None:
        self.run_name = run_name
        self.use_cache = use_cache
        self._cache_path = self._make_cache_path(run_name)
        if self._cache_path.exists() and self.use_cache:  # Check use_cache flag here too
            print(f"Loading cached data from {self._cache_path}")
            self._file = self._cache_path
            self.model = None  # Indicate model is loaded from file
            self.states = None  # Indicate states are loaded from file
        else:
            self._file = None
            self.model = SimViewModel(
                batch_size=batch_size,
                scalar_names=scalar_names,
                dt=dt,
                collapse=collapse,
                terrain=terrain,
                bodies=bodies if bodies is not None else {},  # Pass bodies
                static_objects=static_objects if static_objects is not None else {},  # Pass static_objects
            )
            self.states = []

    def _make_cache_path(self, name: str) -> Path:
        home_dir = Path.home()
        if self.use_cache:
            cache_dir = home_dir / ".cache"
        else:
            cache_dir = Path("/tmp")
        cache_dir /= CACHE_DIR
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir / f"{name}.json"

    @property
    def is_ready(self) -> bool:
        # Model/states are None if loaded from cache
        return self._file is not None or (self.model is not None and self.states is not None and len(self.states) > 0 and self.model.is_complete)

    def add_state(self, time: float, body_states: list[SimViewBodyState], scalar_values: dict[str, torch.Tensor | list] | None = None) -> None:
        if self._file is not None:
            raise ValueError("Cannot add state after starting server or loading from cache")
        if self.model is None or self.states is None:
            raise ValueError("Model and states not initialized. Cannot add state.")
        if self.model.scalar_names is not None:
            assert scalar_values is not None, "Scalar values must be provided"
            assert set(scalar_values.keys()) == set(self.model.scalar_names), "Scalar values do not match model"
            scalars = {k: v.tolist() if isinstance(v, torch.Tensor) else v for k, v in scalar_values.items()}
        else:
            scalars = {}
        self.states.append({"time": time, "bodies": [state.to_json() for state in body_states], **scalars})

    def visualize(self) -> None:
        if self._file is not None:
            # File already exists (cached or previously saved)
            pass
        elif self.model is not None and self.states is not None:
            # Need to save the current model and states
            try:
                complete_json = {
                    "model": self.model.to_json(),
                    "states": self.states,
                }
                self._file = self._cache_path  # Set the file path for saving
                with open(self._file, "w") as f:
                    json.dump(complete_json, f)  # Removed indent for potentially large files
                print(f"Saved simulation data to {self._file}")
                # Clear memory if caching is enabled
                del complete_json
                del self.states
                del self.model
                self.states = None
                self.model = None
                gc.collect()  # Force garbage collection

            except Exception as e:
                print(f"Error saving simulation data: {e}")
                return  # Don't start server if saving failed
        else:
            print("Error: No simulation data available to visualize (neither cached nor in memory).")
            return

        # Start the server with the file path
        if self._file and self._file.exists():
            SimViewServer.start(sim_path=self._file)
        else:
            print(f"Error: Simulation file {self._file} not found.")
