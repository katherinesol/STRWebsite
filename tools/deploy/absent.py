#!/usr/bin/env python3
"""Assert a phrase is absent from a file's CODE — not from its comments.

Four deploy checks in this project have now failed on a comment documenting the
very thing the check forbids: a `catch {}` note, an `airbnb_managed` mention, the
`calendarexport` warning, and a "coming soon" changelog line. Every one was a
false failure, and each cost a deploy cycle to diagnose.

Grep cannot tell a live string from a note about a dead one. This strips block
comments, line comments and JSX comments first, then looks. A phrase that only
survives in prose is not in the shipped behaviour.

  usage: absent.py <file> <phrase> [phrase...]     exit 1 if any phrase is in the code
"""
import re, sys

def code_only(src: str) -> str:
    src = re.sub(r'/\*.*?\*/', ' ', src, flags=re.S)      # /* block */ and /** doc */
    src = re.sub(r'\{\s*/\*.*?\*/\s*\}', ' ', src, flags=re.S)  # {/* jsx */}
    src = re.sub(r'^\s*//.*$', ' ', src, flags=re.M)      # whole-line //
    src = re.sub(r'(?<![:"\'`])//(?![/*]).*$', ' ', src, flags=re.M)  # trailing // , sparing URLs
    return src

def main() -> int:
    path, phrases = sys.argv[1], sys.argv[2:]
    body = code_only(open(path, encoding='utf-8').read())
    bad = [p for p in phrases if p in body]
    for p in phrases:
        print(f"  {'✗' if p in bad else '✓'} {'present in code' if p in bad else 'absent from code'}: {p!r}")
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
