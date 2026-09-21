/**
 * TypeScript types for the SiteGrade contract
 */

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface Site {
  id: string;
  url: string;
  domain: string;
  owner: string;
  grade: Grade;
  security_score: number | bigint;
  accessibility_score: number | bigint;
  security_grade: Grade;
  accessibility_grade: Grade;
  failed: string;
  checks_json: string;
  last_audited_at: string;
  history_json: string;
}

export const SECURITY_CHECKS = ["hsts", "csp", "nosniff", "framing", "referrer", "no_mixed_content"] as const;
export const ACCESSIBILITY_CHECKS = [
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
] as const;

export type CheckKey = (typeof SECURITY_CHECKS)[number] | (typeof ACCESSIBILITY_CHECKS)[number];

/** `null` means the check does not apply to this page. */
export type Checks = { reachable: boolean } & Record<CheckKey, boolean | null>;

export interface AuditRecord {
  date: string;
  grade: Grade;
  security: number;
  accessibility: number;
}

export const CHECK_INFO: Record<CheckKey, { label: string; fix: string }> = {
  hsts: { label: "HSTS (180 days+)", fix: "Send Strict-Transport-Security: max-age=15552000 or longer." },
  csp: {
    label: "Content-Security-Policy",
    fix: "Send a CSP with default-src or script-src that avoids * and 'unsafe-eval'.",
  },
  nosniff: { label: "X-Content-Type-Options", fix: "Send X-Content-Type-Options: nosniff." },
  framing: {
    label: "Clickjacking protection",
    fix: "Send X-Frame-Options: DENY or a CSP frame-ancestors directive.",
  },
  referrer: { label: "Referrer-Policy", fix: "Send a Referrer-Policy such as strict-origin-when-cross-origin." },
  no_mixed_content: { label: "No plain-http resources", fix: "Load every script, image, frame and stylesheet over https." },
  lang: { label: "Page language", fix: 'Set <html lang="en"> (or the right language).' },
  title: { label: "Page title", fix: "Give the page a non-empty <title>." },
  main_landmark: { label: "Main landmark", fix: "Wrap the primary content in <main>." },
  single_h1: { label: "Exactly one h1", fix: "Use a single <h1> that names the page." },
  heading_order: { label: "Heading order", fix: "Do not skip heading levels (h1 to h3 without an h2)." },
  img_alt: { label: "Image alt text", fix: 'Give every <img> an alt attribute (alt="" for decorative images).' },
  form_labels: { label: "Form labels", fix: "Associate every input with a <label>, aria-label or aria-labelledby." },
  control_names: { label: "Named links & buttons", fix: "Give icon-only links and buttons text or an aria-label." },
  zoomable: { label: "Pinch-zoom allowed", fix: "Remove user-scalable=no and maximum-scale below 2 from the viewport meta." },
  labels_meaningful: {
    label: "Descriptive labels",
    fix: 'Replace "click here" / file-name labels with text that says where a link goes or what an image shows.',
  },
};

export interface TransactionReceipt {
  status: string;
  hash: string;
  blockNumber?: number;
  [key: string]: any;
}

export function parseChecks(json: string | undefined): Partial<Checks> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Partial<Checks>) : {};
  } catch {
    return {};
  }
}

export function parseHistory(json: string | undefined): AuditRecord[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as AuditRecord[]) : [];
  } catch {
    return [];
  }
}

export const GRADE_STYLES: Record<Grade, string> = {
  A: "bg-green-500/20 text-green-400 border-green-500/40",
  B: "bg-lime-500/20 text-lime-300 border-lime-500/40",
  C: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  D: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  F: "bg-red-500/20 text-red-400 border-red-500/40",
};

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    const rest = `${u.pathname}${u.search}`;
    return rest === "/" ? "" : rest;
  } catch {
    return "";
  }
}
