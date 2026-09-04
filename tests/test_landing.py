#!/usr/bin/env python3
"""Read the shipped landing HTML, not a fixture."""

from html.parser import HTMLParser
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
CLOUD_DISCUSSION = "https://github.com/orbi-build/orbi/discussions/225"
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

    def test_primary_navigation_keeps_only_first_visit_actions(self) -> None:
        for html, labels in (
            (
                self.en_html,
                ("How it works", "Docs", "GitHub", "Apply"),
            ),
            (
                self.zh_html,
                ("产品怎么运作", "文档", "GitHub", "报名"),
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
            self.assertEqual(ctas["cloud"], CLOUD_DISCUSSION)

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


if __name__ == "__main__":
    unittest.main()
