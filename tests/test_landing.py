#!/usr/bin/env python3
"""Read the shipped landing HTML, not a fixture."""

from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
EN_PATH = ROOT / "public" / "index.html"
ZH_PATH = ROOT / "public" / "zh" / "index.html"
WORKER_PATH = ROOT / "src" / "worker.js"

FACTORY_SLOGAN = "软件工厂的工厂"
GITHUB = "https://github.com/orbi-build/orbi"
DOCS_EN = "https://docs.orbi.build"
DOCS_ZH = "https://docs.orbi.build/zh"


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[tuple[str, str]] = []
        self._href: str | None = None
        self._buf: list[str] = []
        self.text_chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        got = {k: v or "" for k, v in attrs}
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
        self.assertIn("Finish the engineering job", self.en_html)
        self.assertIn("chat window is not a delivery system", self.en_html)
        self.assertIn("GitHub is the only system of record", self.en_html)
        self.assertIn("your GPU", self.en_html)

    def test_chinese_page_exists(self) -> None:
        self.assertIn('lang="zh-CN"', self.zh_html)
        self.assertIn("在你自己的机器和代码环境里", self.zh_html)
        self.assertIn("可靠、可审计、可恢复", self.zh_html)
        self.assertIn("聊天窗口不是交付系统", self.zh_html)
        self.assertIn("GitHub 是唯一的任务状态", self.zh_html)

    def test_no_factory_slogan_or_nineties_type(self) -> None:
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

    def test_delivery_loop_is_on_the_page(self) -> None:
        for name in ("Claim", "Implement", "Independent review", "Merge"):
            self.assertIn(name, self.en.text)
        for name in ("领取", "实现", "独立 Review", "精确 Merge"):
            self.assertIn(name, self.zh.text)

    def test_worker_keeps_www_to_apex(self) -> None:
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn('"www.orbi.build"', worker)
        self.assertIn('"orbi.build"', worker)
        self.assertIn("/zh/index.html", worker)


if __name__ == "__main__":
    unittest.main()
