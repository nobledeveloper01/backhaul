"""
Finds code that is written, tested, and called by nothing.

Run it with the other gates: `python3 scripts/wired-check.py`.

**Three times in one project.** `Tracker` — the capture loop, the thing the
whole product is built around — was complete and had seven tests, and nothing
ever called `start()`. `permissions.ts` was complete and had nine tests, and
nothing ever asked for a permission. `registerDevice` was written on the client
and proven over the wire by the round-trip, and nothing in the app registered a
device. Every one of them had a screen describing what it did.

None of the existing gates ask this question. The round-trip proves a client
method works against the server; the endpoint tests prove the server works;
`tsc` proves the types line up. An export nobody imports type-checks perfectly.

Two rules, both narrow enough to be worth failing a build over:

1. A module under `src/native` or `src/state` whose exports are imported only
   by tests. These are the seams — the native modules and the hooks — and a
   seam nobody is on the other side of is a seam that does nothing.
2. A public method on `BackhaulApi` with no caller outside `api/client.ts`.
   Every one of them is a route somebody built on the server.

Both are allowed an escape hatch — `wired-check: <reason>` on the line above —
because a seam can legitimately land before its caller. The reason is the
point: it makes the gap a decision somebody wrote down rather than a thing
nobody noticed.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'apps/mobile/src'
TESTS = ROOT / 'apps/mobile/__tests__'

EXEMPT = 'wired-check:'


def sources() -> list[pathlib.Path]:
    return sorted(p for p in SRC.rglob('*.ts*') if p.is_file())


def body(path: pathlib.Path) -> str:
    return path.read_text()


def exempted_above(text: str, index: int) -> bool:
    """Whether a `wired-check:` comment sits directly above `index`.

    Directly, not nearby. The first version looked back five hundred
    characters and split on blank lines, which meant a method inherited its
    neighbour's exemption — so removing one reason to check the gate still
    fired proved nothing, because the method above it was still carrying one.
    A guard nobody has watched fail is a guard nobody knows works.
    """
    lines = text[:index].split('\n')
    # Skip the declaration's own line, then any doc comment lines, and require
    # the marker before the first line that is neither.
    for line in reversed(lines[:-1] if lines else []):
        stripped = line.strip()
        if EXEMPT in stripped:
            return True
        if stripped.startswith(('*', '/**', '//', '*/')) or stripped == '':
            continue
        return False
    return False


def unwired_modules() -> list[str]:
    """Seams under `native/` and `state/` that only tests import."""
    found = []
    for path in sources():
        rel = path.relative_to(SRC).as_posix()
        if not (rel.startswith('native/') or rel.startswith('state/')):
            continue

        text = body(path)
        if EXEMPT in text:
            continue

        stem = path.stem
        importers = [
            other
            for other in sources()
            if other != path and re.search(rf"from '[^']*{re.escape(stem)}'", body(other))
        ]
        if importers:
            continue

        # A file nothing under `src` imports. If a test does, it is the exact
        # shape this check exists for; if nothing does at all, it is dead.
        tested = any(
            re.search(rf"from '[^']*{re.escape(stem)}'", t.read_text())
            for t in TESTS.rglob('*.ts*')
        ) if TESTS.exists() else False

        found.append(
            f'{rel} — imported by {"tests only" if tested else "nothing at all"}'
        )
    return found


def unwired_client_methods() -> list[str]:
    """`BackhaulApi` methods no screen or hook calls."""
    client = SRC / 'api/client.ts'
    if not client.exists():
        return []

    text = client.read_text()
    methods = re.findall(r'^\s{2}(?:async\s+)?(\w+)\s*(?:<[^>]*>)?\(', text, re.M)

    callers = [p for p in sources() if p != client]
    joined = '\n'.join(body(p) for p in callers)

    found = []
    for name in sorted(set(methods)):
        if name in {'constructor', 'request', 'if', 'for', 'while', 'switch', 'catch'}:
            continue
        declaration = re.search(rf'^\s{{2}}(?:async\s+)?{re.escape(name)}\s*\(', text, re.M)
        if declaration and exempted_above(text, declaration.start()):
            continue
        if re.search(rf'\.{re.escape(name)}\s*\(', joined):
            continue
        found.append(f'BackhaulApi.{name}() — no caller outside api/client.ts')
    return found


def main() -> int:
    problems = unwired_modules() + unwired_client_methods()

    if not problems:
        print('everything exported is wired to something')
        return 0

    print('written, tested, and called by nothing:')
    for line in problems:
        print(f'  {line}')
    print()
    print("wire it, delete it, or write `wired-check: <reason>` above it and say why")
    return 1


if __name__ == '__main__':
    sys.exit(main())
