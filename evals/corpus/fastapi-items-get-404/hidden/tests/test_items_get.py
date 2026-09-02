# Hidden acceptance test for fastapi-items-get-404. Copied into the candidate
# tree AFTER the pipeline run; the pipeline never sees it.


def test_get_existing_item_returns_it(client):
    created = client.post("/items", json={"name": "widget"}).json()
    response = client.get(f"/items/{created['id']}")
    assert response.status_code == 200
    assert response.json() == created


def test_get_unknown_item_is_404_with_the_agreed_detail(client):
    response = client.get("/items/9999")
    assert response.status_code == 404
    assert response.json() == {"detail": "item not found"}


def test_ids_of_other_items_do_not_leak_into_lookups(client):
    first = client.post("/items", json={"name": "first"}).json()
    second = client.post("/items", json={"name": "second"}).json()
    assert client.get(f"/items/{second['id']}").json()["name"] == "second"
    assert client.get(f"/items/{first['id']}").json()["name"] == "first"
    missing = client.get(f"/items/{second['id'] + 1}")
    assert missing.status_code == 404
    assert missing.json() == {"detail": "item not found"}
