#!/usr/bin/env python3
"""Build/check the complete offline manifest and matching service-worker release."""
import argparse
import hashlib
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
paths = [root / name for name in (
    'index.html', 'style.css', 'app.mjs', 'engine.mjs', 'storage.mjs',
    'critical.mjs', 'teaching.mjs', 'icon.svg', 'manifest.webmanifest',
)]
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
    (root / 'offline-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    sw_path.write_text(sw)
print(f'{len(files)} verified offline files · {manifest["total_bytes"]:,} bytes · release {version}')
