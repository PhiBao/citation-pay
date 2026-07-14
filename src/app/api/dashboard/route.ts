import { getStore } from "@/lib/db";
import { paymentMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dashboard = await getStore().dashboard();

    const totalVolume = dashboard.payments
      .filter((p) => p.status === "settled" || p.status === "mocked")
      .reduce((sum, p) => sum + p.amount_micro_usdc, 0);

    const totalPaidCitations = dashboard.payments.filter(
      (p) => p.status === "settled" || p.status === "mocked"
    ).length;

    const totalCacheHits = dashboard.cache.length;

    const activeAccounts = dashboard.accounts.filter(
      (a) => a.status === "active" && a.balance_micro_usdc !== a.trial_credit_micro_usdc
    ).length;

    const totalAccounts = dashboard.accounts.length;

    const activePublishers = dashboard.publishers.filter(
      (p) => dashboard.sources.some((s) => s.publisher_id === p.id)
    ).length;

    const recentRuns = dashboard.runs
      .filter((r) => r.client_type !== "internal")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        query: r.query.slice(0, 120),
        spent: r.spent_micro_usdc,
        budget: r.budget_micro_usdc,
        status: r.status,
        client: r.client_type,
        createdAt: r.created_at
      }));

    const recentPayments = dashboard.payments
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        amount: p.amount_micro_usdc,
        network: p.network,
        status: p.status,
        title: p.source?.title?.slice(0, 80),
        publisher: p.source?.publisher?.name,
        createdAt: p.created_at
      }));

    const topPublishers = [
      ...new Map(
        dashboard.payments
          .map((p) => p.source?.publisher)
          .filter(Boolean)
          .map((pub) => [pub!.id, { name: pub!.name, citations: 0, volume: 0 }])
      ).entries()
    ];

    for (const payment of dashboard.payments) {
      const pubId = payment.source?.publisher?.id;
      const entry = topPublishers.find(([id]) => id === pubId);
      if (entry) {
        entry[1].citations += 1;
        entry[1].volume += payment.amount_micro_usdc;
      }
    }
    // Add unclaimed publishers with sources
    for (const source of dashboard.sources) {
      const pubId = source.publisher.id;
      if (!topPublishers.some(([id]) => id === pubId)) {
        topPublishers.push([pubId, { name: source.publisher.name, citations: 0, volume: 0 }]);
      }
    }

    const summary = {
      totalVolume,
      totalPaidCitations,
      totalCacheHits,
      totalAccounts,
      activeAccounts,
      totalPublishers: dashboard.publishers.length,
      activePublishers,
      totalSources: dashboard.sources.length,
      totalFeeds: dashboard.feeds.filter((f) => f.status === "active").length,
      recentRuns,
      recentPayments,
      topPublishers: topPublishers.slice(0, 8).map(([, info]) => info)
    };

    return Response.json({
      ...dashboard,
      summary,
      health: {
        database: "ok",
        error: null
      },
      paymentMode: paymentMode()
    });
  } catch (error) {
    return Response.json({
      accounts: [],
      publishers: [],
      feeds: [],
      sources: [],
      runs: [],
      payments: [],
      decisions: [],
      cache: [],
      summary: null,
      health: {
        database: "down",
        error: error instanceof Error ? error.message : "Dashboard unavailable"
      },
      paymentMode: paymentMode()
    });
  }
}
