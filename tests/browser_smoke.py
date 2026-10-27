"""Real Chromium regression flows. Starts its own static server; no live learner data."""
from pathlib import Path
import json
import os
import subprocess
import socket
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
BANK = json.loads((ROOT / 'data/questions.json').read_text())
BY_ID = {q['id']: q for q in BANK['questions']}
SERVER = None


def saved(page):
    return page.evaluate('''async () => {
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('duong-learning-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      return new Promise((resolve,reject)=>{const r=db.transaction('records').objectStore('records').get('state');r.onsuccess=()=>{db.close();resolve(r.result)};r.onerror=()=>reject(r.error)});
    }''')


def settled(page):
    page.wait_for_function("document.querySelector('#app')?.getAttribute('aria-busy') !== 'true'")


def click(page, selector):
    settled(page)
    page.locator(selector).first.click()
    settled(page)


def nav(page, view):
    click(page, f'[data-action="nav"][data-view="{view}"]')


def selected(page, number):
    if page.locator('[data-action="end-study"]').count():
        click(page, '[data-action="end-study"]')
    nav(page, 'learn')
    click(page, '[data-action="selected-ids"]')
    page.locator('#selected-question-ids').fill(str(number))
    click(page, '[data-action="start-selected"]')
    expect(page.locator('.question-top')).to_contain_text(f'QUESTION {number}')


def current_evidence(page):
    data = saved(page)
    return page.evaluate('''async data => {
      const engine=await import('./engine.mjs');
      const bank=await(await fetch('./data/questions.json')).json();
      return engine.readiness(bank.questions,data.attempts,data.exams);
    }''', data)


