#!/usr/bin/env python3
"""Локальный оператор SaqtaFood: роли, сброс пароля, счета на оплату и напоминания."""

import argparse
import getpass
import ipaddress
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import warnings


class OperatorError(Exception):
    """Safe messages only: never include request or response contents."""


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise OperatorError("Некорректные аргументы. Используйте --help.")


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def api_url(value):
    try:
        parsed = urlsplit(value)
        host = parsed.hostname
        port = parsed.port
        try:
            loopback = ipaddress.ip_address(host or "").is_loopback
        except ValueError:
            loopback = host == "localhost"
        if (not host or parsed.username is not None or parsed.password is not None
                or "?" in value or "#" in value or "\\" in value or any(char.isspace() for char in value)
                or (port is not None and port < 1) or not parsed.path.rstrip("/").endswith("/api")
                or not (parsed.scheme == "https" or (parsed.scheme == "http" and loopback))):
            raise ValueError()
    except ValueError:
        raise OperatorError("API_URL должен быть HTTPS-адресом с /api; HTTP разрешён только для localhost.") from None
    return value.rstrip("/")


def replacement_password():
    if not sys.stdin.isatty():
        raise OperatorError("Сброс пароля требует интерактивного терминала; пароль вводится скрыто.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            password = getpass.getpass("Новый пароль (10–128 символов): ")
            repeated = getpass.getpass("Повторите новый пароль: ")
    except (getpass.GetPassWarning, EOFError):
        raise OperatorError("Скрытый ввод пароля недоступен. Используйте интерактивный терминал.") from None
    if password != repeated:
        raise OperatorError("Пароли не совпадают.")
    if not 10 <= len(password) <= 128:
        raise OperatorError("Пароль должен содержать от 10 до 128 символов.")
    return password


def request_api(base, token, path, payload=None):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = Request(base + "/admin/" + path, data=body, method="POST" if payload is not None else "GET",
                      headers={"Authorization": "Bearer " + token, "Accept": "application/json", "Content-Type": "application/json"})
    try:
        with build_opener(NoRedirects()).open(request, timeout=15) as response:
            if response.status != 200:
                raise OperatorError("API вернул неожиданный статус; действие не подтверждено.")
            content = response.read(1_048_577)
            if len(content) > 1_048_576:
                raise OperatorError("Ответ API превышает допустимый размер.")
            result = json.loads(content)
    except HTTPError as exc:
        messages = {
            401: "API отклонил ADMIN_TOKEN.", 403: "API запретил действие.",
            404: "Учётная запись или адрес API не найдены.", 422: "API отклонил введённые данные.",
            429: "Слишком много попыток. Повторите позже.", 503: "Админ-API отключён или временно недоступен.",
        }
        message = "Перенаправление API отклонено; токен не отправлен на другой адрес." if 300 <= exc.code < 400 else messages.get(exc.code, "Ошибка API; действие не подтверждено.")
        exc.close()
        raise OperatorError(message) from None
    except (URLError, OSError):
        raise OperatorError("Нет связи с API; результат действия не подтверждён.") from None
    except (ValueError, UnicodeError):
        raise OperatorError("API вернул некорректный ответ.") from None
    if not isinstance(result, dict):
        raise OperatorError("API вернул некорректный ответ.")
    return result


def result_text(command, result):
    if command == "list-pending":
        rows = result.get("users")
        if not isinstance(rows, list):
            raise OperatorError("API вернул некорректный список заявок.")
        visible = []
        for row in rows:
            if (not isinstance(row, dict) or not isinstance(row.get("email"), str)
                    or not isinstance(row.get("bakery_name"), str) or row.get("requested_role") not in {"business", "charity"}):
                raise OperatorError("API вернул некорректный список заявок.")
            visible.append({key: row[key] for key in ("email", "bakery_name", "requested_role")})
        return json.dumps(visible, ensure_ascii=False, indent=2) if visible else "Ожидающих заявок нет."
    if command == "invoices":
        rows = result.get("invoices")
        if not isinstance(rows, list):
            raise OperatorError("API вернул некорректный список счетов.")
        keys = ("number", "bakery_name", "plan", "months", "amount_kzt", "method", "status", "payer_name", "payer_bin", "created_at")
        visible = [{key: row.get(key) for key in keys} for row in rows if isinstance(row, dict)]
        return json.dumps(visible, ensure_ascii=False, indent=2) if visible else "Счетов нет."
    if command == "mark-paid":
        if result.get("status") != "paid":
            raise OperatorError("API не подтвердил оплату счёта.")
        return ("Оплата подтверждена" if result.get("changed") else "Счёт уже был оплачен") + f": {result.get('number')}, подписка до {result.get('period_end')}."
    if command == "send-reminders":
        return f"Отправлено напоминаний: {int(result.get('sent', 0))}."
    if type(result.get("id")) is not int or result["id"] < 1:
        raise OperatorError("API вернул некорректный результат действия.")
    if command == "approve":
        role = result.get("role")
        if role not in {"consumer", "business", "charity"}:
            raise OperatorError("API вернул некорректную роль.")
        return "Роль обновлена: " + role + "."
    return "Пароль обновлён, все сессии завершены."


def main(argv=None):
    parser = Parser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list-pending", help="Показать заявки на подтверждение роли")
    approve = commands.add_parser("approve", help="Подтвердить или изменить роль")
    approve.add_argument("email")
    approve.add_argument("role", choices=("consumer", "business", "charity"))
    reset = commands.add_parser("reset-password", help="Задать новый пароль скрытым вводом")
    reset.add_argument("email")
    invoices = commands.add_parser("invoices", help="Показать счета (по умолчанию неоплаченные)")
    invoices.add_argument("--status", choices=("pending", "paid", "cancelled", "failed"), default="pending")
    paid = commands.add_parser("mark-paid", help="Подтвердить оплату счёта по выписке банка или Kaspi")
    paid.add_argument("number")
    paid.add_argument("reference", help="Номер платёжного поручения или операции Kaspi")
    commands.add_parser("send-reminders", help="Разослать напоминания об окончании доступа (запускать ежедневно)")
    try:
        args = parser.parse_args(argv)
        token = os.environ.get("ADMIN_TOKEN", "")
        if not token or any(char in token for char in "\r\n"):
            raise OperatorError("Задайте ADMIN_TOKEN в окружении оператора.")
        base = api_url(os.environ.get("API_URL", ""))
        password = None
        payload = None
        if args.command == "approve":
            payload = {"email": args.email, "role": args.role}
        elif args.command == "reset-password":
            password = replacement_password()
            payload = {"email": args.email, "password": password}
        if args.command == "mark-paid":
            payload = {"reference": args.reference}
        elif args.command == "send-reminders":
            payload = {}
        path = {"list-pending": "pending", "invoices": f"invoices?status={args.status}" if args.command == "invoices" else "",
                "mark-paid": f"invoices/{args.number}/mark-paid" if args.command == "mark-paid" else ""}.get(args.command) or args.command
        output = result_text(args.command, request_api(base, token, path, payload))
        # Successful responses contain only whitelisted fields. Also suppress any
        # accidental credential reflection inside a displayed organization name.
        for secret in (token, password):
            if secret:
                for representation in (secret, json.dumps(secret, ensure_ascii=False)[1:-1]):
                    output = output.replace(representation, "[скрыто]")
        print(output)
        return 0
    except OperatorError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Операция отменена.", file=sys.stderr)
        return 130
    except Exception:
        print("Не удалось выполнить действие; результат не подтверждён.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
