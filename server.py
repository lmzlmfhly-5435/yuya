#!/usr/bin/env python3
"""Private, zero-dependency server for the Star Tree website."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import threading
import time
import unicodedata
from collections import defaultdict, deque
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
STATE_FILE = ROOT / "data" / "private_state.json"
PASSWORD_SALT = b"star-tree-private-v1"
PASSWORD_HASH = bytes.fromhex(
    "bda0d80d3891a23c9ef7ff28fd778b2117d8f9754e8e6dd95bdecdf29caaadaf"
)
PASSWORD_ROUNDS = 310_000
SESSION_TTL = 12 * 60 * 60
PUBLIC_FILES = {"login.html", "login.css", "login.js"}
DENIED_SUFFIXES = {".py", ".md", ".json", ".lock", ".tmp"}
PEOPLE = {"yuya": "Yuya", "zhennan": "Zhennan"}
MOODS = {"想你", "开心", "平静", "疲惫", "委屈", "需要抱抱"}
DEFAULT_WISHES = [
    {
        "id": "quiet-night",
        "text": "找一个晚上，什么都不做，只抱着你",
        "done": True,
        "createdAt": None,
        "updatedAt": None,
    },
    {
        "id": "dark-sky",
        "text": "一起去看真正没有灯光的星空",
        "done": False,
        "createdAt": None,
        "updatedAt": None,
    },
    {
        "id": "places",
        "text": "把想去的地方一站一站走完",
        "done": False,
        "createdAt": None,
        "updatedAt": None,
    },
    {
        "id": "photos",
        "text": "拍很多自然又不完美的合照",
        "done": False,
        "createdAt": None,
        "updatedAt": None,
    },
    {
        "id": "home",
        "text": "一起拥有属于我们的家",
        "done": False,
        "createdAt": None,
        "updatedAt": None,
    },
]
DEFAULT_STATE = {
    "moods": {
        "yuya": {"mood": "想你", "updatedAt": None},
        "zhennan": {"mood": "想你", "updatedAt": None},
    },
    "whispers": [],
    "wishes": DEFAULT_WISHES,
    "answers": [],
}


class SecurityState:
    def __init__(self) -> None:
        self.secret = secrets.token_bytes(32)
        self.lock = threading.RLock()
        self.failures: dict[str, deque[float]] = defaultdict(deque)
        self.locked_until: dict[str, float] = {}

    def sign_session(self) -> str:
        expires = int(time.time()) + SESSION_TTL
        payload = f"{expires}.{secrets.token_urlsafe(18)}"
        signature = hmac.new(self.secret, payload.encode(), hashlib.sha256).hexdigest()
        return f"{payload}.{signature}"

    def valid_session(self, token: str | None) -> bool:
        if not token:
            return False
        try:
            expires_text, nonce, signature = token.split(".", 2)
            if int(expires_text) < int(time.time()) or len(nonce) < 16:
                return False
            payload = f"{expires_text}.{nonce}"
            expected = hmac.new(self.secret, payload.encode(), hashlib.sha256).hexdigest()
            return hmac.compare_digest(signature, expected)
        except (TypeError, ValueError):
            return False

    def rate_status(self, client: str) -> tuple[bool, int]:
        now = time.time()
        with self.lock:
            if self.locked_until.get(client, 0) > now:
                return False, max(1, int(self.locked_until[client] - now))
            recent = self.failures[client]
            while recent and now - recent[0] > 600:
                recent.popleft()
            return True, max(0, 6 - len(recent))

    def record_failure(self, client: str) -> int:
        now = time.time()
        with self.lock:
            recent = self.failures[client]
            recent.append(now)
            while recent and now - recent[0] > 600:
                recent.popleft()
            if len(recent) >= 6:
                self.locked_until[client] = now + 900
                recent.clear()
                return 0
            return 6 - len(recent)

    def clear_failures(self, client: str) -> None:
        with self.lock:
            self.failures.pop(client, None)
            self.locked_until.pop(client, None)


SECURITY = SecurityState()
STATE_LOCK = threading.RLock()


def read_state() -> dict:
    with STATE_LOCK:
        if not STATE_FILE.exists():
            return json.loads(json.dumps(DEFAULT_STATE))
        try:
            raw = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return json.loads(json.dumps(DEFAULT_STATE))
        moods = raw.get("moods") if isinstance(raw.get("moods"), dict) else {}
        whispers = raw.get("whispers") if isinstance(raw.get("whispers"), list) else []
        wishes = raw.get("wishes") if isinstance(raw.get("wishes"), list) else DEFAULT_WISHES
        answers = raw.get("answers") if isinstance(raw.get("answers"), list) else []
        clean = json.loads(json.dumps(DEFAULT_STATE))
        for person in PEOPLE:
            item = moods.get(person, {})
            if item.get("mood") in MOODS:
                clean["moods"][person] = {
                    "mood": item["mood"],
                    "updatedAt": clean_timestamp(item.get("updatedAt")),
                }
        clean["whispers"] = [
            item
            for raw_item in whispers[-40:]
            if (item := clean_whisper(raw_item)) is not None
        ]
        clean["wishes"] = [
            item
            for raw_item in wishes[:20]
            if (item := clean_wish(raw_item)) is not None
        ]
        if not clean["wishes"]:
            clean["wishes"] = json.loads(json.dumps(DEFAULT_WISHES))
        clean["answers"] = [
            item
            for raw_item in answers[-30:]
            if (item := clean_answer(raw_item)) is not None
        ]
        return clean


def write_state(state: dict) -> None:
    with STATE_LOCK:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = STATE_FILE.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        os.replace(temporary, STATE_FILE)


def clean_message(value: object, max_length: int = 160) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = unicodedata.normalize("NFKC", value).strip()
    normalized = " ".join(normalized.split())
    if not normalized or len(normalized) > max_length:
        return None
    if any(ord(char) < 32 for char in normalized):
        return None
    return normalized


def clean_timestamp(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and value > 0:
        return int(value)
    return None


def clean_item_id(value: object) -> str | None:
    if not isinstance(value, str) or not 1 <= len(value) <= 64:
        return None
    if not all(char.isascii() and (char.isalnum() or char in "-_") for char in value):
        return None
    return value


def clean_whisper(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    item_id = clean_item_id(value.get("id"))
    author = value.get("author")
    message = clean_message(value.get("message"))
    if not item_id or author not in PEOPLE or not message:
        return None
    return {
        "id": item_id,
        "author": author,
        "message": message,
        "createdAt": clean_timestamp(value.get("createdAt")),
    }


def clean_wish(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    item_id = clean_item_id(value.get("id"))
    text = clean_message(value.get("text"), 80)
    if not item_id or not text:
        return None
    return {
        "id": item_id,
        "text": text,
        "done": value.get("done") is True,
        "createdAt": clean_timestamp(value.get("createdAt")),
        "updatedAt": clean_timestamp(value.get("updatedAt")),
    }


def clean_answer(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    item_id = clean_item_id(value.get("id"))
    author = value.get("author")
    question = clean_message(value.get("question"), 120)
    answer = clean_message(value.get("answer"), 160)
    if not item_id or author not in PEOPLE or not question or not answer:
        return None
    return {
        "id": item_id,
        "author": author,
        "question": question,
        "answer": answer,
        "createdAt": clean_timestamp(value.get("createdAt")),
    }


class PrivateSiteHandler(SimpleHTTPRequestHandler):
    server_version = "StarTree/1.0"

    def log_message(self, format_string: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {self.client_address[0]} {format_string % args}")

    @property
    def client_key(self) -> str:
        return self.client_address[0]

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        )
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; script-src 'self'; "
            "style-src 'self'; connect-src 'self'; font-src 'self'; "
            "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        )
        super().end_headers()

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/health":
            self.send_json(HTTPStatus.OK, {"ok": True})
            return
        if path in {"/login", "/login/"}:
            if self.is_authenticated():
                self.redirect("/")
            else:
                self.serve_public("login.html")
            return
        if path.lstrip("/") in PUBLIC_FILES:
            self.serve_public(path.lstrip("/"))
            return
        if not self.is_authenticated():
            if path in {"/", "/index.html"}:
                self.redirect("/login")
            else:
                self.send_error(HTTPStatus.FORBIDDEN)
            return
        if path == "/api/state":
            state = read_state()
            self.send_json(
                HTTPStatus.OK,
                {
                    "moods": state["moods"],
                    "whispers": state["whispers"][-12:],
                    "wishes": state["wishes"],
                    "answers": state["answers"][-8:],
                },
            )
            return
        self.serve_private(path)

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/login":
            self.handle_login()
            return
        if not self.is_authenticated():
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "请重新输入密码"})
            return
        if not self.same_origin_request():
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "请求来源无效"})
            return
        if path == "/api/logout":
            cookie = (
                "star_tree_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"
            )
            if os.environ.get("STAR_TREE_SECURE_COOKIE") == "1":
                cookie += "; Secure"
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Set-Cookie", cookie)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        if path == "/api/mood":
            self.handle_mood()
            return
        if path == "/api/whispers":
            self.handle_whisper()
            return
        if path == "/api/wishes":
            self.handle_wish()
            return
        if path == "/api/answers":
            self.handle_answer()
            return
        self.send_json(HTTPStatus.NOT_FOUND, {"error": "没有这个入口"})

    def handle_login(self) -> None:
        allowed, remaining = SECURITY.rate_status(self.client_key)
        if not allowed:
            self.send_json(
                HTTPStatus.TOO_MANY_REQUESTS,
                {"error": "尝试次数过多，请稍后再试", "retryAfter": remaining},
                extra_headers={"Retry-After": str(remaining)},
            )
            return
        if not self.same_origin_request():
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "请求来源无效"})
            return
        payload = self.read_json(1024)
        if payload is None:
            return
        password = payload.get("password")
        valid_shape = isinstance(password, str) and len(password) == 8 and password.isascii() and password.isdigit()
        candidate = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode() if valid_shape else b"00000000",
            PASSWORD_SALT,
            PASSWORD_ROUNDS,
        )
        if not valid_shape or not hmac.compare_digest(candidate, PASSWORD_HASH):
            attempts = SECURITY.record_failure(self.client_key)
            self.send_json(
                HTTPStatus.UNAUTHORIZED,
                {"error": "密码不正确", "remaining": attempts},
            )
            return
        SECURITY.clear_failures(self.client_key)
        token = SECURITY.sign_session()
        cookie = (
            f"star_tree_session={token}; Path=/; HttpOnly; SameSite=Strict"
        )
        if os.environ.get("STAR_TREE_SECURE_COOKIE") == "1":
            cookie += "; Secure"
        self.send_json(
            HTTPStatus.OK,
            {"ok": True},
            extra_headers={"Set-Cookie": cookie},
        )

    def handle_mood(self) -> None:
        payload = self.read_json(2048)
        if payload is None:
            return
        person = payload.get("person")
        mood = payload.get("mood")
        if person not in PEOPLE or mood not in MOODS:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "心情选项无效"})
            return
        with STATE_LOCK:
            state = read_state()
            state["moods"][person] = {
                "mood": mood,
                "updatedAt": int(time.time()),
            }
            write_state(state)
        self.send_json(HTTPStatus.OK, {"moods": state["moods"]})

    def handle_whisper(self) -> None:
        payload = self.read_json(4096)
        if payload is None:
            return
        author = payload.get("author")
        message = clean_message(payload.get("message"))
        if author not in PEOPLE or not message:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "留言需为 1—160 个有效字符"},
            )
            return
        with STATE_LOCK:
            state = read_state()
            item = {
                "id": secrets.token_hex(8),
                "author": author,
                "message": message,
                "createdAt": int(time.time()),
            }
            state["whispers"].append(item)
            state["whispers"] = state["whispers"][-40:]
            write_state(state)
        self.send_json(HTTPStatus.CREATED, {"whisper": item})

    def handle_wish(self) -> None:
        payload = self.read_json(4096)
        if payload is None:
            return
        action = payload.get("action")
        with STATE_LOCK:
            state = read_state()
            if action == "add":
                text = clean_message(payload.get("text"), 80)
                if not text:
                    self.send_json(
                        HTTPStatus.BAD_REQUEST,
                        {"error": "愿望需为 1—80 个有效字符"},
                    )
                    return
                if len(state["wishes"]) >= 20:
                    self.send_json(
                        HTTPStatus.CONFLICT,
                        {"error": "愿望清单最多保存 20 条"},
                    )
                    return
                now = int(time.time())
                state["wishes"].append(
                    {
                        "id": secrets.token_hex(8),
                        "text": text,
                        "done": False,
                        "createdAt": now,
                        "updatedAt": now,
                    }
                )
                status = HTTPStatus.CREATED
            elif action == "toggle":
                wish_id = clean_item_id(payload.get("id"))
                wish = next(
                    (item for item in state["wishes"] if item["id"] == wish_id),
                    None,
                )
                if wish is None:
                    self.send_json(HTTPStatus.NOT_FOUND, {"error": "没有找到这个愿望"})
                    return
                requested_done = payload.get("done")
                wish["done"] = (
                    requested_done
                    if isinstance(requested_done, bool)
                    else not wish["done"]
                )
                wish["updatedAt"] = int(time.time())
                status = HTTPStatus.OK
            else:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "愿望操作无效"})
                return
            write_state(state)
        self.send_json(status, {"wishes": state["wishes"]})

    def handle_answer(self) -> None:
        payload = self.read_json(4096)
        if payload is None:
            return
        author = payload.get("author")
        question = clean_message(payload.get("question"), 120)
        answer = clean_message(payload.get("answer"), 160)
        if author not in PEOPLE or not question or not answer:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "回答需为 1—160 个有效字符"},
            )
            return
        with STATE_LOCK:
            state = read_state()
            item = {
                "id": secrets.token_hex(8),
                "author": author,
                "question": question,
                "answer": answer,
                "createdAt": int(time.time()),
            }
            state["answers"].append(item)
            state["answers"] = state["answers"][-30:]
            write_state(state)
        self.send_json(HTTPStatus.CREATED, {"answer": item})

    def read_json(self, maximum: int) -> dict | None:
        if self.headers.get_content_type() != "application/json":
            self.send_json(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": "仅接受 JSON"})
            return None
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > maximum:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "请求内容无效"})
            return None
        try:
            payload = json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "JSON 格式无效"})
            return None
        if not isinstance(payload, dict):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "请求内容无效"})
            return None
        return payload

    def is_authenticated(self) -> bool:
        cookies = self.headers.get("Cookie", "")
        token = None
        for cookie in cookies.split(";"):
            name, separator, value = cookie.strip().partition("=")
            if separator and name == "star_tree_session":
                token = value
                break
        return SECURITY.valid_session(token)

    def same_origin_request(self) -> bool:
        fetch_site = self.headers.get("Sec-Fetch-Site")
        if fetch_site and fetch_site not in {"same-origin", "none"}:
            return False
        origin = self.headers.get("Origin")
        if not origin:
            return True
        host = self.headers.get("Host", "")
        return origin in {f"http://{host}", f"https://{host}"}

    def serve_public(self, filename: str) -> None:
        self.serve_file(ROOT / filename, public=True)

    def serve_private(self, request_path: str) -> None:
        relative = request_path.lstrip("/") or "index.html"
        candidate = (ROOT / relative).resolve()
        try:
            candidate.relative_to(ROOT)
        except ValueError:
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if (
            not candidate.is_file()
            or candidate.name.startswith(".")
            or candidate.suffix.lower() in DENIED_SUFFIXES
            or candidate == STATE_FILE
        ):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.serve_file(candidate, public=False)

    def serve_file(self, path: Path, public: bool) -> None:
        try:
            content = path.read_bytes()
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        if public or path.suffix.lower() == ".html":
            self.send_header("Cache-Control", "no-store")
        elif path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".svg"}:
            self.send_header("Cache-Control", "private, max-age=604800")
        else:
            self.send_header("Cache-Control", "private, max-age=3600")
        self.end_headers()
        self.wfile.write(content)

    def send_json(
        self,
        status: HTTPStatus,
        payload: dict,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, location: str) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the private Star Tree website")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), PrivateSiteHandler)
    print(f"Star Tree private server: http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
