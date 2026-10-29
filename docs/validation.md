# Validation for the October 2026 improvements

Reviewed base: `gh-pages` commit `d200cc6918694be332744bd138fc280a0b6f2607`. The default `main` branch initially contained only the licence and a one-line README.

Executed on 27 October 2026: all 12 engine checks passed; the complete Chromium browser flow passed; syntax and all 145 offline-file checks passed. The official datasets, source PDFs and source images match the reviewed base byte for byte. Browser checks also verified separate untimed evidence, saved delayed checks, keyboard selection, the junction-487 repair, exclusion of background study time, and renewed exposure when reopening old answer feedback.

## Reproduce

```bash
npm test
npm run check
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

Browser checks require Python Playwright and either its Chromium installation or `CHROMIUM_PATH`. The script starts an isolated local HTTP server and uses fresh browser contexts. It does not use anyone’s real learning history.

After changing any shipped file, run `npm run package:offline` before checking or publishing. The script hashes the actual app, all datasets, all 128 figures and both source PDFs, then sets the matching service-worker release. A stale or partial manifest cannot produce a Ready offline marker.

## Automated coverage

The focused engine checks cover blank scoring versus answered coverage; optional confidence and legacy migration; assisted revision and unresolved errors; the 24-hour exposure rule; stale or clustered readiness evidence; balanced new content and deadlines; per-item support; lapse-aware phrase spacing; backup validation and merge; 100 generated papers; immutable question order; and the Vietnam-local format expiry boundary.

Chromium browser flows cover the scrolling title and accessible bottom navigation; layouts at 320, 390, 768 and 1280 CSS pixels; the two original figures and complete reading chunks in question 362; retained help across support changes; an unhighlighted phrase-location task; contextual return after reload; the empty-phrase fallback for question 142; an export/reset/import round-trip; actual offline reload with cached diagrams and zoom; a strict paper submitted with one answer and 24 blanks; a saved guess flag; post-paper repair without changing its score; and genuine automatic timeout with 25 blanks.

## Content and release boundaries

Compare the shipped bank, profiles, phrases, images and PDFs to the base commit. None of their official Vietnamese text, keyed relationships, option order, motorcycle-critical flags or source pixels should change. Additional breakdowns and visual teaching explanations live separately in `teaching.mjs` and are excluded from strict papers.

The A/A1 profile remains verified only through 28 February 2027, Vietnam time. No later exam format is claimed. Source-specific cautions remain visible, including 44, 124, 260, 377 and 432.

## Limits and target-device check

Chromium phone emulation is not an actual Android-device or iOS Safari test. Audio still depends on an available Vietnamese browser voice; no independently reviewed recording set is bundled. English teaching support has no independent human certification. Exam-centre interface vocabulary is explicitly described as common vocabulary, not verified labels from a particular centre.

This cloud environment's configured network does not permit direct requests to the `github.io` site. Deployment verification therefore uses GitHub's Pages job and its published artifact, with local browser checks of the packaged output. It does not establish a live-site check from a physical phone.

Before relying on the app on your phone:

1. Open it online, wait for Ready offline, close/reopen it, then repeat in airplane mode.
2. Try a long option with large system text, both figures in question 362 and diagram zoom.
3. Make a backup, import it in another browser, and check your session and paper history.
4. For an app update, wait for the verified download and refresh online. An open paper must retain its selected answers and original deadline; no browser data needs to be cleared.

Physical-device results should be added here only after someone performs them. Local browser results do not certify real-device behaviour or all translations.

## Fixed-header follow-up

The first scrolling-header check used a fresh browser context. A real upgrade from `d200cc6` to `621a6a3` reproduced a fixed 66-pixel header even after reload: the old offline worker kept serving its cached page while the replacement waited for every app window to close.

`tests/header_update.py` covers upgrades from both releases, with either a saved study answer or an active timed paper. The replacement worker fully verifies its offline content before activation, leaves open documents running, and serves the replacement on a normal refresh. The test verifies that no automatic reload occurs, saved answers and paper deadlines survive, the question view has no branding element or reserved branding space, and offline reload uses the corrected layout. The normal date/settings row scrolls with the page; the bottom navigation remains accessible.

Follow-up verification on 27 October 2026 passed all four upgrade combinations (both old releases, with study or a timed paper open), the complete fresh-browser flow, all 12 engine checks, and the 145-file offline check for release `8a6358188e2493b05247fd96`.

## In-app logo and AMOLED appearance

The header and loading screen now use the same icon pack as the installed app. **Settings & backups → Appearance → AMOLED · Pure black** sets app surfaces to `#000000`, uses dark native controls and requests black browser chrome. Original source-image pixels remain unchanged. The appearance preference survives backups and offline use; a small local appearance cache also prevents a white loading flash.

Verification on 29 October 2026 passed 13 engine checks, the existing learning-flow checks, all four cached-upgrade scenarios and `tests/appearance.py`. The appearance checks cover the loading screen, current logo, pure-black surfaces, light/dark OS settings, widths of 320/390/768/1280 CSS pixels, reload, backup export/import and offline practice. Browser checks used Chromium phone emulation; actual Android status/navigation-bar rendering remains browser-controlled.

## Browser HTTP-cache follow-up

The original logo/appearance fix reproduced a delivery failure even after deleting site data: with a ten-minute HTTP cache for modules and CSS, Chromium fetched the new HTML but reused the previous `app.mjs` and `style.css`. The old imported engine also rejected AMOLED backups. Clearing IndexedDB, CacheStorage and service-worker storage did not remove that HTTP cache.

Packaging now generates content-hashed filenames for the full module graph and stylesheet. The offline worker downloads its manifest and checked files using release/checksum URLs, and online navigations fetch the current shell with the complete verified release retained for offline use. The app registers a worker URL tied to its module version; Settings shows that version for troubleshooting.

`tests/cache_update.py` warms the old release's actual modules and stylesheet, clears site storage while retaining the browser HTTP cache, then checks the new logo, AMOLED styling and exported-backup import against the deployed file layout. The existing appearance and cached-worker upgrade tests also cover the generated layout.
