# Forecast methods and optional model licensing

Checked 29 October 2026. No model-generated forecast, fabricated confidence interval, or assumed accuracy enters SAQTA’s results.

## Numerical forecasting

`backend/app/forecasting/selection.py` uses the existing baseline and NumPy. Baselines are always evaluated before the optional ridge regression. Model choice uses only an earlier validation period; the final seven observed dates are reserved for evaluation of the chosen method. Evaluation is rolling one-step prediction: a completed holdout observation can become history for the next point. These metrics therefore do **not** certify a seven-day simultaneous forecast.

The ridge candidate uses lagged sales means and weekday sine/cosine features, standardizes on past rows only, and applies fixed L2 regularization. It is considered only at 98+ observed dates. All candidates are compared on the same dates; the lowest validation MAE wins, with the simpler baseline first in a tie. Missing dates stay missing, and WAPE is null when actual sales sum to zero.

NumPy is distributed under the [BSD 3-Clause license](https://numpy.org/doc/stable/license.html). The installed pinned version and all runtime dependencies are in `backend/requirements.lock.txt`. No GPU is needed for this implementation.

## Optional self-hosted explanation prioritization

The selected optional weights are **[Qwen/Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B)**. The concrete weight repository provides an [Apache License 2.0](https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE). The optional Transformers inference code is separately licensed under [Apache License 2.0](https://github.com/huggingface/transformers/blob/main/LICENSE). This statement concerns these specific artifacts, not every model carrying the Qwen name. No code is copied from the Qwen GitHub repository.

Apache 2.0 allows use and modification, including commercial use, subject to its conditions. When redistributing covered artifacts, retain the license and applicable notices, preserve attribution, mark modified files and handle any supplied NOTICE material as required. The license includes patent provisions and does not grant general trademark rights. Keep the downloaded weights’ actual license/notice files with any deployment or redistribution.

The model is optional because hosting compute and memory are infrastructure costs even when weights are freely licensed. No claim is made that the existing Render instance has capacity, that a free inference provider is guaranteed, or that model weights are already installed.

A separately provisioned inference server must expose an OpenAI-compatible `/v1/chat/completions` endpoint for the configured model. Set on the backend only:

```dotenv
LLM_BASE_URL=https://YOUR-INFERENCE-SERVICE/v1
LLM_MODEL=Qwen/Qwen3-0.6B
LLM_API_KEY=YOUR_SERVER_TOKEN_IF_REQUIRED
```

Do not place a token in `NEXT_PUBLIC_*`. Restrict the inference endpoint to authorized callers. The server must implement the selected model and support the request fields in `services/explanation.py`; no unverified server package or paid provider is silently installed.

After an explicit analysis, the frontend requests explanation prioritization only when the backend reports inference configured. The adapter sends aggregate metrics and predefined fact IDs, not product/business names, raw transaction rows, account identifiers or original filenames. Output must contain exactly the supplied item indexes and the same fact sets. A ten-second timeout, HTTP failure, oversized/invalid JSON or invented fact returns the original explanation. This is constrained prioritization, **not unrestricted AI-generated advice**. Offline and invented-output cases have regression tests.

## Practical limits

Questionnaire answers are assumptions, not training history. Text about weather, promotions, holidays or supply is stored but does not infer causal multipliers. Inventory lacks full lot-level FIFO and expiry accounting; freshness must be confirmed by the seller. The UI explicitly identifies provisional estimates and conditional surplus. Planned production is not carried into future physical inventory, and no forecast automatically publishes a SAVE offer.
