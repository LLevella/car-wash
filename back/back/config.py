"""Environment-backed configuration helpers for Django settings."""

import os
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlparse


TRUE_VALUES = {"1", "true", "yes", "on"}
FALSE_VALUES = {"0", "false", "no", "off"}


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in TRUE_VALUES:
        return True
    if normalized in FALSE_VALUES:
        return False
    return default


def env_int(name, default=0):
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    return int(value)


def env_list(name, default=None):
    value = os.environ.get(name)
    if value is None:
        return list(default or [])

    return [item.strip() for item in value.split(",") if item.strip()]


def database_config(default_sqlite_path, url=None):
    database_url = url if url is not None else os.environ.get("DATABASE_URL")
    if not database_url:
        return _sqlite_config(default_sqlite_path)

    parsed = urlparse(database_url)
    scheme = parsed.scheme.split("+", 1)[0]

    if scheme in {"sqlite", "sqlite3"}:
        return _sqlite_config(_sqlite_name_from_url(parsed, default_sqlite_path))

    if scheme in {"postgres", "postgresql"}:
        return _postgres_config(parsed)

    raise ValueError(f"Unsupported DATABASE_URL scheme: {parsed.scheme}")


def _sqlite_config(database_path):
    return {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": database_path,
    }


def _sqlite_name_from_url(parsed, default_sqlite_path):
    if parsed.path in {"", "/"}:
        return default_sqlite_path
    if parsed.path == "/:memory:":
        return ":memory:"

    name = unquote(parsed.path)
    if parsed.netloc:
        name = f"//{parsed.netloc}{name}"
    return Path(name)


def _postgres_config(parsed):
    config = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or ""),
    }

    query_options = dict(parse_qsl(parsed.query))
    if query_options:
        config["OPTIONS"] = query_options

    return config
