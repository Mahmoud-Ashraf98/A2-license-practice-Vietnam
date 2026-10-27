"""Exercise a real cached upgrade, including an open paper; no learner data is used."""
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import io
import json
import os
import subprocess
import tarfile
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect

REPO = Path(__file__).resolve().parent.parent
ROOT = REPO
LEGACY_REFS = (
    'd200cc6918694be332744bd138fc280a0b6f2607',  # original fixed header
    '621a6a3d5aba8f1770aef503e58c8da705775346',  # previous release, waiting update
)


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        self.directory = str(self.server.root)
        return super().translate_path(path)

    def log_message(self, *args):
        pass


@contextmanager
def serve(root):
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.root = root
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def saved(page):
    return page.evaluate('''async () => {
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('duong-learning-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      return new Promise((resolve,reject)=>{const r=db.transaction('records').objectStore('records').get('state');r.onsuccess=()=>{db.close();resolve(r.result)};r.onerror=()=>reject(r.error)});
    }''')


def click(page, selector):
    page.wait_for_function("document.querySelector('#app')?.getAttribute('aria-busy') !== 'true'")
    page.locator(selector).first.click()
    page.wait_for_function("document.querySelector('#app')?.getAttribute('aria-busy') !== 'true'")


def ready(page):
    page.wait_for_function("document.querySelector('#offline-label')?.textContent==='Ready offline'", timeout=45000)


def study(page):
    click(page, '[data-action="nav"][data-view="learn"]')
    click(page, '[data-action="single"][data-id="q022"]')
    expect(page.locator('.question-top')).to_contain_text('QUESTION 22')


def assert_reading_header(page):
    brand = page.locator('.main > .brand')
    expect(brand).to_be_hidden()
    assert brand.bounding_box() is None, 'The practice title must reserve zero space'
    assert page.locator('.main').evaluate('e=>parseFloat(getComputedStyle(e).paddingTop)') < 40
    page.evaluate('scrollTo({top:650,behavior:"instant"})')
    assert page.locator('.topbar').bounding_box()['y'] + page.locator('.topbar').bounding_box()['height'] < 0
    assert page.locator('.sidebar').bounding_box()['y'] > 0
    # Re-rendering after a selection must not recreate the pinned title.
    if page.locator('[data-action="answer"]').count():
        click(page, '[data-action="answer"]')
    expect(brand).to_be_hidden()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')


