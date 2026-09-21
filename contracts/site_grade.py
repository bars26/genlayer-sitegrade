# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from html.parser import HTMLParser
from genlayer import *

_HISTORY_LIMIT = 10
_SAMPLE_LIMIT = 12
_HEADERS = {"user-agent": "SiteGrade/1.0 (GenLayer)"}

SECURITY_CHECKS = ("hsts", "csp", "nosniff", "framing", "referrer", "no_mixed_content")
ACCESSIBILITY_CHECKS = (
    "lang",
    "title",
    "main_landmark",
    "single_h1",
    "heading_order",
    "img_alt",
    "form_labels",
    "control_names",
    "zoomable",
    "labels_meaningful",
)

_GRADE_ORDER = ["F", "D", "C", "B", "A"]


def _grade(score: int) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 65:
        return "C"
    if score >= 50:
        return "D"
    return "F"


def _score(checks: dict, keys) -> int:
    """Percentage of applicable checks (non-null) that passed."""
    applicable = [checks[k] for k in keys if checks.get(k) is not None]
    if not applicable:
        return 0
    return round(100 * sum(1 for v in applicable if v is True) / len(applicable))


class _PageAudit(HTMLParser):
    """Collects the handful of accessibility facts SiteGrade judges."""

    _CONTROL_SKIP = ("hidden", "submit", "button", "reset", "image")
    _RESOURCE_TAGS = ("script", "img", "iframe", "source", "video", "audio", "link")

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lang = ""
        self.title = ""
        self.has_main = False
        self.h1_count = 0
        self.heading_levels = []
        self.heading_texts = []
        self.images = 0
        self.images_missing_alt = 0
        self.alt_texts = []
        self.blocks_zoom = False
        self.insecure_resources = 0
        self.label_for = set()
        self.controls_total = 0
        self.controls_unlabelled = []  # ids (or "") still needing a <label for>
        self.unnamed_named_elements = 0
        self.named_elements_total = 0
        self.link_texts = []
        self.button_texts = []
        self._in_title = False
        self._svg_depth = 0
        self._label_depth = 0
        self._heading = None
        self._frames = []

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag == "svg":
            self._svg_depth += 1
        elif tag == "html":
            self.lang = a.get("lang", "").strip()
        elif tag == "title" and self._svg_depth == 0:
            self._in_title = True
        if tag == "main" or a.get("role", "").lower() == "main":
            self.has_main = True

        if len(tag) == 2 and tag[0] == "h" and tag[1] in "123456":
            level = int(tag[1])
            self.heading_levels.append(level)
            if level == 1:
                self.h1_count += 1
            self._heading = []
        elif tag == "img":
            self.images += 1
            if "alt" not in a:
                self.images_missing_alt += 1
            elif a["alt"].strip():
                self.alt_texts.append(a["alt"].strip()[:60])
            if self._frames and a.get("alt", "").strip():
                self._frames[-1]["text"] += a["alt"]
        elif tag == "meta" and a.get("name", "").lower() == "viewport":
            content = a.get("content", "").lower().replace(" ", "")
            if "user-scalable=no" in content or "user-scalable=0" in content:
                self.blocks_zoom = True
            for part in content.split(","):
                if part.startswith("maximum-scale="):
                    try:
                        if float(part.split("=", 1)[1]) < 2:
                            self.blocks_zoom = True
                    except ValueError:
                        pass
        elif tag == "label":
            self._label_depth += 1
            if a.get("for"):
                self.label_for.add(a["for"])
        elif tag in ("input", "select", "textarea"):
            kind = a.get("type", "text").lower() if tag == "input" else tag
            if kind not in self._CONTROL_SKIP:
                self.controls_total += 1
                named = (
                    a.get("aria-label", "").strip()
                    or a.get("aria-labelledby", "").strip()
                    or a.get("title", "").strip()
                    or self._label_depth > 0
                )
                if not named:
                    self.controls_unlabelled.append(a.get("id", ""))
        elif tag == "button" or (tag == "a" and a.get("href")):
            self._frames.append(
                {
                    "tag": tag,
                    "named": bool(
                        a.get("aria-label", "").strip()
                        or a.get("aria-labelledby", "").strip()
                        or a.get("title", "").strip()
                    ),
                    "text": "",
                }
            )

        if tag in self._RESOURCE_TAGS:
            source = a.get("src", "") if tag != "link" else a.get("href", "")
            if source.lower().startswith("http://"):
                self.insecure_resources += 1

    def handle_endtag(self, tag):
        if tag == "svg" and self._svg_depth > 0:
            self._svg_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag == "label" and self._label_depth > 0:
            self._label_depth -= 1
        elif len(tag) == 2 and tag[0] == "h" and tag[1] in "123456" and self._heading is not None:
            text = " ".join("".join(self._heading).split())
            self.heading_texts.append(text[:80])
            self._heading = None
        elif tag in ("button", "a") and self._frames and self._frames[-1]["tag"] == tag:
            frame = self._frames.pop()
            text = " ".join(frame["text"].split())
            self.named_elements_total += 1
            if not (frame["named"] or text):
                self.unnamed_named_elements += 1
            elif text:
                (self.link_texts if tag == "a" else self.button_texts).append(text[:60])

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._heading is not None:
            self._heading.append(data)
        for frame in self._frames:
            frame["text"] += data

    def richness(self) -> int:
        """How much real UI the parsed markup contains (0 for an empty SPA shell)."""
        return (
            len(self.heading_levels)
            + self.images
            + self.controls_total
            + self.named_elements_total
        )

    def heading_order_ok(self) -> bool:
        previous = 0
        for level in self.heading_levels:
            if previous and level > previous + 1:
                return False
            previous = level
        return True

    def forms_ok(self) -> bool:
        return all(ident and ident in self.label_for for ident in self.controls_unlabelled)


