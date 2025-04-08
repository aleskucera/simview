import torch
from einops import rearrange
from dataclasses import dataclass
from enum import StrEnum


class BodyShapeType(StrEnum):
    POINTCLOUD = "pointcloud"
    MESH = "mesh"
    BOX = "box"
    SPHERE = "sphere"
    CYLINDER = "cylinder"


class OptionalBodyStateAttribute(StrEnum):
    CONTACTS = "contacts"
    VELOCITY = "velocity"
    ANGULAR_VELOCITY = "angularVelocity"
    FORCE = "force"
    TORQUE = "torque"


@dataclass
class SimViewTerrain:
    extent_x: float
    extent_y: float
    shape_x: float
    shape_y: float
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
                "extentX": self.extent_x,
                "extentY": self.extent_y,
                "shapeX": self.shape_x,
                "shapeY": self.shape_y,
            },
            "bounds": {
                "minX": self.min_x,
                "minY": self.min_y,
                "maxX": self.max_x,
                "maxY": self.max_y,
                "minZ": self.min_z,
                "maxZ": self.max_z,
            },
            "heightData": self.height_data,
            "normals": self.normals,
            "isSingleton": self.is_singleton,
        }

    @staticmethod
    def create(
        heightmap: torch.Tensor,  # ! remember the x,y indexing is assumed to follow torch's "xy" convention, so increasing column index is increasing x coordinate
        normals: torch.Tensor,
        x_lim: tuple[float, float],
        y_lim: tuple[float, float],
        is_singleton: bool,
    ) -> "SimViewTerrain":
        assert heightmap.ndim == 3, "Heightmap must include a batch dimension"
        assert normals.ndim == 4, "Normals must include a batch dimension"
        assert normals.shape[1] == 3, "Normals must have 3 channels"
        B, Dy, Dx = heightmap.shape
        min_x, max_x = x_lim
        min_y, max_y = y_lim
        min_z = heightmap.min().item()
        max_z = heightmap.max().item()
        extent_x = max_x - min_x
        extent_y = max_y - min_y
        height_data_list = rearrange(heightmap, "b d1 d2 -> b (d1 d2)").tolist()
        normals_list = rearrange(normals, "b c d1 d2 -> b (d1 d2) c").tolist()
        return SimViewTerrain(
            extent_x=extent_x,
            extent_y=extent_y,
            shape_x=Dx,
            shape_y=Dy,
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
    available_attributes: list[OptionalBodyStateAttribute] | None = None

    def set_available_attributes(self, available_attributes: list[str | OptionalBodyStateAttribute]) -> None:
        if self.available_attributes is not None:
            raise UserWarning("Available attributes already set")
        self.available_attributes = [v if isinstance(v, OptionalBodyStateAttribute) else OptionalBodyStateAttribute(v) for v in available_attributes]

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
    def create_pointcloud(name: str, points: torch.Tensor) -> "SimViewBody":
        assert points.ndim == 2, "Points must be a 2D tensor"
        assert points.shape[1] == 3, "Points must have shape (N, 3)"
        return SimViewBody(
            name=name,
            shape={
                "type": BodyShapeType.POINTCLOUD.value,
                "points": points.tolist(),
            },
        )

    @staticmethod
    def create_mesh(name: str, vertices: torch.Tensor, faces: torch.Tensor) -> "SimViewBody":
        assert vertices.ndim == 2, "Vertices must be a 2D tensor"
        assert faces.ndim == 2, "Faces must be a 2D tensor"
        assert vertices.shape[1] == 3, "Vertices must have shape (N, 3)"
        assert faces.shape[1] == 3, "Faces must have shape (N, 3)"
        return SimViewBody(
            name=name,
            shape={
                "type": BodyShapeType.MESH.value,
                "vertices": vertices.tolist(),
                "faces": faces.tolist(),
            },
        )

    @staticmethod
    def create(name: str, body_type: BodyShapeType, available_attributes: list[OptionalBodyStateAttribute] | None = None, **kwargs) -> "SimViewBody":
        match body_type:
            case BodyShapeType.BOX:
                body = SimViewBody.create_box(name, **kwargs)
            case BodyShapeType.SPHERE:
                body = SimViewBody.create_sphere(name, **kwargs)
            case BodyShapeType.CYLINDER:
                body = SimViewBody.create_cylinder(name, **kwargs)
            case BodyShapeType.POINTCLOUD:
                body = SimViewBody.create_pointcloud(name, **kwargs)
            case BodyShapeType.MESH:
                body = SimViewBody.create_mesh(name, **kwargs)
            case _:
                raise ValueError(f"Unknown body type: {body_type}")
        if available_attributes is not None:
            body.set_available_attributes(available_attributes)
        return body

    def to_json(self) -> dict:
        r = {"name": self.name, "shape": self.shape}
        if self.available_attributes is not None:
            r["availableAttributes"] = [v.value for v in self.available_attributes]
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
        heightmap: torch.Tensor,
        normals: torch.Tensor,
        x_lim: tuple[float, float],
        y_lim: tuple[float, float],
    ) -> None:
        if heightmap.ndim == 2:
            heightmap = heightmap.unsqueeze(0)  # add batch dim
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
