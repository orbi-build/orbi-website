# Codex YOLO article figures

The four SVG files here are author-drawn diagrams, not product screenshots.
They use the website's paper, ink, night, signal and run colors. The article
embeds lossless WebP renders, each 1800 px wide, with matching English and
Chinese text. Logical SVG width is 600 px; primary labels are 28 px and body
labels are 26 px, approximately 16 px and 15 px at a 342 px article width.

Serve the repository root on localhost, then use the shared `core.snap`
library with a 600 px viewport and device scale factor 3. Convert the resulting
PNG to lossless WebP using Pillow. Preserve the SVG dimensions and do not
stretch the image.

The boundaries figure describes the experiment documented in
[`codex-yolo-mode-lab.md`](../codex-yolo-mode-lab.md). Its network was left on.
The Orbi figure shows a successful delivery path. Pending or failed repository
checks can stop that path, as explained in the article. Release initiation is
drawn separately: the user clicks in Cloud, Cloud creates the release Issue,
and Orbi runs the release gates. No arrow connects merge directly to release.

`blog-codex-yolo-release-proof.webp` is an unmodified crop of the public
GitHub release notes at
<https://github.com/orbi-build/orbi/releases/tag/v0.5.60>, captured on
2026-10-16. It shows the tag, release commit, release Issue #1522 and closed
scope Issues #1518 and #1519. It is a historical release record, not a Cloud
UI screenshot. Capture the `[data-test-selector="body-content"]` element
using snap's iPhone 13 preset at DPR 6 (324 CSS px element width), then crop
pixel rectangle `(0, 3060, 1944, 4884)`. Output size is 1944 × 1824.
