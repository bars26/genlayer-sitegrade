"""Direct-mode tests for the SiteGrade contract."""

import json

from tests.direct.conftest import to_hex

CONTRACT_PATH = "contracts/site_grade.py"

URL = "https://app.example.com/"
URL_RE = r"^https://app\.example\.com/?$"

GOOD_HEADERS = {
    "Strict-Transport-Security": b"max-age=63072000; includeSubDomains; preload",
    "Content-Security-Policy": b"default-src 'self'; frame-ancestors 'none'",
    "X-Content-Type-Options": b"nosniff",
    "Referrer-Policy": b"strict-origin-when-cross-origin",
}

GOOD_HTML = """<!doctype html>
<html lang="en">
<head><title>Example dApp</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
<main>
  <h1>Example dApp</h1>
  <h2>Swap tokens</h2>
  <img src="/logo.png" alt="Example dApp logo">
  <label for="amount">Amount</label><input id="amount" type="text">
  <label>Slippage <input type="number"></label>
  <input type="text" aria-label="Search markets">
  <button>Connect wallet</button>
  <a href="/docs">Read the documentation</a>
  <a href="/x"><img src="/x.png" alt="Follow us on X"></a>
</main>
</body></html>"""


def _mock_page(direct_vm, html=GOOD_HTML, headers=None, status=200):
    direct_vm.mock_web(
        URL_RE,
        {
            "method": "GET",
            "response": {
                "status": status,
                "headers": GOOD_HEADERS if headers is None else headers,
                "body": html.encode("utf-8"),
            },
        },
    )


def _mock_llm(direct_vm, descriptive=True):
    direct_vm.mock_llm(r".*", f'{{"descriptive": {"true" if descriptive else "false"}}}')


def _setup(direct_vm, html=GOOD_HTML, headers=None, descriptive=True):
    direct_vm.clear_mocks()
    _mock_page(direct_vm, html, headers)
    _mock_llm(direct_vm, descriptive)


def _register(direct_vm, direct_deploy, direct_alice, **kwargs):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    _setup(direct_vm, **kwargs)
    return contract, contract.register_site(URL)


def _failed(contract, site_id):
    failed = contract.get_site(site_id).failed
    return set(failed.split(",")) if failed else set()


# --- overall grading --------------------------------------------------------


def test_clean_page_with_good_headers_earns_an_a(direct_vm, direct_deploy, direct_alice):
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice)

    site = contract.get_site(site_id)
    assert site.domain == "app.example.com"
    assert (site.security_score, site.accessibility_score) == (100, 100)
    assert site.grade == "A"
    assert site.failed == ""
    assert contract.get_grade(site_id) == "A"
    checks = json.loads(site.checks_json)
    assert checks["reachable"] is True and checks["labels_meaningful"] is True


def test_overall_grade_is_the_weaker_area(direct_vm, direct_deploy, direct_alice):
    # Perfect accessibility; only 4 of 6 security checks pass (67% -> C).
    headers = {k: v for k, v in GOOD_HEADERS.items() if k in ("Strict-Transport-Security", "Content-Security-Policy", "X-Content-Type-Options")}
    headers["Content-Security-Policy"] = b"default-src 'self'"  # no frame-ancestors -> framing fails too
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, headers=headers)

    site = contract.get_site(site_id)
    assert site.accessibility_grade == "A"
    assert site.security_score == 67  # hsts, csp, nosniff, no_mixed_content of 6
    assert site.security_grade == "C"
    assert site.grade == "C"


# --- security checks --------------------------------------------------------


def test_each_missing_security_header_is_reported(direct_vm, direct_deploy, direct_alice):
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, headers={})

    assert _failed(contract, site_id) == {"hsts", "csp", "nosniff", "framing", "referrer"}


def test_short_hsts_max_age_fails(direct_vm, direct_deploy, direct_alice):
    headers = dict(GOOD_HEADERS, **{"Strict-Transport-Security": b"max-age=3600"})
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, headers=headers)

    assert _failed(contract, site_id) == {"hsts"}


def test_csp_without_script_or_default_rules_fails_but_frame_ancestors_still_counts(
    direct_vm, direct_deploy, direct_alice
):
    headers = dict(GOOD_HEADERS, **{"Content-Security-Policy": b"frame-ancestors 'self'; upgrade-insecure-requests"})
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, headers=headers)

    assert _failed(contract, site_id) == {"csp"}