_SHELL_RICHNESS = 5


def _choose_content_page(raw: "_PageAudit", rendered: "_PageAudit | None") -> "_PageAudit":
    """The raw HTTP body is the source of truth (it has <html lang>, <title>,
    the viewport meta). Only a client-rendered shell with almost no markup is
    judged on the rendered DOM instead, and only if that has more UI in it."""
    if rendered is not None and raw.richness() < _SHELL_RICHNESS and rendered.richness() > raw.richness():
        return rendered
    return raw


def _csp_ok(csp: str) -> bool:
    """A CSP that actually restricts scripts: it sets script-src or default-src,
    and neither allows every origin (*) nor 'unsafe-eval'. 'unsafe-inline' is
    tolerated because most frameworks still need it for hydration."""
    found = False
    for directive in csp.lower().split(";"):
        tokens = directive.split()
        if not tokens or tokens[0] not in ("script-src", "default-src"):
            continue
        found = True
        if "*" in tokens[1:] or "'unsafe-eval'" in tokens[1:]:
            return False
    return found


def _header(headers: dict, name: str) -> str:
    return headers.get(name, "")


def _hsts_ok(value: str) -> bool:
    for part in value.lower().replace(" ", "").split(";"):
        if part.startswith("max-age="):
            try:
                return int(part.split("=", 1)[1]) >= 15552000  # 180 days
            except ValueError:
                return False
    return False


@allow_storage
@dataclass
class Site:
    id: str
    url: str
    domain: str
    owner: Address
    grade: str  # overall = the weaker of the two areas
    security_score: u256
    accessibility_score: u256
    security_grade: str
    accessibility_grade: str
    failed: str  # comma list of failed check names
    checks_json: str  # latest observation, null = not applicable
    last_audited_at: str
    history_json: str  # last _HISTORY_LIMIT audits


