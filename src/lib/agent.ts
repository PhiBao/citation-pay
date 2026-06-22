import OpenAI from "openai";
import { getStore } from "@/lib/db";
import { payForSource } from "@/lib/payment";
import { formatMicroUsdc } from "@/lib/price";
import type { AgentDecision, PaidSourceCard, PaymentReceipt, SourceWithPublisher } from "@/lib/types";

export type AgentResult = {
  runId: string;
  answer: string;
  spentMicroUsdc: number;
  cacheEvents: number;
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
};

type EvaluatedDecision = AgentDecision & { action: "paid" | "skipped" };

export async function runCitationAgent(query: string, budgetMicroUsdc: number): Promise<AgentResult> {
  const store = getStore();
  const run = await store.createRun(query, budgetMicroUsdc);

  try {
    const candidates = await store.searchSources(query, 16);
    const evaluated = evaluateSources(query, candidates, budgetMicroUsdc);
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

    const answer = await composePaidAnswer(query, paidCards, budgetMicroUsdc, spent);
    await store.finishRun(run.id, "complete", answer, spent);

    return {
      runId: run.id,
      answer,
      spentMicroUsdc: spent,
      cacheEvents,
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
      }))
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

export function evaluateSources(query: string, sources: SourceWithPublisher[], budgetMicroUsdc: number): EvaluatedDecision[] {
  const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  const ranked = sources
    .map((source) => {
      const haystack = `${source.title} ${source.excerpt} ${source.publisher.name}`.toLowerCase();
      const relevance = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 8 : 0), 0);
      const freshness = freshnessBoost(source.published_at);
      const priceFit = source.price_micro_usdc <= Math.max(1, budgetMicroUsdc / 4) ? 6 : 0;
      const publisherSignal = source.publisher.name ? 2 : 0;
      return {
        source,
        score: relevance + freshness + priceFit + publisherSignal,
        relevance,
        freshness,
        priceFit
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.source.price_micro_usdc - b.source.price_micro_usdc);

  const decisions: EvaluatedDecision[] = [];
  const paidPublisherIds = new Set<string>();
  let spent = 0;

  for (const entry of ranked) {
    const paidCount = decisions.filter((decision) => decision.action === "paid").length;
    const scoreBreakdown = `${entry.relevance} relevance, ${entry.freshness} freshness, ${entry.priceFit} price-fit`;

    if (paidCount >= 4) {
      decisions.push({
        source: entry.source,
        score: entry.score,
        action: "skipped",
        reason: `Skipped after the agent filled its four-citation answer set (${scoreBreakdown}).`
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

    const diversity = paidPublisherIds.has(entry.source.publisher.id)
      ? "same publisher as an earlier paid source"
      : "adds publisher diversity";
    spent += entry.source.price_micro_usdc;
    paidPublisherIds.add(entry.source.publisher.id);
    decisions.push({
      source: entry.source,
      score: entry.score,
      action: "paid",
      reason: `Paid because it scored ${entry.score} (${scoreBreakdown}), fits the budget, and ${diversity}. Remaining budget after purchase: ${formatMicroUsdc(budgetMicroUsdc - spent)}.`
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
  if (cards.length === 0) {
    return `No paid citations were purchased. The agent found no relevant sources within the ${formatMicroUsdc(budgetMicroUsdc)} budget.`;
  }

  if (process.env.OPENAI_API_KEY) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a concise research agent. Answer only from the paid source cards. Cite each source as [1], [2], etc. Mention the spend summary at the end."
        },
        {
          role: "user",
          content: JSON.stringify({ query, paidSources: cards })
        }
      ]
    });
    const content = completion.choices[0]?.message.content?.trim();
    if (content) return `${content}\n\nSpent ${formatMicroUsdc(spentMicroUsdc)} of ${formatMicroUsdc(budgetMicroUsdc)}.`;
  }

  const bullets = cards
    .map((card, index) => `[${index + 1}] ${card.title}: ${card.excerpt}`)
    .join("\n\n");
  const citations = cards.map((card, index) => `[${index + 1}] ${card.canonicalUrl}`).join("\n");
  return `Question: ${query}\n\nPaid answer draft:\n${bullets}\n\nCitations:\n${citations}\n\nSpent ${formatMicroUsdc(spentMicroUsdc)} of ${formatMicroUsdc(budgetMicroUsdc)}.`;
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

function freshnessBoost(date: string | null) {
  if (!date) return 0;
  const ageDays = (Date.now() - new Date(date).getTime()) / 86_400_000;
  if (ageDays < 14) return 8;
  if (ageDays < 90) return 4;
  return 0;
}