def test_wildcard_or_unsafe_eval_csp_does_not_count(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    for policy in (b"default-src *", b"script-src 'self' 'unsafe-eval'; frame-ancestors 'none'"):
        headers = dict(GOOD_HEADERS, **{"Content-Security-Policy": policy})
        _setup(direct_vm, headers=headers)
        site_id = contract.register_site(URL)
        assert "csp" in _failed(contract, site_id), policy


def test_unsafe_inline_is_tolerated_in_csp(direct_vm, direct_deploy, direct_alice):
    headers = dict(GOOD_HEADERS, **{"Content-Security-Policy": b"default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'"})
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, headers=headers)

    assert "csp" not in _failed(contract, site_id)


def test_x_frame_options_satisfies_framing(direct_vm, direct_deploy, direct_alice):
    headers = {
        k: v for k, v in GOOD_HEADERS.items() if k != "Content-Security-Policy"
    }
    headers["X-Frame-Options"] = b"DENY"
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, headers=headers)

    assert _failed(contract, site_id) == {"csp"}  # framing passes via X-Frame-Options


def test_header_names_are_case_insensitive(direct_vm, direct_deploy, direct_alice):
    headers = {k.lower(): v for k, v in GOOD_HEADERS.items()}
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, headers=headers)

    assert contract.get_grade(site_id) == "A"


def test_plain_http_subresources_are_mixed_content(direct_vm, direct_deploy, direct_alice):
    html = GOOD_HTML.replace("<main>", '<main><script src="http://cdn.example.net/x.js"></script>')
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=html)

    assert _failed(contract, site_id) == {"no_mixed_content"}


def test_plain_http_navigation_links_are_not_mixed_content(direct_vm, direct_deploy, direct_alice):
    html = GOOD_HTML.replace("<main>", '<main><a href="http://legacy.example.org/">Legacy site</a>')
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=html)

    assert contract.get_site(site_id).failed == ""


# --- accessibility checks ---------------------------------------------------


def test_missing_lang_and_title_are_reported(direct_vm, direct_deploy, direct_alice):
    html = GOOD_HTML.replace('<html lang="en">', "<html>").replace("<title>Example dApp</title>", "")
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=html)

    assert _failed(contract, site_id) == {"lang", "title"}


def test_svg_title_is_not_the_document_title(direct_vm, direct_deploy, direct_alice):
    html = GOOD_HTML.replace("<title>Example dApp</title>", "").replace(
        "<main>", "<main><svg><title>Decorative</title></svg>"
    )
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=html)

    assert "title" in _failed(contract, site_id)


def test_missing_main_landmark_is_reported(direct_vm, direct_deploy, direct_alice):
    html = GOOD_HTML.replace("<main>", "<div>").replace("</main>", "</div>")
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=html)

    assert _failed(contract, site_id) == {"main_landmark"}


def test_role_main_counts_as_a_landmark(direct_vm, direct_deploy, direct_alice):
    html = GOOD_HTML.replace("<main>", '<div role="main">').replace("</main>", "</div>")
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=html)

    assert contract.get_site(site_id).failed == ""


def test_two_h1_headings_fail_single_h1(direct_vm, direct_deploy, direct_alice):
    html = GOOD_HTML.replace("<h2>Swap tokens</h2>", "<h1>Swap tokens</h1>")
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=html)

    assert _failed(contract, site_id) == {"single_h1"}


def test_skipped_heading_level_fails_heading_order(direct_vm, direct_deploy, direct_alice):
    html = GOOD_HTML.replace("<h2>Swap tokens</h2>", "<h4>Swap tokens</h4>")
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=html)

    assert _failed(contract, site_id) == {"heading_order"}


def test_images_without_alt_fail_but_empty_alt_is_decorative(direct_vm, direct_deploy, direct_alice):
    missing = GOOD_HTML.replace('<img src="/logo.png" alt="Example dApp logo">', '<img src="/logo.png">')
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=missing)
    assert _failed(contract, site_id) == {"img_alt"}

    decorative = GOOD_HTML.replace('<img src="/logo.png" alt="Example dApp logo">', '<img src="/logo.png" alt="">')
    _setup(direct_vm, html=decorative)
    second = contract.register_site(URL)
    assert contract.get_site(second).failed == ""


