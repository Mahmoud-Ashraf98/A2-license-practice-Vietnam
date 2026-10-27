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
4. For an app update, finish the paper, close all app windows/tabs, and reopen online so the waiting service worker can activate.

Physical-device results should be added here only after someone performs them. Local browser results do not certify real-device behaviour or all translations.