def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    server = subprocess.Popen(['python3', '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        with sync_playwright() as playwright:
            launch = {'headless': True, 'args': ['--no-sandbox']}
            if os.getenv('CHROMIUM_PATH'):
                launch['executable_path'] = os.environ['CHROMIUM_PATH']
            browser = playwright.chromium.launch(**launch)
            errors = []
            context = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, accept_downloads=True)
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{port}/')
            expect(page.locator('h1')).to_have_text('Your next step starts here.')
            click(page, '[data-action="skip-setup"]')
            (ROOT / 'docs/screenshots').mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(ROOT / 'docs/screenshots/today-mobile.png'))
            page.evaluate('scrollTo(0,600)')
            assert page.locator('.main > .brand').bounding_box()['y'] < 0, 'Title should scroll out of the viewport'
            assert page.locator('.sidebar').bounding_box()['y'] > 0, 'Bottom navigation remains accessible'
            for width in [320,390,768,1280]:
                page.set_viewport_size({'width':width,'height':844})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow at {width}px'
            page.set_viewport_size({'width':390,'height':844})
            selected(page,362)
            assert page.locator('.figure img').count()==2
            click(page,'[data-action="decode"]')
            expect(page.locator('.reading-guide')).to_contain_text('báo hiệu hạn chế tốc độ')
            expect(page.locator('.reading-guide')).to_contain_text('trị số ghi trên biển')
            click(page,'[data-action="save-chunk"][data-index="4"]')
            assert saved(page)['savedPhrases'][0]['vi']=='trị số ghi trên biển'
            click(page,'[data-action="change-support"]')
            page.locator('#next-support').select_option('3')
            click(page,'[data-action="apply-support"]')
            click(page,'[data-action="answer"][data-id="q362_opt_2"]')
            click(page,'[data-action="confidence"][data-value="sure"]')
            click(page,'[data-action="commit"]')
            click(page,'[data-action="schedule-check"][data-id="q362"]')
            assert saved(page)['delayedChecks']['q362']>saved(page)['attempts'][-1]['at']
            attempt=saved(page)['attempts'][-1]
            assert attempt['recentExposure'] and attempt['support'], 'Support changes must retain help and exposure'
            assert current_evidence(page)['mastered']==0
            click(page,'[data-action="repair-phrases"]')
            expect(page.locator('[data-action="return-question"]').first).to_have_text('Return to question 362')
            click(page,'[data-action="phrase-mode"][data-value="locate"]')
            assert page.locator('.locate-chunk.found').count()==0
            click(page,'.locate-chunk')
            page.reload()
            expect(page.locator('[data-action="return-question"]').first).to_have_text('Return to question 362')
            expect(page.locator('.phrase-card')).to_contain_text('From question 362')
            click(page,'[data-action="return-question"]')
            expect(page.locator('.question-top')).to_contain_text('QUESTION 362')
            assert saved(page)['studySession']['study']['committed']
            selected(page,142)
            click(page,'[data-action="answer"][data-id="q142_opt_2"]')
            click(page,'[data-action="commit"]')
            click(page,'[data-action="repair-phrases"]')
            expect(page.locator('#modal')).to_contain_text('No reviewed linked phrase for question 142')
            assert page.locator('.question-top').count()==1
            click(page,'[data-action="close-modal"]')
            # Backup round-trip includes exposures, saved phrases and the exact session.
            click(page,'.topbar [data-action="settings"]')
            with page.expect_download() as download:
                click(page,'[data-action="export"]')
            with tempfile.TemporaryDirectory() as directory:
                backup_path=Path(directory)/'backup.json';download.value.save_as(str(backup_path))
                original=json.loads(backup_path.read_text())
                assert original['studySession']['study']['ids']==['q142']
                assert original['lastBackupAt']
                click(page,'[data-action="reset"]')
                page.once('dialog',lambda d:d.accept())
                click(page,'[data-action="confirm-reset"]')
                assert saved(page)['attempts']==[]
                click(page,'.topbar [data-action="settings"]')
                page.locator('#backup-file').set_input_files(str(backup_path));settled(page)
                expect(page.locator('#modal')).to_contain_text('Review before importing')
                click(page,'[data-action="apply-import"]')
                expect(page.locator('.question-top')).to_contain_text('QUESTION 142')
                restored=saved(page)
                assert restored['attempts']==original['attempts']
                # Reopening the committed card is a new exposure; imported times never rewind.
                assert all(restored['exposures'][id]['at']>=entry['at'] for id,entry in original['exposures'].items())
                assert restored['delayedChecks']==original['delayedChecks']
                assert restored['savedPhrases']==original['savedPhrases']
            # Test real service-worker installation and offline reload, not just the label.
            page.wait_for_function("document.querySelector('#offline-label')?.textContent === 'Ready offline'",timeout=60000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('.question-top')).to_contain_text('QUESTION 142')
            selected(page,362)
            page.wait_for_function('Array.from(document.querySelectorAll(".figure img")).every(i=>i.complete&&i.naturalWidth>0)')
            click(page,'[data-action="zoom"][data-index="1"]')
            expect(page.locator('#modal img')).to_be_visible()
            click(page,'[data-action="close-modal"]')
            context.set_offline(False)
            print('PASS: mobile layout, scrolling title, exposure, contextual repair, reload, backup and actual offline diagrams')
            context.close()
            # Fresh learner: one answer and 24 blank outcomes, flag saved across reload.
            context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{port}/');expect(page.locator('h1')).to_be_visible()
            nav(page,'test');click(page,'[data-action="start-exam"]')
            e=saved(page)['exams'][-1]
            index=next(i for i,id in enumerate(e['ids']) if not BY_ID[id]['critical_for_motorcycle'])
            click(page,f'[data-action="exam-go"][data-index="{index}"]')
            id=e['ids'][index]
            expect(page.locator('.question-top')).to_contain_text(f'Question {index+1} of 25')
            assert page.locator('.translation,[data-action="decode"],.tag.critical').count()==0
            click(page,f'[data-action="answer"][data-id="{BY_ID[id]["correct_option_id"]}"]')
            click(page,'[data-action="exam-flag"][data-value="guessed"]')
            page.reload();expect(page.locator('[data-timer]')).to_be_visible()
            assert saved(page)['exams'][-1]['flags'][id]=='guessed'
            click(page,'[data-action="submit-exam"]')
            expect(page.locator('#modal')).to_contain_text('24 questions are unanswered')
            expect(page.locator('#modal')).to_contain_text('guessed')
            click(page,'[data-action="confirm-submit"]')
            expect(page.locator('.result-score')).to_have_text('1/25')
            data=saved(page);e=data['exams'][-1]
            assert e['result']['criticalWrong'] and e['result']['unanswered']==24
            assert sum(bool(a['answerId']) for a in data['attempts'])==1
            assert all(a['confidence']!='sure' for a in data['attempts'])
            assert current_evidence(page)['coverage']==1
            nav(page,'today');click(page,'[data-action="daily-learn"]')
            assert page.locator('.question-top').count()==1
            click(page,'[data-action="end-study"]');nav(page,'test')
            click(page,'[data-action="exam-result"]')
            click(page,'[data-action="repair-paper"]')
            assert saved(page)['studySession']['study']['mode']=='paper-repair'
            assert saved(page)['exams'][-1]['result']==e['result']
            assert len(saved(page)['studySession']['study']['ids'])==25
            print('PASS: strict paper, saved uncertainty, one-answer coverage, new learning and unchanged post-paper repair score')
            click(page,'[data-action="end-study"]');nav(page,'test')
            click(page,'[data-action="start-practice"]')
            expect(page.locator('[data-timer]')).to_have_text('Untimed')
            e=saved(page)['exams'][-1];id=e['ids'][0]
            click(page,f'[data-action="answer"][data-id="{BY_ID[id]["correct_option_id"]}"]')
            click(page,'[data-action="exam-flag"][data-value="unsure"]')
            click(page,'[data-action="submit-exam"]');click(page,'[data-action="confirm-submit"]')
            assert saved(page)['exams'][-1]['timed'] is False
            assert current_evidence(page)['completedMocks']==1, 'Untimed paper must not add strict evidence'
            assert saved(page)['attempts'][-25]['confidence']=='unsure'
            context.close()
            # The real deadline path auto-submits, including entirely blank papers.
            context=browser.new_context();page=context.new_page();page.clock.install()
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{port}/');expect(page.locator('h1')).to_be_visible()
            nav(page,'test');click(page,'[data-action="start-exam"]')
            page.clock.fast_forward(19*60*1000+2000)
            expect(page.locator('.result-score')).to_have_text('0/25')
            e=saved(page)['exams'][-1]
            assert e['expired'] and e['result']['unanswered']==25 and e['result']['criticalWrong']
            assert current_evidence(page)['coverage']==0
            assert all(a['confidence']=='unrated' for a in saved(page)['attempts'])
            assert e['finishedAt']==e['deadline']
            context.close()
            print('PASS: genuine timed-out paper, strict blank scoring and zero fabricated coverage/confidence')
            context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
            page=context.new_page();page.clock.install();page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{port}/');expect(page.locator('h1')).to_be_visible()
            selected(page,487)
            page.clock.fast_forward(10000)
            page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))")
            settled(page);page.clock.fast_forward(300000)
            page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))")
            page.clock.fast_forward(10000)
            # Keyboard selection and focus remain usable with long options.
            page.keyboard.press('1')
            settled(page);click(page,'[data-action="commit"]')
            measured=saved(page)['attempts'][-1]['activeMs']
            assert 19000 <= measured < 25000, f'Background time leaked into measured study: {measured}'
            page.locator('#repair-reason').select_option('diagram');settled(page)
            click(page,'[data-action="start-repair"]')
            for step in range(4):
                click(page,f'[data-action="repair-step"][data-value="{step}"]')
            expect(page.locator('#modal')).to_contain_text('The car yields to the priority-road vehicles')
            click(page,'[data-action="close-modal"]')
            page.set_viewport_size({'width':320,'height':720})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.locator('[data-action="next-study"]').scroll_into_view_if_needed()
            controls=page.locator('.study-controls').bounding_box()
            assert controls['y']+controls['height']<650, 'Study control must stay above phone navigation'
            page.clock.fast_forward(24*60*60*1000+1000)
            page.reload();expect(page.locator('.question-top')).to_contain_text('QUESTION 487')
            click(page,'[data-action="change-support"]');page.locator('#next-support').select_option('3')
            click(page,'[data-action="apply-support"]')
            click(page,'[data-action="answer"][data-id="q487_opt_2"]')
            click(page,'[data-action="confidence"][data-value="sure"]');click(page,'[data-action="commit"]')
            assert saved(page)['attempts'][-1]['recentExposure'], 'Reloading visible feedback must refresh answer exposure'
            context.close()
            print('PASS: untimed evidence stays separate, background study time excluded, keyboard controls and junction repair')
            assert not errors, errors
            browser.close()
    finally:
        server.terminate();server.wait()


if __name__=='__main__':
    main()
