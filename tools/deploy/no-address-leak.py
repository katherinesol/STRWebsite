#!/usr/bin/env python3
"""FAILS if a public listing serves a property's exact address.

Run against a deployment before it is accepted. Not a lint of the source — it
fetches the rendered page and greps the bytes, because the source-level intent
("no component renders it") held for months while the address sat in the
serialized props of both Royal York listings, one View Source away.

A comment cannot enforce this. A failing check can.

  usage: no-address-leak.py <base-url>
"""
import json, os, ssl, sys, urllib.request

try:
    import certifi; CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    CTX = ssl.create_default_context()


def env(path=".env.local"):
    out = {}
    for line in open(path):
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def main() -> int:
    base = (sys.argv[1] if len(sys.argv) > 1 else "").rstrip("/")
    if not base:
        print("  usage: no-address-leak.py <base-url>"); return 2

    e = env()
    U, K = e["NEXT_PUBLIC_SUPABASE_URL"], e["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(
        f"{U}/rest/v1/properties?select=id,address",
        headers={"apikey": K, "Authorization": f"Bearer {K}"})
    rows = json.load(urllib.request.urlopen(req, context=CTX, timeout=40))

    bad = 0
    for r in rows:
        pid, addr = r["id"], (r["address"] or "").strip()
        page = urllib.request.urlopen(
            urllib.request.Request(f"{base}/property/{pid}",
                                   headers={"User-Agent": "deploy-guard"}),
            context=CTX, timeout=40).read().decode("utf-8", "replace")

        if not addr:
            print(f"  ·  {pid}: no address on file, nothing to leak")
            continue

        #  the full string, and the street line alone — a partial leak is a leak
        street = addr.split(",")[0].strip()
        hits = [s for s in (addr, street) if s and s in page]
        if hits:
            bad += 1
            print(f"  ✗  {pid}: PUBLIC LISTING SERVES THE ADDRESS — {hits[0]!r}")
        else:
            print(f"  ✓  {pid}: address absent from the public listing")

        #  the private feed tokens must never appear either
        if "calendarexport" in page:
            bad += 1
            print(f"  ✗  {pid}: a calendarexport token is in the public page")

    print(f"\n  {'REFUSING — the exact address is public' if bad else 'clean: no listing serves an exact address'}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
