#!/usr/bin/env python3
"""Helper for sprites.json (Bitburner DOOM). Never needs the big file to be read by a human or an AI.

  python sprites_tool.py list   [sprites.json] [--doom doom.js]      names, size, type/anim/frame, problems
  python sprites_tool.py add NAME --png file.png [--json sprites.json]   append one sprite from a PNG file
  python sprites_tool.py add NAME --b64 file.txt [--json sprites.json]   append one sprite from a base64 text file
  python sprites_tool.py reference [--json sprites.json] [--md sprites_reference.md]
                                                                      rewrite the table between the SPRITES markers

`add` edits the file as TEXT (keeps the CRLF line endings, 2-space indent, one entry per line, no trailing newline),
refuses duplicate names, checks that the data is a real PNG, and warns if the name would collide with another
sprite (same type + animation + frame after the game's parseSpriteKey rules). A backup is written to
sprites.json.bak first. Needs only Python 3.

doom.js has a SPRITE_ALIASES table (name -> name) that lets two sprite names share one image. This tool reads it
from doom.js (default ./doom.js, or --doom PATH) so aliases count as existing sprites; if doom.js is not found the
aliases are simply not listed. Naming standard: animation words are walk / attack / death / projectile /
projectile_impact (the game also accepts "dead" and "die", but keep to "death"); every sprite belongs to a type
(Imp_walk1, never a typeless projectile1).
"""
import base64, json, re, shutil, struct, sys

ANIM_KEY = re.compile(r'^(.+?)_(walk|attack|dead|death|die|idle|impact|projectile_impact|projectile)(\d*)$', re.I)


def parse_key(key):
    """Python copy of parseSpriteKey() in doom.js -> (TYPE, anim, frame)."""
    m = ANIM_KEY.match(key)
    if m:
        anim = m.group(2).lower()
        anim = 'die' if anim in ('dead', 'death') else 'idle' if anim == 'projectile' else 'impact' if anim == 'projectile_impact' else anim
        return m.group(1).replace('_', '').upper(), anim, int(m.group(3)) if m.group(3) else 1
    if '_' not in key:
        return re.sub(r'\d+$', '', key).upper(), 'idle', 1
    head, rest = key.split('_', 1)
    r = re.match(r'^(.*?)(\d+)?$', rest)
    return head.upper(), r.group(1).rstrip('_') or 'idle', int(r.group(2)) if r.group(2) else 1