class SiteGrade(gl.Contract):
    """On-chain frontend hygiene grades for dApp websites.

    Grant programs, directories and wallets all ask "is this project's
    frontend any good?" and get screenshots or self-reported badges. There
    is no neutral, repeatable answer. SiteGrade gives one: every validator
    independently loads the page and reads its HTTP headers, and consensus
    is reached (gl.eq_principle.strict_eq) on a small set of coarse
    booleans, so two validators seeing a slightly different page still
    agree.

    Security (from the response headers and the rendered DOM):
      HSTS (>= 180 days), a Content-Security-Policy that restricts scripts
      (no wildcard, no 'unsafe-eval'), X-Content-Type-Options: nosniff, clickjacking protection,
      a Referrer-Policy, and no plain-http subresources.

    Accessibility (from the rendered DOM):
      html lang, a page title, a main landmark, a single h1, no skipped
      heading levels, alt text on every image, labelled form controls,
      named links and buttons, and pinch-zoom not disabled -- plus the
      part no linter can do: an LLM reads the actual link, button, alt
      and heading texts and says whether they would make sense to a
      screen-reader user ("click here" and "image1.png" would not).

    Each area becomes a 0-100 score and an A-F grade; the overall grade is
    the weaker of the two. Anyone can re-audit a site, and consumers call
    meets_grade(site_id, "B") before listing or funding a frontend.
    """

    sites: TreeMap[str, Site]
    site_count: u256

    def __init__(self):
        self.site_count = u256(0)

    def _to_address(self, value) -> Address:
        if isinstance(value, Address):
            return value
        if isinstance(value, int):
            return Address(f"0x{value:040x}")
        return Address(value)

    def _text(self, value) -> str:
        return "" if value is None else str(value).strip()

    def _today(self) -> str:
        return gl.message_raw["datetime"][:10]

    def _validate_url(self, url: str) -> str:
        url = self._text(url)
        if not url.startswith("https://") or len(url) > 300 or any(c.isspace() for c in url):
            raise gl.vm.UserError("url must be an https:// URL (max 300 chars, no spaces)")
        host = url[len("https://") :].split("/", 1)[0].split("?", 1)[0]
        if not host or "." not in host or "@" in host:
            raise gl.vm.UserError("url must include a public host name")
        return url

    def _audit(self, url: str) -> dict:
        """One consensus audit of a page: a dict of coarse booleans (null = n/a)."""

        def audit() -> str:
            checks = {"reachable": False}
            for key in SECURITY_CHECKS + ACCESSIBILITY_CHECKS:
                checks[key] = None

            try:
                response = gl.nondet.web.get(url, headers=_HEADERS)
            except Exception:
                return json.dumps(checks, sort_keys=True)
            if response.status != 200:
                return json.dumps(checks, sort_keys=True)

            headers = {}
            for name, value in response.headers.items():
                text = value.decode("utf-8", errors="replace") if isinstance(value, bytes) else str(value)
                headers[str(name).lower()] = text
            raw_body = (response.body or b"").decode("utf-8", errors="replace")
            if not raw_body.strip():
                return json.dumps(checks, sort_keys=True)
            checks["reachable"] = True

            raw_page = _PageAudit()
            try:
                raw_page.feed(raw_body)
                raw_page.close()
            except Exception:
                pass

            rendered_page = None
            if raw_page.richness() < _SHELL_RICHNESS:
                # Client-rendered shell: render() returns the cleaned body
                # content only (no <html>/<head>), so it supplements the raw
                # document instead of replacing it.
                try:
                    rendered_html = gl.nondet.web.render(url, mode="html", wait_after_loaded="1500ms")
                    rendered_page = _PageAudit()
                    rendered_page.feed(rendered_html or "")
                    rendered_page.close()
                except Exception:
                    rendered_page = None
            page = _choose_content_page(raw_page, rendered_page)

            csp = _header(headers, "content-security-policy").lower()
            checks["hsts"] = _hsts_ok(_header(headers, "strict-transport-security"))
            checks["csp"] = _csp_ok(csp)
            checks["nosniff"] = "nosniff" in _header(headers, "x-content-type-options").lower()
            checks["framing"] = (
                _header(headers, "x-frame-options").lower().strip() in ("deny", "sameorigin")
                or "frame-ancestors" in csp
            )
            checks["referrer"] = bool(_header(headers, "referrer-policy").strip())
            checks["no_mixed_content"] = raw_page.insecure_resources == 0 and page.insecure_resources == 0

            checks["lang"] = bool(raw_page.lang)
            checks["title"] = bool(raw_page.title.strip())
            checks["main_landmark"] = raw_page.has_main or page.has_main
            checks["single_h1"] = page.h1_count == 1
            checks["heading_order"] = page.heading_order_ok()
            checks["img_alt"] = page.images_missing_alt == 0
            checks["form_labels"] = page.forms_ok()
            checks["control_names"] = page.unnamed_named_elements == 0
            checks["zoomable"] = not raw_page.blocks_zoom

            labels = {
                "link texts": page.link_texts[:_SAMPLE_LIMIT],
                "button texts": page.button_texts[:_SAMPLE_LIMIT],
                "image alt texts": page.alt_texts[:_SAMPLE_LIMIT],
                "headings": [t for t in page.heading_texts if t][:_SAMPLE_LIMIT],
            }
            if any(labels.values()):
                verdict = gl.nondet.exec_prompt(
                    f"""
Below are the visible link texts, button texts, image alt texts and
headings extracted from a web page. Decide whether, read out of context
by a screen-reader user, they are descriptive: each says where it goes or
what it does, alt texts describe their image (not file names like
"image1.png"), and headings outline the page. Vague labels such as
"click here", "read more" used repeatedly, "img", or bare file names
mean they are NOT descriptive. A few generic labels among many
descriptive ones are fine.

{json.dumps(labels, ensure_ascii=False)}

Respond in JSON: {{"descriptive": bool}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters, your
output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without
errors.
""",
                    response_format="json",
                )
                descriptive = verdict.get("descriptive")
                if not isinstance(descriptive, bool):
                    raise gl.vm.UserError("LLM response 'descriptive' field must be a JSON boolean")
                checks["labels_meaningful"] = descriptive
            return json.dumps(checks, sort_keys=True)

        checks = json.loads(gl.eq_principle.strict_eq(audit))
        meaningful = checks.get("labels_meaningful")
        if meaningful is not None and not isinstance(meaningful, bool):
            raise gl.vm.UserError("Equivalence-checked verdict was not a boolean")
        return checks

    def _apply(self, site: Site, checks: dict) -> None:
        security = _score(checks, SECURITY_CHECKS)
        accessibility = _score(checks, ACCESSIBILITY_CHECKS)
        if not checks["reachable"]:
            security, accessibility = 0, 0
        security_grade, accessibility_grade = _grade(security), _grade(accessibility)
        overall = min(security_grade, accessibility_grade, key=lambda g: _GRADE_ORDER.index(g))

        site.security_score = u256(security)
        site.accessibility_score = u256(accessibility)
        site.security_grade = security_grade
        site.accessibility_grade = accessibility_grade
        site.grade = overall
        site.failed = ",".join(
            k for k in SECURITY_CHECKS + ACCESSIBILITY_CHECKS if checks.get(k) is False
        )
        site.checks_json = json.dumps(checks, sort_keys=True)
        site.last_audited_at = self._today()

        try:
            history = json.loads(site.history_json) if site.history_json else []
        except ValueError:
            history = []
        history.append(
            {
                "date": self._today(),
                "grade": overall,
                "security": security,
                "accessibility": accessibility,
            }
        )
        site.history_json = json.dumps(history[-_HISTORY_LIMIT:], sort_keys=True)

    @gl.public.write
    def register_site(self, url: str) -> str:
        url = self._validate_url(url)
        checks = self._audit(url)
        if not checks["reachable"]:
            raise gl.vm.UserError("Could not load the page: it must answer HTTP 200 with HTML")

        site_id = f"site_{int(self.site_count)}"
        self.site_count = u256(int(self.site_count) + 1)
        domain = url[len("https://") :].split("/", 1)[0].split("?", 1)[0].lower()
        self.sites[site_id] = Site(
            id=site_id,
            url=url,
            domain=domain,
            owner=gl.message.sender_address,
            grade="F",
            security_score=u256(0),
            accessibility_score=u256(0),
            security_grade="F",
            accessibility_grade="F",
            failed="",
            checks_json="{}",
            last_audited_at="",
            history_json="[]",
        )
        self._apply(self.sites[site_id], checks)
        return site_id

    @gl.public.write
    def audit_site(self, site_id: str) -> str:
        """Permissionless: anyone can trigger a fresh consensus audit."""
        site = self.sites[site_id]
        self._apply(site, self._audit(site.url))
        return site.grade

    @gl.public.view
    def get_site(self, site_id: str) -> Site:
        return self.sites[site_id]

    @gl.public.view
    def get_grade(self, site_id: str) -> str:
        return self.sites[site_id].grade

    @gl.public.view
    def meets_grade(self, site_id: str, min_grade: str) -> bool:
        """True if the site's overall grade is at least min_grade (A best)."""
        wanted = self._text(min_grade).upper()
        if wanted not in _GRADE_ORDER:
            raise gl.vm.UserError("min_grade must be one of A, B, C, D, F")
        return _GRADE_ORDER.index(self.sites[site_id].grade) >= _GRADE_ORDER.index(wanted)

    @gl.public.view
    def get_history(self, site_id: str) -> list:
        site = self.sites[site_id]
        return json.loads(site.history_json) if site.history_json else []

    @gl.public.view
    def list_sites(self) -> list:
        return [s.id for s in self.sites.values()]

    @gl.public.view
    def list_sites_by_owner(self, owner: str) -> list:
        owner_addr = self._to_address(owner)
        return [s.id for s in self.sites.values() if s.owner == owner_addr]
