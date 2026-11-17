"""Bounded process-local rate limits; keys never retain request identifiers."""

from collections import deque
import hashlib
import math
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request

from app.core.config import get_settings


class RateLimiter:
    def __init__(self, clock=monotonic):
        self._clock = clock
        self._lock = Lock()
        self._buckets: dict[str, tuple[deque, float]] = {}

    def reset(self):
        with self._lock:
            self._buckets.clear()

    def check(self, scope: str, identifier: str, *, limit: int, window: int):
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return
        key = hashlib.sha256(f"{scope}\0{identifier}".encode()).hexdigest()
        with self._lock:
            now = self._clock()
            # Prune on every check so inactive keys cannot accumulate indefinitely.
            for stale in [key for key, (_, expires) in self._buckets.items() if expires <= now]:
                del self._buckets[stale]
            bucket = self._buckets.get(key)
            if bucket is None:
                if len(self._buckets) >= settings.rate_limit_max_keys:
                    self._reject(1)
                attempts = deque()
            else:
                attempts = bucket[0]
            while attempts and attempts[0] <= now - window:
                attempts.popleft()
            if len(attempts) >= limit:
                self._reject(math.ceil(attempts[0] + window - now))
            attempts.append(now)
            self._buckets[key] = (attempts, now + window)

    @staticmethod
    def _reject(retry_after):
        raise HTTPException(
            429,
            "Слишком много попыток. Повторите позже.",
            headers={"Retry-After": str(max(1, retry_after))},
        )


limiter = RateLimiter()


def peer_key(request: Request) -> str:
    # Only trust the transport peer. Arbitrary X-Forwarded-For is spoofable.
    return request.client.host if request.client else "unknown"


async def limit_login(request: Request):
    settings = get_settings()
    limiter.check("login-ip", peer_key(request), limit=settings.login_max_attempts, window=settings.login_window_seconds)
    try:
        body = await request.json()
    except ValueError:
        return
    email = body.get("email") if isinstance(body, dict) else None
    if isinstance(email, str):
        email = email.strip().casefold()
        if len(email) <= 254:
            limiter.check("login-email", email, limit=settings.login_max_attempts, window=settings.login_window_seconds)


def limit_register(request: Request):
    settings = get_settings()
    limiter.check("register-ip", peer_key(request), limit=settings.register_max_attempts, window=settings.register_window_seconds)
