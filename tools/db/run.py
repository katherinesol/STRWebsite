"""Runs a .sql file through psql with errors RAISED, never swallowed.

The connection string never reaches stdout: every component is scrubbed out of
both streams by tools/db/dburl.scrubber before anything is printed.
"""
import subprocess, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import dburl

def run_sql(sql: str, label: str = "") -> tuple[int, str]:
    raw = dburl.load()
    if not raw:
        print("  DATABASE_URL not in .env.local"); sys.exit(1)
    scrub = dburl.scrubber(raw)
    p = subprocess.run(
        ["psql", raw, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", "-"],
        input=sql, capture_output=True, text=True,
    )
    out = scrub((p.stdout or "") + (p.stderr or "")).strip()
    return p.returncode, out

if __name__ == "__main__":
    sql = open(sys.argv[1]).read() if len(sys.argv) > 1 else sys.stdin.read()
    code, out = run_sql(sql)
    if out: print(out)
    print(("  ✓ applied" if code == 0 else f"  ✗ FAILED (exit {code})"))
    sys.exit(code)
