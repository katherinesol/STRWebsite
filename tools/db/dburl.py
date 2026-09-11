"""Reads DATABASE_URL from .env.local and scrubs it out of any output.

WHY THIS EXISTS: on 11 September a psql error was printed after replacing the
full connection string in the text — but psql had quoted only the PASSWORD, so
the replacement matched nothing and the password went into a transcript. Scrubbing
the whole URL is not enough. Every component has to be scrubbed independently,
because an error message will quote whichever part it choked on.
"""
import re, urllib.parse

def load(path=".env.local"):
    for line in open(path):
        if line.strip().startswith("DATABASE_URL"):
            _, _, v = line.partition("=")
            return v.strip().strip('"').strip("'")
    return None

def scrubber(raw):
    """Returns a function that removes the URL and EVERY sensitive component."""
    if not raw:
        return lambda t: t
    parts = []
    try:
        u = urllib.parse.urlsplit(raw)
        for v in (u.password, u.username, urllib.parse.unquote(u.password or "")):
            if v and len(v) > 3:
                parts.append(v)
    except Exception:
        pass
    parts.append(raw)
    parts.sort(key=len, reverse=True)          # longest first, so the URL goes before its parts
    def scrub(text):
        out = text or ""
        for p in parts:
            out = out.replace(p, "<redacted>")
        return out
    return scrub

def describe(raw):
    """Structure only — never a value."""
    u = urllib.parse.urlsplit(raw)
    pw = u.password or ""
    return {
        "host": u.hostname, "port": u.port,
        "database": (u.path or "/").lstrip("/"),
        "password_len": len(pw),
        "needs_encoding": sorted({c for c in "&?#@/:% " if c in urllib.parse.unquote(pw)}),
    }
