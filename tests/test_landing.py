#!/usr/bin/env python3
"""Read the shipped landing HTML (public/index.html), not a fixture."""

from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "public" / "index.html"
WORKER_PATH = ROOT / "src" / "worker.js"

HOOK = "在你自己的机器和代码环境里"
HOOK_JOB = "让 AI 工程任务可靠、可审计、可恢复地完成。"
OFFER = "GitHub Issue 自动推进为经过实现、独立审查、测试并合并的 PR。"
FACTORY_SLOGAN = "软件工厂的工厂"
STEPS = ("领取", "实现", "独立 Review", "会话内修复", "精确 Merge", "失败可恢复")


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[tuple[str, str]] = []
        self._href: str | None = None
        self._buf: list[str] = []
        self.text_chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        got = {k: v or "" for k, v in attrs}
        if tag == "a" and "cta" in got.get("class", "").split():
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


class LandingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.html = HTML_PATH.read_text(encoding="utf-8")
        cls.page = PageParser()
        cls.page.feed(cls.html)

    def test_hero_sentence_in_markup(self) -> None:
        self.assertIn(HOOK, self.html)
        self.assertIn(HOOK_JOB, self.html)
        self.assertIn(OFFER, self.html)
        self.assertNotIn(FACTORY_SLOGAN, self.html)
        self.assertNotIn("factory OS", self.html)

    def test_two_ctas_point_at_github(self) -> None:
        hrefs = [href for _, href in self.page.hrefs]
        self.assertGreaterEqual(len(hrefs), 2, self.page.hrefs)
        primary, secondary = hrefs[0], hrefs[1]
        self.assertTrue(primary, "primary CTA href empty")
        self.assertTrue(secondary, "secondary CTA href empty")
        self.assertIn("github.com/orbi-build", primary)
        self.assertTrue(
            "github.com/orbi-build" in secondary
            or "/releases/" in secondary
        )

    def test_workflow_steps_are_page_copy(self) -> None:
        for name in STEPS:
            with self.subTest(step=name):
                self.assertIn(name, self.page.text)

    def test_worker_keeps_www_to_apex(self) -> None:
        worker = WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn('"www.orbi.build"', worker)
        self.assertIn('"orbi.build"', worker)


if __name__ == "__main__":
    unittest.main()
