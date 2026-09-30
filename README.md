# Issue #669 screenshot evidence

These are public navigation screenshots for
[orbi-build/orbi-website#669](https://github.com/orbi-build/orbi-website/issues/669),
captured on 2026-10-01 (Asia/Singapore).

- `before-production/`: live https://orbi.build/ and /zh/, headed Chromium,
  desktop 1440 CSS px and mobile 390 CSS px. The mobile navigation is open.
  Desktop images show the header crop. Measurements accompany the images.
- `after-local/`: delivery agent's local-build browser gate screenshots for
  PR #670, source commit `6d30821a2fbe5bbd3a6a99dc0a639b41e001f985`.
  Desktop 1440 CSS px and mobile 390 CSS px; the navigation area was cropped
  and enlarged by the review process. The yellow outline is keyboard focus.
  These images are NOT deployed-beta or production acceptance evidence.

At the time of the initial evidence upload, the beta page still used the old text
arrow; the post-merge beta deployment run 36747622921 was skipped. PR #673
promoted the earlier beta snapshot and did not contain #670. Do not infer a
production rollout from the local-build images.

This orphan evidence branch contains screenshots only; it is not a website
development or production branch and is not intended to be merged.

## Deployed beta verification added later on 2026-10-01

`after-beta/` contains screenshots from the real, headed Chrome browser visiting
https://beta.orbi.build/ and /zh/, EN/ZH at 1440px and 390px. They were captured
after deployment 36748920317 published the navigation fix; the later final
promotion candidate 110dcb4e also completed beta deployment 36750293369.

Both dropdowns passed click, Enter, Space, Tab-to-first-item and Escape with
focus restoration in all four views. Arrow/text center deltas were approximately
0.27px on desktop and 0.10px on mobile; the fixed SVG path is symmetric around
the 16px viewBox center. See the accompanying measurements JSON.

Classic desktop scrollbars at a 390px viewport expose about 8px horizontal
overflow from the existing 100vw expanded navigation. Old production and fixed
beta have the same clientWidth=375, scrollWidth=383, navWidth=390 baseline.
This was recorded in PR #681, not silently reported as an overflow-free page.

PR #681 promotes beta directly to main, including the dropdown fix, promotion
source guard and newsletter routing. The merged production source is
5cd116b02b2c56c0a6b26c9ad7ae6d3f80c2f72d. Production workflow 36751539012
was dispatched and its production environment approval was submitted normally.
