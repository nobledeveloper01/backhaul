"""
Finds user-facing English still hard-coded in the app.

Run it after adding a screen: `python3 scripts/untranslated-check.py`. It reads
every `.tsx` under `apps/mobile/src`, strips comments — the prose in those is
meant to be English — and reports text a reader would see that still holds
words rather than a `t()` call.

**It has reported zero and been wrong three times, and each time the gap was
the shape of the text rather than the text itself.** Every rule below exists
because something walked past its predecessor:

1. A string alone on its line — the original check.
2. A user-facing prop. It required two words, so `overline="Utilisation"` and
   `label="Loaded"` sat on the fleet screen through a clean run.
3. Text between tags on the same line as them: `<Text>Your fleet</Text>` is
   never alone on its line.
4. Prose sharing a line with an expression. `{count} trips completed` is two
   words of English and the string is not the line, which hid roughly forty
   strings across eighteen screens.
5. A quoted string inside a JSX expression: `{held ? 'On file' : 'Not
   uploaded'}` is two labels, and every rule above blanks the braces first.
6. The middot. This product separates facts with `·` everywhere, and it was not
   in the character class, so any line using one was skipped.

It is a lint, not a gate, and it still cannot read. Proper nouns are listed in
`NAMES` because Lagos is Lagos in all four languages; a branch that is English
on purpose carries an `untranslated-check:` comment saying why.
"""

import pathlib, re, sys, collections

def strip_comments(src: str) -> str:
    """Blank out comments, keeping line numbers."""
    out = list(src)
    i, n = 0, len(src)
    in_line = in_block = False
    while i < n:
        if in_line:
            if src[i] == '\n': in_line = False
            else: out[i] = ' '
        elif in_block:
            if src.startswith('*/', i):
                out[i] = out[i + 1] = ' '; i += 2; in_block = False; continue
            if src[i] != '\n': out[i] = ' '
        elif src.startswith('//', i):
            in_line = True; out[i] = out[i + 1] = ' '; i += 2; continue
        elif src.startswith('/*', i):
            in_block = True; out[i] = out[i + 1] = ' '; i += 2; continue
        i += 1
    return ''.join(out)

PROPS = ('label|title|detail|placeholder|overline|accessibilityLabel|accessibilityHint'
         '|hint|caption|text|value|name|question|lede|note|summary|body|message')

# What an English word looks like, as opposed to an identifier, a plate, a
# token or a unit. Capitalised, letters and the punctuation prose uses, and
# nothing that would make it a `truck_lowbed` or an `LSR-482-XA`.
# Names, not words. Nigerian cities and corridors are written the same way in
# all four languages, and the demonstration carrier is a company. Translating
# any of them would be wrong, so the sweep does not ask.
NAMES = {
    'Backhaul',
    'Lagos', 'Kano', 'Ibadan', 'Abuja', 'Kaduna', 'Port Harcourt', 'Onitsha',
    'Aba', 'Benin City', 'Jos', 'Maiduguri', 'Enugu', 'Warri', 'Calabar',
    'Sahel Haulage',
}
PRODUCT = 'Backhaul'

# A quoted string, either flavour. Not preceded by a letter (which would make
# it an apostrophe) and not by `=` (which makes it a JSX attribute, already
# covered by PROPS).
LITERAL = re.compile(r'''(?<![A-Za-z])'([^'\n]{3,})'|(?<![A-Za-z=])"([^"\n]{3,})"''')

# A line that opens with one of these is code that happens to read as words.
KEYWORD = re.compile(r'\b(?:void|const|let|return|await|if|else|import|export|new)\b')

# Two or more English words in a row, which is prose rather than a token.
PROSE = re.compile(r"[A-Za-z][a-z]+(?:[ ,.'’—–:?!·]+[A-Za-z][a-z]*){1,}[.?!]?")

WORDS = re.compile(r"[A-Z][a-z]+(?:[ ,.'’—–:?!]+[A-Za-z][a-z]*)*[.?!]?")

# A marker for the handful of places where English is the right answer: a
# branch only an English reader reaches. It names the *next* declaration, and
# it is a comment, so `strip_comments` has to be told where they were.
EXEMPT = 'untranslated-check:'


