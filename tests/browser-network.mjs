// Shared third-party request guard for the Playwright browser suites.
//
// The two language homes ship forty footer badge images (site/partials/footer.html,
// Issue #1466 keeps that row on the homes only) plus Cloudflare Web Analytics'
// beacon (scripts/build-pages.mjs), and some posts
// embed a YouTube iframe. The suites navigate with
// `goto(..., { waitUntil: "load" })`, which waits for all of them, so every run
// raced servers the tests do not own. On 2026-10-05 that turned CI's
// "Run browser layout tests" step into intermittent timeouts (Issue #871).
//
// `guardBrowserRequests` answers each third-party request inside Chromium:
// images get a transparent placeholder at the size the page declares, scripts
// get an empty 200, anything else is aborted. It also records the third-party
// requests that got a response without being intercepted, so a suite can
// assert none did with `assertNoExternalRequests`.
//
// The counters are module state, and Vitest isolates test files, so a counter
// covers exactly the pages the file that imported it opened.

// The footer badge embeds in site/partials/footer.html, each served here at its
// real source ratio so the rendered box proves the ratio rather than the
// vendor's declared size. Verified against the live sources on 2026-10-20:
// LaunchNest 205x36, AI Agents Directory 200x50, AI Agents Listing 200x50,
// Toolradar 280x80, Altern 430x151 (PNG), SaaSpa.ge 200x60 (SVG), Tooluck
// 336x88; on 2026-10-28 neeed.directory 139x44 (SVG, Issue #1092),
// zplatform.ai 250x60 (PNG, Issue #1092) and the DevHub badge on
// r2.direasy-multi-tenant.focusapps.app 150x44 (SVG, Issue #1094); and on
// 2026-10-29 startupfa.st 119x50 (SVG, Issue #1096 — the live URL answers
// 307 to www.startupfa.st, so both hosts are listed), artificin.com
// 551x175 (PNG, Issue #1096), toolpotion.ai 250x54 (SVG, Issue #1099 —
// its own width/height match the embed's declared box) and on 2026-10-30
// fazier.com 103x44 (SVG, Issue #1102 — the embed declares only the vendor's
// 120px width, so the source ratio comes from the file itself); and on 2026-10-30
// img.turbo0.com 482x161 (SVG viewBox 481.56x160.97, Issue #1116), toolfame.com
// 160x54 (SVG, Issue #1116), assets.dang.ai 550x198 (PNG — the vendor's embed
// declares the proportional 260x94, ours the PNG's own 550x198, Issue #1116)
// — Issue #1185 removed the launchigniter.com 212x55 badge, whose directory
// entry does not exist; and on 2026-10-30
// scoutforge.net 300x72 (SVG — its own width/height match the embed's declared
// box, Issue #1119); and on 2026-10-31 findly.tools 139x44 (SVG — measured on
// the live file, which the vendor's 175x55 snippet does not match, Issue #1129),
// www.founder.best 1195x390 (SVG — its own width/height and viewBox match the
// vendor's snippet, Issue #1132) and www.makeitla.st 252x76 (SVG — its own
// width/height and viewBox match the vendor's snippet, Issue #1132); and on
// 2026-10-31 aifordevelopers.org 220x48 (SVG, Issue #1134), uno.directory
// 146x44 (SVG — the vendor's snippet declares 120x30, Issue #1134),
// saascity.io 210x80 (SVG — the vendor's snippet declares 150x54, Issue #1134)
// and launchvault.dev 139x44 (SVG — the live URL answers 307 to
// www.launchvault.dev, which serves the same file, and the vendor's snippet
// declares only a 54px height, Issue #1134); and on 2026-11-03 supply-side
// measurements for the Issue #1160 badges — goodsaas.xyz 154x32 (SVG — its own
// width/height, and our snippet declares no box at all), 101aitools.com 360x72
// (SVG — its own width/height, our snippet's declared 360x72),
// vibedonalds.com 240x60 (SVG, our snippet's declared 240x60) and
// minylist.com 176x60 (SVG, our snippet's declared 176x60); and on 2026-11-04
// doforai.tools 538x169 (webp — its own pixels, which the vendor's 172x54
// snippet matches within 0.2%, Issue #1165); and on 2026-11-04 startupfa.me
// 468x148 (webp — measured on the Internet Archive's 2026-10-26 snapshot of
// the file, because Vercel's security checkpoint answers the live host with
// HTTP 429 from the delivery sandbox; the vendor's 171x54 embed box keeps
// that ratio within 0.14%, Issue #1168); and on 2026-11-04
// www.scrolllaunch.com 220x48 (SVG — its own width/height and its viewBox
// 0 0 220 48, the same box the vendor's embed declares, Issue #1169); and on
// 2026-11-06 yourhack.ai 131x20 (SVG — its own width/height, measured on the
// live file, Issue #1198); and on 2026-11-08 launchsoar.com 512x512 (PNG — its
// own pixel box, 12317 bytes on the live URL, Issue #1248) and
// ailaunch.space 225x61 (SVG — its own width/height and viewBox 0 0 225 61,
// Issue #1248); and on 2026-11-08 saasfame.com 170x54 (SVG — its own width/
// height and viewBox 0 0 170 54, Issue #1250) and www.pavelaunch.com 200x54
// (PNG — its own pixel box, 3393 bytes on the live URL; the vendor's embed
// snippet declares 250x54, the file it serves does not, Issue #1250); and on
// 2026-11-09 aitoolfame.com 190x54 (SVG — its own width/height and viewBox
// 0 0 190 54, 25294 bytes on the live URL, the ratio the vendor's
// "height: 54px; width: auto" embed implies, Issue #1259). On 2026-11-09 the
// Issue #1261 badges, each measured on the live URL: pickapps.org 320x96 (SVG,
// 939 bytes, its own width/height and viewBox 0 0 320 96, while the vendor's
// snippet declares only the 160px width), toolsclaw.com 146x44 (SVG, 955 bytes,
// its own width/height and viewBox 0 0 146 44 — the vendor's embed box declares
// 200x54, a different ratio, which is why the source file decides) and
// www.indietools.app 470x150 (PNG, 19187 bytes, its own IHDR pixel box, which the
// vendor's 176x56 snippet keeps within 0.31%).
// Since Issue #1038
// the shared footer rule renders every badge at 28px high, so the
// placeholder's natural size decides only the width the source ratio implies
// (e.g. LaunchNest 205/36 * 28 = 159.44).
export const BADGE_PLACEHOLDER_SIZES = [
  { host: "launchnest.io", width: 205, height: 36 },
  { host: "aiagentsdirectory.com", width: 168, height: 42 },
  { host: "aiagentslisting.com", width: 168, height: 42 },
  { host: "toolradar.com", width: 147, height: 42 },
  { host: "data.altern.ai", width: 430, height: 151 },
  { host: "saaspa.ge", width: 200, height: 60 },
  { host: "www.tooluck.org", width: 336, height: 88 },
  { host: "neeed.directory", width: 139, height: 44 },
  { host: "zplatform.ai", width: 250, height: 60 },
  { host: "r2.direasy-multi-tenant.focusapps.app", width: 150, height: 44 },
  { host: "startupfa.st", width: 119, height: 50 },
  { host: "www.startupfa.st", width: 119, height: 50 },
  { host: "artificin.com", width: 551, height: 175 },
  { host: "toolpotion.ai", width: 250, height: 54 },
  { host: "fazier.com", width: 103, height: 44 },
  { host: "img.turbo0.com", width: 482, height: 161 },
  { host: "toolfame.com", width: 160, height: 54 },
  { host: "assets.dang.ai", width: 550, height: 198 },
  { host: "scoutforge.net", width: 300, height: 72 },
  { host: "findly.tools", width: 139, height: 44 },
  { host: "www.founder.best", width: 1195, height: 390 },
  { host: "www.makeitla.st", width: 252, height: 76 },
  { host: "aifordevelopers.org", width: 220, height: 48 },
  { host: "uno.directory", width: 146, height: 44 },
  { host: "saascity.io", width: 210, height: 80 },
  { host: "launchvault.dev", width: 139, height: 44 },
  { host: "findstack.com", width: 180, height: 56 },
  { host: "goodsaas.xyz", width: 154, height: 32 },
  { host: "101aitools.com", width: 360, height: 72 },
  { host: "vibedonalds.com", width: 240, height: 60 },
  { host: "minylist.com", width: 176, height: 60 },
  { host: "doforai.tools", width: 538, height: 169 },
  { host: "startupfa.me", width: 468, height: 148 },
  { host: "www.scrolllaunch.com", width: 220, height: 48 },
  // Issue #1198: www.yourhack.ai is reached as the bare yourhack.ai host, and
  // the file measures 131x20 on the live URL (200, image/svg+xml), the same box
  // the vendor's embed snippet declares through its 20px-tall SVG.
  { host: "yourhack.ai", width: 131, height: 20 },
  // Issue #1248: both files measured on the live URLs (200 image/png 12317
  // bytes, and 200 image/svg+xml whose own box is 225x61).
  { host: "launchsoar.com", width: 512, height: 512 },
  { host: "ailaunch.space", width: 225, height: 61 },
  // Issue #1250: both files measured on the live URLs (200 image/svg+xml 1321
  // bytes with viewBox 0 0 170 54, and 200 image/png 3393 bytes at 200x54).
  { host: "saasfame.com", width: 170, height: 54 },
  { host: "www.pavelaunch.com", width: 200, height: 54 },
  // Issue #1259: measured on the live URL (200 image/svg+xml, 25294 bytes,
  // viewBox 0 0 190 54).
  { host: "aitoolfame.com", width: 190, height: 54 },
  // Issue #1261: all three measured on the live URLs (see the note above);
  // the source files, not the vendor embed boxes, set each ratio.
  { host: "pickapps.org", width: 320, height: 96 },
  { host: "toolsclaw.com", width: 146, height: 44 },
  { host: "www.indietools.app", width: 470, height: 150 },
  // 2026-11-11 pending reciprocal directory badges, each measured on the live URL:
  // linksalad.me 150x44 (SVG, 69415 bytes, viewBox 0 0 150 44), softwareontheweb.com
  // 292x56 (SVG source in the vendor <picture>, 1484 bytes, viewBox 0 0 292 56;
  // PNG fallback 584x112, same ratio), indiehunt.io 200x58 (SVG, 21738 bytes,
  // viewBox 0 0 200 58; vendor snippet declares 265x58), softwarecomoservicio.com
  // 178x40 (SVG, 952 bytes, viewBox 0 0 178 40), lift-off.sh 360x120 (webp VP8X,
  // 12918 bytes), dailylaunch.io 200x54 (SVG, 16234 bytes, viewBox 0 0 200 54),
  // thedevtoolslist.com / themicrosaasdir.com / theaitoolsdir.com / indielineup.com
  // 182x46 (SVG, viewBox 0 0 182 46; footer embed updated to the official 182x46
  // box), hypestar.org 140x24 (SVG, 929 bytes,
  // viewBox 0 0 140 24), productfame.com 195x54 (SVG, 1324 bytes, viewBox 0 0 195 54;
  // vendor snippet declares 245x54) and aitoolslist.tools 240x64 (SVG, 1125 bytes,
  // viewBox 0 0 240 64; vendor snippet declares 220x58). Source files set the
  // ratio. Text-only embeds (faxianai.com, aitoolscoop.com) have no image host.
  // www.topaitools4u.site 64x64 (SVG, 473 bytes, viewBox 0 0 64 64; the official
  // submit-page embed declares 32x32, same ratio).
  { host: "linksalad.me", width: 150, height: 44 },
  { host: "softwareontheweb.com", width: 292, height: 56 },
  { host: "indiehunt.io", width: 200, height: 58 },
  { host: "softwarecomoservicio.com", width: 178, height: 40 },
  { host: "lift-off.sh", width: 360, height: 120 },
  { host: "dailylaunch.io", width: 200, height: 54 },
  { host: "thedevtoolslist.com", width: 182, height: 46 },
  { host: "themicrosaasdir.com", width: 182, height: 46 },
  { host: "theaitoolsdir.com", width: 182, height: 46 },
  { host: "hypestar.org", width: 140, height: 24 },
  { host: "productfame.com", width: 195, height: 54 },
  { host: "aitoolslist.tools", width: 240, height: 64 },
  { host: "indielineup.com", width: 182, height: 46 },
  { host: "www.topaitools4u.site", width: 64, height: 64 },
  // 2026-11-12 PromptFrenzy directory badge, measured on the live URL:
  // www.promptfrenzy.com 220x44 (SVG, 950 bytes, width/height and viewBox 0 0 220 44;
  // the vendor snippet declares the same 220x44 box).
  { host: "www.promptfrenzy.com", width: 220, height: 44 },
  // 2026-11-12 Smol Launch featured badge, measured on the live URL:
  // smollaunch.com 250x60 (SVG, 35601 bytes, width/height 250x60 and
  // viewBox 0 0 187.5 44.999999, same 25:6 ratio; the vendor snippet
  // declares the same 250x60 box).
  { host: "smollaunch.com", width: 250, height: 60 },
  // 2026-11-13 FoundrList featured badge, measured on the live URL:
  // foundrlist.com 150x48 (SVG, 2390 bytes, width/height and viewBox 0 0 150 48;
  // the official vendor snippet declares the same 150x48 box).
  { host: "foundrlist.com", width: 150, height: 48 },
  // 2026-11-14 RoboDebut featured badge, measured on the live URL:
  // robodebut.com 180x40 (SVG, 831 bytes, width/height and viewBox 0 0 180 40;
  // the official vendor snippet declares the same 180x40 box).
  { host: "robodebut.com", width: 180, height: 40 },
  // 2026-11-14 MossAI featured badge, measured on the live URL:
  // mossai.org 140x54 (SVG, 1034 bytes, width/height and viewBox 0 0 140 54;
  // the official vendor snippet declares the same 140x54 box).
  { host: "mossai.org", width: 140, height: 54 },
  // 2026-11-14 Super Launch, Best AI Tool and IndieLaunch featured badges,
  // measured on the live URLs: super-launch.app 153x44 (SVG, 8797 bytes,
  // width/height and viewBox 0 0 153 44; the official vendor snippet
  // declares 200x54, a different ratio, so the source file decides),
  // www.bestaitool.co 153x44 (SVG, 48764 bytes, width/height and viewBox
  // 0 0 153 44; the official vendor snippet also declares 200x54), and
  // indielaunch.dev 200x54 (SVG, 1034 bytes, width/height and viewBox
  // 0 0 200 54; the official vendor snippet declares the same 200x54 box).
  { host: "super-launch.app", width: 153, height: 44 },
  { host: "www.bestaitool.co", width: 153, height: 44 },
  { host: "indielaunch.dev", width: 200, height: 54 },
  // 2026-11-15 BetterLaunch featured badge, measured on the live URL:
  // betterlaunch.app 196x72 (SVG, 58786 bytes, width/height and viewBox
  // 0 0 196 72; the vendor snippet declares the same 196x72 box, Issue #1332).
  { host: "betterlaunch.app", width: 196, height: 72 },
  // 2026-11-18 Hokai listed badge, measured on the live URL:
  // hokai.io 172x40 (SVG, 8412 bytes, width/height and viewBox 0 0 172 40;
  // the official vendor snippet on /for-vendors declares the same 172x40 box).
  // DevTool.io's official free-listing snippet is a styled text link with no
  // image, so it does not need a placeholder size here.
  { host: "hokai.io", width: 172, height: 40 },
  // 2026-11-18 Launch List live badge, measured on the live URL:
  // launch-list.org / www.launch-list.org 260x85 (SVG, 12008 bytes, width/height
  // and viewBox 0 0 260 85). The official Copy-code snippet on
  // /my-products/launch/{slug} (and the public /product/orbi/badges gallery)
  // styles the image at height 50px and does not declare width/height
  // attributes, so the source file decides the placeholder box. The snippet
  // uses the apex host; it redirects to www, so both hostnames are listed.
  { host: "launch-list.org", width: 260, height: 85 },
  { host: "www.launch-list.org", width: 260, height: 85 },
  // 2026-11-19 aidirecto brand badge, measured on the live URL:
  // aidirecto.com 236x56 (SVG, 11879 bytes, width/height and viewBox 0 0 236 56;
  // the official /badge embed for light sites declares the same 236x56 box,
  // with ?ref=your-tool as a placeholder — we use ?ref=orbi).
  { host: "aidirecto.com", width: 236, height: 56 },
  // 2026-11-19 PublishYourSaaS listed badge, measured on the live URL:
  // publishyoursaas.com 240x60 (SVG, 679 bytes, width/height and viewBox
  // 0 0 240 60; the official vendor snippet declares the same 240x60 box).
  { host: "publishyoursaas.com", width: 240, height: 60 },
  // 2026-11-19 LaunchPact listed badge, measured on the live URL:
  // www.launchpact.io 540x180 (PNG, 109094 bytes). The official vendor
  // snippet declares 180x60, the same 3:1 ratio, so the source file decides
  // the placeholder box. The snippet uses the www host.
  { host: "www.launchpact.io", width: 540, height: 180 },
  // 2026-11-19 LaunchIt featured badge, measured on the live URL:
  // launchit.fast 200x54 (SVG, 2036 bytes, width/height and viewBox 0 0 200 54).
  // The official vendor snippet does not declare width/height attributes,
  // so the source file decides the placeholder box.
  { host: "launchit.fast", width: 200, height: 54 },
  // 2026-11-19 Starter Best featured badge, measured on the live URL:
  // starterbest.com 184x54 (SVG, 2925 bytes, width/height and viewBox
  // 0 0 184 54). The official vendor snippet styles the image at
  // height 54px; width auto and does not declare width/height attributes,
  // so the source file decides the placeholder box. The asset path is the
  // official /badages-awards.svg spelling.
  { host: "starterbest.com", width: 184, height: 54 },
  // 2026-11-19 Days Launch featured badge, measured on the live URL:
  // dayslaunch.com 200x54 (SVG, 2919 bytes, width="200" height="54",
  // viewBox 0 0 184 54). Same family as Starter Best; the official
  // /badages-awards.svg asset returns 200 image/svg+xml and is linked
  // from public pages on both sites. The official-style snippet styles
  // the image at height 54px; width auto, so the source file decides
  // the placeholder box.
  { host: "dayslaunch.com", width: 200, height: 54 },
  // 2026-11-19 MegaLaunch featured badge, measured on the live URL:
  // megalaun.ch /badges/featured/asset 280x72 (SVG, 795 bytes, width/height
  // and viewBox 0 0 280 72). The official embed on /badges/featured
  // declares 220x57, a different box, so the source file decides the
  // placeholder. Orbi has no product slug yet, so the href is the
  // official homepage (their docs also accept a link to MegaLaunch).
  { host: "megalaun.ch", width: 280, height: 72 },
  // 2026-11-19 SuperLaunch List featured badge, measured on the live URL:
  // superlaunchlist.com /badge.svg 174x42 (SVG, 1491 bytes, width/height
  // and viewBox 0 0 174 42). This is the official badgeHtml() snippet
  // from their public pricing/submit JS (no product ref query).
  { host: "superlaunchlist.com", width: 174, height: 42 },
  // 2026-11-19 AInexfinder official Free Launch badge logo, measured on
  // the live URL: ainexfinder.com /brand/ainexfinder-logo-white.png
  // 1186x182 (PNG, 194200 bytes). The official submit-page snippet
  // styles the image at height 22px; width auto.
  { host: "ainexfinder.com", width: 1186, height: 182 },
  // 2026-11-19 PostYourStartup featured badge, measured on the live URL:
  // postyourstartup.com /api/badge/orbi?theme=light 212x55 (SVG, 16929
  // bytes, width/height and viewBox 0 0 212 55; the official vendor
  // snippet declares the same 212x55 box).
  { host: "postyourstartup.com", width: 212, height: 55 },
  // 2026-11-20 DiscoverLaunches featured badge, measured on the live URL:
  // discoverlaunches.com /badge/orbi.svg 212x48 (SVG, 787 bytes, width/height
  // and viewBox 0 0 212 48; the official vendor snippet declares the same
  // 212x48 box). The listing /product/orbi returns 200.
  { host: "discoverlaunches.com", width: 212, height: 48 },
  // 2026-11-20 ProductPerch Discover badge, measured on the live URL:
  // productperch.com /badges/discover-light.svg 220x54 (SVG, 1211 bytes,
  // width/height and viewBox 0 0 220 54; the official vendor snippet
  // declares the same 220x54 box).
  { host: "productperch.com", width: 220, height: 54 },
  // 2026-11-20 LaunchPanda launched badge, measured on the live URL:
  // launchpanda.dev /images/badges/launchpanda-badge.svg 260x64 (SVG, 1896
  // bytes, width/height and viewBox 0 0 260 64; the official vendor snippet
  // declares the same 260x64 box). The apex host 301s to www, so both
  // hostnames are listed.
  { host: "launchpanda.dev", width: 260, height: 64 },
  { host: "www.launchpanda.dev", width: 260, height: 64 },
  // 2026-11-20 The One Startup featured badge, measured on the live URL:
  // theonestartup.com /badages-awards.svg 230x54 (SVG, 2923 bytes,
  // width="230" height="54", viewBox 0 0 225 54). Official typo
  // "badages" kept exact, same family spelling as Starter Best / Days Launch.
  // The official snippet styles the image at height 54px; width auto and does
  // not declare width/height attributes, so the source file decides the
  // placeholder box.
  { host: "theonestartup.com", width: 230, height: 54 },
  // 2026-11-20 The Launch Directory listed badge, measured on the live URL:
  // thelaunchdirectory.com /badge/orbi.svg?... 250x54 (SVG, 1003 bytes,
  // width/height and viewBox 0 0 250 54; the official vendor snippet
  // declares the same 250x54 box). Official /badge/orbi.js (343 bytes)
  // is kept in the footer; browser tests already stub third-party scripts.
  { host: "thelaunchdirectory.com", width: 250, height: 54 },
  // 2026-11-20 ConfettiSaaS official badge, measured on the live URL:
  // confettisaas.com /badge-light.svg 250x54 (SVG, 12269 bytes, width/height
  // and viewBox 0 0 250 54; the official vendor snippet declares the same
  // 250x54 box).
  { host: "confettisaas.com", width: 250, height: 54 },
  // 2026-11-20 So Product featured badge, measured on the live URL:
  // soproduct.com /badages-awards.svg 184x54 (SVG, 2918 bytes, width/height
  // and viewBox 0 0 184 54). Official typo "badages" kept exact, same family
  // spelling as Starter Best / Days Launch / The One Startup. The official
  // snippet styles the image at height 54px; width auto, so the source file
  // decides the placeholder box.
  { host: "soproduct.com", width: 184, height: 54 },
  // 2026-11-20 ProductWill featured badge, measured on the live URL:
  // productwill.com /badages-awards.svg 190x54 (SVG, 2925 bytes,
  // width="190" height="54", viewBox 0 0 184 54). Official typo "badages"
  // kept exact. The official snippet styles the image at height 54px; width
  // auto, so the source file decides the placeholder box.
  { host: "productwill.com", width: 190, height: 54 },
  // 2026-11-20 Another Directory listed badge, measured on the live URL:
  // another.directory /badges/listed-light.svg 214x48 (SVG, 1004 bytes,
  // width/height and viewBox 0 0 214 48; the official vendor snippet
  // declares the same 214x48 box). The listing /tools/orbi is expected
  // to go live after the badge is found.
  { host: "another.directory", width: 214, height: 48 },
  // 2026-11-20 LaunchBuff featured badge, measured on the live URL:
  // launchbuff.com /badge-featured-dark.svg 256x80 (SVG, 1153 bytes,
  // width/height and viewBox 0 0 256 80; the official vendor snippet
  // declares the same 256x80 box). The listing /products/orbi-hii2su is
  // expected to go live after the badge is verified.
  { host: "launchbuff.com", width: 256, height: 80 },
  // 2026-11-20 AI Jet featured badge, measured on the live URL:
  // aijet.cc /badge/badge_light.svg 200x55 (SVG, 1158 bytes,
  // width/height and viewBox 0 0 200 55; the official vendor snippet
  // declares the same 200x55 box).
  { host: "aijet.cc", width: 200, height: 55 },
  // 2026-11-20 Launchpadly listed-on badge, measured on the live URL:
  // launchpadly.co /embed/badges/startup/orbi.svg?variant=listed-on
  // 260x48 (SVG, 1183 bytes, width/height and viewBox 0 0 260 48; the
  // official vendor snippet declares the same 260x48 box). The listing
  // /startup/orbi is expected to go live after the badge is verified.
  { host: "launchpadly.co", width: 260, height: 48 },
  // 2026-11-21 Sell With Boost listed badge, measured on the live URL:
  // sellwithboost.com /badge/listing.svg 160x40 (SVG, 2624 bytes,
  // width="160" height="40"; the official vendor snippet styles the
  // image at height 40px; width auto, so the source file decides the
  // placeholder box).
  { host: "sellwithboost.com", width: 160, height: 40 },
  // 2026-11-21 NewTool.site featured badge, measured on the live URL:
  // newtool.site /badges/newtool-light.svg 210x54 (SVG, 115904 bytes,
  // width/height and viewBox 0 0 210 54). Official snippet uses
  // height = "54px" width = "auto" (spacing kept exact), so the source
  // file decides the placeholder box. The listing /item/orbi returns 200.
  { host: "newtool.site", width: 210, height: 54 },
  // 2026-11-21 StartupTrusted verified badge, measured on the live URL:
  // startuptrusted.com /api/badge?type=verified&style=light 240x54
  // (SVG, 889 bytes, width/height and viewBox 0 0 240 54; the official
  // vendor snippet declares the same 240x54 box).
  { host: "startuptrusted.com", width: 240, height: 54 },
  // 2026-11-21 SaasHunt featured badge (official snippet from
  // saashunt.best/legal/badges), measured on the live URL:
  // /images/badges/featured-on-light.svg 150x44 (SVG, viewBox 0 0 150 44).
  { host: "saashunt.best", width: 150, height: 44 },
  // 2026-11-21 Shipstry backlink badge (snippet from the Shipstry submit
  // form), measured on the live URL: /badges/featured.svg 220x52.
  { host: "shipstry.com", width: 220, height: 52 },
  // 2026-11-21 Toolhunter badge (/badge/<slug>.svg format used by verified
  // listings), measured on the live URL: /badge/orbi.svg 200x50.
  { host: "toolhunter.ai", width: 200, height: 50 },
  // 2026-11-22 BuiltByIndies badge, measured on the live URL:
  // /badge/fc534ac5-27de-42de-ad1e-078f3151c36e.svg 250x60 (SVG, 15868
  // bytes, width/height and viewBox 0 0 250 60; the official vendor snippet
  // declares height 60 and the same file, Issue #1429).
  { host: "builtbyindies.com", width: 250, height: 60 },
  // 2026-11-22 LaunchOnIt featured badge, measured on the live URL:
  // /api/badge/orbi?theme=light&size=md&type=featured 151x48 (SVG, 2210 bytes,
  // width/height and role="img"; the official vendor snippet declares no box,
  // so the source file decides the placeholder). The listing
  // /products/orbi answers 200 and is expected to go dofollow after the
  // crawler finds this badge (Issue #1435).
  { host: "launchon.it", width: 151, height: 48 },
  // 2026-11-24 ToolPilot official "Featured Badge White", measured on the live
  // URL the vendor's brand-guidelines page embeds:
  // /cdn/shop/files/f-w_690x151_crop_center.png 300x66 (PNG, 2407 bytes; the
  // CDN serves this crop at 300x66 and the vendor's own snippet declares the
  // same box). Only the dedicated /toolpilot/ page carries it (Issue #1439).
  { host: "www.toolpilot.ai", width: 300, height: 66 },
  // 2026-11-24 LaunchScaler official badge embed (Credential / Dark / Outlined),
  // measured on the live URL:
  // /api/badge/orbi.build/image?theme=dark&variant=credential&tone=outline
  // 272x58 (SVG, width="272" height="58" viewBox="0 0 272 58"; the vendor's own
  // snippet declares the same 272x58 box). The snippet's /v/orbi.build?t=<token>
  // link answers 307 to /launches/orbi.build, the listing (Issue #1454).
  { host: "www.launchscaler.com", width: 272, height: 58 },
  // 2026-11-25 TheDevToolsIndex official badge, measured on the live URL:
  // /badge/orbi.svg 182x46 (SVG, 1306 bytes, width/height and viewBox 0 0 182 46;
  // same series and box as TheDevToolsList / TheMicroSaaSDir / TheAIToolsDir).
  { host: "thedevtoolsindex.com", width: 182, height: 46 },
  // 2026-11-25 PeplioHUB official badge for listing 10123, measured on the live
  // URL: /wp-json/pepliohub/v1/badge/10123 250x56 (SVG, 724 bytes, width/height
  // and viewBox 0 0 250 56; the vendor snippet declares the same 250x56 box).
  { host: "peplio.com", width: 250, height: 56 },
  // 2026-11-26 SwipeToLaunch official badge, measured on the live URL:
  // /api/badge/orbi 220x48 (SVG, 9357 bytes, width/height and viewBox 0 0 220 48;
  // the vendor snippet declares the same 220x48 box). The free listing at
  // /p/orbi goes live after this badge is found in the server-rendered homepage.
  { host: "swipetolaunch.com", width: 220, height: 48 },
  // 2026-11-27 ShapelessAI official card, logo-mark.png declared 54x30
  // (source PNG 256x141, displayed at height 30px / width auto ≈ 54).
  // The listing at /ai-tools/orbi stays followed after this card is found
  // in the server-rendered homepage.
  { host: "shapelessai.com", width: 54, height: 30 },
  // 2026-11-27 AI SaaS Dir official badge, measured on the live URL:
  // /badge.svg 220x56 (SVG, 1109 bytes, width/height and viewBox 0 0 220 56;
  // the vendor snippet declares the same 220x56 box). The free listing at
  // /tools/orbi is awaiting_badge until this badge is on the homepage.
  { host: "aisaasdir.com", width: 220, height: 56 },
  // 2026-11-27 four free listings that verify a followed homepage badge
  // before the submit form unlocks (orbi-growth backlinks.md, 2026-11-27
  // login batch). Sizes measured on the live URLs: indietool.io /badge.svg
  // 236x54 (viewBox 0 0 236 54); mylaunchstash badge.png 234x54;
  // launchclash badge.png 197x54; aitechviral badge.png 192x54.
  { host: "www.indietool.io", width: 236, height: 54 },
  // 2026-11-27 VouchDex badge (orbi-growth #1706): /badge/orbi.svg measured on
  // the live URL (200 image/svg+xml, 1011 bytes, width/height and viewBox
  // 0 0 190 52; the vendor's "Get the code" snippet declares the same box).
  { host: "vouchdex.com", width: 190, height: 52 },
  // 2026-11-28 Nexora Launch listed badge (Issue #1528), measured on the live
  // URL: /badge/orbi.svg?kind=listed&shape=standard&mode=light&size=m&v=2
  // 250x54 (SVG, 1131 bytes, width/height and viewBox 0 0 250 54; the vendor
  // receipt declares the same 250x54 box).
  { host: "nexoralaunch.com", width: 250, height: 54 },
  { host: "mylaunchstash.com", width: 234, height: 54 },
  { host: "launchclash.com", width: 197, height: 54 },
  { host: "aitechviral.com", width: 192, height: 54 },
];
const FALLBACK_PLACEHOLDER_SIZE = { width: 1, height: 1 };

