def test_create_and_list_items(client):
    created = client.post("/items", json={"name": "widget"})
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "widget"
    assert isinstance(body["id"], int)

    listed = client.get("/items")
    assert listed.status_code == 200
    assert listed.json() == [body]


def test_create_item_requires_a_name(client):
    assert client.post("/items", json={}).status_code == 422
    assert client.post("/items", json={"name": ""}).status_code == 422
