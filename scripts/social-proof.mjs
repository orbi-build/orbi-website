// Issue #226: the third-party social-proof section is data-driven. Every
// delivery or quote is one record in site/data/social-proof.json; this module
// is the only place that turns records into HTML, so adding one record never
// means editing a page. Two fixed shapes from one data source:
//
//   "home"     — the homepage grid directly after #orbi-stats: at most 6
//                cards, at most 2 quotes (consent date first), the rest the
//                newest deliveries with at most 2 per repository, then the
//                computed "N deliveries in other people's repositories" line.
//   "evidence" — the /evidence/#third-party list: every record, deliveries
//                grouped by repository (newest repository first, newest first
//                inside a group), the quotes group last.
//
// A quote without a recorded consent fails the build with the person's name:
// consent lives in the data file, never in someone's memory. The card colors
// are scoped by context (`.night` on the homes, paper background on
// /evidence/) in public/styles.css; the markup is identical everywhere.

const HOME_MAX_CARDS = 6;
const HOME_MAX_QUOTES = 2;
const HOME_MAX_PER_REPO = 2;

const COPY = {
  en: {
    homeTag: "THIRD-PARTY DELIVERIES",
    homeTitle: "Merged in other people's repositories",
    homeLede:
      "Orbi opened these pull requests in repositories it does not own. Every link opens the public GitHub record.",
    evidenceTag: "THIRD-PARTY RECORDS",
    evidenceTitle: "Deliveries in other people's repositories",
    evidenceLede:
      "Every third-party delivery and quote, grouped by repository: the pull requests Orbi opened in repositories it does not own, and what the people running it said. Newest first.",
    deliveriesLine: (n) =>
      n === 1
        ? "1 delivery in other people's repositories"
        : `${n} deliveries in other people's repositories`,
    noHumanReview: "no human review",
    quotesGroup: "Quotes",
    evidenceHref: "/evidence/#third-party",
  },
  zh: {
    homeTag: "他人仓库中的交付",
    homeTitle: "在其他人的仓库中合并",
    homeLede: "这些 PR 由 Orbi 在它不拥有的仓库里发起并合并。每个链接都指向公开的 GitHub 记录。",
    evidenceTag: "他人仓库记录",
    evidenceTitle: "他人仓库中的交付",
    evidenceLede:
      "全部第三方交付与引述，按仓库分组：Orbi 在它不拥有的仓库里发起的 pull request，以及运行者本人说的话。组内按时间倒序。",
    deliveriesLine: (n) => `他人仓库中已有 ${n} 次交付`,
    noHumanReview: "无人类 review",
    quotesGroup: "用户引述",
    evidenceHref: "/zh/evidence/#third-party",
  },
};

// Attribute/text escaping for data-file values, same contract as the build's
// escAttr (this module cannot import it without a circular import).
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const quoteText = (record) => (typeof record.quote === "string" ? record.quote.trim() : "");
const consentDate = (record) => record.consent?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "0000-00-00";
const isDelivery = (record) => record.repo != null && record.pr != null;

// Issue #226 consent gate: a non-empty quote with an empty consent fails the
// build, naming the person. A record that is neither a delivery nor a quote
// fails too — a typo must never silently drop a record from every section.
export function validateSocialProof(records, source = "site/data/social-proof.json") {
  for (const [index, record] of records.entries()) {
    if (quoteText(record) && !(typeof record.consent === "string" && record.consent.trim() !== "")) {
      throw new Error(
        `${source}: record ${index} (${record.person ?? "unnamed person"}): a quote without recorded consent must not ship — add a non-empty "consent" naming where and when it was given (Issue #226)`,
      );
    }
    if (!quoteText(record) && !isDelivery(record)) {
      throw new Error(
        `${source}: record ${index} is neither a delivery (repo + pr) nor a quote (quote) — every record must be one or the other (Issue #226)`,
      );
    }
  }
  return records;
}

const deliveriesNewestFirst = (records) =>
  records.filter(isDelivery).sort((a, b) => String(b.merged_at ?? "").localeCompare(String(a.merged_at ?? "")));
const quotesByConsent = (records) =>
  records.filter((record) => quoteText(record)).sort((a, b) => consentDate(b).localeCompare(consentDate(a)));

// The homepage's capped selection: quotes first (at most HOME_MAX_QUOTES), the
// remaining slots filled with the newest deliveries, at most HOME_MAX_PER_REPO
// per repository — one active user cannot fill the section. The walk skips a
// capped repository's older records and keeps filling from the others.
export function selectHomeCards(records) {
  const quotes = quotesByConsent(records).slice(0, HOME_MAX_QUOTES);
  const slots = HOME_MAX_CARDS - quotes.length;
  const perRepo = new Map();
  const deliveries = [];
  for (const record of deliveriesNewestFirst(records)) {
    if (deliveries.length >= slots) break;
    const used = perRepo.get(record.repo) ?? 0;
    if (used >= HOME_MAX_PER_REPO) continue;
    perRepo.set(record.repo, used + 1);
    deliveries.push(record);
  }
  return { quotes, deliveries };
}

