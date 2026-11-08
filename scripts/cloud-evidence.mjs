// Issue #1238: the Cloud pricing section states two numbers a visitor can check
// and one signed quote — evidence at the decision point, not an adjective.
//
// The numbers are written at build time from site/data/cloud-evidence.json and
// refreshed weekly (the Orbi Cloud side publishes the same figure through
// orbi-cloud#3154; until that lands the file is the source). A number that was
// not measured is null in that file: the line then does not render at all — no
// zero, no half-empty shell. A number that is present but not a positive integer
// fails the build, naming the file and the field.
//
// The quote is not copied here: it lives once in site/data/social-proof.json
// (the record that also carries the consent), and this module renders that
// record next to the price. A quote without a recorded consent never reaches
// this far — validateSocialProof() in the build already fails on it.

const COPY = {
  en: {
    releases: (count) => `Orbi shipped all ${count} of its own releases`,
    // "30&nbsp;days" keeps the time window on one piece: on a phone the second
    // clause wraps, and a lone "days" under the rest would be the widow the
    // layout test forbids.
    merged: (count) => `${count} PRs merged across its public repos in the last 30&nbsp;days`,
    record: "The record →",
    recordHref: "/evidence/",
    role: "creator of k8e",
    open: "“",
    close: "”",
  },
  zh: {
    releases: (count) => `Orbi 自己的 ${count} 个版本都是它发的`,
    merged: (count) => `过去 30 天在公开仓库合并 ${count} 个 PR`,
    record: "公开记录 →",
    recordHref: "/zh/evidence/",
    role: "k8e 作者",
    open: "「",
    close: "」",
  },
};

// Attribute/text escaping for data-file values (the same contract as the build's
// escAttr; this module cannot import it without a circular import).
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const count = (value, field, source) => {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `${source}: ${field} must be a positive integer (or null when the number was not measured), got ${JSON.stringify(value)}`,
    );
  }
  return value;
};

// null means "not measured": the caller renders no line for it.
export function validateCloudEvidence(data, source = "site/data/cloud-evidence.json") {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${source}: expected an object with the evidence numbers`);
  }
  if (typeof data.quotePerson !== "string" || data.quotePerson.trim() === "") {
    throw new Error(`${source}: quotePerson must name the person whose quote sits beside the price`);
  }
  return {
    releases: count(data.releasesShippedByOrbi, "releasesShippedByOrbi", source),
    merged: count(data.mergedPullRequestsLast30Days, "mergedPullRequestsLast30Days", source),
    quotePerson: data.quotePerson.trim(),
    measuredAt: typeof data.measuredAt === "string" ? data.measuredAt.trim() : "",
  };
}

// The quote's link is the record's person_url: site/data/social-proof.json
// records where the person said it and where they agreed to be quoted (that
// consent gate is validateSocialProof's), and a URL that record does not carry
// is not invented here.
function quoteRecord(socialProof, person, source) {
  const record = socialProof.find((candidate) => candidate.person === person && typeof candidate.quote === "string" && candidate.quote.trim() !== "");
  if (!record) {
    throw new Error(`${source}: quotePerson "${person}" has no quote in site/data/social-proof.json`);
  }
  if (typeof record.person_url !== "string" || record.person_url.trim() === "") {
    throw new Error(`site/data/social-proof.json: the quote from "${person}" has no person_url to link at`);
  }
  return record;
}

// The block that replaces <!--@cloud-evidence--> on the two Cloud pages. The
// numbers ride their own spans so a phone can stack the two facts and the link
// instead of leaving one word alone on the line above the quote.
export function renderCloudEvidence({
  evidence,
  socialProof,
  lang,
  source = "site/data/cloud-evidence.json",
}) {
  const copy = COPY[lang];
  if (!copy) throw new Error(`cloud evidence: no copy for lang "${lang}"`);
  const record = quoteRecord(socialProof, evidence.quotePerson, source);
  const numbers = evidence.releases !== null && evidence.merged !== null;
  const line = numbers
    ? [
      '          <p class="pricing-evidence-line">',
      `            <span class="pricing-evidence-item">${copy.releases(`<span class="pricing-evidence-count">${evidence.releases}</span>`)}</span>`,
      `            <span class="pricing-evidence-item">${copy.merged(`<span class="pricing-evidence-count">${evidence.merged}</span>`)}</span>`,
      `            <a class="pricing-evidence-record" href="${copy.recordHref}">${copy.record}</a>`,
      "          </p>",
    ].join("\n")
    : "";
  const quote = [
      '          <figure class="pricing-quote">',
      `            <blockquote class="pricing-quote-text">${copy.open}${esc(record.quote.trim())}${copy.close}</blockquote>`,
      '            <figcaption class="pricing-quote-person">',
      `              <span class="pricing-quote-name">${esc(record.person)}</span>`,
      `              <span class="pricing-quote-role">${esc(copy.role)}</span>`,
      `              <a class="pricing-quote-handle" href="${esc(record.person_url)}" rel="noopener">${esc(record.handle)}</a>`,
      "            </figcaption>",
      "          </figure>",
  ].join("\n");
  // Provenance for whoever refreshes the numbers; never rendered to a visitor.
  const provenance = evidence.measuredAt
    ? `        <!-- Issue #1238: the numbers below come from site/data/cloud-evidence.json, measured ${esc(evidence.measuredAt)} and refreshed weekly; a null number in that file means "not measured" and the line is not rendered. -->`
    : "";
  return [provenance, '        <div class="pricing-evidence">', line, quote, "        </div>"].filter((part) => part !== "").join("\n");
}
