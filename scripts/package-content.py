#!/usr/bin/env python3
"""Build/check fingerprinted app assets and the complete verified offline release."""
import argparse
import hashlib
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()

# Use immutable URLs for the entire module graph. Clearing site storage does not
# clear Chrome's HTTP cache, so changing only the shell or worker is insufficient.
modules = {'app.mjs', 'engine.mjs', 'storage.mjs', 'critical.mjs', 'teaching.mjs'}
module_import = re.compile(r'''(?P<prefix>\bfrom\s+|\bimport\s*)(?P<quote>['"])(?P<path>\./[^'"\n]+\.mjs)(?P=quote)''')
generated = {}
compiled = {}
visiting = set()


def compile_module(name):
    if name in compiled:
        return compiled[name]
    assert name in modules, f'Unknown local module: {name}'
    assert name not in visiting, f'Cyclic local module import: {name}'
    visiting.add(name)

    def replace_import(match):
        dependency = match['path'][2:]
        filename = compile_module(dependency)
        return f'{match["prefix"]}{match["quote"]}./{filename}{match["quote"]}'

    content = module_import.sub(replace_import, (root / name).read_text()).encode()
    filename = f'{Path(name).stem}.{hashlib.sha256(content).hexdigest()[:16]}.mjs'
    generated[root / 'assets/app' / filename] = content
    compiled[name] = filename
    visiting.remove(name)
    return filename


for name in sorted(modules):
    compile_module(name)
css = (root / 'style.css').read_bytes()
css_filename = f'style.{hashlib.sha256(css).hexdigest()[:16]}.css'
generated[root / 'assets/app' / css_filename] = css

index_path = root / 'index.html'
index = index_path.read_text()
updated_index, css_replacements = re.subn(
    r'''(\bhref=['"])(?:style\.css|assets/app/style\.[a-f0-9]{16}\.css)(['"])''',
    lambda match: f'{match[1]}assets/app/{css_filename}{match[2]}', index)
updated_index, app_replacements = re.subn(
    r'''(\bsrc=['"])(?:app\.mjs|assets/app/app\.[a-f0-9]{16}\.mjs)(['"])''',
    lambda match: f'{match[1]}assets/app/{compiled["app.mjs"]}{match[2]}', updated_index)
assert css_replacements == app_replacements == 1, 'Expected one app module and one stylesheet entrypoint'

generated_pattern = re.compile(r'(?:app|engine|storage|critical|teaching)\.[a-f0-9]{16}\.mjs|style\.[a-f0-9]{16}\.css')
existing_generated = {path for path in (root / 'assets/app').glob('*')
                      if generated_pattern.fullmatch(path.name)}
if args.check:
    assert existing_generated == set(generated), 'Generated app assets are stale. Run npm run package:offline'
    for path, content in generated.items():
        assert path.read_bytes() == content, f'Generated asset is stale: {path.name}'
    assert index == updated_index, 'App entrypoints are stale. Run npm run package:offline'
else:
    (root / 'assets/app').mkdir(parents=True, exist_ok=True)
    for path in existing_generated - set(generated):
        path.unlink()
    for path, content in generated.items():
        if not path.exists() or path.read_bytes() != content:
            path.write_bytes(content)
    if index != updated_index:
        index_path.write_text(updated_index)

paths = [root / name for name in (
    'index.html', 'style.css', 'app.mjs', 'engine.mjs', 'storage.mjs',
    'critical.mjs', 'teaching.mjs', 'icon.svg', 'manifest.webmanifest',
)]
paths.extend(generated)
for folder, pattern in [('data', '*.json'), ('assets/questions', '*.png'),
                        ('assets/icons', '*.png'), ('assets/icons', '*.ico'),
                        ('sources', '*.pdf')]:
    paths.extend((root / folder).glob(pattern))
files = []
for path in sorted(paths):
    content = path.read_bytes()
    files.append({'url': path.relative_to(root).as_posix(),
                  'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)})
version = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()[:24]
manifest = {'schema_version': 1, 'version': version, 'files': files,
            'total_bytes': sum(f['bytes'] for f in files)}
sw_path = root / 'sw.js'
sw, replacements = re.subn(r'''const RELEASE\s*=\s*['"][a-f0-9]+['"];''', f'const RELEASE = "{version}";', sw_path.read_text())
assert replacements == 1, 'Expected exactly one service-worker release declaration'
if args.check:
    assert json.loads((root / 'offline-manifest.json').read_text()) == manifest, 'Offline manifest is stale. Run python3 scripts/package-content.py'
    assert sw_path.read_text() == sw, 'Service-worker release does not match the manifest'
else:
    manifest_path = root / 'offline-manifest.json'
    manifest_text = json.dumps(manifest, indent=2) + '\n'
    if not manifest_path.exists() or manifest_path.read_text() != manifest_text:
        manifest_path.write_text(manifest_text)
    if sw_path.read_text() != sw:
        sw_path.write_text(sw)
print(f'{len(files)} verified offline files · {manifest["total_bytes"]:,} bytes · release {version}')
