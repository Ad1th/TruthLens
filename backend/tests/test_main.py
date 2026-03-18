from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_endpoint_returns_ok():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "openai_configured" in payload


def test_analyze_endpoint_returns_expected_shape():
    response = client.post(
        "/api/v1/analyze",
        json={
            "url": "https://example.com/news",
            "text": "This shocking report clearly proves that everyone knows the truth.",
            "config": {"sensitivity": "2", "heuristics_only": True},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "overall_bias_score" in payload
    assert "confidence" in payload
    assert "flags" in payload
    assert "meta" in payload
    assert isinstance(payload["flags"], list)


def test_analyze_rejects_invalid_url():
    response = client.post(
        "/api/v1/analyze",
        json={
            "url": "invalid-url",
            "text": "sample text",
        },
    )
    assert response.status_code == 400
