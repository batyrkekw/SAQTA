import asyncio
from copy import deepcopy
from unittest.mock import AsyncMock
import httpx
import pytest
from app.core.config import get_settings
from app.services.explanation import explain_report


@pytest.mark.parametrize("mode", ["timeout", "invented", "valid"])
def test_optional_model_never_changes_numbers_or_invents_facts(monkeypatch, mode):
    monkeypatch.setattr(get_settings(), "llm_base_url", "https://inference.example.test/v1")
    report = {
        "items": [
            {
                "product_name": "Private product name",
                "demand": 42,
                "observations": 40,
                "metrics": {"mae": 2, "points": [{"secret": "raw daily data"}]},
                "explanation": {"mode": "rules", "facts": ["history", "metrics"]},
            }
        ]
    }
    original = deepcopy(report)
    client = AsyncMock()
    if mode == "timeout":
        client.post.side_effect = httpx.ReadTimeout("offline")
    else:
        facts = ["metrics", "history"] if mode == "valid" else ["guaranteed profit"]
        import json

        client.post.return_value = httpx.Response(
            200,
            request=httpx.Request("POST", "https://inference.example.test/v1/chat/completions"),
            json={"choices": [{"message": {"content": json.dumps([{"index": 0, "facts": facts}])}}]},
        )
    manager = AsyncMock()
    manager.__aenter__.return_value = client
    monkeypatch.setattr("app.services.explanation.httpx.AsyncClient", lambda **kwargs: manager)
    result = asyncio.run(explain_report(report))
    assert result["explanation_service"] == ("available" if mode == "valid" else "unavailable")
    assert result["items"][0]["demand"] == 42
    assert result["items"][0]["metrics"] == original["items"][0]["metrics"]
    assert set(result["items"][0]["explanation"]["facts"]) == {"history", "metrics"}
    sent = str(client.post.call_args.kwargs["json"])
    assert "Private product name" not in sent and "raw daily data" not in sent
