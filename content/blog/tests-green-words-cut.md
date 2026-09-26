---
title: Every test passed. 193 words were cut in half.
date: 2026-09-26
summary: A mobile table fix shipped to beta with every overflow test green. A 390px screenshot showed “Individual” split across four lines on 25 of 34 pages. What the tests measured, what they couldn't see, and what we kept.
lang: en
author: Orbi
image: /img/blog-tests-green.png
mirror: tests-green-words-cut
---

On September 25, the comparison and pricing tables on orbi.build had a mobile bug. They were forced to 620px wide, so on a phone the first column sat in a wide empty strip and the data columns were cut off the right edge. [Issue #522](https://github.com/orbi-build/orbi-website/issues/522) asked for the tables to fit a 390px screen on all 34 pages that have one. Orbi delivered it as [PR #523](https://github.com/orbi-build/orbi-website/pull/523): drop the 620px minimum, and let cells wrap with `overflow-wrap: anywhere`. The tests measured horizontal overflow on every table page. Zero overflow, all green, merged, deployed to beta.

Then we looked at a screenshot.

![The Orbi vs Devin pricing table at 390px after the first fix: "Free" is split into "Fr" and "ee", "Individual" into four lines](/img/blog-tests-green-before.png)

"Free" became "Fr / ee". "Individual" took four lines. The header "PLAN" broke after "PLA". We walked all 34 pages at 390px and counted words that a line break had split in the middle: 193 of them, on 25 pages. Overflow was still zero. The tests were right about what they measured. They measured the wrong thing.

### Why it happened

`overflow-wrap: anywhere` lets the browser break a word at any character, and it also lowers the smallest width a cell can shrink to, down to one character. A table in auto layout gives each column at least that minimum and shares out the rest. So the first column, which holds short labels, got squeezed to a few characters, and every label in it broke.

```css
/* PR #523: a column can
   shrink to one character */
td { overflow-wrap: anywhere; }

/* PR #530: break a word only
   when it would overflow */
td { overflow-wrap: break-word; }
```

The obvious fix was `overflow-wrap: break-word`, which only breaks a word when it would otherwise overflow. We measured that before filing anything. It brought the split words to zero and put 13 pages back into horizontal overflow, with tables 349 to 457 pixels wide on a 390px screen. The columns had nowhere to go.

What worked was changing the layout rather than the wrapping. On a phone, any table with three or more columns now stacks row by row, each cell labeled with its column header. Only two-column tables keep the table form, and those use `break-word`. Code identifiers such as `rewrite_active_milestone_line` may still break anywhere, because breaking one of those mid-name is normal.

That became [Issue #526](https://github.com/orbi-build/orbi-website/issues/526), written with the measurements above so the fix was decided before anyone started. Orbi delivered it in [PR #530](https://github.com/orbi-build/orbi-website/pull/530) in 32 minutes. A second pass ([#531](https://github.com/orbi-build/orbi-website/issues/531)) added side padding, after the stacked text turned out to sit flush against the table border.

![The same table at 390px after the fix: each plan is a stacked block, and "Individual" and "Team / scale" read as whole words](/img/blog-tests-green-after.png)

The same walk after both fixes: 0 split words, 0 overflowing tables, and at least 16px between any text and the table border, on beta and again on production.

### The test we added, and then removed

PR #530 added a browser test that visits every table page at 390px and checks each run of letters or digits outside `<code>`. If one run lands on two lines, the test fails. It also had a counter-test: force `overflow-wrap: anywhere` back on and confirm the detector goes red. It did.

A day later we deleted it, with the other layout assertions from those PRs ([#540](https://github.com/orbi-build/orbi-website/issues/540)). The website had gained 1,906 lines of tests against 377 lines of source, and most of those tests pinned wording, coordinates or CSS strings, so every copy change dragged a test change behind it. This one pinned less than most, and it still went out with the batch.

What we kept is the step that caught the bug in the first place: before anything is promoted from beta to production, someone opens the changed pages at 390px and 1440px, in English and Chinese, and looks. The test measured the property someone had named. The screenshot showed a problem nobody had named yet.

### What this says about delivering unattended

Orbi merged PR #523 because its tests passed and its review found nothing. Both were true. The gap was between "the ticket's acceptance criteria hold" and "the page is fine", and no agent, human or AI, closes that gap by trying harder at the criteria it was given. It closes when someone looks at the result and turns what they saw into the next ticket. Here that took one screenshot and about three hours.

If you run an agent that merges its own work, what do you look at before you trust a green run?

## Related

The fix, with the numbers above, is [orbi-website#526](https://github.com/orbi-build/orbi-website/issues/526). Read the [Devin comparison](/compare/devin/) the screenshots come from, and [Cloud](/cloud/).
