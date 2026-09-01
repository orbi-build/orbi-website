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


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[tuple[str, str]] = []
        self._href: str | None = None
        self._buf: list[str] = []
        self.text_chunks: list[str] = []
        self.elements: list[tuple[str, dict[str, str]]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        got = {k: v or "" for k, v in attrs}
        self.elements.append((tag, got))
        if tag == "a":
            self._href = got.get("href", "")
            self._buf = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href is not None:
            self.hrefs.append(("".join(self._buf).strip(), self._href))
            self._href = None
            self._buf = []

    def handle_data(self, data: str) -> None:
        self.text_chunks.append(data)
        if self._href is not None:
            self._buf.append(data)

    @property
    def text(self) -> str:
        return " ".join(self.text_chunks)


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
        self.assertIn("Software keeps shipping", self.en_html)

    def test_chinese_page_exists(self) -> None:
        self.assertIn('lang="zh-CN"', self.zh_html)
        self.assertIn("软件继续交付", self.zh_html)

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
        self.assertTrue(any("/zh/" in href or href.endswith("/zh") for href in en_hrefs), en_hrefs)
        self.assertTrue(any(href == "/" or href.endswith("orbi.build/") for href in zh_hrefs), zh_hrefs)

    def test_language_switch_uses_readable_names(self) -> None:
        for html in (self.en_html, self.zh_html):
            self.assertNotIn("🇺🇸", html)
            self.assertNotIn("🇨🇳", html)
            self.assertIn(">EN<", html)
            self.assertIn(">中文<", html)

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
        self.assertIn("Platform subscription + managed runtime + model usage", self.en.text)
        self.assertIn("自托管，永久免费", self.zh.text)
        self.assertIn("托管 Cloud", self.zh.text)
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

    def test_worker_keeps_www_to_apex(self) -> None:
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn('"www.orbi.build"', worker)
        self.assertIn('"orbi.build"', worker)
        self.assertIn('"/stats"', worker)
        self.assertIn("type:issue state:closed", worker)
        self.assertIn("is:pr is:merged", worker)


if __name__ == "__main__":
    unittest.main()
