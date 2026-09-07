#!/usr/bin/env python3
"""The /configure page and its worker proxy, read from the shipped files.

Issue #16: the API key / endpoint configuration UI. The page is a static
asset; the browser calls the same-origin
/api/tenants/{tenant_id}/model-config, which the Worker transparently
proxies to orbi-cloud (ORBI_CLOUD_API). The four field names and both
paths are the documented contract from the Issue's API comment — they are
asserted verbatim so a renamed field cannot ship green.
"""

from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
PAGE_PATH = ROOT / "public" / "configure.html"
WORKER_PATH = ROOT / "src" / "worker.js"

# The POST body keys of the orbi-cloud contract, exactly as the Issue's API
# comment spells them (camelCase baseUrl/apiKey, snake_case provider_id/model_id).
CONTRACT_FIELDS = {"provider_id", "baseUrl", "apiKey", "model_id"}


class ConfigurePageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.html = PAGE_PATH.read_text(encoding="utf-8")

    def control_tag(self, control_id: str) -> str:
        """The full HTML tag of one form control, so assertions about
        name/required cannot accidentally match a different field."""
        start = self.html.index('id="%s"' % control_id)
        open_ = self.html.rindex("<", 0, start)
        return self.html[open_:self.html.index(">", start) + 1]

    def label_for(self, control_id: str) -> str:
        start = self.html.index('for="%s"' % control_id)
        return self.html[start:self.html.index("</label>", start)]

    def test_page_is_a_noindex_tool_page_with_canonical(self) -> None:
        """The page only means something with ?tenant=, and must not compete
        with the landing pages in search: same treatment as /apply."""
        self.assertIn('name="robots" content="noindex, follow"', self.html)
        self.assertIn('rel="canonical" href="https://orbi.build/configure"', self.html)
        self.assertIn('id="langBtn"', self.html)

    def test_form_posts_exactly_the_four_contract_fields(self) -> None:
        """The POST body keys ARE the contract keys: a renamed control sends
        a wrong key and orbi-cloud stores nothing, so the form may not carry
        any named control beyond the four."""
        named = set(
            re.findall(r'<(?:input|textarea|select)[^>]*\bname="([^"]+)"', self.html)
        )
        self.assertEqual(named, CONTRACT_FIELDS, sorted(named))
        for control_id, name in (
            ("f-provider", "provider_id"),
            ("f-baseurl", "baseUrl"),
            ("f-apikey", "apiKey"),
            ("f-model", "model_id"),
        ):
            tag = self.control_tag(control_id)
            self.assertIn('name="%s"' % name, tag, control_id)

    def test_only_the_provider_fields_gate_the_submit(self) -> None:
        """apiKey stays optional: a local endpoint (the Issue's own example
        is http://127.0.0.1:8080/v1) usually has no key. The other three
        identify the provider — missing one makes every save fail."""
        for control_id in ("f-provider", "f-baseurl", "f-model"):
            self.assertIn("required", self.control_tag(control_id), control_id)
            self.assertIn('class="req"', self.label_for(control_id), control_id)
        self.assertNotIn("required", self.control_tag("f-apikey"))
        # The browser must not persist a model key into its own form history.
        self.assertIn('autocomplete="off"', self.control_tag("f-apikey"))

    def test_tenant_id_comes_from_the_url_and_cannot_escape_the_segment(self) -> None:
        """orbi-website has no tenant session — the tenant context IS the
        ?tenant= parameter. It is interpolated into a URL path, so it must
        be encoded: a tenant id containing / or ? must not rewrite the path
        onto some other endpoint."""
        self.assertIn(
            'new URLSearchParams(location.search).get("tenant")', self.html
        )
        self.assertIn(
            '"/api/tenants/" + encodeURIComponent(tenant) + "/model-config"',
            self.html,
        )
        # The browser only ever talks to this origin: no absolute API URL.
        self.assertNotIn('fetch("http', self.html)

    def test_status_area_names_both_states_and_guides_the_unconfigured(self) -> None:
        """Acceptance 1/4: unconfigured must show onboarding steps, and the
        configured state must say so in so many words (模型已配置)."""
        for text in ("模型已配置", "未配置"):
            self.assertIn(text, self.html)
        self.assertIn('id="status-badge"', self.html)
        self.assertIn('id="guide"', self.html)
        # Onboarding steps are an ordered list, and the tenant parameter is
        # part of the instruction — it is the only way back into the page.
        self.assertRegex(self.html, r"<ol")
        self.assertIn("?tenant=", self.html)

    def test_the_masked_key_comes_from_the_server_not_the_page(self) -> None:
        """Acceptance 4: the current config is displayed with apiKey masked.
        The masking rule is orbi-cloud's (its GET response already returns
        the masked value) — a second, local mask would disagree with the
        stored one and leak format assumptions the website does not own."""
        self.assertIn("cfg.apiKey", self.html)
        self.assertNotIn("mask", self.html.lower())

    def test_save_shows_the_outcome_and_blocks_double_submission(self) -> None:
        """Acceptance 2/3/6: the button locks while the request is in flight
        (measured on /apply: three clicks made three POSTs), success says
        配置已保存, and an upstream error is shown, not swallowed."""
        self.assertIn("submit.disabled", self.html)
        self.assertIn("data-msg-sending", self.html)
        self.assertIn("配置已保存", self.html)
        # The result area is announced: same a11y contract as /apply.
        self.assertIn('id="result" role="status" aria-live="polite"', self.html)
        # A 400 carries details (field, reason) — surface them, the user can
        # act on "baseUrl: must be a valid URL" but not on a bare 400.
        self.assertIn("details", self.html)

    def test_required_fields_are_checked_before_the_round_trip(self) -> None:
        """novalidate turns the browser's own check off, so the page must do
        it — a missing field should not cost a round-trip and come back as a
        raw error string that never names the field (the /apply lesson)."""
        self.assertIn("novalidate", self.html)
        self.assertIn("el.required", self.html)


class ModelConfigProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.worker = WORKER_PATH.read_text(encoding="utf-8")

    def handler_source(self) -> str:
        start = self.worker.index("async function handleModelConfig")
        end = self.worker.index("async function handleFetch")
        return self.worker[start:end]

    def test_proxy_forwards_the_documented_path_shape(self) -> None:
        """The contract path is /api/tenants/{tenant_id}/model-config. The
        browser cannot call orbi-cloud directly (no production domain is
        committed, no credential may live in page code), so the Worker
        forwards the same path bytes to the configured base."""
        self.assertIn("/^\\/api\\/tenants\\/([^/]+)\\/model-config$/", self.worker)
        self.assertIn("env.ORBI_CLOUD_API", self.worker)
        # The base URL is deploy-time configuration, never a committed URL.
        # (The whole-file scan is wrong on purpose: an unrelated robots
        # comment already names *.workers.dev.)
        handler = self.handler_source()
        self.assertNotIn("workers.dev", handler)
        self.assertNotIn("cloud.orbi", handler)
        self.assertNotIn("https://", handler)

    def test_proxy_fails_fast_without_a_configured_base(self) -> None:
        """An unset ORBI_CLOUD_API must produce a named 503, not a fetch to
        "undefined/api/..." that fails as a confusing 500 (the GITHUB_TOKEN
        school of failing fast)."""
        self.assertIn("orbi-cloud API is not configured", self.worker)

    def test_upstream_verdicts_pass_through_uncached(self) -> None:
        """400/404/500 semantics belong to orbi-cloud: status and JSON body
        (including details.field/reason) pass through untouched, and the
        response — it carries the masked key — is never cached."""
        handler = self.handler_source()
        self.assertIn("upstream.status", handler)
        self.assertIn("no-store", handler)

    def test_the_proxy_never_logs_the_posted_key(self) -> None:
        """The POST body carries the tenant's apiKey. /api/apply logs the
        parsed payload on insert failure so the lead can be recovered by
        hand — that pattern is forbidden here: the only log this path may
        emit is the method and path, and there may be only one."""
        handler = self.handler_source()
        self.assertEqual(handler.count("console."), 1, handler)
        self.assertIn("model_config_upstream_failed", handler)
        log_call = handler[handler.index("console.error"):]
        log_call = log_call[: log_call.index(";")]
        self.assertNotIn("raw", log_call)
        self.assertNotIn("body", log_call)

    def test_post_bodies_stay_bounded(self) -> None:
        """The proxy is an unauthenticated write path into orbi-cloud: the
        same 16KB bound as /api/apply applies before anything is forwarded."""
        handler = self.handler_source()
        self.assertIn("MAX_BODY_BYTES", handler)


if __name__ == "__main__":
    unittest.main()