def test_unlabelled_form_control_fails(direct_vm, direct_deploy, direct_alice):
    html = GOOD_HTML.replace("<main>", '<main><input type="text" id="orphan">')
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=html)

    assert _failed(contract, site_id) == {"form_labels"}


def test_label_for_wrapping_label_and_aria_all_count(direct_vm, direct_deploy, direct_alice):
    # GOOD_HTML already uses all three association styles.
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice)

    assert "form_labels" not in _failed(contract, site_id)


def test_button_without_a_name_fails_control_names(direct_vm, direct_deploy, direct_alice):
    html = GOOD_HTML.replace("<main>", "<main><button><svg></svg></button>")
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=html)

    assert _failed(contract, site_id) == {"control_names"}


def test_aria_label_and_image_alt_name_controls(direct_vm, direct_deploy, direct_alice):
    html = GOOD_HTML.replace("<main>", '<main><button aria-label="Close dialog"><svg></svg></button>')
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=html)

    assert "control_names" not in _failed(contract, site_id)


def test_pinch_zoom_disabled_fails(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    for content in ("width=device-width, user-scalable=no", "width=device-width, maximum-scale=1"):
        html = GOOD_HTML.replace('content="width=device-width, initial-scale=1"', f'content="{content}"')
        _setup(direct_vm, html=html)
        site_id = contract.register_site(URL)
        assert _failed(contract, site_id) == {"zoomable"}, content


# --- LLM label judgement ----------------------------------------------------


def test_non_descriptive_labels_lower_the_accessibility_score(direct_vm, direct_deploy, direct_alice):
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, descriptive=False)

    assert _failed(contract, site_id) == {"labels_meaningful"}
    site = contract.get_site(site_id)
    assert site.accessibility_score == 90  # 9 of 10 checks
    assert site.accessibility_grade == "A"


def test_page_with_no_labels_skips_the_llm_check(direct_vm, direct_deploy, direct_alice):
    bare = '<!doctype html><html lang="en"><head><title>Hi</title></head><body><main><p>Hello</p></main></body></html>'
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.clear_mocks()
    _mock_page(direct_vm, bare, GOOD_HEADERS)  # no llm mock: any LLM call would fail
    site_id = contract.register_site(URL)

    assert json.loads(contract.get_site(site_id).checks_json)["labels_meaningful"] is None


def test_llm_verdict_must_be_a_json_boolean(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.clear_mocks()
    _mock_page(direct_vm)
    direct_vm.mock_llm(r".*", '{"descriptive": "false"}')  # a truthy string must not count

    with direct_vm.expect_revert("LLM response 'descriptive' field must be a JSON boolean"):
        contract.register_site(URL)


# --- a genuinely bad page ---------------------------------------------------


def test_a_bad_page_scores_poorly_on_both_areas(direct_vm, direct_deploy, direct_alice):
    bad = """<html><head></head><body>
    <div><h3>Welcome</h3><h1>One</h1><h1>Two</h1>
    <img src="a.png"><img src="b.png"><input type="text"><a href="/x"></a>
    <script src="http://cdn.example.net/a.js"></script></div></body></html>"""
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, html=bad, headers={}, descriptive=False)

    site = contract.get_site(site_id)
    assert site.grade == "F"
    assert site.security_grade == "F" and site.accessibility_grade == "F"
    assert {"hsts", "lang", "title", "img_alt", "form_labels", "control_names", "single_h1"} <= _failed(
        contract, site_id
    )


# --- registration, re-audit, views ------------------------------------------


def test_register_rejects_non_https_and_bad_urls(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    _setup(direct_vm)

    with direct_vm.expect_revert("url must be an https:// URL"):
        contract.register_site("http://app.example.com/")
    with direct_vm.expect_revert("url must include a public host name"):
        contract.register_site("https://localhost/")


def test_register_rejects_a_page_that_does_not_load(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.clear_mocks()
    _mock_page(direct_vm, status=503)
    _mock_llm(direct_vm)

    with direct_vm.expect_revert("Could not load the page"):
        contract.register_site(URL)


def test_audit_after_the_site_goes_down_grades_f(direct_vm, direct_deploy, direct_alice):
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice)
    assert contract.get_grade(site_id) == "A"

    direct_vm.clear_mocks()
    _mock_page(direct_vm, status=500)
    _mock_llm(direct_vm)

    assert contract.audit_site(site_id) == "F"
    site = contract.get_site(site_id)
    assert (site.security_score, site.accessibility_score) == (0, 0)


def test_audit_reflects_a_regression_and_records_history(direct_vm, direct_deploy, direct_alice):
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice)

    _setup(direct_vm, headers={})  # someone drops every security header
    contract.audit_site(site_id)

    history = contract.get_history(site_id)
    assert [h["grade"] for h in history][0] == "A"
    assert history[-1]["security"] < history[0]["security"]
    assert len(history) == 2


