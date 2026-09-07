#!/usr/bin/env python3
"""Read the shipped landing HTML, not a fixture."""

from html.parser import HTMLParser
from html import unescape
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
EN_PATH = ROOT / "public" / "index.html"
ZH_PATH = ROOT / "public" / "zh" / "index.html"
WORKER_PATH = ROOT / "src" / "worker.js"

FACTORY_SLOGAN = "软件工厂的工厂"
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
        self.assertLessEqual(len(en_title), 65, en_title)
        self.assertLessEqual(len(en_desc), 260, len(en_desc))
        for term in ("AI coding agent", "GitHub Issues", "open-source"):
            self.assertIn(term.lower(), (en_title + " " + en_desc).lower(), term)

        zh_title = re.search(r"<title>([^<]+)</title>", self.zh_html).group(1)
        zh_desc = re.search(r'name="description" content="([^"]+)"', self.zh_html).group(1)
        for term in ("AI 编程 Agent", "GitHub Issue", "自托管"):
            self.assertIn(term, zh_title + " " + zh_desc, term)

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

    def test_no_generic_factory_os_or_nineties_type(self) -> None:
        for html in (self.en_html, self.zh_html):
            self.assertNotIn(FACTORY_SLOGAN, html)
            self.assertNotIn("factory OS", html)
            self.assertNotIn("Barlow Condensed", html)
            self.assertNotIn("Noto Serif SC", html)

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

    def test_primary_navigation_keeps_only_first_visit_actions(self) -> None:
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
            self.assertNotIn(">Direction<", primary_nav)
            self.assertNotIn(">Roadmap<", primary_nav)
            self.assertNotIn(">方向<", primary_nav)
            self.assertNotIn(">路线图<", primary_nav)

    def test_language_switch_uses_readable_names(self) -> None:
        for html in (self.en_html, self.zh_html):
            self.assertNotIn("🇺🇸", html)
            self.assertNotIn("🇨🇳", html)
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
            self.assertEqual(ctas["cloud-start"], "/api/login")
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

    def test_hero_leads_with_github_issues_without_a_second_workspace(self) -> None:
        self.assertIn("Turn GitHub Issues into reviewed software", self.en.text)
        self.assertIn("No new workspace", self.en.text)
        self.assertIn("让 GitHub Issue 变成经过审查的软件", self.zh.text)
        self.assertIn("不用迁移工作流", self.zh.text)

    def test_cloud_is_a_direction_not_a_shipping_claim(self) -> None:
        for page in (self.en, self.zh):
            cloud_sections = [
                attrs for tag, attrs in page.elements
                if tag == "section" and attrs.get("id") == "run-orbi"
            ]
            self.assertEqual(cloud_sections[0].get("data-status"), "direction")
        self.assertIn("Self-hosted, free forever", self.en.text)
        self.assertIn("Managed Cloud", self.en.text)
        self.assertIn("commercial managed service", self.en.text)
        self.assertIn("Platform subscription + managed runtime + model usage", self.en.text)
        self.assertIn("自托管，永久免费", self.zh.text)
        self.assertIn("托管 Cloud", self.zh.text)
        self.assertIn("商业托管服务", self.zh.text)
        self.assertIn("平台订阅 + 托管运行时 + 模型用量", self.zh.text)

    def test_cloud_entry_separates_start_from_application(self) -> None:
        for page, state, start_label, apply_label in (
            (self.en, "FOUNDING PILOT · LIMITED SEATS", "Start Cloud with GitHub", "Apply / contact us"),
            (self.zh, "创始试点 · 席位有限", "用 GitHub 开始 Cloud", "申请 / 联系我们"),
        ):
            self.assertIn(state, page.text)
            self.assertTrue(any(href == "/api/login" and text.startswith(start_label) for text, href in page.hrefs))
            self.assertTrue(any(href == "/apply" and text.startswith(apply_label) for text, href in page.hrefs))

    def test_cloud_login_is_environment_configured_and_drops_tenant_query(self) -> None:
        import tomllib
        with open(ROOT / "wrangler.toml", "rb") as handle:
            config = tomllib.load(handle)
        self.assertEqual(config["vars"]["CLOUD_LOGIN_URL"], "https://beta.orbi.build/api/login")
        self.assertEqual(config["env"]["beta"]["vars"]["CLOUD_LOGIN_URL"], "https://beta.orbi.build/api/login")
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn("new URL(cloudBaseUrl)", worker)
        self.assertIn("CLOUD_LOGIN_URL", worker)
        self.assertNotIn("cloud.orbi.build", worker)
        self.assertNotIn("beta-cloud.orbi.build", worker)

    def test_cloud_faq_matches_pilot_reality(self) -> None:
        for html, not_yet in (
            (self.en_html, "in design and not yet shipping"),
            (self.zh_html, "还在设计中，尚未上线"),
        ):
            self.assertNotIn(not_yet, html)

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
        self.assertNotIn('"\u2014"', js)
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

    def test_install_path_is_concrete_not_just_a_link(self) -> None:
        """"Install it yourself" should show what installing actually costs,
        not send the reader to the docs to find out."""
        for html in (self.en_html, self.zh_html):
            self.assertIn("git clone https://github.com/orbi-build/orbi.git", html)
            self.assertIn("orbi setup --config orbi.toml", html)
            # the honest prerequisites, so nobody discovers systemd halfway in
            self.assertIn("systemd", html)

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

    def test_stats_authenticate_github_without_exposing_the_secret(self) -> None:
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn("env.GITHUB_TOKEN", worker)
        self.assertIn("Authorization", worker)
        self.assertIn("Bearer", worker)
        self.assertNotIn("GITHUB_TOKEN", self.en_html)
        self.assertNotIn("GITHUB_TOKEN", self.zh_html)

    def test_star_chart_endpoint_stays_round(self) -> None:
        """`preserveAspectRatio="none"` stretched the SVG 2.6x horizontally,
        so the endpoint circle rendered as a 12x5 ellipse and the stroke
        thinned unevenly. The dot is positioned in CSS instead, and the
        stroke opts out of scaling."""
        demo = (ROOT / "public" / "demo.js").read_text(encoding="utf-8")
        css = (ROOT / "public" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("non-scaling-stroke", demo)
        self.assertNotIn('shape("circle"', demo)
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

    def test_apply_pairs_name_and_telegram_on_one_row(self) -> None:
        """Name and Telegram are both short; pairing them keeps the form from
        reading as a long column of single inputs. Stacks under 640px."""
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        self.assertIn('<div class="field-row">', apply_html)
        self.assertIn(".field-row { display:grid; grid-template-columns:1fr 1fr;", apply_html)
        self.assertIn(".field-row { grid-template-columns:1fr;", apply_html)
        row_start = apply_html.index('<div class="field-row">')
        row_end = apply_html.index('id="f-email"')
        row = apply_html[row_start:row_end]
        self.assertIn('id="f-name"', row)
        self.assertIn('id="f-tg"', row)

    def test_apply_pairs_the_two_pricing_selects(self) -> None:
        """Both are short dropdowns; side by side they read as one question
        about volume rather than two more rows to get through."""
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        start = apply_html.index('id="f-ai-spend"')
        row_open = apply_html.rindex('<div class="field-row">', 0, start)
        row_close = apply_html.index('id="f-pain"', start)
        row = apply_html[row_open:row_close]
        self.assertIn('id="f-ai-spend"', row)
        self.assertIn('id="f-volume"', row)

    def test_apply_marks_every_required_field(self) -> None:
        """A field the form rejects must look required before it is rejected.
        name carried `required` with no marker, so it read as optional and got
        skipped — then the submit failed on it."""
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        import re

        required_ids = re.findall(r'<(?:input|textarea)[^>]*id="([^"]+)"[^>]*\brequired\b', apply_html)
        required_ids += re.findall(r'<(?:input|textarea)[^>]*\brequired\b[^>]*id="([^"]+)"', apply_html)
        required_ids = sorted(set(required_ids))
        # Telegram already identifies and reaches the person, so a nickname is
        # one more thing to abandon the form over. Only tg and scenario are
        # genuinely needed to act on an application.
        self.assertEqual(required_ids, ["f-scenario", "f-tg"], required_ids)

        for field_id in required_ids:
            start = apply_html.index('for="%s"' % field_id)
            label = apply_html[start:apply_html.index("</label>", start)]
            self.assertIn('class="req"', label, "%s has no required marker" % field_id)

    def test_language_switch_keeps_the_required_markers(self) -> None:
        """setLang() assigns innerHTML on each label, which wipes the nested
        <span class="req">*</span> — English visitors saw no required markers
        at all. The marker has to live outside what the switch overwrites."""
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        import re

        for match in re.finditer(r'<label for="([^"]+)"([^>]*)>(.*?)</label>', apply_html, re.S):
            field_id, attrs, body = match.groups()
            if 'class="req"' not in body:
                continue
            # a label whose own data-zh/data-en is swapped in would lose the
            # marker; the swapped element must be an inner span instead
            self.assertNotIn("data-zh=", attrs, "%s label is overwritten wholesale" % field_id)

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

    def test_apply_pairs_email_with_agent_tools(self) -> None:
        """Both are single-line optional inputs that sat on their own rows.
        Paired, they read as two quick extras and the required scenario box
        moves further up the page."""
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        start = apply_html.index('id="f-email"')
        row_open = apply_html.rindex('<div class="field-row">', 0, start)
        row_close = apply_html.index('id="f-scenario"', start)
        row = apply_html[row_open:row_close]
        self.assertIn('id="f-email"', row)
        self.assertIn('id="f-agent"', row)
        # the row must be their own, not the name/telegram one above
        self.assertNotIn('id="f-tg"', row)
        self.assertNotIn('id="f-name"', row)

    def test_apply_does_not_ask_for_identity_or_team_size(self) -> None:
        """Free text that nobody answers comparably ("3"), and team size
        already surfaces in the scenario answer. One less field to abandon."""
        apply_html = (ROOT / "public" / "apply.html").read_text(encoding="utf-8")
        self.assertNotIn('name="role"', apply_html)
        self.assertNotIn('id="f-role"', apply_html)
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertNotIn('field(body, "role")', worker)

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
        self.assertIn("branches:\n      - main", workflow)
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("cloudflare/wrangler-action@v3", workflow)
        self.assertIn('node-version: "20.19.0"', workflow)
        self.assertIn('wranglerVersion: "4.34.0"', workflow)
        self.assertIn("npm test", workflow)
        self.assertIn("command: deploy --env beta", workflow)
        self.assertIn("CLOUDFLARE_API_TOKEN", workflow)
        self.assertIn("CLOUDFLARE_ACCOUNT_ID", workflow)
        self.assertIn("vars.CLOUDFLARE_ACCOUNT_ID", workflow)
        self.assertNotIn("secrets.CLOUDFLARE_ACCOUNT_ID", workflow)
        self.assertIn("beta.orbi.build/compare/", workflow)
        self.assertIn("beta.orbi.build/zh/compare/", workflow)
        self.assertLess(workflow.index("npm test"), workflow.index("command: deploy"))
        self.assertLess(workflow.index("command: deploy"), workflow.index("curl"))

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
        self.assertNotIn("String(err.message || err)", worker)
        self.assertIn("upstream unavailable", worker)


COMPARE_EN_PATH = ROOT / "public" / "compare" / "openclaw" / "index.html"
COMPARE_ZH_PATH = ROOT / "public" / "zh" / "compare" / "openclaw" / "index.html"
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
        """English pages do not ship the CJK webfont (REVIEW.md P1-3)."""
        self.assertNotIn("Noto+Sans+SC", self.en_html)
        self.assertIn("Noto+Sans+SC", self.zh_html)

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
        """English pages do not ship the CJK webfont (REVIEW.md P1-3)."""
        self.assertNotIn("Noto+Sans+SC", self.en_html)
        self.assertIn("Noto+Sans+SC", self.zh_html)

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
        the thing runs — in both languages, and the retired "Pick by the
        job" wording has no residual copies on the compare pages."""
        retired = ("Pick by the job", "按活选工具")
        for html, page, heading in (
            (self.en_html, self.en, "Choose by where it runs"),
            (self.zh_html, self.zh, "按运行位置选择"),
        ):
            self.assertIn(heading, page.headings)
            for phrase in retired:
                self.assertNotIn(phrase, html)
        for path in (COMPARE_EN_PATH, COMPARE_ZH_PATH):
            html = path.read_text(encoding="utf-8")
            for phrase in retired:
                self.assertNotIn(phrase, html)


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
                        self.assertNotIn("Orbi", headers[1], (path, headers))
                    elif "compare-table-no-orbi" in names:
                        self.assertTrue(headers, path)
                        for header in headers:
                            self.assertNotIn("Orbi", header, (path, headers))
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
