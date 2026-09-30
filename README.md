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

At the time of this evidence upload, the beta page still used the old text
arrow; the post-merge beta deployment run 36747622921 was skipped. PR #673
promoted the earlier beta snapshot and did not contain #670. Do not infer a
production rollout from the local-build images.

This orphan evidence branch contains screenshots only; it is not a website
development or production branch and is not intended to be merged.
