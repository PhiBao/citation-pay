import { getStore } from "@/lib/db";
import { payForSource } from "@/lib/payment";
import { formatMicroUsdc } from "@/lib/price";
import { assertAccountCanSpendToday, debitAccountForRun, type AccountSession } from "@/lib/accounts";
import { scoreSource } from "@/lib/search";
import type { AgentDecision, PaidSourceCard, PaymentReceipt, SourceWithPublisher } from "@/lib/types";

export type AgentResult = {
  runId: string;
  answer: string;
  spentMicroUsdc: number;
  cacheEvents: number;
  reasoningUsed: boolean;
  ledger: Array<{
    sourceId: string;
    title: string;
    publisher: string;
    action: "paid" | "cached" | "skipped";
    score: number;
    price: string;
    reason: string;
  }>;
  decisions: Array<{
    sourceId: string;
    title: string;
    publisher: string;
    reason: string;
    price: string;
    receipt: string;
  }>;
  retrieval: RetrievalSummary;
  account?: {
    id: string;
    balanceMicroUsdc: number;
  };
};

type EvaluatedDecision = AgentDecision & { action: "paid" | "skipped" };

type LlmDecision = {
  sourceId: string;
  verdict: "pay" | "skip";
  confidence: number;
  reasoning: string;
};

type RetrievalSummary = {
  status: "answered" | "no_coverage" | "provider_fallback";
  candidateCount: number;
  paidCardCount: number;
  composer: "dgrid" | "extractive" | "none";
  message: string;
};

type ComposeResult = {
  answer: string;
  composer: RetrievalSummary["composer"];
  message: string;
};

