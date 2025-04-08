from pathlib import Path
import json
import torch
from simview.model import SimViewTerrain, SimViewModel, SimViewBody, BodyShapeType, OptionalBodyStateAttribute
from simview.state import SimViewBodyState
from simview.server import SimViewServer


CACHE = ".simview_cache"


class SimView:
    def __init__(
        self,
        run_name: str,
        batch_size: int,
        scalar_names: list[str],
        dt: float,
        collapse: bool,
        terrain: SimViewTerrain | None = None,
        bodies: dict[str, SimViewBody] | None = None,
        use_cache: bool = True,
    ) -> None:
        self.run_name = run_name
        self.use_cache = use_cache
        self._cache_path = self._make_cache_path(run_name)
        if (json_path := self._try_get_from_cache()) is not None and use_cache:
            print(f"Loading cached data from {json_path}")
            self._file = json_path
        else:
            self._file = None
            self.model = SimViewModel(
                batch_size=batch_size,
                scalar_names=scalar_names,
                dt=dt,
                collapse=collapse,
                terrain=terrain,
                bodies=bodies,
            )
            self.states = []

    def _make_cache_path(self, name: str) -> Path:
        home_dir = Path.home()
        cache_dir = home_dir / ".cache"
        cache_dir /= CACHE
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir / f"{name}.json"

    @property
    def is_ready(self) -> bool:
        return self._file is not None or (len(self.states) > 0 and self.model.is_complete)

    def _try_get_from_cache(self) -> Path | None:
        if not self._cache_path.exists():
            return None
        return self._cache_path

    def add_state(self, time: float, body_states: list[SimViewBodyState], scalar_values: dict[str, torch.Tensor | list] | None = None) -> None:
        if self._file is not None:
            raise ValueError("Cannot add state after starting server")
        if self.model.scalar_names is not None:
            assert scalar_values is not None, "Scalar values must be provided"
            assert set(scalar_values.keys()) == set(self.model.scalar_names), "Scalar values do not match model"
            scalars = {k: v.tolist() if isinstance(v, torch.Tensor) else v for k, v in scalar_values.items()}
        else:
            scalars = {}
        self.states.append({"time": time, "bodies": [state.to_json() for state in body_states], **scalars})

    def visualize(self) -> None:
        if self._file is not None:
            SimViewServer.start(sim_path=self._file)
        else:
            try:
                complete_json = {
                    "model": self.model.to_json(),
                    "states": self.states,
                }
                if self.use_cache:
                    json_path = self._cache_path
                    with open(json_path, "w") as f:
                        json.dump(complete_json, f, indent=4)
                SimViewServer.start(sim_dict=complete_json)
            except Exception as e:
                print(f"Error starting server: {e}")
