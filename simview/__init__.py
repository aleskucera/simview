from pathlib import Path
import json
from .model import SimViewTerrain, SimViewModel, SimViewBody
from .state import SimViewBodyState
from .server import SimViewServer


PKG_ROOT = Path(__file__).resolve().parent
DATA_ROOT = PKG_ROOT.parent


CACHE = DATA_ROOT / ".simview_cache"


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
        if (json_path := self._try_get_from_cache(run_name)) is not None and use_cache:
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

    @property
    def is_ready(self) -> bool:
        return self._file is not None or (len(self.states) > 0 and self.model.is_complete)

    def _try_get_from_cache(self, name: str) -> Path | None:
        cache_path = CACHE / f"{name}.json"
        if not cache_path.exists():
            return None
        return cache_path

    def add_state(self, time: float, body_states: list[SimViewBodyState]) -> None:
        if self._file is not None:
            raise ValueError("Cannot add state after starting server")
        self.states.append(
            {
                "time": time,
                "body_states": [state.to_json() for state in body_states],
            }
        )

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
                    json_path = CACHE / f"{self.run_name}.json"
                    with open(json_path, "w") as f:
                        json.dump(complete_json, f, indent=4)
                SimViewServer.start(sim_dict=complete_json)
            except Exception as e:
                print(f"Error starting server: {e}")
