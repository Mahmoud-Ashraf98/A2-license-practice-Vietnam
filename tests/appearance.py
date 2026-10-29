"""Check persisted appearance, native chrome, current branding and offline use."""
from pathlib import Path
import json
import os
import tempfile
from playwright.sync_api import sync_playwright, expect
from browser_smoke import click, nav, saved, selected, settled
from header_update import serve, ready

ROOT = Path(__file__).resolve().parent.parent
BLACK = 'rgb(0, 0, 0)'


def background(page, selector):
    return page.locator(selector).first.evaluate('e => getComputedStyle(e).backgroundColor')


def choose_theme(page, theme):
    click(page, '.topbar [data-action="settings"]')
    page.locator('#setting-theme').select_option(theme)
    click(page, '[data-action="save-settings"]')
    expect(page.locator('body')).to_have_attribute('data-theme', theme)
    assert saved(page)['preferences']['theme'] == theme


def assert_amoled(page, selectors):
    expect(page.locator('html')).to_have_attribute('data-theme', 'amoled')
    expect(page.locator('body')).to_have_attribute('data-theme', 'amoled')
    assert page.locator('html').evaluate('e => getComputedStyle(e).colorScheme') == 'dark'
    expect(page.locator('meta[name="theme-color"]')).to_have_attribute('content', '#000000')
    for selector in selectors:
        assert background(page, selector) == BLACK, f'{selector} must be pure black'


def assert_logo(page, selector):
    logo = page.locator(selector)
    expect(logo).to_be_visible()
    expect(logo).to_have_attribute('src', 'assets/icons/duong-192-v1.png')
    page.wait_for_function('''selector => {
      const image = document.querySelector(selector);
      return image?.complete && image.naturalWidth === 192 && image.naturalHeight === 192;
    }''', arg=selector)
    bounds = logo.bounding_box()
    assert bounds['width'] == bounds['height'], 'The app icon must retain its square shape'
    assert page.locator('.brand-dot').count() == 0, 'No old letter badge should remain'


def main():
    with serve(ROOT) as server, sync_playwright() as playwright:
        launch = {'headless': True, 'args': ['--no-sandbox']}
        if os.getenv('CHROMIUM_PATH'):
            launch['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = playwright.chromium.launch(**launch)
        url = f'http://127.0.0.1:{server.server_port}/'

        # Hold the startup shell on screen to verify its logo independently of JS.
        boot_context = browser.new_context(service_workers='block')
        boot_context.add_init_script('localStorage.setItem("duong-appearance", "amoled")')
        boot = boot_context.new_page()
        boot.route('**/app.mjs', lambda route: route.fulfill(content_type='text/javascript', body=''))
        boot.goto(url)
        assert_logo(boot, '.boot .brand-icon')
        expect(boot.locator('html')).to_have_attribute('data-theme', 'amoled')
        assert background(boot, 'html') == BLACK
        assert background(boot, 'body') == BLACK, 'A saved AMOLED setting must also cover startup'
        expect(boot.locator('meta[name="theme-color"]')).to_have_attribute('content', '#000000')
        boot_context.close()

        context = browser.new_context(viewport={'width': 390, 'height': 844},
                                      is_mobile=True, has_touch=True, color_scheme='light',
                                      accept_downloads=True)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url)
        expect(page.locator('h1')).to_have_text('Your next step starts here.')
        click(page, '[data-action="skip-setup"]')
        assert_logo(page, '.main > .brand .brand-icon')

        light = background(page, 'body')
        page.emulate_media(color_scheme='dark')
        dark = background(page, 'body')
        assert dark != light, 'System appearance must follow the OS'
        choose_theme(page, 'light')
        assert background(page, 'body') == light
        choose_theme(page, 'dark')
        page.emulate_media(color_scheme='light')
        assert background(page, 'body') == dark, 'Explicit dark mode must override a light OS'

        click(page, '.topbar [data-action="settings"]')
        expect(page.locator('#setting-theme option[value="amoled"]')).to_have_text('AMOLED · Pure black')
        page.locator('#setting-theme').select_option('amoled')
        click(page, '[data-action="save-settings"]')
        home_surfaces = ['html', 'body', '.sidebar', '.hero', '.card', '.stats']
        assert_amoled(page, home_surfaces)
        assert saved(page)['preferences']['theme'] == 'amoled'

        # AMOLED must stay black on both OS palettes, at phone and desktop widths.
        for os_theme in ['light', 'dark']:
            page.emulate_media(color_scheme=os_theme)
            for width in [320, 390, 768, 1280]:
                page.set_viewport_size({'width': width, 'height': 844})
                assert_amoled(page, home_surfaces)
                assert_logo(page, '.main > .brand .brand-icon')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.emulate_media(color_scheme='light')
        page.reload()
        expect(page.locator('h1')).to_have_text('Your next step starts here.')
        assert_amoled(page, home_surfaces)

        click(page, '.topbar [data-action="settings"]')
        assert_amoled(page, ['#modal', '#setting-theme', '#setting-limit'])
        expect(page.locator('#setting-theme')).to_have_value('amoled')
        click(page, '[data-action="close-modal"]')
        selected(page, 362)
        assert_amoled(page, ['.question-card', '.option', '.study-controls'])
        # Official sign images remain unfiltered, retaining their source colours.
        page.wait_for_function('Array.from(document.querySelectorAll(".figure img")).every(i => i.complete && i.naturalWidth > 0)')
        assert page.locator('.figure img').count() == 2
        assert page.locator('.figure img').evaluate_all('images => images.every(i => getComputedStyle(i).filter === "none")')
        assert_amoled(page, ['.figures'])
        assert background(page, '.figures [data-action="zoom"]') == 'rgba(0, 0, 0, 0)', 'Diagram buttons must not add a white surface'
        click(page, '[data-action="answer"][data-id="q362_opt_2"]')
        click(page, '[data-action="commit"]')
        attempts = saved(page)['attempts']

        # A real exported backup must restore AMOLED alongside existing answers.
        click(page, '.topbar [data-action="settings"]')
        with page.expect_download() as download:
            click(page, '[data-action="export"]')
        with tempfile.TemporaryDirectory() as directory:
            backup = Path(directory) / 'appearance-backup.json'
            download.value.save_as(str(backup))
            assert json.loads(backup.read_text())['preferences']['theme'] == 'amoled'
            click(page, '[data-action="close-modal"]')
            choose_theme(page, 'light')
            click(page, '.topbar [data-action="settings"]')
            page.locator('#backup-file').set_input_files(str(backup))
            settled(page)
            expect(page.locator('#modal')).to_contain_text('Review before importing')
            click(page, '[data-action="apply-import"]')
            expect(page.locator('.question-top')).to_contain_text('QUESTION 362')
            assert_amoled(page, ['body', '.question-card', '.study-controls'])
            assert saved(page)['attempts'] == attempts

        ready(page)
        context.set_offline(True)
        page.reload()
        expect(page.locator('.question-top')).to_contain_text('QUESTION 362')
        assert_amoled(page, ['html', 'body', '.sidebar', '.question-card', '.study-controls'])
        nav(page, 'today')
        assert_logo(page, '.main > .brand .brand-icon')
        assert_amoled(page, home_surfaces)
        output = ROOT / 'test-results'
        output.mkdir(exist_ok=True)
        page.screenshot(path=str(output / 'amoled-mobile.png'))
        assert not errors, errors
        context.close()
        browser.close()
        print('PASS: current in-app/startup logo; AMOLED surfaces/chrome, OS overrides, reload, backup and offline use')


if __name__ == '__main__':
    main()
