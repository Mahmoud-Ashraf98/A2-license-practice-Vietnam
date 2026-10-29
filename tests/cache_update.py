"""A site-data reset must not leave an older HTTP-cached app or module graph."""
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import io
import json
import os
import subprocess
import tarfile
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect
from browser_smoke import click, saved, settled
from header_update import Handler, ready

ROOT = Path(__file__).resolve().parent.parent
PREVIOUS_RELEASE = '61efb08b740c6c7954e512e390caee3dc84206a9'


class CachedHandler(Handler):
    def translate_path(self, path):
        parsed = urlsplit(path)
        name = parsed.path.lstrip('/')
        stale_root = getattr(self.server, 'stale_root', None)
        query = parse_qs(parsed.query)
        # A CDN can retain unversioned source/manifest/worker responses after
        # publication. Versioned requests must reach the current fixture.
        stale = (
            (name.endswith(('.mjs', '.css')) and 'sha256' not in query)
            or (name == 'offline-manifest.json' and 'release' not in query)
            or (name == 'sw.js' and 'build' not in query)
        )
        if stale_root and stale and (stale_root / name).is_file():
            return str(stale_root / name)
        return super().translate_path(path)

    def do_GET(self):
        self.server.requests.append(self.path)
        super().do_GET()

    def end_headers(self):
        # GitHub Pages/browser HTTP caching is separate from site storage and
        # CacheStorage. HTML is refreshed, while the old modules remain fresh.
        path = urlsplit(self.path).path
        cache = 'public, max-age=600' if path.endswith(('.mjs', '.css')) else 'no-store'
        self.send_header('Cache-Control', cache)
        super().end_headers()


@contextmanager
def serve(root):
    server = ThreadingHTTPServer(('127.0.0.1', 0), CachedHandler)
    server.root = root
    server.requests = []
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def choose_theme(page, theme):
    click(page, '.topbar [data-action="settings"]')
    page.locator('#setting-theme').select_option(theme)
    click(page, '[data-action="save-settings"]')


def main():
    with tempfile.TemporaryDirectory() as directory, sync_playwright() as playwright:
        old = Path(directory) / 'previous-release'
        old.mkdir()
        archive = subprocess.check_output(['git', 'archive', PREVIOUS_RELEASE], cwd=ROOT)
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            tar.extractall(old, filter='data')
        launch = {'headless': True, 'args': ['--no-sandbox']}
        if os.getenv('CHROMIUM_PATH'):
            launch['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = playwright.chromium.launch(**launch)
        with serve(old) as server:
            # Block the worker so this test isolates the browser HTTP cache.
            # The cached-worker update is covered separately in header_update.py.
            context = browser.new_context(service_workers='block', accept_downloads=True)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            origin = f'http://127.0.0.1:{server.server_port}'
            page.goto(origin + '/')
            expect(page.locator('.main > .brand .brand-dot')).to_have_text('đ')
            assert '/app.mjs' in server.requests and '/engine.mjs' in server.requests

            # Equivalent to deleting site data, not clearing the entire browser's
            # HTTP cache. Navigate away to release the app's single-writer lock.
            page.goto('about:blank')
            session = context.new_cdp_session(page)
            session.send('Storage.clearDataForOrigin', {'origin': origin, 'storageTypes': 'all'})
            server.root = ROOT
            server.requests.clear()
            page.goto(origin + '/')
            expect(page.locator('h1')).to_have_text('Your next step starts here.')
            expect(page.locator('.main > .brand .brand-icon')).to_have_attribute('src', 'assets/icons/duong-192-v1.png')
            assert page.locator('.brand-dot').count() == 0
            choose_theme(page, 'amoled')
            assert page.locator('body').evaluate('e => getComputedStyle(e).backgroundColor') == 'rgb(0, 0, 0)'
            assert saved(page)['preferences']['theme'] == 'amoled'

            # Validate the actual application's imported engine too: merely
            # versioning app.mjs leaves a stale engine that rejects this backup.
            click(page, '.topbar [data-action="settings"]')
            with page.expect_download() as download:
                click(page, '[data-action="export"]')
            backup = Path(directory) / 'amoled-backup.json'
            download.value.save_as(str(backup))
            assert json.loads(backup.read_text())['preferences']['theme'] == 'amoled'
            click(page, '[data-action="close-modal"]')
            choose_theme(page, 'light')
            click(page, '.topbar [data-action="settings"]')
            page.locator('#backup-file').set_input_files(str(backup))
            settled(page)
            expect(page.locator('#modal')).to_contain_text('Review before importing')
            click(page, '[data-action="apply-import"]')
            assert saved(page)['preferences']['theme'] == 'amoled'
            assert not errors, errors
            context.close()

        # An already installed worker must also use fresh online HTML instead
        # of serving its verified cached shell forever. Offline still requires
        # the complete, checksum-verified release rather than arbitrary HTML.
        current = Path(directory) / 'current-release'
        manifest = json.loads((ROOT / 'offline-manifest.json').read_text())
        for name in [entry['url'] for entry in manifest['files']] + ['sw.js', 'offline-manifest.json']:
            target = current / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((ROOT / name).read_bytes())
        with serve(current) as server:
            server.stale_root = old
            context = browser.new_context()
            page = context.new_page()
            origin = f'http://127.0.0.1:{server.server_port}'
            page.goto(origin + '/')
            ready(page)
            page.wait_for_function('navigator.serviceWorker.controller !== null')
            assert page.locator('meta[name="online-shell-probe"]').count() == 0
            index = current / 'index.html'
            index.write_text(index.read_text().replace('</head>', '<meta name="online-shell-probe" content="new-html"></head>'))
            page.reload()
            expect(page.locator('meta[name="online-shell-probe"]')).to_have_attribute('content', 'new-html')
            expect(page.locator('.main > .brand .brand-icon')).to_be_visible()
            context.set_offline(True)
            page.reload()
            expect(page.locator('.main > .brand .brand-icon')).to_be_visible()
            assert page.locator('meta[name="online-shell-probe"]').count() == 0, 'Offline navigation must use the verified original shell'
            ready(page)
            choose_theme(page, 'amoled')
            page.set_viewport_size({'width': 800, 'height': 1500})
            click(page, '.topbar [data-action="settings"]')
            expect(page.locator('#setting-theme')).to_have_value('amoled')
            expect(page.locator('#modal')).to_contain_text('App version:')
            expect(page.locator('#modal')).not_to_contain_text('App version: development')
            output = ROOT / 'test-results'
            output.mkdir(exist_ok=True)
            page.screenshot(path=str(output / 'cache-fixed-settings.png'))
            context.close()
        browser.close()
    print('PASS: warm HTTP cache after site-data reset; current logo/AMOLED/backup engine; online shell refresh and verified offline fallback')


if __name__ == '__main__':
    main()
