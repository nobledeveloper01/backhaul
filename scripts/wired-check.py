"""
Finds code that is written, tested, and called by nothing.

Run it with the other gates: `python3 scripts/wired-check.py`.

**Four times in one project.** `Tracker` — the capture loop, the thing the
whole product is built around — was complete and had seven tests, and nothing
ever called `start()`. `permissions.ts` was complete and had nine tests, and
nothing ever asked for a permission. `registerDevice` was written on the client
and proven over the wire by the round-trip, and nothing in the app registered a
device. Sealing a proof of delivery was written, tested and reachable from
nowhere — a driver finishing a delivery and not being paid. Every one of them
had a screen describing what it did.

None of the existing gates ask this question. The round-trip proves a client
method works against the server; the endpoint tests prove the server works;
`tsc` and `dotnet build` prove the types line up. An export nobody imports
type-checks perfectly, and so does a repository method nobody queries.

Four rules, all narrow enough to be worth failing a build over.

On the app:

1. A module under `src/native` or `src/state` whose exports are imported only
   by tests. These are the seams — the native modules and the hooks — and a
   seam nobody is on the other side of is a seam that does nothing.
2. A public method on `BackhaulApi` with no caller outside `api/client.ts`.
   Every one of them is a route somebody built on the server.

On the server, where the same defect hides better, because a repository method
with an endpoint test looks exactly like a repository method with a caller:

3. A public method on a repository class under
   `Backhaul.Infrastructure/Repositories` with no caller anywhere in
   `server/src` outside its own file. A repository method is only ever reached
   through a controller; if no controller reaches it, no request does.
   **Controller actions themselves are never reported** — they are the entry
   points, called over HTTP by a client this script cannot see.
4. A public method on a domain mirror under `Backhaul.Domain` with no caller
   outside its own file *and* no reference under `server/tests`. The mirrors
   exist to be held to `fixtures/parity.json` (ADR-0005), so a parity test
   referencing one is a legitimate reason for it to exist ahead of its caller —
   but a mirror with neither a caller nor a parity case is a second
   implementation of a rule that nothing compares against the first.

Two kinds of C# member are excluded from rules 3 and 4 because the language
calls them without anybody naming them: `override` members, and the small set
of interface and record contracts (`Equals`, `GetHashCode`, `ToString`,
`CompareTo`, `Deconstruct`, `Dispose`, `DisposeAsync`, `GetEnumerator`).
Reporting `ToString()` as unwired would teach people to ignore this gate.

All four are allowed the same escape hatch — `wired-check: <reason>` on the
line directly above the declaration — because a seam can legitimately land
before its caller. The reason is the point: it makes the gap a decision
somebody wrote down rather than a thing nobody noticed.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'apps/mobile/src'
TESTS = ROOT / 'apps/mobile/__tests__'

SERVER_SRC = ROOT / 'server/src'
SERVER_TESTS = ROOT / 'server/tests'
REPOSITORIES = SERVER_SRC / 'Backhaul.Infrastructure/Repositories'
DOMAIN = SERVER_SRC / 'Backhaul.Domain'

EXEMPT = 'wired-check:'

TS_COMMENT_PREFIXES = ('*', '/**', '//', '*/')
CS_COMMENT_PREFIXES = ('*', '/*', '/**', '//', '///', '*/', '[')

# Members the runtime, the compiler or an interface calls for you. Naming one
# of these as unwired would be wrong every time, and a gate that is wrong every
# time is a gate people learn to skip.
IMPLICIT_MEMBERS = {
    'CompareTo',
    'Deconstruct',
    'Dispose',
    'DisposeAsync',
    'Equals',
    'GetEnumerator',
    'GetHashCode',
    'ToString',
}


def sources() -> list[pathlib.Path]:
    return sorted(p for p in SRC.rglob('*.ts*') if p.is_file())


def body(path: pathlib.Path) -> str:
    return path.read_text()


def exempted_above(
    text: str,
    index: int,
    prefixes: tuple[str, ...] = TS_COMMENT_PREFIXES,
) -> bool:
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
        if stripped.startswith(prefixes) or stripped == '':
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


# --- the server --------------------------------------------------------------
#
# No Roslyn, no NuGet, no second toolchain to install before a gate will run.
# What follows is a deliberately small C# reader: enough to find a `public`
# method declaration and the type it sits in, and nothing more. It reads
# declarations off text with the strings and comments blanked out, so a brace
# inside `"{"` cannot shift the type it thinks it is inside.


def cs_files(root: pathlib.Path) -> list[pathlib.Path]:
    """Every hand-written C# file under `root`.

    Migrations and their model snapshot are generated by `dotnet ef` and are
    nobody's decision, so they are neither searched for declarations nor
    trusted as callers.
    """
    if not root.exists():
        return []
    return sorted(
        p
        for p in root.rglob('*.cs')
        if p.is_file()
        and 'Migrations' not in p.parts
        and 'bin' not in p.parts
        and 'obj' not in p.parts
    )


def blank_literals(text: str) -> str:
    """Replace comments and string literals with spaces, keeping every offset.

    Offsets are preserved so a match against this can be reported against the
    original file, and newlines survive so line numbers do too.
    """
    out: list[str] = []
    i, n = 0, len(text)

    def blanked(chunk: str) -> str:
        return ''.join(c if c == '\n' else ' ' for c in chunk)

    while i < n:
        two = text[i:i + 2]
        if two == '//':
            end = text.find('\n', i)
            end = n if end < 0 else end
            out.append(blanked(text[i:end]))
            i = end
        elif two == '/*':
            end = text.find('*/', i + 2)
            end = n if end < 0 else end + 2
            out.append(blanked(text[i:end]))
            i = end
        elif two == '@"':
            j = i + 2
            while j < n:
                if text[j] == '"':
                    if text[j:j + 2] == '""':
                        j += 2
                        continue
                    j += 1
                    break
                j += 1
            out.append(blanked(text[i:j]))
            i = j
        elif text[i] in '"\'':
            quote = text[i]
            j = i + 1
            while j < n and text[j] != '\n':
                if text[j] == '\\':
                    j += 2
                    continue
                if text[j] == quote:
                    j += 1
                    break
                j += 1
            out.append(blanked(text[i:j]))
            i = j
        else:
            out.append(text[i])
            i += 1
    return ''.join(out)


def strip_comments(text: str) -> str:
    """Comments blanked, string literals left alone.

    The opposite trade to `blank_literals`, and it is made on purpose. Callers
    are searched in this: a call inside an interpolated string is a real call,
    while `<see cref="Foo"/>` in a doc comment above a dead method is not — and
    counting the second as a caller is how a dead method stays alive.
    """
    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        two = text[i:i + 2]
        if two == '//':
            end = text.find('\n', i)
            i = n if end < 0 else end
        elif two == '/*':
            end = text.find('*/', i + 2)
            i = n if end < 0 else end + 2
        else:
            out.append(text[i])
            i += 1
    return ''.join(out)


TYPE_DECLARATION = re.compile(
    r'^[\w\s]*?\b(?:record\s+struct|record\s+class|class|record|struct|interface|enum)'
    r'\s+(?P<name>\w+)'
)

PUBLIC_METHOD = re.compile(
    r'^[ \t]*public\s+'
    r'(?:(?:static|async|virtual|override|sealed|new|partial|extern|unsafe|abstract|required)\s+)*'
    # Parentheses belong in the return type: `Task<(string Token, Share Link)>`
    # is a tuple, and leaving them out silently skipped every method that
    # returns one — which is the exact failure mode this whole script is about.
    r'(?P<returns>[A-Za-z_][\w\.<>,\[\]\?\s()]*?)\s+'
    r'(?P<name>[A-Za-z_]\w*)\s*(?:<[^<>()]*>)?\s*\('
)


def public_methods(path: pathlib.Path) -> list[tuple[str, str, int, int]]:
    """`(type, method, line number, character offset)` for each public method.

    Only methods. A property, a field and a positional record parameter all
    read like a declaration and none of them is a call site, so the pattern
    insists on a name followed by an open parenthesis and rejects any line
    carrying a type keyword or `operator`.
    """
    text = path.read_text()
    scan = blank_literals(text)

    found: list[tuple[str, str, int, int]] = []
    offset = 0
    depth = 0
    stack: list[tuple[int, str]] = []
    pending: str | None = None
    declared: set[str] = set()

    for line in scan.split('\n'):
        line_start = offset
        offset += len(line) + 1
        stripped = line.strip()

        type_here = TYPE_DECLARATION.match(stripped)
        if type_here and not stripped.startswith(('return', 'new ')):
            pending = type_here.group('name')
            declared.add(pending)
        elif not type_here:
            method = PUBLIC_METHOD.match(line)
            if (
                method
                and ' operator ' not in line
                and method.group('name') not in declared
                and method.group('returns').strip() not in {'implicit', 'explicit'}
            ):
                owner = stack[-1][1] if stack else path.stem
                found.append((
                    owner,
                    method.group('name'),
                    scan.count('\n', 0, line_start) + 1,
                    line_start,
                ))

        for char in line:
            if char == '{':
                depth += 1
                if pending is not None:
                    stack.append((depth, pending))
                    pending = None
            elif char == '}':
                if stack and stack[-1][0] == depth:
                    stack.pop()
                depth -= 1

        # `public sealed record Corridor(string A, string B);` declares a type
        # and closes it on one line. Without this the next `{` in the file
        # would be adopted as its body.
        if stripped.endswith(';'):
            pending = None

    return found


def called(name: str, haystack: str) -> bool:
    """Whether `haystack` calls `name` or passes it as a method group."""
    escaped = re.escape(name)
    return bool(
        re.search(rf'\.{escaped}\s*(?:<[^<>()]*>\s*)?\(', haystack)
        or re.search(rf'\.{escaped}\s*[,)\];]', haystack)
    )


def referenced(name: str, haystack: str) -> bool:
    """Whether `haystack` mentions `name` at all as a member of something.

    Looser than `called` on purpose: a parity test that hands a method to a
    theory or names it in an assertion is still the parity coverage that
    justifies the mirror existing.
    """
    return bool(re.search(rf'\.{re.escape(name)}\b', haystack))


def unwired_server_methods(
    declaring: pathlib.Path,
    label: str,
    tests_count: bool,
) -> list[str]:
    """Public methods under `declaring` that nothing in `server/src` calls."""
    if not declaring.exists():
        return []

    everything = cs_files(SERVER_SRC)
    test_text = (
        '\n'.join(strip_comments(p.read_text()) for p in cs_files(SERVER_TESTS))
        if tests_count
        else ''
    )

    found = []
    for path in sorted(cs_files(declaring)):
        text = path.read_text()
        rel = path.relative_to(ROOT).as_posix()
        elsewhere = '\n'.join(
            strip_comments(other.read_text())
            for other in everything
            if other != path
        )

        for owner, name, line_number, index in public_methods(path):
            if name in IMPLICIT_MEMBERS:
                continue
            if exempted_above(text, index, CS_COMMENT_PREFIXES):
                continue
            if called(name, elsewhere):
                continue
            if tests_count and referenced(name, test_text):
                continue
            found.append(
                f'{owner}.{name}() — {rel}:{line_number} — {label}'
            )
    return found


def unwired_repository_methods() -> list[str]:
    """Repository methods no controller — and so no request — ever reaches."""
    return unwired_server_methods(
        REPOSITORIES,
        'no caller anywhere in server/src outside its own file',
        tests_count=False,
    )


def unwired_domain_methods() -> list[str]:
    """Domain mirrors with neither a caller nor a parity case."""
    return unwired_server_methods(
        DOMAIN,
        'no caller outside its own file and no reference in server/tests',
        tests_count=True,
    )


def main() -> int:
    problems = (
        unwired_modules()
        + unwired_client_methods()
        + unwired_repository_methods()
        + unwired_domain_methods()
    )

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