export async function runCitationAgent(
  query: string,
  budgetMicroUsdc: number,
  context?: { session?: AccountSession; clientType?: "web" | "mcp" | "internal" }
): Promise<AgentResult> {
  const store = getStore();
  if (context?.session) {
    await assertAccountCanSpendToday(context.session.account, budgetMicroUsdc);
  }
  const run = await store.createRun(query, budgetMicroUsdc, {
    accountId: context?.session?.account.id,
    apiKeyId: context?.session?.apiKey.id,
    clientType: context?.clientType || "web"
  });

  try {
    const candidates = await store.searchSources(query, 32);
    const llmDecisions = await decideWithLlm(query, candidates, budgetMicroUsdc).catch(() => []);
    const evaluated = evaluateSources(query, candidates, budgetMicroUsdc, llmDecisions);
    const selected = evaluated.filter((decision) => decision.action === "paid").slice(0, 4);
    const selectedIds = new Set(selected.map((decision) => decision.source.id));
    const cacheBySourceId = new Map(
      (
        await Promise.all(
          selected.map(async (decision) => ({
            sourceId: decision.source.id,
            cached: await store.findCachedPaidSource(decision.source.content_hash)
          }))
        )
      )
        .filter((entry) => entry.cached)
        .map((entry) => [entry.sourceId, entry.cached])
    );
    const paidCards: PaidSourceCard[] = [];
    const receipts: Array<{ decision: EvaluatedDecision; receipt: PaymentReceipt }> = [];
    let spent = 0;
    let cacheEvents = 0;

    for (const decision of evaluated) {
      await store.createDecision({
        run_id: run.id,
        source_id: decision.source.id,
        action: cacheBySourceId.has(decision.source.id)
          ? "cached"
          : selectedIds.has(decision.source.id)
            ? decision.action
            : "skipped",
        score: decision.score,
        reason: decision.reason,
        price_micro_usdc: decision.source.price_micro_usdc
      });
    }

    for (const decision of selected) {
      const cached = cacheBySourceId.get(decision.source.id);
      if (cached) {
        cacheEvents += 1;
        paidCards.push(sourceToCard(decision.source));
        receipts.push({
          decision: {
            ...decision,
            action: "paid",
            reason: "Reused a previously paid citation card for this content hash."
          },
          receipt: {
            payerWallet: "cache",
            sellerWallet: decision.source.publisher.wallet_address,
            amountMicroUsdc: 0,
            formattedAmount: "$0.000000",
            network: "cache",
            transferId: `cache-${cached.id}`,
            status: "settled"
          }
        });
        continue;
      }

      const receipt = await payForSource(decision.source, run.id);
      spent += decision.source.price_micro_usdc;
      const payment = await store.createPayment({
        run_id: run.id,
        account_id: context?.session?.account.id || null,
        source_id: decision.source.id,
        payer_wallet: receipt.payerWallet,
        seller_wallet: receipt.sellerWallet,
        amount_micro_usdc: decision.source.price_micro_usdc,
        network: receipt.network,
        transfer_id: receipt.transferId,
        status: receipt.status
      });
      await store.upsertPaidSourceCache({
        content_hash: decision.source.content_hash,
        source_id: decision.source.id,
        payment_id: payment.id,
        publisher_id: decision.source.publisher.id
      });
      receipts.push({ decision, receipt });
      paidCards.push(sourceToCard(decision.source));
    }

    const composition = await composePaidAnswerResult(query, paidCards, budgetMicroUsdc, spent);
    await store.finishRun(run.id, "complete", composition.answer, spent);
    const account = context?.session
      ? spent > 0
        ? await debitAccountForRun(context.session.account, run, spent)
        : context.session.account
      : null;
    const retrieval: RetrievalSummary = {
      status:
        paidCards.length === 0
          ? "no_coverage"
          : composition.composer === "dgrid"
            ? "answered"
            : "provider_fallback",
      candidateCount: candidates.length,
      paidCardCount: paidCards.length,
      composer: composition.composer,
      message: composition.message
    };

    return {
      runId: run.id,
      answer: composition.answer,
      spentMicroUsdc: spent,
      cacheEvents,
      reasoningUsed: llmDecisions.length > 0,
      ledger: evaluated.map((decision) => ({
        sourceId: decision.source.id,
        title: decision.source.title,
        publisher: decision.source.publisher.name,
        action: cacheBySourceId.has(decision.source.id)
          ? "cached"
          : selectedIds.has(decision.source.id)
            ? decision.action
            : "skipped",
        score: decision.score,
        price: formatMicroUsdc(decision.source.price_micro_usdc),
        reason: decision.reason
      })),
      decisions: receipts.map(({ decision, receipt }) => ({
        sourceId: decision.source.id,
        title: decision.source.title,
        publisher: decision.source.publisher.name,
        reason: decision.reason,
        price: formatMicroUsdc(decision.source.price_micro_usdc),
        receipt: receipt.transferId
      })),
      retrieval,
      account: account
        ? {
            id: account.id,
            balanceMicroUsdc: account.balance_micro_usdc
          }
        : undefined
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed";
    await store.finishRun(run.id, "failed", message, 0);
    throw error;
  }
}

export function chooseSources(query: string, sources: SourceWithPublisher[], budgetMicroUsdc: number): AgentDecision[] {
  return evaluateSources(query, sources, budgetMicroUsdc)
    .filter((decision) => decision.action === "paid")
    .map(({ source, score, reason }) => ({ source, score, reason }));
}

export function evaluateSources(
  query: string,
  sources: SourceWithPublisher[],
  budgetMicroUsdc: number,
  llmDecisions: LlmDecision[] = []
): EvaluatedDecision[] {
  const llmMap = new Map(llmDecisions.map((d) => [d.sourceId, d]));
  const ranked = sources
    .map((source) => {
      const relevance = scoreSource(query, source);
      const priceFit = source.price_micro_usdc <= Math.max(1, budgetMicroUsdc / 4) ? 6 : 0;
      const publisherSignal = source.publisher.name ? 2 : 0;
      const llm = llmMap.get(source.id);
      const llmBoost = llm ? llm.confidence * 10 : 0;
      return {
        source,
        score: relevance + priceFit + publisherSignal + llmBoost,
        relevance,
        priceFit,
        llm
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.source.price_micro_usdc - b.source.price_micro_usdc);

  const decisions: EvaluatedDecision[] = [];
  const paidPublisherIds = new Set<string>();
  let spent = 0;

  for (const entry of ranked) {
    const paidCount = decisions.filter((decision) => decision.action === "paid").length;
    const scoreBreakdown = `${entry.relevance} search-match, ${entry.priceFit} price-fit${entry.llm ? `, ${entry.llm.confidence} LLM confidence` : ""}`;

    if (paidCount >= 4) {
      decisions.push({
        source: entry.source,
        score: entry.score,
        action: "skipped",
        reason: entry.llm
          ? `Skipped after filling four citations. LLM said: ${entry.llm.reasoning}`
          : `Skipped after the agent filled its four-citation answer set (${scoreBreakdown}).`
      });
      continue;
    }

    if (spent + entry.source.price_micro_usdc > budgetMicroUsdc) {
      decisions.push({
        source: entry.source,
        score: entry.score,
        action: "skipped",
        reason: `Skipped because ${formatMicroUsdc(entry.source.price_micro_usdc)} would exceed the remaining ${formatMicroUsdc(Math.max(0, budgetMicroUsdc - spent))} budget.`
      });
      continue;
    }

    if (entry.llm && entry.llm.verdict === "skip") {
      decisions.push({
        source: entry.source,
        score: entry.score,
        action: "skipped",
        reason: `LLM evaluated this source as not worth the price: ${entry.llm.reasoning}`
      });
      continue;
    }

    const diversity = paidPublisherIds.has(entry.source.publisher.id)
      ? "same publisher as an earlier paid source"
      : "adds publisher diversity";
    spent += entry.source.price_micro_usdc;
    paidPublisherIds.add(entry.source.publisher.id);
    decisions.push({
      source: entry.source,
      score: entry.score,
      action: "paid",
      reason: entry.llm
        ? `Paid because the LLM rated it ${entry.llm.confidence}/1 confidence (${entry.llm.reasoning}). Also scored ${entry.score} (${scoreBreakdown}), fits the budget, and ${diversity}.`
        : `Paid because it scored ${entry.score} (${scoreBreakdown}), fits the budget, and ${diversity}. Remaining budget after purchase: ${formatMicroUsdc(budgetMicroUsdc - spent)}.`
    });
  }

  return decisions;
}

export async function composePaidAnswer(
  query: string,
  cards: PaidSourceCard[],
  budgetMicroUsdc: number,
  spentMicroUsdc: number
) {
  return (await composePaidAnswerResult(query, cards, budgetMicroUsdc, spentMicroUsdc)).answer;
}

async function composePaidAnswerResult(
  query: string,
  cards: PaidSourceCard[],
  budgetMicroUsdc: number,
  spentMicroUsdc: number
): Promise<ComposeResult> {
  if (cards.length === 0) {
    return {
      answer: `No paid citations were purchased.\n\nCitationPay found no priced publisher sources that matched "${query}" within the current source graph. Import a trusted RSS or Mastodon source for this topic, or seed official documentation sources, then run the query again.\n\nSpent ${formatMicroUsdc(spentMicroUsdc)} of ${formatMicroUsdc(budgetMicroUsdc)}.`,
      composer: "none",
      message: "No priced CitationPay source matched the query."
    };
  }

  if (process.env.DGRID_API_KEY) {
    const content = await composeWithDgrid(query, cards).catch((error) => {
      console.error("DGrid answer composition failed", error);
      return "";
    });
    if (content) {
      return {
        answer: `${content}\n\nSpent ${formatMicroUsdc(spentMicroUsdc)} of ${formatMicroUsdc(budgetMicroUsdc)}.`,
        composer: "dgrid",
        message: "Composed with DGrid from paid source cards."
      };
    }
  }

  const bullets = cards
    .map((card, index) => `[${index + 1}] ${card.title}: ${card.excerpt}`)
    .join("\n\n");
  const citations = cards.map((card, index) => `[${index + 1}] ${card.canonicalUrl}`).join("\n");
  return {
    answer: `Question: ${query}\n\nPaid answer draft:\n${bullets}\n\nCitations:\n${citations}\n\nSpent ${formatMicroUsdc(spentMicroUsdc)} of ${formatMicroUsdc(budgetMicroUsdc)}.`,
    composer: "extractive",
    message: process.env.DGRID_API_KEY
      ? "DGrid was unavailable or timed out; used deterministic extractive composition."
      : "DGrid is not configured; used deterministic extractive composition."
  };
}

type DgridChatResponse = {
  choices?: Array<{
    message?: {
      content?: DgridContent;
    };
  }>;
};

type DgridContent = string | Array<{ type?: string; text?: string }> | undefined;

async function composeWithDgrid(query: string, cards: PaidSourceCard[]) {
  const response = await fetch(`${dgridBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DGRID_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.DGRID_MODEL || "openai/gpt-4o",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a concise research agent. Answer only from the paid source cards. Cite each source as [1], [2], etc. Do not mention spend, payment totals, budgets, or receipts; the server appends the verified payment summary."
        },
        {
          role: "user",
          content: JSON.stringify({ query, paidSources: cards })
        }
      ]
    }),
    signal: AbortSignal.timeout(dgridComposeTimeoutMs())
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DGrid request failed with HTTP ${response.status}: ${body.slice(0, 240)}`);
  }

  const data = (await response.json()) as DgridChatResponse;
  return normalizeDgridContent(data.choices?.[0]?.message?.content);
}

function normalizeDgridContent(content: DgridContent) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => part.text || "")
      .join("")
      .trim();
  }
  return "";
}

