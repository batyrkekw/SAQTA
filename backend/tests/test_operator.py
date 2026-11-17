import getpass
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError, URLError
import warnings

import pytest


spec = importlib.util.spec_from_file_location("saqtafood_operator", Path(__file__).resolve().parents[2] / "scripts" / "operator.py")
operator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(operator)

TOKEN = "operator-secret-not-for-output"
PASSWORD = "replacement-secret-not-for-output"


@pytest.fixture(autouse=True)
def environment(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", TOKEN)
    monkeypatch.setenv("API_URL", "http://127.0.0.1:8001/api/")


def transport(monkeypatch, result=None, *, failure=None, content=None):
    requests = []

    class Response(io.BytesIO):
        status = 200

    class Opener:
        def open(self, request, timeout):
            requests.append(request)
            assert timeout == 15
            if failure is not None:
                raise failure
            return Response(content if content is not None else json.dumps(result).encode())

    def build(*handlers):
        assert len(handlers) == 1 and isinstance(handlers[0], operator.NoRedirects)
        return Opener()

    monkeypatch.setattr(operator, "build_opener", build)
    return requests


def hidden_password(monkeypatch, values=(PASSWORD, PASSWORD)):
    answers = iter(values)
    calls = []
    monkeypatch.setattr(operator.sys, "stdin", SimpleNamespace(isatty=lambda: True))

    def prompt(message):
        calls.append(message)
        return next(answers)

    monkeypatch.setattr(operator.getpass, "getpass", prompt)
    return calls


def safe_output(capsys):
    output = capsys.readouterr()
    combined = output.out + output.err
    assert TOKEN not in combined and PASSWORD not in combined and "Traceback" not in combined
    return output


def test_pending_uses_admin_header_and_only_displays_allowed_result_fields(monkeypatch, capsys):
    requests = transport(monkeypatch, {"users": [{"email": "owner@example.com", "bakery_name": "Bakery " + TOKEN,
                                                  "requested_role": "business", "password": PASSWORD, "token": TOKEN}]})
    assert operator.main(["list-pending"]) == 0
    assert requests[0].full_url == "http://127.0.0.1:8001/api/admin/pending"
    assert requests[0].get_method() == "GET" and requests[0].data is None
    assert requests[0].get_header("Authorization") == "Bearer " + TOKEN
    result = json.loads(safe_output(capsys).out)
    assert result == [{"email": "owner@example.com", "bakery_name": "Bakery [скрыто]", "requested_role": "business"}]


def test_empty_pending_list(monkeypatch, capsys):
    transport(monkeypatch, {"users": []})
    assert operator.main(["list-pending"]) == 0
    assert "Ожидающих заявок нет" in safe_output(capsys).out


def test_pending_does_not_reflect_json_escaped_token(monkeypatch, capsys):
    token = 'secret"with\\punctuation'
    monkeypatch.setenv("ADMIN_TOKEN", token)
    transport(monkeypatch, {"users": [{"email": "owner@example.com", "bakery_name": token, "requested_role": "charity"}]})
    assert operator.main(["list-pending"]) == 0
    assert json.loads(safe_output(capsys).out)[0]["bakery_name"] == "[скрыто]"


@pytest.mark.parametrize("role", ["consumer", "business", "charity"])
def test_approve_posts_exact_role_without_raw_server_message(monkeypatch, capsys, role):
    requests = transport(monkeypatch, {"id": 1, "role": role, "message": PASSWORD})
    assert operator.main(["approve", "owner@example.com", role]) == 0
    assert requests[0].full_url.endswith("/admin/approve") and requests[0].get_method() == "POST"
    assert json.loads(requests[0].data) == {"email": "owner@example.com", "role": role}
    assert role in safe_output(capsys).out


def test_reset_uses_two_hidden_prompts_and_never_prints_password(monkeypatch, capsys):
    prompts = hidden_password(monkeypatch)
    requests = transport(monkeypatch, {"id": 1, "message": PASSWORD})
    assert operator.main(["reset-password", "owner@example.com"]) == 0
    assert len(prompts) == 2 and requests[0].full_url.endswith("/admin/reset-password")
    assert json.loads(requests[0].data) == {"email": "owner@example.com", "password": PASSWORD}
    assert "все сессии завершены" in safe_output(capsys).out


@pytest.mark.parametrize("values", [(PASSWORD, "different-secret"), ("short", "short"), ("x" * 129, "x" * 129)])
def test_reset_invalid_password_never_sends_request(monkeypatch, capsys, values):
    hidden_password(monkeypatch, values)
    requests = transport(monkeypatch)
    assert operator.main(["reset-password", "owner@example.com"]) == 1
    assert requests == [] and safe_output(capsys).err


def test_reset_refuses_redirected_stdin(monkeypatch, capsys):
    monkeypatch.setattr(operator.sys, "stdin", SimpleNamespace(isatty=lambda: False))
    requests = transport(monkeypatch)
    assert operator.main(["reset-password", "owner@example.com"]) == 1
    assert requests == [] and "интерактивного терминала" in safe_output(capsys).err


def test_getpass_cannot_fall_back_to_echoed_input(monkeypatch, capsys):
    hidden_password(monkeypatch)

    def unsafe_prompt(_):
        warnings.warn("Would echo " + PASSWORD, getpass.GetPassWarning)
        pytest.fail("Echoed fallback must not execute")

    monkeypatch.setattr(operator.getpass, "getpass", unsafe_prompt)
    requests = transport(monkeypatch)
    assert operator.main(["reset-password", "owner@example.com"]) == 1
    assert requests == [] and "Скрытый ввод" in safe_output(capsys).err


@pytest.mark.parametrize("status", [301, 302, 307, 308, 401, 403, 404, 422, 429, 503, 500])
def test_http_errors_never_echo_body_url_or_secret(monkeypatch, capsys, status):
    body = io.BytesIO((TOKEN + PASSWORD).encode())
    failure = HTTPError("https://example.test/" + TOKEN, status, PASSWORD, {}, body)
    requests = transport(monkeypatch, failure=failure)
    assert operator.main(["list-pending"]) == 1
    assert len(requests) == 1 and body.closed
    assert safe_output(capsys).err


def test_redirect_handler_never_creates_forwarded_request():
    assert operator.NoRedirects().redirect_request(None, None, 302, "", {}, "https://elsewhere.test") is None


@pytest.mark.parametrize("failure", [URLError(TOKEN + PASSWORD), TimeoutError(PASSWORD), RuntimeError(TOKEN)])
def test_transport_failure_has_no_trace_or_secrets(monkeypatch, capsys, failure):
    transport(monkeypatch, failure=failure)
    assert operator.main(["list-pending"]) == 1
    assert safe_output(capsys).err


@pytest.mark.parametrize("content", [b"not json", b"x" * 1_048_577, b"[]", b'{"users":[{}]}'],
                         ids=["invalid_json", "oversized", "array", "invalid_user"])
def test_malformed_or_oversized_response_is_not_reported_as_success(monkeypatch, capsys, content):
    transport(monkeypatch, content=content)
    assert operator.main(["list-pending"]) == 1
    assert safe_output(capsys).err


@pytest.mark.parametrize("url", ["", "http://example.com/api", "ftp://localhost/api", "https://user:secret@example.com/api",
                                 "https://@example.com/api", "https://example.com/api?", "https://example.com/api#",
                                 "https://example.com/api?secret=value", "https://example.com/api#fragment",
                                 "https://example.com", "https://example.com:invalid/api", "https://example.com:0/api",
                                 "https://example.com/api\n", "http://localhost.evil.test/api"])
def test_unsafe_or_invalid_api_url_is_rejected(monkeypatch, capsys, url):
    monkeypatch.setenv("API_URL", url)
    requests = transport(monkeypatch)
    assert operator.main(["list-pending"]) == 1
    assert requests == [] and safe_output(capsys).err


@pytest.mark.parametrize("url", ["https://example.com/api", "https://example.com/prefix/api/",
                                 "http://localhost:8001/api", "http://[::1]:8001/api", "http://127.0.0.2/api"])
def test_https_and_loopback_http_api_urls_are_accepted(url):
    assert operator.api_url(url) == url.rstrip("/")


def test_missing_token_and_argument_errors_do_not_send_requests(monkeypatch, capsys):
    requests = transport(monkeypatch)
    monkeypatch.delenv("ADMIN_TOKEN")
    assert operator.main(["list-pending"]) == 1
    assert "ADMIN_TOKEN" in safe_output(capsys).err
    assert operator.main(["reset-password", "owner@example.com", PASSWORD]) == 1
    assert safe_output(capsys).err
    assert requests == []
