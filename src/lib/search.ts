type RankedSource<T> = {
  source: T;
  score: number;
};

type SearchableSource = {
  title?: string | null;
  excerpt?: string | null;
  search_text?: string | null;
  canonical_url?: string | null;
  published_at?: string | null;
  price_micro_usdc?: number | null;
  publisher?: {
    name?: string | null;
  } | null;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "approach",
  "are",
  "can",
  "compare",
  "explain",
  "for",
  "from",
  "how",
  "into",
  "latest",
  "summarize",
  "the",
  "their",
  "this",
  "what",
  "with"
]);

const QUERY_EXPANSIONS: Record<string, string[]> = {
  "402": ["x402", "payment", "payments", "required", "http", "stablecoin"],
  agent: ["agents", "agentic", "autonomous"],
  agentkit: ["agent", "agents", "coinbase", "cdp", "wallet", "wallets", "onchain"],
  arc: ["circle", "gateway", "testnet", "usdc"],
  authorization: ["authorizations", "signature", "signatures", "settlement"],
  authorizations: ["authorization", "signature", "signatures", "settlement"],
  cdp: ["coinbase", "agentkit", "wallet", "onchain"],
  circle: ["gateway", "usdc", "nanopayments", "wallets"],
  controlled: ["developer", "wallet", "wallets", "custody"],
  developer: ["controlled", "wallet", "wallets", "circle"],
  gateway: ["circle", "x402", "facilitator", "settlement", "usdc"],
  nanopayment: ["nanopayments", "x402", "payment", "payments", "gateway", "settlement"],
  nanopayments: ["nanopayment", "x402", "payment", "payments", "gateway", "settlement"],
  offchain: ["authorization", "authorizations", "signature", "signatures"],
  payment: ["payments", "x402", "stablecoin", "usdc", "settlement"],
  payments: ["payment", "x402", "stablecoin", "usdc", "settlement"],
  protocol: ["standard", "http", "x402"],
  rails: ["payments", "settlement", "gateway", "stablecoin"],
  settle: ["settlement", "settles", "authorization", "gateway"],
  settlement: ["settle", "settles", "authorization", "gateway", "usdc"],
  stablecoin: ["stablecoins", "usdc", "payments", "settlement", "rails"],
  stablecoins: ["stablecoin", "usdc", "payments", "settlement", "rails"],
  wallet: ["wallets", "agentkit", "cdp", "developer", "controlled"],
  wallets: ["wallet", "agentkit", "cdp", "developer", "controlled"],
  x402: ["402", "payment", "payments", "required", "http", "nanopayment", "nanopayments", "gateway", "facilitator", "authorization", "authorizations", "settlement", "stablecoin", "usdc"]
};

const PHRASE_EXPANSIONS: Array<[RegExp, string[]]> = [
  [/\bagent\s*kit\b/i, ["agentkit", "coinbase", "cdp", "wallet", "wallets", "onchain"]],
  [/\bdeveloper[-\s]controlled\b/i, ["developer", "controlled", "wallet", "wallets", "circle"]],
  [/\bhttp\s*402\b/i, ["x402", "payment", "required", "stablecoin"]],
  [/\bpayment\s*required\b/i, ["x402", "402", "http", "stablecoin"]],
  [/\bstablecoin\s*payment\s*rails?\b/i, ["stablecoin", "payments", "settlement", "usdc", "gateway"]],
  [/\boffchain\s*authorizations?\b/i, ["authorization", "authorizations", "signature", "settlement"]]
];

export function queryTerms(query: string, maxTerms = 18) {
  const normalized = query.toLowerCase();
  const terms: string[] = [];
  for (const term of normalized.split(/\W+/)) {
    addTerm(terms, term);
    for (const expansion of QUERY_EXPANSIONS[term] || []) {
      addTerm(terms, expansion);
    }
  }
  for (const [pattern, expansions] of PHRASE_EXPANSIONS) {
    if (pattern.test(query)) {
      for (const expansion of expansions) {
        addTerm(terms, expansion);
      }
    }
  }
  return terms.slice(0, maxTerms);
}

export function querySearchClauses(query: string, maxTerms = 14) {
  return queryTerms(query, maxTerms)
    .map((term) => term.replace(/[%*,().]/g, ""))
    .filter((term) => term.length > 1);
}

export function rankSources<T extends SearchableSource>(query: string, sources: T[], limit: number) {
  return sources
    .map((source) => ({ source, score: scoreSource(query, source) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || sourceTime(b.source) - sourceTime(a.source))
    .slice(0, limit)
    .map((entry) => entry.source);
}

export function scoreSource(query: string, source: SearchableSource) {
  const baseTerms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
  const expandedTerms = queryTerms(query);
  const text = sourceText(source);
  const title = (source.title || "").toLowerCase();
  const url = (source.canonical_url || "").toLowerCase();
  const publisher = (source.publisher?.name || "").toLowerCase();

  let score = 0;
  for (const term of baseTerms) {
    score += text.includes(term) ? 12 : 0;
    score += title.includes(term) ? 10 : 0;
    score += url.includes(term) ? 6 : 0;
    score += publisher.includes(term) ? 5 : 0;
  }
  for (const term of expandedTerms) {
    score += text.includes(term) ? 4 : 0;
    score += title.includes(term) ? 4 : 0;
    score += url.includes(term) ? 2 : 0;
  }
  score += freshnessBoost(source.published_at);
  if ((source.price_micro_usdc || 0) <= 1_000) score += 2;
  return score;
}

export function rankedEntries<T extends SearchableSource>(query: string, sources: T[], limit: number): RankedSource<T>[] {
  return sources
    .map((source) => ({ source, score: scoreSource(query, source) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || sourceTime(b.source) - sourceTime(a.source))
    .slice(0, limit);
}

function addTerm(terms: string[], rawTerm: string) {
  const term = rawTerm.toLowerCase().trim();
  if (term.length < 2 || STOP_WORDS.has(term) || terms.includes(term)) return;
  terms.push(term);
}

function sourceText(source: SearchableSource) {
  return [
    source.title,
    source.excerpt,
    source.search_text,
    source.canonical_url,
    source.publisher?.name
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sourceTime(source: SearchableSource) {
  if (!source.published_at) return 0;
  const time = new Date(source.published_at).getTime();
  return Number.isFinite(time) ? time : 0;
}

function freshnessBoost(date: string | null | undefined) {
  if (!date) return 0;
  const ageDays = (Date.now() - new Date(date).getTime()) / 86_400_000;
  if (ageDays < 14) return 4;
  if (ageDays < 90) return 2;
  return 0;
}