function dgridBaseUrl() {
  return (process.env.DGRID_BASE_URL || "https://api.dgrid.ai/v1").replace(/\/$/, "");
}

function sourceToCard(source: SourceWithPublisher): PaidSourceCard {
  return {
    sourceId: source.id,
    title: source.title,
    canonicalUrl: source.canonical_url,
    excerpt: source.excerpt,
    publisherName: source.publisher.name,
    priceMicroUsdc: source.price_micro_usdc
  };
}

async function decideWithLlm(
  query: string,
  candidates: SourceWithPublisher[],
  budgetMicroUsdc: number
): Promise<LlmDecision[]> {
  if (!process.env.DGRID_API_KEY || candidates.length === 0) {
    return [];
  }

  const budgetUsd = (budgetMicroUsdc / 1_000_000).toFixed(6);
  const sources = candidates.slice(0, 10).map((s, i) => ({
    index: i,
    id: s.id,
    title: s.title,
    publisher: s.publisher.name,
    price: formatMicroUsdc(s.price_micro_usdc),
    excerpt: s.excerpt.slice(0, 200)
  }));

  const systemPrompt = `You are a citation purchasing agent. Given a research query, a budget, and a list of candidate sources with prices, decide which sources are worth paying for.

For each source, return a JSON object with:
- sourceId: the source's id
- verdict: "pay" or "skip"
- confidence: a number from 0.0 to 1.0
- reasoning: one sentence explaining your verdict

Return ONLY a JSON array of these objects. No markdown, no other text.`;

  const userPrompt = JSON.stringify({
    query,
    budget: `${budgetUsd} USDC`,
    sources
  });

  try {
    const response = await fetch(`${dgridBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DGRID_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.DGRID_MODEL || "openai/gpt-4o",
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      }),
      signal: AbortSignal.timeout(dgridDecisionTimeoutMs())
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as DgridChatResponse;
    const content = normalizeDgridContent(data.choices?.[0]?.message?.content);
    if (!content) return [];

    const jsonText = extractJson(content);
    if (!jsonText) return [];

    const parsed = JSON.parse(jsonText) as { decisions?: LlmDecision[] } | LlmDecision[];
    const decisions = Array.isArray(parsed) ? parsed : parsed.decisions || [];
    return decisions.filter((d) => d.sourceId && (d.verdict === "pay" || d.verdict === "skip"));
  } catch {
    return [];
  }
}

function dgridDecisionTimeoutMs() {
  return envPositiveInteger("DGRID_DECISION_TIMEOUT_MS", 5_500);
}

function dgridComposeTimeoutMs() {
  return envPositiveInteger("DGRID_COMPOSE_TIMEOUT_MS", 8_000);
}

function envPositiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] || "");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function extractJson(text: string): string | null {
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    return text.slice(arrayStart, arrayEnd + 1);
  }
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    return text.slice(objStart, objEnd + 1);
  }
  return null;
}
