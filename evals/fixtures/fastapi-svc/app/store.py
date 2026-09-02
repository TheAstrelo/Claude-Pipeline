"""In-memory item storage."""

from __future__ import annotations

from dataclasses import dataclass
from itertools import count


@dataclass
class Item:
    id: int
    name: str


class ItemStore:
    """A process-local store; ids are sequential and never reused."""

    def __init__(self) -> None:
        self._items: dict[int, Item] = {}
        self._ids = count(1)

    def create(self, name: str) -> Item:
        item = Item(id=next(self._ids), name=name)
        self._items[item.id] = item
        return item

    def get(self, item_id: int) -> Item | None:
        return self._items.get(item_id)

    def list(self) -> list[Item]:
        return list(self._items.values())

    def clear(self) -> None:
        self._items.clear()


store = ItemStore()
