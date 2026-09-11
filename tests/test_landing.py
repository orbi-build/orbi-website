#!/usr/bin/env python3
"""Read the shipped landing HTML, not a fixture."""

from html.parser import HTMLParser
from html import unescape
from pathlib import Path
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
EN_PATH = ROOT / "public" / "index.html"
ZH_PATH = ROOT / "public" / "zh" / "index.html"
WORKER_PATH = ROOT / "src" / "worker.js"

GITHUB = "https://github.com/orbi-build/orbi"
DOCS_EN = "https://docs.orbi.build"
DOCS_ZH = "https://docs.orbi.build/zh"
ROADMAP = "https://github.com/orbi-build/orbi/milestones"


# Tags that start a new line in a rendered page. Text either side of one is
# separate words; text either side of an inline tag (<strong>, <span>, <em>)
# is not, and joining across those would invent boundaries the DOM lacks.
BREAKING_TAGS = frozenset(
    """br p div section article header footer main nav aside ul ol li dl dt dd
    h1 h2 h3 h4 h5 h6 figure figcaption blockquote pre table tr td th form
    fieldset legend hr button option""".split()
)

HEADING_TAGS = frozenset({"h1", "h2", "h3", "h4", "h5", "h6"})


class PageParser(HTMLParser):
    """Reads page text the way a browser builds textContent.

    Whitespace comes from the markup, never from the joining, so an
    assertion here fails on exactly what a crawler would misread.
    """

    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[tuple[str, str]] = []
        self._href: str | None = None
        self._buf: list[str] = []
        self.text_chunks: list[str] = []
        self.elements: list[tuple[str, dict[str, str]]] = []
        # Each heading twice: as textContent gives it (a crawler's view, where a
        # bare <br> leaves no separator) and as a reader sees it rendered.
        self.headings: list[str] = []
        self.headings_rendered: list[str] = []
        self._heading: list[str] | None = None
        self._heading_rendered: list[str] | None = None

    def _break(self) -> None:
        if self.text_chunks and self.text_chunks[-1] != "\n":
            self.text_chunks.append("\n")

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        got = {k: v or "" for k, v in attrs}
        self.elements.append((tag, got))
        if tag in BREAKING_TAGS:
            self._break()
            if self._heading_rendered is not None:
                self._heading_rendered.append("\n")
        if tag in HEADING_TAGS:
            self._heading = []
            self._heading_rendered = []
        if tag == "a":
            self._href = got.get("href", "")
            self._buf = []

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag in BREAKING_TAGS:
            self._break()
        if tag in HEADING_TAGS and self._heading is not None:
            self.headings.append("".join(self._heading).strip())
            self.headings_rendered.append(
                " ".join("".join(self._heading_rendered or []).split())
            )
            self._heading = None
            self._heading_rendered = None
        if tag == "a" and self._href is not None:
            self.hrefs.append(("".join(self._buf).strip(), self._href))
            self._href = None
            self._buf = []

    def handle_data(self, data: str) -> None:
        self.text_chunks.append(data)
        if self._href is not None:
            self._buf.append(data)
        if self._heading is not None:
            self._heading.append(data)
        if self._heading_rendered is not None:
            self._heading_rendered.append(data)

    @property
    def text(self) -> str:
        """Rendered text with runs of whitespace collapsed, as a reader sees it."""
        return " ".join("".join(self.text_chunks).split())


def parse(path: Path) -> tuple[str, PageParser]:
    html = path.read_text(encoding="utf-8")
    page = PageParser()
    page.feed(html)
    return html, page


def font_families(html: str) -> list[str]:
    """Font families the page requests from the Google Fonts css2 API.

    Fonts are loaded through one stylesheet URL whose query names the
    families, so this is the whole static font surface of a page.
    """
    families: list[str] = []
    for match in re.finditer(r'fonts\.googleapis\.com/css2\?([^"]+)"', html):
        families += re.findall(r"family=([A-Za-z0-9+]+)", match.group(1))
    return families


class LandingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.en_html, cls.en = parse(EN_PATH)
        cls.zh_html, cls.zh = parse(ZH_PATH)

    def test_english_is_the_default_page(self) -> None:
        self.assertIn('lang="en"', self.en_html)
        self.assertIn('rel="canonical" href="https://orbi.build/"', self.en_html)

    def test_chinese_page_exists(self) -> None:
        self.assertIn('lang="zh-CN"', self.zh_html)
        self.assertIn('rel="canonical" href="https://orbi.build/zh/"', self.zh_html)

    def test_title_and_description_carry_search_terms(self) -> None:
        """Titles must name what someone would search for, not only the metaphor.

        "Software keeps shipping after the lights go out" is memorable but
        nobody types it into a search box.
        """
        en_title = re.search(r"<title>([^<]+)</title>", self.en_html).group(1)
        en_desc = re.search(r'name="description" content="([^"]+)"', self.en_html).group(1)
        # Issue #78: the licence-accurate title ("Self-hosted, fair-code …")
        # runs 75 chars; keeping the licence wording intact is worth more than
        # the old 65-char cap, so the cap moves rather than the wording.
        self.assertLessEqual(len(en_title), 80, en_title)
        self.assertLessEqual(len(en_desc), 260, len(en_desc))
        for term in ("AI coding agent", "GitHub Issues", "fair-code"):
            self.assertIn(term.lower(), (en_title + " " + en_desc).lower(), term)

        zh_title = re.search(r"<title>([^<]+)</title>", self.zh_html).group(1)
        zh_desc = re.search(r'name="description" content="([^"]+)"', self.zh_html).group(1)
        for term in ("AI 编程 Agent", "GitHub Issue", "自托管"):
            self.assertIn(term, zh_title + " " + zh_desc, term)

    def test_titles_never_call_orbi_open_source_and_agree_with_llms_txt(self) -> None:
        """Issue #78: llms.txt tells LLMs never to describe Orbi as OSI open
        source, while <title>/og:title/twitter:title said "Open-source" (zh
        "开源") in the same breath. The licence summary must use one wording
        everywhere: self-hosted, fair-code."""
        llms = (ROOT / "public" / "llms.txt").read_text(encoding="utf-8")
        licence = llms.split("## Licence", 1)[1].split("\n## ", 1)[0]
        self.assertIn("Do not describe Orbi as OSI open source", licence)
        self.assertIn("self-hosted and fair-code", llms)
        for html in (self.en_html, self.zh_html):
            slots = [
                ("title", re.search(r"<title>([^<]+)</title>", html).group(1)),
                ("og:title", re.search(r'property="og:title" content="([^"]+)"', html).group(1)),
                ("twitter:title", re.search(r'name="twitter:title" content="([^"]+)"', html).group(1)),
            ]
            for slot, text in slots:
                self.assertNotIn("open-source", text.lower(), (slot, text))
                self.assertNotIn("open source", text.lower(), (slot, text))
                self.assertNotIn("开源", text, (slot, text))
                self.assertIn("fair-code", text, (slot, text))

    def test_headings_carry_search_terms_not_only_rhetoric(self) -> None:
        """At least half the H2s should contain a term someone would search."""
        terms_en = ("ai", "agent", "github", "code review", "self-host",
                    "open-source", "model", "automat", "issue", "pr")
        terms_zh = ("ai", "agent", "github", "代码审查", "自托管",
                    "开源", "模型", "自动", "issue", "pr")
        for page, terms in ((self.en, terms_en), (self.zh, terms_zh)):
            h2s = [h for h in page.headings_rendered if h]
            hits = [h for h in h2s if any(t in h.lower() for t in terms)]
            self.assertGreaterEqual(
                len(hits), len(h2s) // 2,
                f"only {len(hits)}/{len(h2s)} headings carry a search term: {h2s}",
            )

    def test_font_loading_follows_the_language(self) -> None:
        """English pages do not load the CJK webfont (REVIEW.md P1-3).

        Stated without pinning font names (Issue #112): the Chinese page
        requests strictly more families than the English page, and its extra
        families exist only to cover CJK glyphs. An English page that loads
        any of that coverage (e.g. by copying the zh head) evens the counts
        and fails here; a Chinese page that drops the CJK font does too.
        """
        en, zh = (
            sorted(set(font_families(html)))
            for html in (self.en_html, self.zh_html)
        )
        self.assertLess(len(en), len(zh), (en, zh))

    def test_docs_and_github_on_both_languages(self) -> None:
        en_hrefs = [href for _, href in self.en.hrefs]
        zh_hrefs = [href for _, href in self.zh.hrefs]
        self.assertTrue(any(href.rstrip("/").startswith(DOCS_EN) for href in en_hrefs), en_hrefs)
        self.assertTrue(any(href.rstrip("/").startswith(DOCS_ZH) for href in zh_hrefs), zh_hrefs)
        self.assertTrue(any(href.startswith(GITHUB) for href in en_hrefs), en_hrefs)
        self.assertTrue(any(href.startswith(GITHUB) for href in zh_hrefs), zh_hrefs)
        self.assertIn(ROADMAP, en_hrefs)
        self.assertIn(ROADMAP, zh_hrefs)
        self.assertTrue(any("/zh/" in href or href.endswith("/zh") for href in en_hrefs), en_hrefs)
        self.assertTrue(any(href == "/" or href.endswith("orbi.build/") for href in zh_hrefs), zh_hrefs)

    def test_public_roadmap_is_named_in_both_languages(self) -> None:
        self.assertTrue(any(text == "Roadmap" and href == ROADMAP for text, href in self.en.hrefs))
        self.assertTrue(any(text == "路线图" and href == ROADMAP for text, href in self.zh.hrefs))

    def test_homepage_exposes_localized_comparisons_entry(self) -> None:
        for page, label, href in (
            (self.en, "Comparisons", "/compare/"),
            (self.zh, "竞品对比", "/zh/compare/"),
        ):
            matching = [(text, target) for text, target in page.hrefs if text == label]
            self.assertIn((label, href), matching)
            self.assertTrue(
                any(
                    text == label and target == href
                    for text, target in page.hrefs
                ),
                f"missing visible homepage entry: {label} -> {href}",
            )

    def test_primary_navigation_names_the_first_visit_actions(self) -> None:
        for html, labels in (
            (
                self.en_html,
                ("How it works", "Docs", "GitHub", "Start Cloud"),
            ),
            (
                self.zh_html,
                ("产品怎么运作", "文档", "GitHub", "开始 Cloud"),
            ),
        ):
            nav_start = html.index('data-primary-nav')
            nav_end = html.index("</nav>", nav_start)
            primary_nav = html[nav_start:nav_end]
            for label in labels:
                self.assertIn(f">{label}<", primary_nav)

    def test_language_switch_uses_readable_names(self) -> None:
        for html in (self.en_html, self.zh_html):
            self.assertIn(">EN<", html)
            self.assertIn(">中文<", html)

    def test_mobile_navigation_exposes_an_accessible_toggle(self) -> None:
        for page in (self.en, self.zh):
            toggles = [
                attrs
                for tag, attrs in page.elements
                if tag == "button" and "data-menu-toggle" in attrs
            ]
            self.assertEqual(len(toggles), 1, toggles)
            toggle = toggles[0]
            self.assertEqual(toggle.get("aria-expanded"), "false")
            self.assertTrue(toggle.get("aria-label"))
            controlled_id = toggle.get("aria-controls")
            self.assertTrue(controlled_id)

            controlled_navs = [
                attrs
                for tag, attrs in page.elements
                if tag == "nav"
                and attrs.get("id") == controlled_id
                and "data-primary-nav" in attrs
            ]
            self.assertEqual(len(controlled_navs), 1, controlled_navs)

    def test_header_and_footer_use_the_selected_breakout_ring_logo(self) -> None:
        for page in (self.en, self.zh):
            marks = [
                attrs.get("src")
                for tag, attrs in page.elements
                if tag == "img" and "wordmark-mark" in attrs.get("class", "").split()
            ]
            self.assertEqual(
                marks,
                ["/logo-mark-on-dark.svg", "/logo-mark.svg"],
            )

    def test_pages_distinguish_shipping_product_from_future_direction(self) -> None:
        for page in (self.en, self.zh):
            sections = [attrs.get("data-status") for tag, attrs in page.elements if tag == "section"]
            self.assertIn("shipping", sections)
            self.assertIn("direction", sections)

    def test_factory_map_covers_the_current_delivery_graph(self) -> None:
        expected = {"epic", "dependency", "delivery", "release"}
        for page in (self.en, self.zh):
            capabilities = {
                attrs["data-capability"]
                for _, attrs in page.elements
                if "data-capability" in attrs
            }
            self.assertTrue(expected.issubset(capabilities), capabilities)

    def test_primary_actions_install_and_show_a_real_delivery(self) -> None:
        for page, docs in ((self.en, DOCS_EN), (self.zh, DOCS_ZH)):
            ctas = {
                attrs.get("data-cta"): attrs.get("href")
                for tag, attrs in page.elements
                if tag == "a" and "data-cta" in attrs
            }
            self.assertTrue(ctas["install"].rstrip("/").startswith(docs), ctas)
            self.assertEqual(ctas["proof"], f"{GITHUB}/issues/48")
            # The Start Cloud CTA must exist; where it points is a product and
            # configuration decision (Issue #99 sends it straight to
            # /cloud/login), so no test pins its target (Issue #103).
            self.assertIn("cloud-start", ctas)
            self.assertEqual(ctas["cloud-apply"], "/apply")

    def test_parser_reads_text_the_way_a_crawler_does(self) -> None:
        """Inline tags must not invent whitespace; <br> must produce it.

        The old parser joined every text chunk with a space, so it saw word
        boundaries the DOM does not have. That hid `Issuesinto` from these
        tests while crawlers and AI summarisers read it verbatim.
        """
        inline = PageParser()
        inline.feed("<p>Read the <strong>v0.2.0</strong> release</p>")
        self.assertEqual(inline.text, "Read the v0.2.0 release")

        glued = PageParser()
        glued.feed("<p>Read the<strong>v0.2.0</strong>release</p>")
        self.assertEqual(glued.text, "Read thev0.2.0release")

        broken = PageParser()
        broken.feed("<h1>Turn GitHub Issues<br>into reviewed software</h1>")
        self.assertEqual(broken.text, "Turn GitHub Issues into reviewed software")

        blocks = PageParser()
        blocks.feed("<p>First</p><p>Second</p>")
        self.assertEqual(blocks.text, "First Second")

    def test_display_headings_keep_word_boundaries_for_crawlers(self) -> None:
        """A heading must read the same to a crawler as it does on screen.

        `<br>` breaks the line visually but contributes nothing to
        textContent, so `Issues<br>into` reaches crawlers and AI summarisers
        as `Issuesinto`. Any heading whose collapsed textContent differs from
        its rendered text has lost a word boundary.
        """
        for page in (self.en, self.zh):
            for crawler, rendered in zip(page.headings, page.headings_rendered):
                self.assertEqual(
                    " ".join(crawler.split()),
                    rendered,
                    f"heading loses a word boundary for crawlers: {crawler!r}",
                )

    def test_share_cards_exist_and_agree_on_one_title(self) -> None:
        """Every share/search slot must exist and the three title slots must
        stay one sentence: a drifted og:title/twitter:title shows a share
        card that previews a different headline than the page it links to.
        The wording itself is copy and stays unpinned (Issue #112)."""
        for html in (self.en_html, self.zh_html):
            title = re.search(r"<title>([^<]+)</title>", html).group(1)
            slots = [
                ("description", r'name="description" content="([^"]+)"'),
                ("og:title", r'property="og:title" content="([^"]+)"'),
                ("og:description", r'property="og:description" content="([^"]+)"'),
                ("og:image:alt", r'property="og:image:alt" content="([^"]+)"'),
                ("twitter:title", r'name="twitter:title" content="([^"]+)"'),
                ("twitter:description", r'name="twitter:description" content="([^"]+)"'),
            ]
            for slot, pattern in slots:
                self.assertIsNotNone(re.search(pattern, html), slot)
            for slot, pattern in slots:
                if slot.endswith("title"):
                    self.assertEqual(re.search(pattern, html).group(1), title, slot)

    def test_cloud_section_is_marked_a_direction(self) -> None:
        """The Cloud section must be marked a direction, not a shipping
        claim: a page that sells a managed service as shipped when it is not
        misleads the visitor it asks to pay."""
        for page in (self.en, self.zh):
            cloud_sections = [
                attrs for tag, attrs in page.elements
                if tag == "section" and attrs.get("id") == "run-orbi"
            ]
            self.assertEqual(cloud_sections[0].get("data-status"), "direction")

    def test_cloud_entry_separates_start_from_application(self) -> None:
        for page, apply_label, price, explainer in (
            (self.en, "Apply / contact us", "US$79/month", "/cloud/"),
            (self.zh, "申请 / 联系我们", "US$79/月", "/zh/cloud/"),
        ):
            # Issue #99: the price sits on the card before the click, and the
            # /cloud/ explainer stays reachable from the footer. The Start
            # Cloud CTA's own target is a product decision (#99 sends it
            # straight to /cloud/login) and the served href is additionally
            # rewritten per environment by the Worker, so no page test pins it
            # (Issue #103). Price and entry points are the key information
            # (Issue #112); the surrounding copy stays unpinned.
            self.assertIn(price, page.text)
            self.assertIn(explainer, [href for _, href in page.hrefs])
            self.assertTrue(any(href == "/apply" and text.startswith(apply_label) for text, href in page.hrefs))

    def test_cloud_login_is_environment_configured_and_drops_tenant_query(self) -> None:
        import tomllib
        with open(ROOT / "wrangler.toml", "rb") as handle:
            config = tomllib.load(handle)
        # CLOUD_LOGIN_URL is a per-environment configuration decision, not a
        # contract: Issue #96 opened production with its verified control-plane
        # endpoint, and the assertNotIn here that locked the old unconfigured
        # state broke the beta deploy (Issue #103). The behavior under either
        # configuration — configured: /cloud/login 302s to the value and the
        # served pages keep their CTAs; unconfigured: 503 with every Cloud CTA
        # rewritten to /apply — is locked where it runs, in
        # tests/worker.test.js. Only beta's value is pinned: it must stay the
        # one verified beta Cloud endpoint (docs/cloud-endpoints.md).
        self.assertEqual(config["env"]["beta"]["vars"]["CLOUD_LOGIN_URL"], "https://beta.orbi.build/api/login")
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn("new URL(cloudBaseUrl)", worker)
        self.assertIn("CLOUD_LOGIN_URL", worker)
        self.assertNotIn("cloud.orbi.build", worker)
        self.assertNotIn("beta-cloud.orbi.build", worker)

    def test_website_defines_no_endpoint_inside_a_cloud_route_prefix(self) -> None:
        """Issue #76: on the shared beta hostname the cloud control plane owns
        /api*, /auth*, /login*, /app*, /connect*, /checkout*, /stripe*
        (orbi-cloud discussion 120 §2 C2, confirmed live 2026-09-09), so a
        website endpoint under those prefixes never runs there — measured:
        beta answered POST /api/apply with cloud's 404. Both website-owned
        Cloud-entry endpoints live under /cloud/, which none of the cloud
        prefixes covers."""
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertNotIn("/api/apply", worker)
        self.assertNotIn("/api/login", worker)
        self.assertIn('"/cloud/apply"', worker)
        self.assertIn('"/cloud/login"', worker)

    def test_robots_disallows_the_website_endpoints(self) -> None:
        """The submit and handoff endpoints are actions, not pages: keep
        crawlers off them now that they no longer sit under /api/."""
        robots = (ROOT / "public" / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("Disallow: /cloud/apply", robots)
        self.assertIn("Disallow: /cloud/login", robots)

    def test_apply_posts_to_the_website_owned_submit_path(self) -> None:
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        self.assertIn('fetch("/cloud/apply"', apply_html)

    def test_display_headings_have_no_terminal_periods(self) -> None:
        for html in (self.en_html, self.zh_html):
            headings = re.findall(r"<h[12][^>]*>(.*?)</h[12]>", html, re.DOTALL)
            plain = [re.sub(r"<[^>]+>", "", heading).strip() for heading in headings]
            self.assertTrue(plain)
            self.assertFalse(
                [heading for heading in plain if heading.endswith((".", "。"))],
                plain,
            )

    def test_pages_declare_a_favicon_instead_of_requesting_a_missing_default(self) -> None:
        for page in (self.en, self.zh):
            icons = [
                attrs.get("href", "")
                for tag, attrs in page.elements
                if tag == "link" and "icon" in attrs.get("rel", "").split()
            ]
            self.assertTrue(icons, "browser would request missing /favicon.ico")

    def test_pages_ship_screenshots_and_diagrams(self) -> None:
        for html in (self.en_html, self.zh_html):
            self.assertIn("/img/issue-48.png", html)
            self.assertIn("/img/pr-193.png", html)
            self.assertIn('id="orbi-stats"', html)

    def test_hero_plays_a_factory_trace(self) -> None:
        js = (ROOT / "public" / "demo.js").read_text(encoding="utf-8")
        self.assertIn("data-trace-node", js)
        self.assertIn("prefers-reduced-motion", js)
        for html in (self.en_html, self.zh_html):
            self.assertIn('id="factory-trace"', html)
            self.assertIn("/demo.js", html)

    def test_stats_count_up_when_the_record_enters_the_viewport(self) -> None:
        js = (ROOT / "public" / "demo.js").read_text(encoding="utf-8")
        self.assertIn("IntersectionObserver", js)
        self.assertIn("startStats", js)
        self.assertIn("2600", js)
        self.assertIn('threshold: 0.25', js)

    def test_stats_never_render_a_hollow_record(self) -> None:
        """The live counters are the page's only social proof. When /stats is
        unreachable they must fall back to conservative real numbers, not to
        four em-dashes that read as a broken page."""
        js = (ROOT / "public" / "demo.js").read_text(encoding="utf-8")
        self.assertIn("data-floor", js)
        for page in (self.en, self.zh):
            stats = [
                attrs for tag, attrs in page.elements
                if tag == "strong" and "data-stat" in attrs
            ]
            self.assertEqual(len(stats), 4, stats)
            for attrs in stats:
                floor = attrs.get("data-floor", "")
                self.assertTrue(floor.isdigit() and int(floor) > 0, attrs)

    def test_install_is_one_published_command_with_a_manual_fallback(self) -> None:
        """"Install it yourself" is one curl line; the four hand-run steps
        survive only as the collapsed manual fallback, so nobody faces them
        up front."""
        command = "curl -fsSL https://orbi.build/install.sh | bash"
        for html in (self.en_html, self.zh_html):
            # exactly once: the primary install path, not repeated per locale
            self.assertEqual(html.count(command), 1)
            self.assertIn("git clone https://github.com/orbi-build/orbi.git", html)
            self.assertIn("orbi setup --config orbi.toml", html)
            # the fallback stays collapsed and secondary, behind the one-liner
            self.assertIn("<details", html)
            self.assertLess(html.index("<details"), html.index("git clone https://github.com"))
            # the honest prerequisites, so nobody discovers systemd halfway in
            self.assertIn("systemd", html)

    def test_install_sh_is_published_from_the_orbi_repo(self) -> None:
        """/install.sh must be the orbi repo's script byte for byte, with a
        documented repeatable sync path — two unattended copies drift."""
        published = (ROOT / "public" / "install.sh").read_text(encoding="utf-8")
        self.assertTrue(published.startswith("#!/usr/bin/env bash"), published[:60])
        self.assertIn("orbi setup", published)

        sync = (ROOT / "scripts" / "sync-install-sh.sh").read_text(encoding="utf-8")
        # the single named source of truth, and where it lands
        self.assertIn(
            "https://raw.githubusercontent.com/orbi-build/orbi/main/install.sh", sync,
        )
        self.assertIn("public/install.sh", sync)

        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        # CI red-lights any drift between the published copy and the source
        self.assertIn(
            "https://raw.githubusercontent.com/orbi-build/orbi/main/install.sh", ci,
        )
        self.assertIn("public/install.sh", ci)

    def test_install_commands_are_copyable_in_one_click(self) -> None:
        """Four lines with long flags are miserable to select by hand."""
        js = (ROOT / "public" / "demo.js").read_text(encoding="utf-8")
        self.assertIn("clipboard", js)
        for page, label in ((self.en, "Copy"), (self.zh, "复制")):
            buttons = [
                attrs for tag, attrs in page.elements
                if tag == "button" and "data-copy" in attrs
            ]
            self.assertEqual(len(buttons), 1, buttons)
            # the button must say what it copies, for screen readers too
            self.assertTrue(buttons[0].get("aria-label"), buttons[0])
            self.assertTrue(buttons[0].get("data-copied-label"), buttons[0])

    def test_wide_code_scrolls_inside_its_own_container(self) -> None:
        """A <pre> in a grid/flex track needs min-width:0, or its intrinsic
        width drags the whole page sideways on a phone."""
        css = (ROOT / "public" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".install-block", css)
        self.assertIn("overflow-x: auto", css)

    def test_worker_keeps_www_to_apex(self) -> None:
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn('"www.orbi.build"', worker)
        self.assertIn('"orbi.build"', worker)
        self.assertIn('"/stats"', worker)
        self.assertIn("type:issue state:closed", worker)
        self.assertIn("is:pr is:merged", worker)

    def test_stats_authenticate_github_server_side(self) -> None:
        """The counters are fed by the Worker, which holds the credential:
        the page ships no GitHub call of its own to authenticate."""
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn("env.GITHUB_TOKEN", worker)
        self.assertIn("Authorization", worker)
        self.assertIn("Bearer", worker)

    def test_star_chart_endpoint_stays_round(self) -> None:
        """`preserveAspectRatio="none"` stretched the SVG 2.6x horizontally,
        so the endpoint circle rendered as a 12x5 ellipse and the stroke
        thinned unevenly. The dot is positioned in CSS instead, and the
        stroke opts out of scaling."""
        demo = (ROOT / "public" / "demo.js").read_text(encoding="utf-8")
        css = (ROOT / "public" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("non-scaling-stroke", demo)
        self.assertIn(".star-dot", css)
        self.assertIn("border-radius: 50%", css)

    def test_stats_carry_the_star_history(self) -> None:
        """The static counters show scale; only a curve shows acceleration.

        Ten days from 2 stars to 52 is the strongest thing this page can
        say, and a row of frozen numbers cannot say it.
        """
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn("stargazers", worker)
        self.assertIn("star.json", worker)
        self.assertIn("stars", worker)
        for page in (self.en_html, self.zh_html):
            self.assertIn("data-star-chart", page)
        demo = (ROOT / "public" / "demo.js").read_text(encoding="utf-8")
        self.assertIn("data-star-chart", demo)

    def test_proof_runs_all_the_way_to_the_release(self) -> None:
        """The evidence strip must end where the headline promises.

        The section claims Issue to tagged release, so stopping at the
        merged PR leaves the last and least-believed step unproven.
        """
        for page, html in ((self.en, self.en_html), (self.zh, self.zh_html)):
            self.assertIn("/img/release-v020.png", html)
            hrefs = [href for _, href in page.hrefs]
            self.assertIn(
                f"{GITHUB}/releases/tag/v0.2.0", hrefs,
                "the release shot must link to the real release",
            )
            self.assertEqual(
                html.count("proof-arrow"), 2,
                "two arrows: Issue -> PR -> release",
            )

    def test_x_account_is_reachable_and_credited(self) -> None:
        """X is where the audience actually comes from.

        Every star so far arrived because the author posted on X, but the
        site had no link back: visitors landed and lost the thread, share
        cards carried no attribution, and AI retrieval had no way to know
        which account is official.
        """
        for page in (self.en_html, self.zh_html):
            self.assertIn('name="twitter:site" content="@xqliu"', page)
            self.assertIn('name="twitter:creator" content="@xqliu"', page)
            self.assertIn("https://x.com/xqliu", page)
        for page in (self.en, self.zh):
            hrefs = [href for _, href in page.hrefs]
            self.assertIn("https://x.com/xqliu", hrefs, hrefs)

    def test_no_third_party_analytics(self) -> None:
        """A page that promises code never leaves your machine must not ship
        visitor data to someone else. Cloudflare's own analytics is enough."""
        for page in (self.en_html, self.zh_html):
            for tracker in (
                "google-analytics", "googletagmanager", "gtag(",
                "plausible.io", "umami", "segment.com", "hotjar",
            ):
                self.assertNotIn(tracker, page.lower(), tracker)

    def test_apply_requires_only_telegram_and_scenario(self) -> None:
        """Telegram already identifies and reaches the person, so a nickname
        is one more thing to abandon the form over. Only tg and scenario are
        genuinely needed to act on an application, and they are exactly what
        the Worker's own required check gates on — a page set wider than the
        Worker's would 400 on fields the browser called valid, and narrower
        would submit incomplete applications. That every required field also
        shows a visible marker is asserted where it renders, in
        tests/homepage.smoke.mjs (Issue #112)."""
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        import re

        required_ids = re.findall(r'<(?:input|textarea)[^>]*id="([^"]+)"[^>]*\brequired\b', apply_html)
        required_ids += re.findall(r'<(?:input|textarea)[^>]*\brequired\b[^>]*id="([^"]+)"', apply_html)
        required_ids = sorted(set(required_ids))
        self.assertEqual(required_ids, ["f-scenario", "f-tg"], required_ids)

    def test_optional_email_never_blocks_the_submission(self) -> None:
        """Nothing is sent to this address — Telegram is how people get
        contacted — so a malformed optional field must not stop an otherwise
        complete application. Only required fields gate the submit."""
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        self.assertIn("el.required", apply_html)
        # a hint is fine; a blocked submission is not
        self.assertIn("data-msg-email-hint", apply_html)

    def test_apply_blocks_double_submission(self) -> None:
        """On a slow connection nothing says the request is in flight, so the
        button gets clicked again — measured 3 POSTs from 3 clicks against
        production. Disable it for the duration and say it is sending."""
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        self.assertIn("submit.disabled", apply_html)
        self.assertIn("data-msg-sending", apply_html)

    def test_apply_validates_before_posting(self) -> None:
        """novalidate turns off the browser's own check, so the form must do
        it in JS. Otherwise a missing field costs a round-trip and comes back
        as a raw English API string that never says which field is empty."""
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        self.assertIn("checkValidity", apply_html)
        # the offending field has to be focused, not just flagged
        self.assertIn("focus()", apply_html)
        # and it needs a localized message, not the API's English error
        self.assertIn("data-msg-required", apply_html)
        # spaces must be trimmed client-side too: the Worker trims before its
        # own required check, so "   " would otherwise pass here and come back
        # as a 400 that never names the field
        self.assertIn(".trim()", apply_html)
        # a filled-but-malformed field is not a missing one; saying "还差…没填"
        # about an optional email the user did fill reads as a lie
        self.assertIn("data-msg-invalid", apply_html)
        self.assertIn("valueMissing", apply_html)

    def test_apply_shows_the_outcome_where_the_user_is_looking(self) -> None:
        """The form clears on success, which alone reads as "nothing
        happened" if the confirmation is off-screen — measured at y=1627 in a
        844px viewport when submitting after scrolling up to re-check."""
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        self.assertIn("scrollIntoView", apply_html)
        # the confirmation must be announced, not just painted
        self.assertIn('role="status"', apply_html)
        self.assertIn('aria-live', apply_html)

    def test_apply_collects_pricing_signals(self) -> None:
        """The first cohort is the only chance to gather real pricing data.

        Two answers set the price: what they already pay for AI coding (the
        anchor) and how many Issues they'd hand over per week (the volume).
        Without both, Cloud pricing is guesswork.
        """
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        worker = WORKER_PATH.read_text(encoding="utf-8")
        migrations = "\n".join(
            p.read_text(encoding="utf-8") for p in sorted((ROOT / "migrations").glob("*.sql"))
        )
        for field in ("ai_spend", "issue_volume"):
            self.assertIn(f'name="{field}"', apply_html, field)
            self.assertIn(f'"{field}"', worker, field)
            self.assertIn(field, migrations, field)

    def test_apply_logs_the_payload_when_it_cannot_be_stored(self) -> None:
        """A lead that fails to insert is gone unless the request itself is in
        the log. Log every recognised field so it can be recovered by hand."""
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn("apply_insert_failed", worker)
        self.assertIn("JSON.stringify", worker)
        for token in ("name", "tg", "scenario", "email"):
            self.assertIn(token, worker)

    def test_beta_wrangler_environment_isolated_from_production(self) -> None:
        import tomllib

        with open(ROOT / "wrangler.toml", "rb") as handle:
            config = tomllib.load(handle)
        beta = config["env"]["beta"]
        self.assertEqual(beta["name"], "orbi-website-beta")
        self.assertFalse(beta["workers_dev"])
        # This is an ordinary Worker route through the existing proxied DNS
        # record, not a Custom Domain declaration that Wrangler would manage.
        self.assertEqual(
            beta["routes"],
            [
                {
                    "pattern": "beta.orbi.build/*",
                    "custom_domain": False,
                    "zone_name": "orbi.build",
                }
            ],
        )
        self.assertEqual(beta["d1_databases"][0]["binding"], "orbi_applications")
        self.assertEqual(beta["d1_databases"][0]["database_name"], "orbi-applications-test")
        self.assertEqual(
            beta["d1_databases"][0]["database_id"],
            "3c254d65-e5c6-4488-9b83-dabc3433f092",
        )
        self.assertEqual(
            config["d1_databases"][0]["database_name"], "orbi-applications"
        )
        self.assertEqual(
            config["d1_databases"][0]["database_id"],
            "9df2048e-004e-48e1-b81e-16826bd49d8a",
        )
        self.assertEqual(
            [route["pattern"] for route in config["routes"]],
            ["orbi.build", "www.orbi.build"],
        )

    def test_beta_deployment_workflow_is_explicit_and_smoked(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "deploy-beta.yml").read_text(encoding="utf-8")
        self.assertIn("branches:\n      - beta", workflow)
        # the log must name the branch and commit the deployment was built from
        self.assertIn("git rev-parse HEAD", workflow)
        self.assertIn("GITHUB_REF_NAME", workflow)
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("cloudflare/wrangler-action@v3", workflow)
        self.assertIn('node-version: "20.19.0"', workflow)
        self.assertIn('wranglerVersion: "4.34.0"', workflow)
        self.assertIn("npm test", workflow)
        self.assertIn("command: deploy --env beta", workflow)
        self.assertIn("CLOUDFLARE_API_TOKEN", workflow)
        self.assertIn("CLOUDFLARE_ACCOUNT_ID", workflow)
        self.assertIn("vars.CLOUDFLARE_ACCOUNT_ID", workflow)
        self.assertIn("beta.orbi.build/compare/", workflow)
        self.assertIn("beta.orbi.build/zh/compare/", workflow)
        # the install one-liner's host is the host CI actually deploys, so the
        # published script must be smoke-tested there after every release
        self.assertIn('check_page "https://beta.orbi.build/install.sh"', workflow)
        self.assertLess(workflow.index("npm test"), workflow.index("command: deploy"))
        self.assertLess(workflow.index("command: deploy"), workflow.index("curl"))
        # Issue #74: the browser smoke's login contract is injected per
        # environment; beta's is the GitHub OAuth 302 served by Cloud
        self.assertIn("CLOUD_LOGIN_EXPECT=oauth-302", workflow)

    def test_production_deployment_workflow_gates_deploys_and_rolls_back(self) -> None:
        """Issue #68: merging into main deploys orbi.build behind the
        `production` environment approval gate, smokes the real site against
        the deployed commit's own copy, and rolls back automatically when any
        smoke fails."""
        workflow = (ROOT / ".github" / "workflows" / "deploy-production.yml").read_text(encoding="utf-8")
        self.assertIn("branches:\n      - main", workflow)
        self.assertIn("workflow_dispatch:", workflow)
        # the one-confirmation human gate: the workflow must declare the
        # environment whose required reviewers hold the deployment
        self.assertIn("environment: production", workflow)
        self.assertIn("group: deploy-production", workflow)
        self.assertIn("cancel-in-progress: true", workflow)
        self.assertIn("cloudflare/wrangler-action@v3", workflow)
        self.assertIn('node-version: "20.19.0"', workflow)
        self.assertIn('wranglerVersion: "4.34.0"', workflow)
        self.assertIn("CLOUDFLARE_API_TOKEN", workflow)
        self.assertIn("vars.CLOUDFLARE_ACCOUNT_ID", workflow)
        # top-level environment = the production Worker serving orbi.build;
        # the beta environment must stay untouched by this workflow
        self.assertIn("command: deploy\n", workflow)
        # the pipeline order: full tests before the deploy, smoke after
        self.assertLess(workflow.index("npm ci"), workflow.index("npm test"))
        self.assertLess(workflow.index("npm test"), workflow.index("command: deploy\n"))
        self.assertLess(workflow.index("tests.test_landing"), workflow.index("command: deploy\n"))
        self.assertLess(workflow.index("playwright install"), workflow.index("command: deploy\n"))
        self.assertLess(workflow.index("command: deploy\n"), workflow.index("https://orbi.build/"))
        self.assertIn("BASE_URL=https://orbi.build", workflow)
        # Issue #74: the browser smoke's login contract is injected per
        # environment. Issue #77: production configures no CLOUD_LOGIN_URL, so
        # its /cloud/login fail-closes with the site Worker's stamped 503 and
        # the served pages send the Cloud CTA to /apply; expecting the old
        # handoff 302 here would fail every promotion. When production gets
        # its own Cloud login, set the verified endpoint in wrangler.toml and
        # flip this to oauth-302 as a reviewed diff.
        self.assertIn("CLOUD_LOGIN_EXPECT=fail-closed-503", workflow)
        # the smoke asserts the deployed commit's real copy, parsed from the
        # checked-out pages — never hardcoded wording that will drift
        self.assertIn("public/index.html", workflow)
        self.assertIn("public/compare/index.html", workflow)
        self.assertIn("public/zh/index.html", workflow)
        # rollback: smoke failure triggers wrangler rollback to the recorded
        # pre-deploy version, and both version IDs land in the log
        self.assertIn("rollback", workflow)
        self.assertLess(workflow.index("deployments list"), workflow.index("command: deploy\n"))
        rollback_at = workflow.index("wrangler@4.34.0 rollback")
        self.assertGreater(rollback_at, workflow.index("https://orbi.build/"))
        self.assertIn("if: failure()", workflow)
        self.assertLess(workflow.index("if: failure()"), rollback_at)
        # the soak gate: promoted commits must have aged on origin/beta before
        # the approval-gated deploy job starts, so a rejected promotion never
        # requests the approver's attention; the hotfix escape skips soak but
        # never the environment approval
        self.assertIn("actions: read", workflow)
        soak_at = workflow.index("  soak:")
        deploy_at = workflow.index("  deploy:")
        self.assertLess(soak_at, deploy_at)
        # the first `environment: production` declaration belongs to the
        # deploy job — the soak job must run without waiting for approval
        self.assertLess(deploy_at, workflow.index("environment: production"))
        self.assertIn("needs: soak", workflow)
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("skip_soak", workflow)
        self.assertLess(workflow.index("workflow_dispatch:"), workflow.index("skip_soak"))
        self.assertIn("PROD_MIN_SOAK_HOURS", workflow)
        self.assertIn("gh run list", workflow)
        self.assertIn("git fetch origin beta", workflow)

    def test_ci_workflow_triggers_on_beta_push_and_keeps_pull_request(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        self.assertIn("branches:\n      - beta", workflow)
        self.assertIn("pull_request:", workflow)
        # Issue #103: PR CI must run the same contract tests the deploy
        # workflows run. This suite used to execute only at deploy time,
        # so a contract violation passed PR review green and broke the
        # beta deploy after the merge instead of failing the PR.
        self.assertIn("python3 -m unittest tests.test_landing", workflow)

    def test_beta_deployment_docs_name_secrets_and_environments(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        for text in (
            "beta.orbi.build",
            "CLOUDFLARE_API_TOKEN",
            "CLOUDFLARE_ACCOUNT_ID",
            "Secret `CLOUDFLARE_API_TOKEN`",
            "Variable `CLOUDFLARE_ACCOUNT_ID`",
            "wrangler deploy --env beta",
            "orbi.build",
            "production",
        ):
            self.assertIn(text, readme)

    def test_wrangler_config_keeps_every_binding_at_top_level(self) -> None:
        """A table header claims every key after it, so a stray [section]
        above `assets` swallows the binding and env.ASSETS goes undefined —
        which takes the whole site down with a 1101."""
        import tomllib

        with open(ROOT / "wrangler.toml", "rb") as handle:
            config = tomllib.load(handle)

        self.assertEqual(config["assets"]["binding"], "ASSETS")
        self.assertEqual(config["assets"]["directory"], "./public/")
        self.assertEqual(len(config["d1_databases"]), 1)
        self.assertEqual(len(config["routes"]), 2)
        # observability must hold only its own keys
        self.assertEqual(
            set(config["observability"]), {"enabled", "head_sampling_rate"}
        )
        self.assertTrue(config["observability"]["enabled"])

    def test_apply_bounds_every_stored_field(self) -> None:
        """An unauthenticated write path must cap what it stores."""
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn("MAX_FIELD", worker)
        self.assertIn("MAX_BODY_BYTES", worker)
        self.assertIn("slice(0, ", worker)

    def test_apply_rejects_oversized_bodies_before_parsing(self) -> None:
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn("content-length", worker)
        self.assertIn("413", worker)

    def test_stats_does_not_leak_upstream_error_text(self) -> None:
        """A 502 must not echo GitHub's response body to anonymous callers."""
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn("upstream unavailable", worker)


COMPARE_EN_PATH = ROOT / "public" / "compare" / "openclaw" / "index.html"
COMPARE_ZH_PATH = ROOT / "public" / "zh" / "compare" / "openclaw" / "index.html"
CLOUD_EN_PATH = ROOT / "public" / "cloud" / "index.html"
CLOUD_ZH_PATH = ROOT / "public" / "zh" / "cloud" / "index.html"


class CloudLandingPageTests(unittest.TestCase):
    """Issue #79: /cloud/ and /zh/cloud/ — the indexable explainer page for
    anyone not ready to hit an OAuth consent screen directly.

    Three segments: what Cloud is, the Founding Pilot price, and the three
    steps after the click. Its buttons reach the /cloud/login handoff, whose
    behavior (302 to CLOUD_LOGIN_URL when configured, fail-closed 503 with
    every Cloud CTA rewritten to /apply otherwise) is locked where it runs,
    in tests/worker.test.js — not by page-target assertions (Issue #103)."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.en_html, cls.en = parse(CLOUD_EN_PATH)
        cls.zh_html, cls.zh = parse(CLOUD_ZH_PATH)

    def test_both_languages_declare_canonical_and_the_hreflang_triple(self) -> None:
        self.assertIn('lang="en"', self.en_html)
        self.assertIn('rel="canonical" href="https://orbi.build/cloud/"', self.en_html)
        self.assertIn('hreflang="en" href="https://orbi.build/cloud/"', self.en_html)
        self.assertIn('hreflang="zh-CN" href="https://orbi.build/zh/cloud/"', self.en_html)
        self.assertIn('hreflang="x-default" href="https://orbi.build/cloud/"', self.en_html)
        self.assertIn('lang="zh-CN"', self.zh_html)
        self.assertIn('rel="canonical" href="https://orbi.build/zh/cloud/"', self.zh_html)
        self.assertIn('hreflang="en" href="https://orbi.build/cloud/"', self.zh_html)
        self.assertIn('hreflang="zh-CN" href="https://orbi.build/zh/cloud/"', self.zh_html)
        self.assertIn('hreflang="x-default" href="https://orbi.build/cloud/"', self.zh_html)

    def test_each_page_has_exactly_one_h1(self) -> None:
        for html in (self.en_html, self.zh_html):
            self.assertEqual(len(re.findall(r"<h1[\s>]", html)), 1)

    def test_share_cards_and_jsonld_name_webpage_and_offer(self) -> None:
        for html in (self.en_html, self.zh_html):
            for meta in (
                'property="og:title"',
                'property="og:image"',
                'name="twitter:card"',
                'name="twitter:site" content="@xqliu"',
            ):
                self.assertIn(meta, html, meta)
            scripts = re.findall(
                r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL
            )
            self.assertTrue(scripts, "no JSON-LD on the page")
            types = []
            for script in scripts:
                data = json.loads(script)
                nodes = data.get("@graph", [data])
                types += [node.get("@type") for node in nodes]
            self.assertIn("WebPage", types, types)
            self.assertIn("Offer", types, types)

    def test_body_states_the_regular_price_and_the_founding_coupon(self) -> None:
        """Issue #108: the regular US$79 price, the 2B-token inclusion, and the
        coupon mechanism must be readable body text, not only structured data."""
        for page, coupon, tokens in (
            (self.en, "Founding coupon", "2 billion tokens"),
            (self.zh, "Founding 券", "20 亿 token"),
        ):
            self.assertIn("US$79", page.text)
            self.assertIn(tokens, page.text)
            self.assertIn("100% off", page.text)
            self.assertIn("Private Beta", page.text)
            self.assertIn(coupon, page.text)

    def test_pricing_section_states_price_tokens_overage_and_coupon_mechanism(self) -> None:
        """Issue #108: $79 regular, 2B tokens included, the published overage,
        and the coupon mechanism — the terms a subscriber agrees to must be
        readable before subscribing. The framing around them stays unpinned
        (Issue #112)."""
        for page, needles in (
            (
                self.en,
                (
                    "US$79 per month",
                    "2 billion tokens of model usage",
                    "$0.10 per additional 1M tokens",
                    "100% off",
                ),
            ),
            (
                self.zh,
                (
                    "US$79",
                    "20 亿 token",
                    "$0.10",
                    "100% off",
                    "限量",
                ),
            ),
        ):
            for needle in needles:
                self.assertIn(needle, page.text, needle)

    def test_cloud_states_the_measured_token_cost_with_all_three_limits(self) -> None:
        """Issue #108: the measured cost section carries the date, the sample
        size, the distribution, and the three qualifying statements — our repo
        only, caching load-bearing, totalTokens as billed — plus the competitor
        non-disclosure quotes with their sources."""
        competitors = (
            "a significantly larger weekly usage quota",
            "~10x Pro usage",
        )
        competitor_hrefs = (
            "https://docs.devin.ai/admin/billing/self-serve",
            "https://docs.factory.ai/pricing/individuals",
        )
        for page, needles in (
            (
                self.en,
                (
                    "2026-09-10", "n=46",
                    "2,220,637", "4,667,630", "37,627,783",
                    "$0.04–0.11", "92.7%", "3.4%", "0.7%", "430",
                    "not a promise to everyone", "order of magnitude", "totalTokens",
                ),
            ),
            (
                self.zh,
                (
                    "2026-09-10", "n=46",
                    "2,220,637", "4,667,630", "37,627,783",
                    "$0.04–0.11", "92.7%", "3.4%", "0.7%", "430",
                    "不是对所有人的承诺", "一个数量级", "totalTokens",
                ),
            ),
        ):
            for needle in needles:
                self.assertIn(needle, page.text, needle)
            for needle in competitors:
                self.assertIn(needle, page.text, needle)
            for href in competitor_hrefs:
                self.assertIn(href, [h for _, h in page.hrefs], href)

    def test_offer_jsonld_prices_the_regular_plan(self) -> None:
        """Issue #108: JSON-LD prices the regular plan at 79 with the coupon in
        the description — a wrong Offer price reaches search engines and
        checkout previews without anyone scrolling the page. The meta
        descriptions' wording stays unpinned (Issue #112)."""
        for html in (self.en_html, self.zh_html):
            scripts = re.findall(
                r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL
            )
            offers = []
            for script in scripts:
                data = json.loads(script)
                offers += [node for node in data.get("@graph", [data]) if node.get("@type") == "Offer"]
            self.assertEqual(len(offers), 1, offers)
            self.assertEqual(offers[0]["price"], "79", offers[0])
            self.assertIn("100% off", offers[0]["description"], offers[0])

    def test_the_three_steps_appear_in_order_and_end_at_the_login_button(self) -> None:
        for page, steps in (
            (
                self.en,
                ("Sign in with GitHub", "Install the Orbi GitHub App", "Subscribe and connect a repository"),
            ),
            (
                self.zh,
                ("用 GitHub 登录", "安装 Orbi GitHub App", "订阅并连接仓库"),
            ),
        ):
            positions = [page.text.index(step) for step in steps]
            self.assertEqual(positions, sorted(positions), steps)
            self.assertIn("/cloud/login", [href for _, href in page.hrefs])

    def test_pages_interlink_with_homepage_and_counterpart(self) -> None:
        self.assertIn("/zh/cloud/", [href for _, href in self.en.hrefs])
        self.assertIn("/cloud/", [href for _, href in self.zh.hrefs])
        for page, home in ((self.en, "/"), (self.zh, "/zh/")):
            self.assertIn(home, [href for _, href in page.hrefs])

    def test_sitemap_lists_both_cloud_pages(self) -> None:
        sitemap = (ROOT / "public" / "sitemap.xml").read_text(encoding="utf-8")
        for loc in ("https://orbi.build/cloud/", "https://orbi.build/zh/cloud/"):
            self.assertIn(f"<loc>{loc}</loc>", sitemap, loc)

    def test_font_loading_follows_the_language(self) -> None:
        """English pages do not load the CJK webfont (REVIEW.md P1-3),
        stated without pinning font names (Issue #112): see
        LandingTests.test_font_loading_follows_the_language."""
        en, zh = (
            sorted(set(font_families(html)))
            for html in (self.en_html, self.zh_html)
        )
        self.assertLess(len(en), len(zh), (en, zh))
COMPARE_INDEX_EN_PATH = ROOT / "public" / "compare" / "index.html"
COMPARE_INDEX_ZH_PATH = ROOT / "public" / "zh" / "compare" / "index.html"


class OpenClawComparisonTests(unittest.TestCase):
    """The OpenClaw deep dive (Issue #10): every claim sourced, both languages,
    interlinked with the comparison overview, no disparagement."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.en_html, cls.en = parse(COMPARE_EN_PATH)
        cls.zh_html, cls.zh = parse(COMPARE_ZH_PATH)

    def test_both_languages_declare_canonicals_and_alternates(self) -> None:
        self.assertIn('lang="en"', self.en_html)
        self.assertIn('rel="canonical" href="https://orbi.build/compare/openclaw/"', self.en_html)
        self.assertIn('hreflang="zh-CN" href="https://orbi.build/zh/compare/openclaw/"', self.en_html)
        self.assertIn('lang="zh-CN"', self.zh_html)
        self.assertIn('rel="canonical" href="https://orbi.build/zh/compare/openclaw/"', self.zh_html)
        self.assertIn('hreflang="en" href="https://orbi.build/compare/openclaw/"', self.zh_html)

    def test_titles_carry_the_search_terms(self) -> None:
        en_title = re.search(r"<title>([^<]+)</title>", self.en_html).group(1)
        self.assertLessEqual(len(en_title), 65, en_title)
        en_desc = re.search(r'name="description" content="([^"]+)"', self.en_html).group(1)
        self.assertLessEqual(len(en_desc), 260, len(en_desc))
        for term in ("Orbi", "OpenClaw", "Anthropic"):
            self.assertIn(term, en_title + " " + en_desc, term)

        zh_title = re.search(r"<title>([^<]+)</title>", self.zh_html).group(1)
        zh_desc = re.search(r'name="description" content="([^"]+)"', self.zh_html).group(1)
        for term in ("Orbi", "OpenClaw", "Anthropic"):
            self.assertIn(term, zh_title + " " + zh_desc, term)

    def test_share_cards_are_complete(self) -> None:
        for html in (self.en_html, self.zh_html):
            for meta in (
                'property="og:title"',
                'property="og:image"',
                'name="twitter:card"',
                'name="twitter:site" content="@xqliu"',
            ):
                self.assertIn(meta, html, meta)

    def test_every_page_states_the_verification_date(self) -> None:
        self.assertIn("2026-09-07", self.en.text)
        self.assertIn("2026-09-07", self.zh.text)

    def test_the_named_sources_are_cited(self) -> None:
        for page in (self.en, self.zh):
            hrefs = [href for _, href in page.hrefs]
            self.assertIn("https://openclaw.ai", hrefs)
            # cited by name and date; the April post itself is no longer
            # retrievable, so the page must not link a guessed post URL
            self.assertIn("https://x.com/bcherny", hrefs)
            self.assertIn("Boris Cherny", page.text)
            self.assertIn(
                "Anthropic Managed Agents: What It Is, What It Kills, and Why the Timing Matters",
                page.text,
            )
            self.assertIn("2026-04-11", page.text)
            self.assertIn("Medium", page.text)

    def test_competitor_facts_match_the_verified_research(self) -> None:
        # The Issue's research notes (verified 2026-09-07) as the page states them
        for page, launch, instances in (
            (self.en, "November 2025", "135,000"),
            (self.zh, "2025 年 11 月", "13.5 万"),
        ):
            text = page.text
            for fact in (
                "Clawdbot",
                "Peter Steinberger",
                launch,
                "WhatsApp",
                "Telegram",
                instances,
                "$236",
                "12x–36x",
                "Extra Usage",
                "2026-02-14",
                "2026-04-04",
                "2026-04-08",
                "$0.08",
            ):
                self.assertIn(fact, text, fact)

    def test_the_differences_table_covers_the_deciding_dimensions(self) -> None:
        for page, terms in (
            (
                self.en,
                ("Task loop", "Where state lives", "Scheduling", "Model policy risk"),
            ),
            (
                self.zh,
                ("任务闭环", "状态存于", "调度", "模型政策风险"),
            ),
        ):
            for term in terms:
                self.assertIn(term, page.text, term)
            # the scheduling row names both mechanisms
            self.assertIn("Heartbeat", page.text)
            self.assertIn("systemd timer", page.text)

    def test_honest_choice_names_both_products(self) -> None:
        self.assertIn("CHOOSE OPENCLAW IF", self.en.text)
        self.assertIn("CHOOSE ORBI IF", self.en.text)
        self.assertIn("选 OPENCLAW，如果你要", self.zh.text)
        self.assertIn("选 ORBI，如果你要", self.zh.text)

    def test_does_not_disparage_the_competitor(self) -> None:
        """The cutoff repriced a usage pattern, not the framework — the page
        has to say so, or the comparison reads as a hit piece."""
        self.assertIn("still runs fine on API keys and local models", self.en.text)
        self.assertIn("跑 API key 和本地模型依然没问题", self.zh.text)

    def test_interlinks_with_the_overview_page(self) -> None:
        # A link to a 404 is not an interlink: the target page must exist,
        # and it must link back to the deep dive.
        for page, overview in ((self.en, "/compare/"), (self.zh, "/zh/compare/")):
            hrefs = [href for _, href in page.hrefs]
            self.assertIn(overview, hrefs)
            target = ROOT / "public" / overview.lstrip("/")
            self.assertTrue((target / "index.html").is_file(), target)

        for index_path, dive in (
            (COMPARE_INDEX_EN_PATH, "/compare/openclaw/"),
            (COMPARE_INDEX_ZH_PATH, "/zh/compare/openclaw/"),
        ):
            _, index = parse(index_path)
            self.assertIn(dive, [href for _, href in index.hrefs])

    def test_language_switch_crosses_to_the_counterpart(self) -> None:
        self.assertIn("/zh/compare/openclaw/", [href for _, href in self.en.hrefs])
        self.assertIn("/compare/openclaw/", [href for _, href in self.zh.hrefs])

    def test_headings_keep_word_boundaries_and_no_terminal_periods(self) -> None:
        for page, html in ((self.en, self.en_html), (self.zh, self.zh_html)):
            for crawler, rendered in zip(page.headings, page.headings_rendered):
                self.assertEqual(" ".join(crawler.split()), rendered, crawler)
            headings = re.findall(r"<h[12][^>]*>(.*?)</h[12]>", html, re.DOTALL)
            plain = [re.sub(r"<[^>]+>", "", heading).strip() for heading in headings]
            self.assertTrue(plain)
            self.assertFalse(
                [heading for heading in plain if heading.endswith((".", "。"))],
                plain,
            )

    def test_font_loading_follows_the_language(self) -> None:
        """English pages do not load the CJK webfont (REVIEW.md P1-3),
        stated without pinning font names (Issue #112): see
        LandingTests.test_font_loading_follows_the_language."""
        en, zh = (
            sorted(set(font_families(html)))
            for html in (self.en_html, self.zh_html)
        )
        self.assertLess(len(en), len(zh), (en, zh))

    def test_no_third_party_analytics(self) -> None:
        for html in (self.en_html, self.zh_html):
            for tracker in (
                "google-analytics", "googletagmanager", "gtag(",
                "plausible.io", "umami", "segment.com", "hotjar",
            ):
                self.assertNotIn(tracker, html.lower(), tracker)

    def test_sitemap_and_llms_txt_list_the_new_pages(self) -> None:
        sitemap = (ROOT / "public" / "sitemap.xml").read_text(encoding="utf-8")
        for loc in (
            "https://orbi.build/compare/",
            "https://orbi.build/zh/compare/",
            "https://orbi.build/compare/openclaw/",
            "https://orbi.build/zh/compare/openclaw/",
            "https://orbi.build/compare/hermes-agent/",
            "https://orbi.build/zh/compare/hermes-agent/",
        ):
            self.assertIn(f"<loc>{loc}</loc>", sitemap, loc)
        llms = (ROOT / "public" / "llms.txt").read_text(encoding="utf-8")
        self.assertIn("https://orbi.build/compare/openclaw/", llms)
        self.assertIn("https://orbi.build/zh/compare/openclaw/", llms)
        self.assertIn("https://orbi.build/compare/hermes-agent/", llms)
        self.assertIn("https://orbi.build/zh/compare/hermes-agent/", llms)


DEVIN_EN_PATH = ROOT / "public" / "compare" / "devin" / "index.html"
DEVIN_ZH_PATH = ROOT / "public" / "zh" / "compare" / "devin" / "index.html"
MANAGED_EN_PATH = ROOT / "public" / "compare" / "managed-agents" / "index.html"
MANAGED_ZH_PATH = ROOT / "public" / "zh" / "compare" / "managed-agents" / "index.html"
HERMES_EN_PATH = ROOT / "public" / "compare" / "hermes-agent" / "index.html"
HERMES_ZH_PATH = ROOT / "public" / "zh" / "compare" / "hermes-agent" / "index.html"


class HermesComparisonTests(unittest.TestCase):
    def test_bilingual_pages_are_canonical_and_sourced(self) -> None:
        for path, canonical, alternate, date in (
            (HERMES_EN_PATH, "/compare/hermes-agent/", "/zh/compare/hermes-agent/", "verified 2026-09-07"),
            (HERMES_ZH_PATH, "/zh/compare/hermes-agent/", "/compare/hermes-agent/", "核实于 2026-09-07"),
        ):
            html, page = parse(path)
            self.assertIn(f'rel="canonical" href="https://orbi.build{canonical}"', html)
            self.assertIn(f'href="https://orbi.build{alternate}"', html)
            self.assertIn(date, page.text)
            self.assertIn("NousResearch/hermes-agent", html)
            self.assertIn("GitHub", page.text)
            self.assertIn("Issue", page.text)
            self.assertIn("MIT", page.text)

    def test_hermes_is_not_misrepresented_as_orbis_delivery_loop(self) -> None:
        for path in (HERMES_EN_PATH, HERMES_ZH_PATH):
            _, page = parse(path)
            self.assertIn("A documented, unattended GitHub Issue queue" if path == HERMES_EN_PATH else "没有文档证明它提供一个无人值守", page.text)
            self.assertIn("always-on" if path == HERMES_EN_PATH else "常驻", page.text)

    def test_hermes_page_covers_openclaw_relationship(self) -> None:
        for path in (HERMES_EN_PATH, HERMES_ZH_PATH):
            html, page = parse(path)
            self.assertIn("OpenClaw", page.text)
            self.assertIn("openclaw.ai", html)


class DevinComparisonTests(unittest.TestCase):
    """The Devin deep dive (Issue #9): every claim sourced, both languages,
    interlinked with the comparison overview, no disparagement."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.en_html, cls.en = parse(DEVIN_EN_PATH)
        cls.zh_html, cls.zh = parse(DEVIN_ZH_PATH)

    def test_both_languages_declare_canonicals_and_alternates(self) -> None:
        self.assertIn('lang="en"', self.en_html)
        self.assertIn('rel="canonical" href="https://orbi.build/compare/devin/"', self.en_html)
        self.assertIn('hreflang="zh-CN" href="https://orbi.build/zh/compare/devin/"', self.en_html)
        self.assertIn('lang="zh-CN"', self.zh_html)
        self.assertIn('rel="canonical" href="https://orbi.build/zh/compare/devin/"', self.zh_html)
        self.assertIn('hreflang="en" href="https://orbi.build/compare/devin/"', self.zh_html)

    def test_titles_carry_the_search_terms(self) -> None:
        en_title = re.search(r"<title>([^<]+)</title>", self.en_html).group(1)
        self.assertLessEqual(len(en_title), 65, en_title)
        en_desc = re.search(r'name="description" content="([^"]+)"', self.en_html).group(1)
        self.assertLessEqual(len(en_desc), 260, len(en_desc))
        for term in ("Orbi", "Devin", "Cognition"):
            self.assertIn(term, en_title + " " + en_desc, term)

        zh_title = re.search(r"<title>([^<]+)</title>", self.zh_html).group(1)
        zh_desc = re.search(r'name="description" content="([^"]+)"', self.zh_html).group(1)
        for term in ("Orbi", "Devin", "Cognition"):
            self.assertIn(term, zh_title + " " + zh_desc, term)

    def test_share_cards_are_complete(self) -> None:
        for html in (self.en_html, self.zh_html):
            for meta in (
                'property="og:title"',
                'property="og:image"',
                'name="twitter:card"',
                'name="twitter:site" content="@xqliu"',
            ):
                self.assertIn(meta, html, meta)

    def test_every_page_states_the_verification_date(self) -> None:
        self.assertIn("2026-09-07", self.en.text)
        self.assertIn("2026-09-07", self.zh.text)

    def test_the_named_sources_are_cited(self) -> None:
        for page in (self.en, self.zh):
            hrefs = [href for _, href in page.hrefs]
            # the competitor's own materials, linked — including the two
            # billing pages the pricing facts come from
            self.assertIn("https://cognition.com", hrefs)
            self.assertIn("https://docs.devin.ai", hrefs)
            self.assertIn("https://docs.devin.ai/admin/billing/self-serve", hrefs)
            self.assertIn("https://docs.devin.ai/admin/billing/usage", hrefs)
            for quote in (
                "the first autonomous software engineer",
                "from prompt to PR",
            ):
                self.assertIn(quote, page.text, quote)
        # devin.ai's pricing page was not directly reachable at verification;
        # the page must say so instead of pretending it checked the prices
        self.assertIn("not directly reachable at verification time", self.en.text)
        self.assertIn("无法直接访问", self.zh.text)

    def test_competitor_facts_match_the_verified_research(self) -> None:
        # The verified research notes (2026-09-07, cognition.com and
        # docs.devin.ai) as the page states them
        for page in (self.en, self.zh):
            for fact in (
                "Slack",
                "Teams",
                "Linear/Jira",
                "Agent Compute Units",
                "ACU",
                "on-demand credits" if page is self.en else "按需积分",
                "$20/month" if page is self.en else "$20/月",
                "$80/month" if page is self.en else "$80/月",
                "Automations stop running",
                "Legacy Core plan users have been migrated to the Free plan",
                "SWE",
                "ai-ready",
            ):
                self.assertIn(fact, page.text, fact)

    def test_the_differences_table_covers_the_deciding_dimensions(self) -> None:
        for page, terms in (
            (
                self.en,
                ("Task entry", "Models", "Runs where", "Cost", "Auditability"),
            ),
            (
                self.zh,
                ("任务入口", "模型", "运行位置", "成本", "可审计"),
            ),
        ):
            for term in terms:
                self.assertIn(term, page.text, term)
            # the lock-in and sovereignty claims both appear
            self.assertIn("no bring-your-own-key option", self.en.text)
            self.assertIn("无自带 key 选项", self.zh.text)
            self.assertIn("BYOK", page.text)

    def test_honest_choice_names_both_products(self) -> None:
        self.assertIn("CHOOSE DEVIN IF", self.en.text)
        self.assertIn("CHOOSE ORBI IF", self.en.text)
        self.assertIn("选 DEVIN，如果你要", self.zh.text)
        self.assertIn("选 ORBI，如果你要", self.zh.text)

    def test_does_not_disparage_the_competitor(self) -> None:
        """Devin is described as the serious managed product it is — with its
        enterprise deployments credited — or the comparison reads as a hit
        piece."""
        self.assertIn("serious managed product", self.en.text)
        self.assertIn("一个严肃的托管产品", self.zh.text)

    def test_interlinks_with_the_overview_page(self) -> None:
        # A link to a 404 is not an interlink: the target page must exist,
        # and it must link back to the deep dive.
        for page, overview in ((self.en, "/compare/"), (self.zh, "/zh/compare/")):
            hrefs = [href for _, href in page.hrefs]
            self.assertIn(overview, hrefs)
            target = ROOT / "public" / overview.lstrip("/")
            self.assertTrue((target / "index.html").is_file(), target)

        for index_path, dive in (
            (COMPARE_INDEX_EN_PATH, "/compare/devin/"),
            (COMPARE_INDEX_ZH_PATH, "/zh/compare/devin/"),
        ):
            _, index = parse(index_path)
            self.assertIn(dive, [href for _, href in index.hrefs])

    def test_language_switch_crosses_to_the_counterpart(self) -> None:
        self.assertIn("/zh/compare/devin/", [href for _, href in self.en.hrefs])
        self.assertIn("/compare/devin/", [href for _, href in self.zh.hrefs])

    def test_headings_keep_word_boundaries_and_no_terminal_periods(self) -> None:
        for page, html in ((self.en, self.en_html), (self.zh, self.zh_html)):
            for crawler, rendered in zip(page.headings, page.headings_rendered):
                self.assertEqual(" ".join(crawler.split()), rendered, crawler)
            headings = re.findall(r"<h[12][^>]*>(.*?)</h[12]>", html, re.DOTALL)
            plain = [re.sub(r"<[^>]+>", "", heading).strip() for heading in headings]
            self.assertTrue(plain)
            self.assertFalse(
                [heading for heading in plain if heading.endswith((".", "。"))],
                plain,
            )

    def test_font_loading_follows_the_language(self) -> None:
        """English pages do not load the CJK webfont (REVIEW.md P1-3),
        stated without pinning font names (Issue #112): see
        LandingTests.test_font_loading_follows_the_language."""
        en, zh = (
            sorted(set(font_families(html)))
            for html in (self.en_html, self.zh_html)
        )
        self.assertLess(len(en), len(zh), (en, zh))

    def test_no_third_party_analytics(self) -> None:
        for html in (self.en_html, self.zh_html):
            for tracker in (
                "google-analytics", "googletagmanager", "gtag(",
                "plausible.io", "umami", "segment.com", "hotjar",
            ):
                self.assertNotIn(tracker, html.lower(), tracker)

    def test_sitemap_and_llms_txt_list_the_new_pages(self) -> None:
        sitemap = (ROOT / "public" / "sitemap.xml").read_text(encoding="utf-8")
        for loc in (
            "https://orbi.build/compare/devin/",
            "https://orbi.build/zh/compare/devin/",
        ):
            self.assertIn(f"<loc>{loc}</loc>", sitemap, loc)
        llms = (ROOT / "public" / "llms.txt").read_text(encoding="utf-8")
        self.assertIn("https://orbi.build/compare/devin/", llms)
        self.assertIn("https://orbi.build/zh/compare/devin/", llms)


class CompareIndexTests(unittest.TestCase):
    """The /compare/ section index links every published deep dive."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.en_html, cls.en = parse(COMPARE_INDEX_EN_PATH)
        cls.zh_html, cls.zh = parse(COMPARE_INDEX_ZH_PATH)

    def test_declare_canonicals_and_alternates(self) -> None:
        self.assertIn('rel="canonical" href="https://orbi.build/compare/"', self.en_html)
        self.assertIn('hreflang="zh-CN" href="https://orbi.build/zh/compare/"', self.en_html)
        self.assertIn('rel="canonical" href="https://orbi.build/zh/compare/"', self.zh_html)
        self.assertIn('hreflang="en" href="https://orbi.build/compare/"', self.zh_html)

    def test_the_epics_competitors_are_all_named(self) -> None:
        for page in (self.en, self.zh):
            for name in ("OpenClaw", "Copilot", "Claude Managed Agents", "OpenAI Codex", "Devin", "OpenHands", "Hermes Agent"):
                self.assertIn(name, page.text, name)

    def test_hero_leads_with_the_most_similar_competitor(self) -> None:
        """Issue #56: the hero primary deep dive is the closest peer, OpenHands;
        OpenClaw stays reachable as the hero secondary, Hermes from the page."""
        for html, page, primary, secondary, hermes in (
            (self.en_html, self.en, "/compare/openhands/", "/compare/openclaw/", "/compare/hermes-agent/"),
            (self.zh_html, self.zh, "/zh/compare/openhands/", "/zh/compare/openclaw/", "/zh/compare/hermes-agent/"),
        ):
            hero = re.search(r'<section class="compare-hero.*?</section>', html, re.DOTALL)
            self.assertIsNotNone(hero, "compare hero section not found")
            hero_html = hero.group(0)
            self.assertIn(f'class="button button-signal" href="{primary}"', hero_html)
            self.assertIn(f'class="button button-ghost" href="{secondary}"', hero_html)
            self.assertIn(hermes, [href for _, href in page.hrefs])

    def test_live_dive_statuses_match_the_published_pages(self) -> None:
        """Published deep dives are live, and every published or research
        entry points to its page or research ticket."""
        for page in (self.en, self.zh):
            statuses = [
                attrs.get("class", "")
                for tag, attrs in page.elements
                if tag == "span" and "dive-status" in attrs.get("class", "")
            ]
            self.assertTrue(statuses)
            self.assertEqual(
                len([cls for cls in statuses if "is-live" in cls]), 6, statuses
            )
        # A published or research entry must not become a dead end.
        for html in (self.en_html, self.zh_html):
            entries = re.findall(r"<li>(.*?)</li>", html, re.DOTALL)
            self.assertEqual(len(entries), 7, entries)
            for entry in entries:
                self.assertIn('<a href="', entry, entry)

    def test_the_closing_heading_names_the_choice_dimension(self) -> None:
        """Issue #54: the closing H2 states the real decision axis — where
        the thing runs — in both languages."""
        for page, heading in (
            (self.en, "Choose by where it runs"),
            (self.zh, "按运行位置选择"),
        ):
            self.assertIn(heading, page.headings)


class ManagedAgentsComparisonTests(unittest.TestCase):
    def test_bilingual_pages_are_canonical_and_sourced(self) -> None:
        for path, canonical, alternate, terms in (
            (MANAGED_EN_PATH, "/compare/managed-agents/", "/zh/compare/managed-agents/", ("Brain", "Hands", "$0.08/session-hour", "verified 2026-09-07")),
            (MANAGED_ZH_PATH, "/zh/compare/managed-agents/", "/compare/managed-agents/", ("Brain", "Hands", "$0.08/session-hour", "核实于 2026-09-07")),
        ):
            html, page = parse(path)
            self.assertIn(f'rel="canonical" href="https://orbi.build{canonical}"', html)
            self.assertIn(f'href="https://orbi.build{alternate}"', html)
            self.assertTrue(all(term in page.text for term in terms), page.text)
            self.assertIn("https://www.anthropic.com/engineering/managed-agents", html)

    def test_overviews_link_the_managed_agents_dive(self) -> None:
        for path, href in ((COMPARE_INDEX_EN_PATH, "/compare/managed-agents/"), (COMPARE_INDEX_ZH_PATH, "/zh/compare/managed-agents/")):
            html, page = parse(path)
            self.assertIn(href, [link for _, link in page.hrefs])

    def test_overviews_have_the_complete_matrix_and_vendor_risk_section(self) -> None:
        for path, terms in (
            (COMPARE_INDEX_EN_PATH, ("Same destination, different ownership", "OpenAI Codex", "Pricing", "Degradation", "Audit / data", "Supply / policy", "Account access", "verified 2026-09-07")),
            (COMPARE_INDEX_ZH_PATH, ("终点相同，所有权不同", "OpenAI Codex", "涨价", "降级", "审计 / 数据", "断供 / 政策", "账号访问", "核实于 2026-09-07")),
        ):
            html, page = parse(path)
            self.assertTrue(all(term in page.text for term in terms), page.text)
            tables = [tag for tag, _ in page.elements if tag == "table"]
            self.assertGreaterEqual(len(tables), 2)
            for href in ("/compare/managed-agents/", "/compare/github-copilot-coding-agent/", "/compare/devin/"):
                if path == COMPARE_INDEX_EN_PATH:
                    self.assertIn(href, [link for _, link in page.hrefs])
            self.assertIn("https://github.com/orbi-build/orbi-website/issues/8", [link for _, link in page.hrefs])


OPENHANDS_EN_PATH = ROOT / "public" / "compare" / "openhands" / "index.html"
OPENHANDS_ZH_PATH = ROOT / "public" / "zh" / "compare" / "openhands" / "index.html"


class OpenHandsComparisonTests(unittest.TestCase):
    """Issue #12: bilingual, sourced OpenHands comparison."""

    def test_pages_are_canonical_bilingual_and_dated(self) -> None:
        for path, canonical, alternate, date in (
            (OPENHANDS_EN_PATH, "/compare/openhands/", "/zh/compare/openhands/", "verified 2026-09-07"),
            (OPENHANDS_ZH_PATH, "/zh/compare/openhands/", "/compare/openhands/", "核实于 2026-09-07"),
        ):
            html, page = parse(path)
            self.assertIn(f'rel="canonical" href="https://orbi.build{canonical}"', html)
            self.assertIn(f'hreflang="{"zh-CN" if path == OPENHANDS_EN_PATH else "en"}"', html)
            self.assertIn(f"href=\"https://orbi.build{alternate}\"", html)
            self.assertIn(date, page.text)

    def test_openhands_contract_is_sourced(self) -> None:
        for path in (OPENHANDS_EN_PATH, OPENHANDS_ZH_PATH):
            html, page = parse(path)
            self.assertIn("OpenHands", page.text)
            for fact in ("Docker", "BYOK", "GitHub", "REST API", "MIT"):
                self.assertIn(fact, page.text, fact)
            for source in (
                "https://github.com/All-Hands-AI/OpenHands",
                "https://github.com/OpenHands/software-agent-sdk",
                "https://github.com/OpenHands/automation",
            ):
                self.assertIn(source, html, source)

    def test_overviews_and_indexes_publish_the_pages(self) -> None:
        for index_path, href in (
            (COMPARE_INDEX_EN_PATH, "/compare/openhands/"),
            (COMPARE_INDEX_ZH_PATH, "/zh/compare/openhands/"),
        ):
            _, page = parse(index_path)
            self.assertIn(href, [link for _, link in page.hrefs])
        sitemap = (ROOT / "public" / "sitemap.xml").read_text(encoding="utf-8")
        llms = (ROOT / "public" / "llms.txt").read_text(encoding="utf-8")
        for url in ("https://orbi.build/compare/openhands/", "https://orbi.build/zh/compare/openhands/"):
            self.assertIn(url, sitemap)
            self.assertIn(url, llms)


def compare_tables(html: str) -> list[tuple[str, list[str]]]:
    """(class attribute, header texts) for every shipped .compare-table."""
    tables = []
    for match in re.finditer(r'<table class="([^"]*)">(.*?)</table>', html, re.DOTALL):
        head = re.search(r"<thead>(.*?)</thead>", match.group(2), re.DOTALL)
        headers = []
        if head:
            headers = [
                unescape(re.sub(r"<[^>]+>", "", cell)).strip()
                for cell in re.findall(r"<th[^>]*>(.*?)</th>", head.group(1), re.DOTALL)
            ]
        tables.append((match.group(1), headers))
    return tables


class CompareTableOrbiColumnTests(unittest.TestCase):
    """Issue #53: every .compare-table marks its Orbi column for the CSS.

    The stylesheet tints column 2 by default; risk tables carry the Orbi
    trade-off in column 3 and mark .compare-table-orbi-last; the hermes
    sources table has no Orbi column and marks .compare-table-no-orbi.
    Assertions read the shipped markup so a table rework that moves or drops
    the Orbi column fails here instead of silently losing the highlight.
    """

    ORBI_LAST_PAGES = (
        COMPARE_INDEX_EN_PATH,
        COMPARE_INDEX_ZH_PATH,
        ROOT / "public" / "compare" / "codex" / "index.html",
        ROOT / "public" / "zh" / "compare" / "codex" / "index.html",
    )
    NO_ORBI_PAGES = (HERMES_EN_PATH, HERMES_ZH_PATH)
    ALL_PAGES = sorted(
        {
            COMPARE_INDEX_EN_PATH,
            COMPARE_INDEX_ZH_PATH,
            *ROOT.glob("public/compare/*/index.html"),
            *ROOT.glob("public/zh/compare/*/index.html"),
        }
    )

    def test_stylesheet_marks_the_orbi_column(self) -> None:
        css = (ROOT / "public" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(
            ".compare-table:not(.compare-table-no-orbi):not(.compare-table-orbi-last) thead th:nth-child(2)",
            css,
        )
        self.assertIn(
            ".compare-table:not(.compare-table-no-orbi):not(.compare-table-orbi-last) tbody td:nth-child(2)",
            css,
        )
        self.assertIn(".compare-table-orbi-last thead th:nth-child(3)", css)
        self.assertIn(".compare-table-orbi-last tbody td:nth-child(3)", css)
        self.assertIn("background: rgba(92, 214, 181, 0.13);", css)
        self.assertIn("box-shadow: inset 2px 0 0 var(--run), inset -2px 0 0 var(--run);", css)

    def test_every_compare_table_marks_its_orbi_column(self) -> None:
        for path in self.ALL_PAGES:
            with self.subTest(page=str(path)):
                html = path.read_text(encoding="utf-8")
                tables = compare_tables(html)
                self.assertTrue(tables, f"{path} ships no compare-table")
                for classes, headers in tables:
                    names = classes.split()
                    self.assertEqual(names[0], "compare-table", (path, names))
                    if "compare-table-orbi-last" in names:
                        self.assertGreaterEqual(len(headers), 3, (path, headers))
                        self.assertIn("Orbi", headers[2], (path, headers))
                    elif "compare-table-no-orbi" in names:
                        self.assertTrue(headers, path)
                    else:
                        self.assertGreaterEqual(len(headers), 2, (path, headers))
                        self.assertEqual(headers[1], "Orbi", (path, headers))

    def test_the_risk_tables_carry_the_orbi_last_mark(self) -> None:
        for path in self.ORBI_LAST_PAGES:
            with self.subTest(page=str(path)):
                html = path.read_text(encoding="utf-8")
                marked = [
                    classes
                    for classes, _ in compare_tables(html)
                    if "compare-table-orbi-last" in classes.split()
                ]
                self.assertEqual(len(marked), 1, path)

    def test_the_hermes_sources_table_opts_out(self) -> None:
        for path in self.NO_ORBI_PAGES:
            with self.subTest(page=str(path)):
                html = path.read_text(encoding="utf-8")
                marked = [
                    classes
                    for classes, _ in compare_tables(html)
                    if "compare-table-no-orbi" in classes.split()
                ]
                self.assertEqual(len(marked), 1, path)


if __name__ == "__main__":
    unittest.main()