def test_history_is_capped_at_ten(direct_vm, direct_deploy, direct_alice):
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice)
    for _ in range(13):
        contract.audit_site(site_id)

    assert len(contract.get_history(site_id)) == 10


def test_audit_is_permissionless(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice)

    direct_vm.sender = direct_bob
    assert contract.audit_site(site_id) == "A"


def test_meets_grade_compares_against_the_overall_grade(direct_vm, direct_deploy, direct_alice):
    contract, site_id = _register(direct_vm, direct_deploy, direct_alice, descriptive=False)  # A (90/100)

    assert contract.meets_grade(site_id, "A") is True
    assert contract.meets_grade(site_id, "b") is True  # case-insensitive

    _setup(direct_vm, headers={})
    contract.audit_site(site_id)
    assert contract.meets_grade(site_id, "A") is False
    assert contract.meets_grade(site_id, "F") is True
    with direct_vm.expect_revert("min_grade must be one of A, B, C, D, F"):
        contract.meets_grade(site_id, "Z")


def test_list_sites_by_owner_scopes_correctly(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    _setup(direct_vm)
    a = contract.register_site(URL)
    direct_vm.sender = direct_bob
    b = contract.register_site(URL)

    assert contract.list_sites_by_owner(to_hex(direct_alice)) == [a]
    assert contract.list_sites_by_owner(to_hex(direct_bob)) == [b]
    assert sorted(contract.list_sites()) == sorted([a, b])


def test_owner_args_accept_address_shape(direct_vm, direct_deploy, direct_alice):
    """The genlayer CLI pre-encodes hex-looking --args as Address or int."""
    contract, _ = _register(direct_vm, direct_deploy, direct_alice)
    from genlayer.py.types import Address

    alice_hex = to_hex(direct_alice)
    assert contract.list_sites_by_owner(Address(alice_hex)) == contract.list_sites_by_owner(alice_hex)


# --- SPA shells: raw HTML is primary, render() only supplements -------------


def _module(direct_deploy_result):
    import sys

    return sys.modules["_contract_site_grade"]


def test_client_rendered_shell_is_judged_on_the_rendered_dom(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    direct_deploy(CONTRACT_PATH)
    module = _module(None)

    shell = module._PageAudit()
    shell.feed('<!doctype html><html lang="en"><head><title>App</title></head><body><div id="root"></div></body></html>')
    rendered = module._PageAudit()
    rendered.feed("<div><h1>Dashboard</h1><h2>Feeds</h2><a href='/a'>Open feed</a><a href='/b'>Open docs</a><button>Refresh</button></div>")

    assert shell.richness() < module._SHELL_RICHNESS
    assert module._choose_content_page(shell, rendered) is rendered


def test_a_rich_server_rendered_page_never_defers_to_render(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    direct_deploy(CONTRACT_PATH)
    module = _module(None)

    raw = module._PageAudit()
    raw.feed(GOOD_HTML)
    rendered = module._PageAudit()
    rendered.feed("<div><h1>Different</h1><h2>a</h2><h3>b</h3><a href='/1'>One</a><a href='/2'>Two</a><a href='/3'>Three</a></div>")

    assert raw.richness() >= module._SHELL_RICHNESS
    assert module._choose_content_page(raw, rendered) is raw


def test_document_level_facts_come_from_the_raw_html_even_for_shells(direct_vm, direct_deploy, direct_alice):
    """render() strips <html>/<head>; lang, title and viewport must still be read."""
    shell = '<!doctype html><html lang="en"><head><title>App</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>'
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.clear_mocks()
    _mock_page(direct_vm, shell)
    _mock_llm(direct_vm)
    site_id = contract.register_site(URL)

    failed = _failed(contract, site_id)
    assert "lang" not in failed and "title" not in failed and "zoomable" not in failed