const blockedRequests = new Set();
const interceptedRequests = new WeakSet();

function isNetworkUrl(url) {
  return url.protocol === "http:" || url.protocol === "https:";
}

export function placeholderSvg(url) {
  const size = BADGE_PLACEHOLDER_SIZES.find((badge) => badge.host === new URL(url).hostname)
    ?? FALLBACK_PLACEHOLDER_SIZE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"></svg>`;
}

// Answer every request that is not the local test server from inside the
// browser, and remember the ones that were not answered.
export function guardBrowserRequests(context, origin) {
  const localOrigin = new URL(origin).origin;

  // Count a third-party request only once a response for it arrives. A lazy
  // footer badge can start loading while the page is closing: the "request"
  // event fires, the page is gone before the route handler runs, and the
  // request is cancelled without touching the network. Counting it on
  // "request" made that teardown race a guard failure (PR #893, run 37728049058).
  context.on("response", (response) => {
    const request = response.request();
    const url = new URL(request.url());
    if (!isNetworkUrl(url) || url.origin === localOrigin) return;
    blockedRequests.add(request);
  });

  // Issue #1330: every page loads PostHog through Cloud's forwarder, so the
  // browser asks the origin under test for /api/ph/static/array.js. Cloud owns
  // /api/*, the local static server has no file there, and Chromium reports the
  // 404 as a console error that a suite asserting a clean console would count
  // as a page defect. Answer it with an empty script, the same way a
  // third-party script is answered just below.
  context.route(
    (url) => isNetworkUrl(url) && url.origin === localOrigin && url.pathname.startsWith("/api/ph/"),
    (route) => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "" }),
  );

  return context.route(
    (url) => isNetworkUrl(url) && url.origin !== localOrigin,
    (route) => {
      const request = route.request();
      interceptedRequests.add(request);
      if (request.resourceType() === "image") {
        return route.fulfill({
          status: 200,
          contentType: "image/svg+xml",
          body: placeholderSvg(request.url()),
        });
      }
      if (request.resourceType() === "script") {
        return route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "" });
      }
      return route.abort();
    },
  );
}

// browser.newPage() opens its own context; guard that context before the page
// can navigate. Page options (deviceScaleFactor, viewport) are context options,
// so they are passed through untouched.
export async function guardedPage(browser, origin, options) {
  const page = await browser.newPage(options);
  await guardBrowserRequests(page.context(), origin);
  return page;
}

// Third-party requests the guard saw but did not intercept: they went to the
// real external network.
export function allowedExternalRequests() {
  return [...blockedRequests]
    .filter((request) => !interceptedRequests.has(request))
    .map((request) => request.url());
}

export function assertNoExternalRequests() {
  const allowed = allowedExternalRequests();
  if (allowed.length > 0) {
    throw new Error(
      `${allowed.length} third-party request(s) reached the network because nothing intercepted them: `
      + allowed.join(", "),
    );
  }
}
