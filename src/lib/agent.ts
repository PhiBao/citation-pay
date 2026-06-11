import OpenAI from "openai";
import { getStore } from "@/lib/db";
import { payForSource } from "@/lib/payment";
import { formatMicroUsdc } from "@/lib/price";
import type { AgentDecision, PaidSourceCard, SourceWithPublisher } from "@/lib/types";

export type AgentResult = {
  runId: string;
  answer: string;
  spentMicroUsdc: number;
  decisions: Array<{
    sourceId: string;
    title: string;
    publisher: string;
    reason: string;
    price: string;
    receipt: string;
  }>;
};

export async function runCitationAgent(query: string, budgetMicroUsdc: number): Promise<AgentResult> {
  const store = getStore();
  const run = await store.createRun(query, budgetMicroUsdc);

  try {
    const candidates = await store.searchSources(query, 10);
    const decisions = chooseSources(query, candidates, budgetMicroUsdc);
    const paidCards: PaidSourceCard[] = [];
    const receipts = [];
    let spent = 0;

    for (const decision of decisions) {
      const receipt = await payForSource(decision.source, run.id);
      spent += decision.source.price_micro_usdc;
      receipts.push({ decision, receipt });
      await store.createPayment({
        run_id: run.id,
        source_id: decision.source.id,
        payer_wallet: receipt.payerWallet,
        seller_wallet: receipt.sellerWallet,
        amount_micro_usdc: decision.source.price_micro_usdc,
        network: receipt.network,
        transfer_id: receipt.transferId,
        status: receipt.status
      });
      paidCards.push(sourceToCard(decision.source));
    }

    const answer = await composePaidAnswer(query, paidCards, budgetMicroUsdc, spent);
    await store.finishRun(run.id, "complete", answer, spent);

    return {
      runId: run.id,
      answer,
      spentMicroUsdc: spent,
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
  const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  const ranked = sources
    .map((source) => {
      const haystack = `${source.title} ${source.excerpt} ${source.publisher.name}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 2 : 0), 0) + freshnessBoost(source.published_at);
      return { source, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.source.price_micro_usdc - b.source.price_micro_usdc);

  const chosen: AgentDecision[] = [];
  let spent = 0;
  for (const entry of ranked) {
    if (chosen.length >= 4) break;
    if (spent + entry.source.price_micro_usdc > budgetMicroUsdc) continue;
    spent += entry.source.price_micro_usdc;
    chosen.push({
      source: entry.source,
      reason: `Matches the query and fits the remaining ${formatMicroUsdc(budgetMicroUsdc - spent)} budget.`
    });
  }
  return chosen;
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
            "You are a concise research agent. Answer only from the paid source cards. Cite each source as [1], [2], etc."
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
  if (ageDays < 14) return 2;
  if (ageDays < 90) return 1;
  return 0;
}
