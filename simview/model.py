import torch
import numpy as np
from einops import rearrange
from dataclasses import dataclass
from enum import IntEnum, StrEnum


class BodyShapeType(IntEnum):
    CUSTOM = 0
    BOX = 1
    SPHERE = 2
    CYLINDER = 3


class BodyVectorType(StrEnum):
    ORIENTATION = "orientation"
    POSITION = "position"
    VELOCITY = "velocity"
    ANGULAR_VELOCITY = "angularVelocity"
    FORCE = "force"
    TORQUE = "torque"


class StaticObjectType(StrEnum):
    POINTCLOUD = "pointcloud"
    MESH = "mesh"


@dataclass
class SimViewTerrain:
    x_size: float
    y_size: float
    x_res: float
    y_res: float
    min_x: float
    min_y: float
    max_x: float
    max_y: float
    min_z: float
    max_z: float
    height_data: list[float]
    normals: list[list[float]]
    is_singleton: bool

    def to_json(self):
        return {
            "dimensions": {
                "x_size": self.x_size,
                "y_size": self.y_size,
                "x_res": self.x_res,
                "y_res": self.y_res,
            },
            "bounds": {
                "min_x": self.min_x,
                "min_y": self.min_y,
                "max_x": self.max_x,
                "max_y": self.max_y,
                "min_z": self.min_z,
                "max_z": self.max_z,
            },
            "height_data": self.height_data,
            "normals": self.normals,
            "is_singleton": self.is_singleton,
        }

    @staticmethod
    def create(
        heightmap: torch.Tensor
        | np.ndarray,  # ! remember the x,y indexing is assumed to follow torch's "xy" convention, so increasing column index is increasing x coordinate
        normals: torch.Tensor | np.ndarray,
        x_lim: tuple[float, float],
        y_lim: tuple[float, float],
        is_singleton: bool,
    ) -> "SimViewTerrain":
        assert heightmap.ndim == 3, "Heightmap must include a batch dimension"
        assert normals.ndim == 4, "Normals must include a batch dimension"
        B, Dy, Dx = heightmap.shape
        min_x, max_x = x_lim
        min_y, max_y = y_lim
        min_z = heightmap.min().item()
        max_z = heightmap.max().item()
        x_size = max_x - min_x
        y_size = max_y - min_y
        x_res = x_size / Dx
        y_res = y_size / Dy
        height_data_list = rearrange(heightmap, "b d1 d2 -> b (d1 d2)").tolist()
        normals_list = rearrange(normals, "b c d1 d2 -> b (d1 d2) c").tolist()
        return SimViewTerrain(
            x_size=x_size,
            y_size=y_size,
            x_res=x_res,
            y_res=y_res,
            min_x=min_x,
            min_y=min_y,
            max_x=max_x,
            max_y=max_y,
            min_z=min_z,
            max_z=max_z,
            height_data=height_data_list,
            normals=normals_list,
            is_singleton=is_singleton,
        )


@dataclass
class SimViewBody:
    name: str
    shape: dict
    available_vectors: list[BodyVectorType] | None = None

    def set_available_vectors(self, available_vectors: list[str | BodyVectorType]) -> None:
        if self.available_vectors is not None:
            raise ValueError("Available vectors already set")
        self.available_vectors = [BodyVectorType(v) if isinstance(v, str) else v for v in available_vectors]

    @staticmethod
    def create_box(name: str, hx: float, hy: float, hz: float) -> "SimViewBody":
        return SimViewBody(
            name=name,
            shape={
                "type": BodyShapeType.BOX.value,
                "hx": hx,
                "hy": hy,
                "hz": hz,
            },
        )

    @staticmethod
    def create_sphere(name: str, radius: float) -> "SimViewBody":
        return SimViewBody(
            name=name,
            shape={
                "type": BodyShapeType.SPHERE.value,
                "radius": radius,
            },
        )

    @staticmethod
    def create_cylinder(name: str, radius: float, height: float) -> "SimViewBody":
        return SimViewBody(
            name=name,
            shape={
                "type": BodyShapeType.CYLINDER.value,
                "radius": radius,
                "height": height,
            },
        )

    @staticmethod
    def create_custom(name: str, points: torch.Tensor | np.ndarray) -> "SimViewBody":
        assert points.ndim == 2, "Points must be a 2D tensor"
        assert points.shape[1] == 3, "Points must have shape (N, 3)"
        return SimViewBody(
            name=name,
            shape={
                "type": BodyShapeType.CUSTOM.value,
                "points": points.tolist(),
            },
        )

    @staticmethod
    def create(name: str, body_type: BodyShapeType, **kwargs) -> "SimViewBody":
        match body_type:
            case BodyShapeType.BOX:
                return SimViewBody.create_box(name, **kwargs)
            case BodyShapeType.SPHERE:
                return SimViewBody.create_sphere(name, **kwargs)
            case BodyShapeType.CYLINDER:
                return SimViewBody.create_cylinder(name, **kwargs)
            case BodyShapeType.CUSTOM:
                return SimViewBody.create_custom(name, **kwargs)
            case _:
                raise ValueError(f"Unknown body type: {body_type}")

    def to_json(self) -> dict:
        r = self.shape.copy()
        r["name"] = self.name
        if self.available_vectors is not None:
            r["availableVectors"] = [v.value for v in self.available_vectors]
        return r