def png_size(b64):
    raw = base64.b64decode(b64, validate=True)
    if raw[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a PNG')
    return struct.unpack('>II', raw[16:24])


def load_aliases(doom):
    """Reads the SPRITE_ALIASES table out of doom.js (text parse). Returns {alias: target}."""
    try:
        text = open(doom, encoding='utf-8').read()
    except OSError:
        return {}
    m = re.search(r'const SPRITE_ALIASES = \{(.*?)\n\};', text, re.S)
    if not m:
        return {}
    return dict(re.findall(r"'([A-Za-z0-9_]+)'\s*:\s*'([A-Za-z0-9_]+)'", re.sub(r'//[^\n]*', '', m.group(1))))


def load(path):
    with open(path, 'rb') as f:
        return json.loads(f.read().decode('utf-8'))


def problems(data, aliases=None):
    out, seen, by_b64 = [], {}, {}
    aliases = aliases or {}
    for al, target in aliases.items():
        if target not in data:
            out.append(f'ALIAS TARGET MISSING: {al} -> {target}')
        if al in data:
            out.append(f'ALIAS IGNORED: {al} also exists in sprites.json (the file wins); remove one')
    for k, v in data.items():
        if '_' not in k:
            out.append(f'NO TYPE: {k} has no enemy type (there is no generic art); rename it like Imp_projectile')
        elif re.search(r'_(dead|die)\d*$', k, re.I):
            out.append(f'NONSTANDARD NAME: {k} should use "death" (e.g. Imp_death1)')
        slot = parse_key(k)
        if slot in seen:
            out.append(f'COLLISION: {k} and {seen[slot]} are both {slot[0]} {slot[1]} frame {slot[2]} (the later one wins)')
        seen[slot] = k
        if slot[1] not in ('walk', 'attack', 'die', 'idle', 'impact'):
            out.append(f'UNUSED ANIMATION: {k} -> "{slot[1]}" (the game only asks for walk/attack/die/idle/impact)')
        if v in by_b64:
            out.append(f'IDENTICAL IMAGE: {k} and {by_b64[v]} (keep one, add a SPRITE_ALIASES line in doom.js)')
        by_b64[v] = k
    return out


def cmd_list(path, doom):
    data = load(path)
    aliases = load_aliases(doom)
    for k, v in data.items():
        w, h = png_size(v)
        t, a, f = parse_key(k)
        print(f'{k:32} {w:>3}x{h:<3}  {t} / {a} / {f}')
    for al, target in aliases.items():
        t, a, f = parse_key(al)
        print(f'{al:32} alias of {target}  {t} / {a} / {f}')
    print(f'{len(data)} sprites in the file + {len(aliases)} aliases')
    for p in problems(data, aliases):
        print(p)


def cmd_add(name, path, doom, png=None, b64file=None):
    if not re.fullmatch(r'[A-Za-z0-9_]+', name):
        sys.exit('name may only contain letters, digits and underscores')
    if '_' not in name:
        sys.exit('name needs an enemy type first, like Imp_projectile (there is no generic projectile art)')
    if re.search(r'_(dead|die)\d*$', name, re.I):
        sys.exit('use "death" in the name (Imp_death1), not "dead" / "die"')
    if png:
        b64 = base64.b64encode(open(png, 'rb').read()).decode('ascii')
    else:
        b64 = re.sub(r'\s+', '', open(b64file, encoding='utf-8').read())
        if b64.startswith('data:'):
            b64 = b64.split(',', 1)[1]
    w, h = png_size(b64)
    data = load(path)
    if name in data:
        sys.exit(f'{name} already exists (delete or rename it first)')
    slot = parse_key(name)
    aliases = load_aliases(doom)
    if name in aliases:
        sys.exit(f'{name} is an alias of {aliases[name]} in doom.js; remove that alias line first')
    clash = [k for k in list(data) + list(aliases) if parse_key(k) == slot]
    text = open(path, 'rb').read().decode('utf-8')
    tail = '\r\n}' if text.endswith('\r\n}') else '\n}'
    if not text.endswith(tail):
        sys.exit('unexpected end of file (expected the closing brace on its own line)')
    nl = tail[:-1]
    shutil.copyfile(path, path + '.bak')
    new = text[:-len(tail)] + ',' + nl + f'  {json.dumps(name)}: "{b64}"' + tail
    json.loads(new)   # must still be valid JSON
    open(path, 'wb').write(new.encode('utf-8'))
    print(f'added {name} ({w}x{h}) as {slot[0]} / {slot[1]} / frame {slot[2]}')
    if clash:
        print(f'WARNING: same slot as {clash} - the later key replaces it in game')


def cmd_reference(path, md, doom):
    data = load(path)
    aliases = load_aliases(doom)
    groups = {}
    for k, v in data.items():
        t, a, f = parse_key(k)
        groups.setdefault(t, []).append((k, a, f, '%dx%d' % png_size(v)))
    for al, target in aliases.items():
        t, a, f = parse_key(al)
        groups.setdefault(t, []).append((al, a, f, f'alias of `{target}`'))
    lines = []
    for t, items in groups.items():
        lines.append(f'### {t}  ({len(items)} sprites)')
        lines.append('')
        lines.append('| Key | Animation | Frame | Size (px) / note |')
        lines.append('|---|---|---|---|')
        for k, a, f, size in sorted(items, key=lambda i: (i[1], i[2])):
            lines.append(f'| `{k}` | {a} | {f} | {size} |')
        lines.append('')
    block = '\n'.join(lines).rstrip() + '\n'
    text = open(md, encoding='utf-8').read()
    pat = re.compile(r'(<!-- SPRITES:START -->\n).*?(<!-- SPRITES:END -->)', re.S)
    if not pat.search(text):
        sys.exit('markers <!-- SPRITES:START --> / <!-- SPRITES:END --> not found in ' + md)
    text = pat.sub(lambda m: m.group(1) + block + m.group(2), text)
    text = re.sub(r'(\*\*Total sprites:\*\* )[^\n]*', lambda m: m.group(1) + f'{len(data)} images in the file + {len(aliases)} aliases', text)
    open(md, 'w', encoding='utf-8').write(text)
    print(f'rewrote table for {len(data)} sprites in {md}')


def main(a):
    if not a or a[0] not in ('list', 'add', 'reference'):
        sys.exit(__doc__)
    opt = lambda f, d=None: a[a.index(f) + 1] if f in a else d
    js = opt('--json', 'sprites.json')
    doom = opt('--doom', 'doom.js')
    if a[0] == 'list':
        cmd_list(a[1] if len(a) > 1 and not a[1].startswith('--') else js, doom)
    elif a[0] == 'add':
        if len(a) < 2 or not (opt('--png') or opt('--b64')):
            sys.exit(__doc__)
        cmd_add(a[1], js, doom, opt('--png'), opt('--b64'))
    else:
        cmd_reference(js, opt('--md', 'sprites_reference.md'), doom)


if __name__ == '__main__':
    main(sys.argv[1:])
