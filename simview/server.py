import json
from pathlib import Path

from flask import Flask
from flask import render_template
from flask_socketio import SocketIO

from .utils import find_free_port


class SimViewServer:
    def __init__(self, sim_dict: dict | None = None, sim_path: str | Path | None = None):
        if (sim_dict is None and sim_path is None) or (sim_dict is not None and sim_path is not None):
            raise ValueError("Either sim_dict or sim_path must be provided, but not both.")
        if sim_dict is not None:
            if "model" not in sim_dict or "states" not in sim_dict:
                raise ValueError("sim_dict must contain 'model' and 'states' keys.")
            self.sim_data = sim_dict
        else:
            self.sim_data = self._load_data_from_file(sim_path)
        self.app = Flask(__name__, template_folder="../templates", static_folder="../static")
        self.socketio = SocketIO(self.app, json=json, cors_allowed_origins="*", async_mode="eventlet")
        self.setup_routes()
        self.setup_socket_handlers()

    def _load_data_from_file(self, sim_path: str | Path):
        sim_path = Path(sim_path).resolve()
        if not sim_path.exists():
            raise FileNotFoundError(f"Simulation file {sim_path} does not exist.")
        with open(sim_path, "r") as file:
            data = json.load(file)
        if ("model" not in data) or ("states" not in data):
            raise ValueError("Simulation file must contain 'model' and 'states' keys.")
        return data

    def setup_routes(self):
        @self.app.route("/")
        def index():
            return render_template("index.html")

    def setup_socket_handlers(self):
        @self.socketio.on("connect")
        def handle_connect():
            print("Client connected")

        @self.socketio.on("disconnect")
        def handle_disconnect():
            print("Client disconnected")

        @self.socketio.on("get_model")
        def handle_get_model():
            try:
                self.socketio.emit("model", self.sim_data["model"])
            except Exception as e:
                print(f"Error loading model: {e}")
                self.socketio.emit("error", {"message": "Error loading model"})

        @self.socketio.on("get_states")
        def handle_get_states():
            try:
                self.socketio.emit("states", self.sim_data["states"])
            except Exception as e:
                print(f"Error loading states: {e}")
                self.socketio.emit("error", {"message": "Error loading states"})

    def run(self, debug: bool = False, host: str = "0.0.0.0", port: int = 5420):
        self.socketio.run(self.app, debug=debug, host=host, port=port)

    @staticmethod
    def start(sim_path: str | Path | None = None, sim_dict: dict | None = None, host: str = "0.0.0.0", preferred_port: int = 5420):
        server = SimViewServer(sim_dict=sim_dict, sim_path=sim_path)
        port = find_free_port(host, preferred_port)
        if port != preferred_port:
            print(f"Preferred port {preferred_port} is not available. Using port {port} instead.")
        server.run(host=host, port=port)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run the SimView server.")
    parser.add_argument("--sim_path", type=str, required=True, help="Path to the simulation JSON file.")
    args = parser.parse_args()
    SimViewServer.start(args.sim_path)