// The evidence page's grouping: one group per repository in the order each
// repository's newest delivery merged, records newest first inside, quotes
// group last.
export function groupForEvidence(records) {
  const byRepo = new Map();
  for (const record of deliveriesNewestFirst(records)) {
    if (!byRepo.has(record.repo)) byRepo.set(record.repo, []);
    byRepo.get(record.repo).push(record);
  }
  return {
    repos: [...byRepo.entries()].map(([repo, repoRecords]) => ({ repo, records: repoRecords })),
    quotes: quotesByConsent(records),
  };
}

const githubRepoUrl = (repo) => `https://github.com/${repo}`;
const githubPrUrl = (repo, pr) => `https://github.com/${repo}/pull/${pr}`;

function renderDeliveryCard(record, copy) {
  return [
    `      <article class="proof-card">`,
    `        <p class="proof-card-repo"><a href="${esc(githubRepoUrl(record.repo))}" rel="noopener">${esc(record.repo)}</a></p>`,
    `        <h3 class="proof-card-title"><a href="${esc(githubPrUrl(record.repo, record.pr))}" rel="noopener">${esc(record.title)}</a></h3>`,
    `        <p class="proof-card-meta"><time datetime="${esc(record.merged_at)}">${esc(String(record.merged_at).slice(0, 10))}</time></p>`,
    // `no human review` only when there were zero: a non-zero count is never
    // claimed (the build has no data shape that would let it claim one).
    ...(record.human_reviews === 0 ? [`        <p class="proof-card-review">${copy.noHumanReview}</p>`] : []),
    `      </article>`,
  ].join("\n");
}

function renderQuoteCard(record, copy) {
  const lines = [
    `      <article class="proof-card proof-card-quote">`,
    `        <blockquote class="proof-card-quote-text"><p>${esc(record.quote)}</p></blockquote>`,
    `        <p class="proof-card-person"><span class="proof-card-name">${esc(record.person)}</span> <a class="proof-card-handle" href="${esc(record.person_url)}" rel="noopener">${esc(record.handle)}</a></p>`,
  ];
  // A PR line underneath only when the quote actually carries a repository —
  // a quote must never borrow a record it does not belong to.
  if (isDelivery(record)) {
    lines.push(
      `        <p class="proof-card-meta"><a href="${esc(githubPrUrl(record.repo, record.pr))}" rel="noopener">${esc(record.repo)}#${record.pr}</a></p>`,
    );
  }
  lines.push(`      </article>`);
  return lines.join("\n");
}

function renderHomeSection(records, lang) {
  const copy = COPY[lang];
  const { quotes, deliveries } = selectHomeCards(records);
  const cards = [
    ...quotes.map((record) => renderQuoteCard(record, copy)),
    ...deliveries.map((record) => renderDeliveryCard(record, copy)),
  ];
  return [
    `      <section class="social-proof shell" id="social-proof" aria-labelledby="social-proof-title">`,
    `        <p class="section-tag">${copy.homeTag}</p>`,
    `        <h2 id="social-proof-title">${copy.homeTitle}</h2>`,
    `        <p class="section-lede">${copy.homeLede}</p>`,
    `        <div class="social-proof-grid">`,
    ...cards,
    `        </div>`,
    `        <p class="social-proof-more"><a href="${copy.evidenceHref}">${copy.deliveriesLine(records.filter(isDelivery).length)} →</a></p>`,
    `      </section>`,
  ].join("\n");
}

function renderEvidenceSection(records, lang) {
  const copy = COPY[lang];
  const { repos, quotes } = groupForEvidence(records);
  const groups = [];
  for (const { repo, records: repoRecords } of repos) {
    groups.push(
      `        <div class="social-proof-group">`,
      `          <h3 class="social-proof-group-title"><a href="${esc(githubRepoUrl(repo))}" rel="noopener">${esc(repo)}</a></h3>`,
      `          <div class="social-proof-grid">`,
      ...repoRecords.map((record) => renderDeliveryCard(record, copy)),
      `          </div>`,
      `        </div>`,
    );
  }
  if (quotes.length > 0) {
    groups.push(
      `        <div class="social-proof-group">`,
      `          <h3 class="social-proof-group-title">${copy.quotesGroup}</h3>`,
      `          <div class="social-proof-grid">`,
      ...quotes.map((record) => renderQuoteCard(record, copy)),
      `          </div>`,
      `        </div>`,
    );
  }
  return [
    `      <section class="social-proof shell" id="third-party" aria-labelledby="third-party-title">`,
    `        <p class="section-tag">${copy.evidenceTag}</p>`,
    `        <h2 id="third-party-title">${copy.evidenceTitle}</h2>`,
    `        <p class="section-lede">${copy.evidenceLede}</p>`,
    ...groups,
    `      </section>`,
  ].join("\n");
}

export function renderSocialProof(records, lang, variant) {
  return variant === "evidence"
    ? renderEvidenceSection(records, lang)
    : renderHomeSection(records, lang);
}