def exempt_lines(raw: str) -> set:
    """Line numbers covered by an `untranslated-check:` marker.

    From the marker to the end of the declaration it sits above, which is the
    next line at column zero that closes it. Cheap and good enough: these are
    top-level helpers, and a marker that over-reaches silences a helper rather
    than a screen.
    """
    lines = raw.split('\n')
    covered = set()
    for i, line in enumerate(lines):
        if EXEMPT not in line:
            continue
        for j in range(i, len(lines)):
            covered.add(j + 1)
            if lines[j].startswith('}'):
                break
    return covered


def sweep(paths):
    found = collections.defaultdict(list)
    for p in paths:
        raw = pathlib.Path(p).read_text()
        skip = exempt_lines(raw)
        src = strip_comments(raw)
        for i, line in enumerate(src.split('\n'), 1):
            if i in skip: continue
            s = line.strip()
            if not s: continue
            if re.fullmatch(r"[A-Z][A-Za-z0-9 ,.'’—–:%()·\-…?!]{5,}", s) and ' ' in s:
                found[p].append((i, s))
                continue
            # Props holding words. A single word counts: `overline="Utilisation"`
            # and `label="Loaded"` are as English as a sentence is, and
            # requiring two words is how both of those sat on the fleet screen
            # through a sweep that reported zero.
            for m in re.finditer(rf'''\b(?:{PROPS})=(?:"([^"]{{3,}})"|\{{`([^`{{}}]{{3,}})`\}})''', line):
                v = m.group(1) or m.group(2)
                if WORDS.fullmatch(v):
                    found[p].append((i, v))

            # Text between tags, on the same line as them. The check above only
            # sees a string that is alone on its line, and `<Text>Your fleet</Text>`
            # never is.
            # `(?<!=)` keeps the arrow out of it: `=> Promise<Answer>` is a
            # type annotation, not a label, and it matches otherwise.
            for m in re.finditer(r'(?<!=)>([^<>{}\n]{3,})<', line):
                v = m.group(1).strip()
                if WORDS.fullmatch(v) and v not in NAMES:
                    found[p].append((i, v))
            for m in re.finditer(r"return '([A-Z][^']{6,})';", line):
                found[p].append((i, m.group(1)))

            # Prose in a JSX text node that shares its line with an expression.
            # `{count} trips completed` is two words of English and the check
            # above cannot see it, because the line is not the string. Blank
            # the `{...}` out and look at what is left.
            bare = re.sub(r'\{[^{}]*\}', ' ', line).strip()
            if (
                '<' not in bare
                and '=' not in bare
                and ':' not in bare
                # `view.ok` and `trip.live` are two words to a regex and a
                # property access to everybody else.
                and not re.search(r'[A-Za-z]\.[A-Za-z]', bare)
                and not KEYWORD.match(bare)
                and PROSE.fullmatch(bare)
            ):
                found[p].append((i, bare))

            # A quoted string inside a JSX expression. `{held ? 'On file' :
            # 'Not uploaded'}` is two labels a reader sees, and every check
            # above blanks the braces out before looking.
            for m in re.finditer(LITERAL, line):
                v = (m.group(1) or m.group(2)).strip()
                if '/' in v or v in NAMES:
                    continue
                if WORDS.fullmatch(v):
                    found[p].append((i, v))

            # And prose inside a template literal, which is how the same text
            # gets written when a number lands in the middle of it.
            for m in re.finditer(r'`([^`]*)`', line):
                text = re.sub(r'\$\{[^{}]*\}', ' ', m.group(1)).strip(' ·')
                if PROSE.fullmatch(text.strip()):
                    found[p].append((i, text.strip()))
    return found

if __name__ == '__main__':
    args = sys.argv[1:] or [
        str(p) for p in sorted(pathlib.Path('apps/mobile/src').rglob('*.tsx'))
    ]
    found = sweep(args)
    total = sum(len(v) for v in found.values())
    print(f'{total} strings across {len(found)} files\n')
    for path, hits in sorted(found.items(), key=lambda kv: -len(kv[1])):
        print(f'--- {path} ({len(hits)})')
        for i, s in hits[:200]:
            print(f'  {i}: {s}')
