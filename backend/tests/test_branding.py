def test_openapi_uses_current_product_names(client):
    schema = client.get("/openapi.json").json()
    assert schema["info"]["title"] == "SaqtaFood API"
    assert "SaqtaFood Save" in schema["info"]["description"]
    assert "SaqtaFood Forecast" in schema["info"]["description"]
    # This identifier is consumed by existing health clients.
    assert client.get("/api/health").json()["service"] == "SAQTA"


def test_rebranded_reset_confirmation(client):
    response = client.post("/api/demo/reset", json={"confirm": "RESET SaqtaFood DEMO"})
    assert response.status_code == 200
    assert "SaqtaFood" in response.json()["message"]