def main():
    version = json.loads((ROOT / 'offline-manifest.json').read_text())['version']
    bank = json.loads((ROOT / 'data/questions.json').read_text())
    by_id = {q['id']: q for q in bank['questions']}
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as playwright:
        launch = {'headless': True, 'args': ['--no-sandbox']}
        if os.getenv('CHROMIUM_PATH'):
            launch['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = playwright.chromium.launch(**launch)
        waiting_release=Path(tmp)/'previous-waiting-release'
        waiting_release.mkdir()
        with tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['git','archive',LEGACY_REFS[1]],cwd=REPO))) as tar:
            tar.extractall(waiting_release,filter='data')
        for ref in LEGACY_REFS:
            old = Path(tmp) / ref
            old.mkdir()
            archive = subprocess.check_output(['git', 'archive', ref], cwd=REPO)
            with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
                tar.extractall(old, filter='data')
            for scenario in ['study', 'exam']:
                with serve(old) as server:
                    context = browser.new_context(viewport={'width': 393, 'height': 851}, is_mobile=True, has_touch=True, color_scheme='dark')
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.goto(f'http://127.0.0.1:{server.server_port}/')
                    ready(page)
                    study(page)
                    if ref == LEGACY_REFS[0]:
                        page.evaluate('scrollTo({top:650,behavior:"instant"})')
                        assert page.locator('a.brand').evaluate('e=>getComputedStyle(e).position') == 'fixed'
                        assert page.locator('a.brand').bounding_box()['y'] == 0
                    click(page, '[data-action="answer"][data-id="q022_opt_1"]')
                    click(page, '[data-action="commit"]')
                    expect(page.locator('.feedback')).to_be_visible()
                    attempts = saved(page)['attempts']
                    if scenario == 'exam':
                        click(page, '[data-action="nav"][data-view="test"]')
                        click(page, '[data-action="start-exam"]')
                        expect(page.locator('[data-timer]')).to_be_visible()
                        paper = saved(page)['exams'][-1]
                        first = paper['ids'][0]
                        click(page, f'[data-action="answer"][data-id="{by_id[first]["correct_option_id"]}"]')
                        expect(page.locator('.option.selected')).to_be_visible()
                        paper = saved(page)['exams'][-1]
                    else:
                        page.evaluate('scrollTo({top:650,behavior:"instant"})')
                    if ref==LEGACY_REFS[0] and scenario=='study':
                        # Reproduce the reported failure with a fully downloaded, waiting update.
                        page.wait_for_load_state('networkidle')
                        server.root=waiting_release
                        page.evaluate('''async()=>{
                          const registration=await navigator.serviceWorker.getRegistration();
                          await registration.update();
                          const deadline=Date.now()+45000;
                          while(!registration.waiting&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
                          if(!registration.waiting)throw Error('The previous release did not enter its waiting state');
                        }''')
                        page.reload();expect(page.locator('h1')).to_be_visible();study(page)
                        page.evaluate('scrollTo({top:650,behavior:"instant"})')
                        assert page.locator('a.brand').evaluate('e=>getComputedStyle(e).position')=='fixed'
                        assert page.locator('a.brand').bounding_box()['y']==0
                        print('REPRODUCED: the previous fully downloaded release still leaves a pinned header after reload')
                    token = page.evaluate('window.headerUpgradeToken=crypto.randomUUID()')
                    # Finish any automatic update check before changing the served release.
                    page.wait_for_load_state('networkidle')
                    server.root = ROOT
                    page.evaluate("window.headerUpdateErrors=[];navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='OFFLINE_ERROR')window.headerUpdateErrors.push(e.data.message)})")
                    page.evaluate('''async version => {
                      const registration=await navigator.serviceWorker.getRegistration();
                      await registration.update();
                      const deadline=Date.now()+45000;
                      let lastResponse;
                      while(Date.now()<deadline) {
                        const worker=navigator.serviceWorker.controller;
                        if(worker) {
                          const response=await new Promise(resolve=>{
                            const channel=new MessageChannel();
                            const timer=setTimeout(()=>resolve(null),1000);
                            channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data)};
                            worker.postMessage({type:'CHECK_STATUS'},[channel.port2]);
                          });
                          lastResponse=response;
                          if(response?.version===version && response.ready)return;
                        }
                        await new Promise(resolve=>setTimeout(resolve,50));
                      }
                      throw Error('Update did not take control: '+JSON.stringify({lastResponse,errors:window.headerUpdateErrors,installing:registration.installing?.state,waiting:registration.waiting?.state,active:registration.active?.state}));
                    }''', version)
                    assert page.evaluate('window.headerUpgradeToken') == token, 'An update must never automatically reload an open question or paper'
                    assert (page.evaluate('async()=>!!(await navigator.serviceWorker.getRegistration()).waiting')) is False
                    if scenario == 'exam':
                        current = saved(page)['exams'][-1]
                        assert current['id'] == paper['id'] and current['answers'] == paper['answers']
                        assert current['deadline'] == paper['deadline'] and current['status'] == 'active'
                    page.reload()
                    expect(page.locator('.main')).to_be_visible()
                    data = saved(page)
                    assert [a['id'] for a in data['attempts']] == [a['id'] for a in attempts]
                    if scenario == 'exam':
                        expect(page.locator('[data-timer]')).to_be_visible()
                        current = data['exams'][-1]
                        assert current['id'] == paper['id'] and current['answers'] == paper['answers']
                        assert current['deadline'] == paper['deadline'] and current['status'] == 'active'
                    elif ref == LEGACY_REFS[0]:
                        # The original app did not save study sessions; saved answers still migrate.
                        study(page)
                    else:
                        expect(page.locator('.question-top')).to_contain_text('QUESTION 22')
                    assert_reading_header(page)
                    context.set_offline(True)
                    page.reload()
                    expect(page.locator('.main')).to_be_visible()
                    assert_reading_header(page)
                    assert not errors, errors
                    if ref == LEGACY_REFS[0] and scenario == 'study':
                        output = REPO / 'test-results'
                        output.mkdir(exist_ok=True)
                        page.screenshot(path=str(output / 'header-after-fix.png'))
                    context.close()
                    print(f'PASS: {ref[:7]} → {version} · {scenario}: one-refresh update, no pinned title or gap, progress retained, offline works')
        browser.close()


if __name__ == '__main__':
    main()
