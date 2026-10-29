"""Optional self-hosted Qwen prioritizes verified facts; it cannot invent claims.

No raw business rows, identities, names or filenames leave this service. Model
output is restricted to existing fact IDs. All figures remain deterministic.
"""

import json
import httpx
from app.core.config import get_settings


async def explain_report(report):
    config = get_settings()
    if not config.llm_base_url:
        report["explanation_service"] = "not_configured"
        return report
    aggregates = [
        {
            "index": i,
            "facts": item["explanation"]["facts"],
            "observations": item["observations"],
            "metrics": {k: v for k, v in (item.get("metrics") or {}).items() if k != "points"},
        }
        for i, item in enumerate(report["items"])
    ]
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            response = await client.post(
                config.llm_base_url.rstrip("/") + "/chat/completions",
                headers={"Authorization": f"Bearer {config.llm_api_key}"} if config.llm_api_key else {},
                json={
                    "model": config.llm_model,
                    "temperature": 0,
                    "max_tokens": 700,
                    "chat_template_kwargs": {"enable_thinking": False},
                    "messages": [
                        {
                            "role": "system",
                            "content": "Return a JSON array of {index, facts}. Reorder ALL supplied fact IDs by importance. Never add or omit IDs. No prose, numbers, forecasts, or tools.",
                        },
                        {"role": "user", "content": json.dumps(aggregates)},
                    ],
                },
            )
            response.raise_for_status()
            if len(response.content) > 32_000:
                raise ValueError()
            data = json.loads(response.json()["choices"][0]["message"]["content"])
            if not isinstance(data, list) or len(data) != len(aggregates):
                raise ValueError()
            if sorted(row["index"] for row in data) != list(range(len(aggregates))):
                raise ValueError()
            for row in data:
                original = aggregates[row["index"]]["facts"]
                if sorted(row["facts"]) != sorted(original):
                    raise ValueError()
            for row in data:
                report["items"][row["index"]]["explanation"] = {"mode": "qwen_ranked", "facts": row["facts"]}
            report["explanation_service"] = "available"
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        report["explanation_service"] = "unavailable"
    return report
