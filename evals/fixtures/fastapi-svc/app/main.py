"""HTTP routes for the item service."""

from dataclasses import asdict

from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.store import store

app = FastAPI(title="items service")


class ItemIn(BaseModel):
    name: str = Field(min_length=1)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/items")
def list_items() -> list[dict]:
    return [asdict(item) for item in store.list()]


@app.post("/items", status_code=201)
def create_item(payload: ItemIn) -> dict:
    return asdict(store.create(payload.name))
