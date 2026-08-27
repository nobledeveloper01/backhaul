"""
Finds user-facing English still hard-coded in the app.

Run it after adding a screen: `python3 scripts/untranslated-check.py`. It reads
every `.tsx` under `apps/mobile/src`, strips comments — the prose in those is
meant to be English — and reports JSX text nodes and user-facing props that
still hold words rather than a `t()` call.

It is a lint, not a gate. It cannot tell a company name from a heading, so it
will always report a few things that are right. What it is for is the case that
actually happened: a screen whose headings were translated and whose body copy
was not, which reads as finished until somebody actually reads it.
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
# The product's own name is the same word in all four languages.
PRODUCT = 'Backhaul'

WORDS = re.compile(r"[A-Z][a-z]+(?:[ ,.'’—–:?!]+[A-Za-z][a-z]*)*[.?!]?")

def sweep(paths):
    found = collections.defaultdict(list)
    for p in paths:
        src = strip_comments(pathlib.Path(p).read_text())
        for i, line in enumerate(src.split('\n'), 1):
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
                if WORDS.fullmatch(v) and v != PRODUCT:
                    found[p].append((i, v))
            for m in re.finditer(r"return '([A-Z][^']{6,})';", line):
                found[p].append((i, m.group(1)))
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
