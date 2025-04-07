import torch
from dataclasses import dataclass, field
from .model import BodyVectorType


@dataclass
class SimViewBodyState:
    body_name: str
    scalars: dict[str, list[float]] = field(default_factory=dict)
    vectors: dict[BodyVectorType, list[list[float]]] = field(default_factory=dict)
    contacts: list[list[int]] = field(default_factory=list)

    @staticmethod
    def from_tensors(
        body_name: str,
        scalars: dict[str, torch.Tensor],
        vectors: dict[BodyVectorType, torch.Tensor],
        contacts: torch.Tensor,
        contacts_as_mask: bool = False,
    ) -> "SimViewBodyState":
        if contacts_as_mask:
            contacts = [torch.nonzero(c).flatten() for c in contacts]
        return SimViewBodyState(
            body_name=body_name,
            scalars={k: v.tolist() for k, v in scalars.items()},
            vectors={k: v.tolist() for k, v in vectors.items()},
            contacts=[c.tolist() for c in contacts],
        )

    def to_json(self) -> dict:
        r = {
            "name": self.body_name,
            "scalars": self.scalars,
            "contacts": self.contacts,
            **{k.value: v for k, v in self.vectors.items()},
        }
        return r