@dataclass
class SimViewStaticObject:
    type: str
    points: list[list[float]]
    vertices: list[list[float]] | None = None
    faces: list[list[int]] | None = None
    color: str | list[float] | None = None

    def to_json(self) -> dict:
        r = {
            "type": self.type,
            "points": self.points,
            "color": self.color,
        }
        if self.type == StaticObjectType.MESH:
            assert self.vertices or self.faces, "Mesh must have vertices or faces"
            if self.vertices:
                r["vertices"] = self.vertices
            if self.faces:
                r["faces"] = self.faces
        return r


@dataclass
class SimViewModel:
    batch_size: int
    scalar_names: list[str]
    dt: float
    collapse: bool
    terrain: SimViewTerrain | None = None
    bodies: dict[str, SimViewBody] | None = None

    def add_terrain(self, terrain: SimViewTerrain) -> None:
        if self.terrain is not None:
            raise ValueError("Terrain already exists")
        self.terrain = terrain

    def add_body(self, body_name: str, body: SimViewBody) -> None:
        if self.bodies is None:
            self.bodies = {}
        if body_name in self.bodies:
            raise ValueError(f"Body {body_name} already exists")
        self.bodies[body_name] = body

    def create_terrain(
        self,
        heightmap: torch.Tensor | np.ndarray,
        normals: torch.Tensor | np.ndarray,
        x_lim: tuple[float, float],
        y_lim: tuple[float, float],
    ) -> None:
        if isinstance(heightmap, np.ndarray):
            heightmap = torch.from_numpy(heightmap)
        if heightmap.ndim == 2:
            heightmap = heightmap.unsqueeze(0)  # add batch dim
        if isinstance(normals, np.ndarray):
            normals = torch.from_numpy(normals)
        if normals.ndim == 3:  # channels first
            normals = normals.unsqueeze(0)  # add batch dim
        B = heightmap.shape[0]
        is_singleton = B == 1 and self.batch_size != 1
        self.terrain = SimViewTerrain.create(
            heightmap=heightmap,
            normals=normals,
            x_lim=x_lim,
            y_lim=y_lim,
            is_singleton=is_singleton,
        )

    def create_body(self, body_name: str, shape_type: BodyShapeType, **kwargs) -> None:
        if self.bodies is None:
            self.bodies = {}
        if body_name in self.bodies:
            raise ValueError(f"Body {body_name} already exists")
        self.bodies[body_name] = SimViewBody.create(body_name, shape_type, **kwargs)

    def to_json(self) -> dict:
        if self.bodies is None or len(self.bodies) == 0:
            raise ValueError("No bodies defined")
        if self.terrain is None:
            raise ValueError("No terrain defined")
        r = {
            "batchSize": self.batch_size,
            "scalarNames": self.scalar_names,
            "dt": self.dt,
            "collapse": self.collapse,
            "terrain": self.terrain.to_json(),
            "bodies": [b.to_json() for b in self.bodies.values()],
        }
        return r

    @property
    def is_complete(self) -> bool:
        return self.bodies is not None and len(self.bodies) > 0 and self.terrain is not None
