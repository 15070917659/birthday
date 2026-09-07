# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A static, dependency-free, single-page "生日时光纪念册" (birthday memory album) for 李思雨, built with plain HTML/CSS/JS — no framework, no build step, no package manager. The user runs it by double-clicking `index.html` under the `file://` protocol, so nothing may depend on an HTTP server.

There are no build/lint/test commands. To verify changes, open `index.html` in a browser (mobile viewport matters most — the UI is touch-first). All comments and user-facing copy in the code are Chinese; keep that convention when editing.

## Data flow & file roles

- `data/pages.js` — the **authoritative** content source. It assigns `window.PAGES_DATA` via a `<script>` tag loaded before `js/app.js`, specifically to bypass `file://` CORS restrictions. Schema: `{ background, music, cover: {badge,title,name,subtitle,wish}, ending: {title,name,text,emoji}, pages: [{time,title,desc}] }`.
- `data/pages.json` — a byte-for-byte duplicate of the same data. `loadData()` in `js/app.js` prefers `window.PAGES_DATA` and only `fetch()`s this file as fallback (works only over HTTP). **When editing page content, update both files in sync.**
- `index.html` — fixed DOM skeleton: background layers, cover overlay, carousel stage, ending overlay, pager, nav/music buttons. The `<title>` hardcodes "李思雨 · 生日时光纪念册". Renders overlays by injecting HTML from data with template literals.

## Core mechanics (`js/app.js`, single file)

1. `main()` loads data, fills the cover overlay ("点击进入" hides it), builds one `.carousel-item` per `pages` entry, then streams images.
2. **Image convention (critical):** the page at array index `i` maps to `图片/{i+1}.jpg` (see `CONFIG.imagesDir` / `imageExt`). Images are probed with 2 concurrent workers; the first load failure sets `probeStop`, halting all remaining loads — so numbered images must exist and be contiguous from `1.jpg`. Missing image → that card shows "未配置图片".
3. Each card is sized from the image's real aspect ratio via `calcCardSize`, clamped by `CONFIG.maxCardWidth/Height` (380×520) and `minCardWidth/Height` (280×360), then laid out on a 3D ring.
4. `Carousel` class — cards arranged via per-card inline CSS vars `--angle`/`--radius`, ring rotated by `rotateY()` on `.carousel-track`. Physics: drag/swipe with velocity + friction decay (rAF loop), snap-to-card easing, prev/next buttons, arrow-key/space/Enter (flip current card), pager dots, click-on-card to flip vs `goTo()`. `fillHearts()` and `fitTextSize()` adjust card-back decorations to each card's actual rendered size.
5. `MusicController` — `<audio>` from `data.music` (default `音乐/bgm.mp3`). Autoplay is attempted on the first user click/touch/keydown anywhere (browser autoplay-policy workaround). Missing file → tooltip telling user to put an mp3 in `音乐/`.
6. Effects: falling petals (`startPetals`), background mouse parallax (`bindParallax`, desktop only).
7. Debug hooks: `window.carousel` and `window.music` are exposed globally.

## Layout & theming (`css/style.css`)

One stylesheet organized in numbered sections (背景层 / petals / carousel / cards / cover / ending / music / pager). Theme colors are `:root` CSS vars (`--pink`, `--gold`, `--deep`, `--soft`). Google Fonts (Ma Shan Zheng, ZCOOL KuaiLe, Noto Serif SC) load from CDN — requires internet; the site should degrade gracefully without it. `body` is `position: fixed; touch-action: none` — the page is a locked viewport by design.

## Assets

- `图片/` — `1.jpg`–`16.jpg` (one per page, numbered as above) plus `背景图.jpg` (`CONFIG.bgFallback`, also referenced in data as `background`).
- `音乐/` — background music mp3.
- Directory/file names contain Chinese characters; they are hardcoded string paths in `CONFIG` and the data files — do not rename folders without updating all references.
