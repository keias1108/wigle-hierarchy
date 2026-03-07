Original prompt: ui가 안 깔끔한 부분들이 있어. 설명도 굳이 넣을 필요 없는 것도 많고, 캔버스도 차트에 가려져. Playwright MCP를 사용하여 내 웹사이트를 테스트하세요. 웹사이트를 열고 메인 페이지를 클릭해보고 잘못된 부분이 없는지 확인하세요.

- 2026-03-07: Playwright CLI on WSL could not use Windows Chrome. Installed temporary Playwright package under `/tmp/pwtest` to test the local site from WSL without modifying the project dependencies.
- 2026-03-07: Cleaned the `wigle-u-2d` UI around hierarchy-first use. Removed the broken logo dependency and extra explainer card, added an inline SVG favicon, reduced sidebar noise, made the chart toggle opt-in, and compacted the recording controls so they no longer overlap the canvas.
- 2026-03-07: Verified with Playwright in WSL using the cached Chromium binary. No console errors or 404s remained after the cleanup. Main page interactions tested: chart toggle, mode button click, canvas click. Final artifact screenshots: `output/playwright/ui-main.png`, `output/playwright/ui-interacted.png`.
