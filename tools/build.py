"""Build the playable download: one HTML file that works when opened straight from disk, zipped with play notes.

The game's source uses ES modules, which browsers refuse to load from file://. This bundles them into a single
classic script, each module wrapped in its own scope so their names cannot clash.

Usage: python3 tools/build.py   ->   download/Thaw.zip
"""
import pathlib
import re
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
# Dependency order: each module comes after the ones it imports.
ORDER = ['config', 'terrain', 'level1', 'prologue', 'village', 'input', 'audio', 'character', 'game', 'render', 'main']
# Files shipped next to index.html, byte for byte. The theme track must stay unmodified.
ASSETS = ['audio/thatgamejam02_theme.wav', 'audio/CREDITS.md'] + sorted(
    str(p.relative_to(ROOT)) for d in ('sfx', 'music') for p in (ROOT / 'audio' / d).glob('*.mp3'))

PLAY_NOTES = """THAW

1. Unzip this folder.
2. Double-click index.html. It opens in your web browser.
3. Press any key to wake. Sound on.

Controls
- Walk: Left and Right arrows, or A and D
- Pulse: hold Space (you cannot move while pulsing)
- Pause: Esc
- Mute: M
- Replay the stage: R
- Start over from the beginning: Enter (at the stage end or when paused)

Best in Chrome, Edge or Firefox.

Music: thatgamejam #02 theme by Jason Grace, used unmodified.
Music: Long Winter by Indieteur, Esther by Kistol, November Snow by cynicmusic (all CC0, OpenGameArt).
Sound recordings: human-made CC0 recordings from Freesound. Full credits in audio/CREDITS.md.
"""


def bundle():
    found = {p.stem for p in (ROOT / 'src').glob('*.js')}
    missing = found - set(ORDER)
    assert not missing, f'add these modules to ORDER in tools/build.py: {sorted(missing)}'
    parts = []
    for name in ORDER:
        src = (ROOT / 'src' / f'{name}.js').read_text()
        imports = []

        def imp(m):
            imports.append(f"const {{ {m.group(1).strip()} }} = __m_{m.group(2)};")
            return ''

        src = re.sub(r"^import\s*\{([^}]*)\}\s*from\s*'\./(\w+)\.js';\s*$", imp, src, flags=re.M)
        names = re.findall(r'^export\s+(?:const|let|function|class)\s+(\w+)', src, flags=re.M)
        src = re.sub(r'^export\s+', '', src, flags=re.M)
        parts.append(f"const __m_{name} = (() => {{\n" + '\n'.join(imports) + '\n' + src
                     + f"\nreturn {{ {', '.join(names)} }};\n}})();")
    html = (ROOT / 'index.html').read_text()
    tag = '<script type="module" src="src/main.js"></script>'
    assert tag in html, 'index.html no longer loads src/main.js the expected way'
    return html.replace(tag, '<script>\n"use strict";\n' + '\n'.join(parts) + '\n</script>')


def main():
    out = ROOT / 'download' / 'Thaw.zip'
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('Thaw/index.html', bundle())
        z.writestr('Thaw/HOW-TO-PLAY.txt', PLAY_NOTES)
        for a in ASSETS:
            # Stored, not compressed, so the file inside the zip is the original.
            z.write(ROOT / a, f'Thaw/{a}', compress_type=zipfile.ZIP_STORED)
    print(f'wrote {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
