export type Publisher = {
  id: string;
  name: string;
  wallet_address: string;
  default_price_micro_usdc: number;
  owner_token_hash: string;
  created_at: string;
};

export type Feed = {
  id: string;
  publisher_id: string;
  url: string;
  title: string;
  status: "active" | "error";
  last_imported_at: string | null;
  created_at: string;
};

export type Source = {
  id: string;
  publisher_id: string;
  feed_id: string;
  title: string;
  canonical_url: string;
  excerpt: string;
  content_hash: string;
  price_micro_usdc: number;
  published_at: string | null;
  search_text: string;
  created_at: string;
};

export type AgentRun = {
  id: string;
  query: string;
  budget_micro_usdc: number;
  spent_micro_usdc: number;
  answer: string;
  status: "running" | "complete" | "failed";
  created_at: string;
};

export type CitationPayment = {
  id: string;
  run_id: string;
  source_id: string;
  payer_wallet: string;
  seller_wallet: string;
  amount_micro_usdc: number;
  network: string;
  transfer_id: string;
  status: "mocked" | "settled" | "failed";
  created_at: string;
};

export type AgentDecisionRecord = {
  id: string;
  run_id: string;
  source_id: string;
  action: "paid" | "cached" | "skipped";
  score: number;
  reason: string;
  price_micro_usdc: number;
  created_at: string;
};

export type PaidSourceCache = {
  id: string;
  content_hash: string;
  source_id: string;
  payment_id: string | null;
  publisher_id: string;
  paid_at: string;
  created_at: string;
};

export type SourceWithPublisher = Source & {
  publisher: Pick<Publisher, "id" | "name" | "wallet_address">;
};

export type PaymentReceipt = {
  payerWallet: string;
  sellerWallet: string;
  amountMicroUsdc: number;
  formattedAmount: string;
  network: string;
  transferId: string;
  status: CitationPayment["status"];
};

export type PaidSourceCard = {
  sourceId: string;
  title: string;
  canonicalUrl: string;
  excerpt: string;
  publisherName: string;
  priceMicroUsdc: number;
};

export type AgentDecision = {
  source: SourceWithPublisher;
  score: number;
  reason: string;
};

export type DashboardData = {
  publishers: Publisher[];
  feeds: Feed[];
  sources: SourceWithPublisher[];
  runs: AgentRun[];
  payments: Array<CitationPayment & { source?: SourceWithPublisher; run?: AgentRun }>;
  decisions: Array<AgentDecisionRecord & { source?: SourceWithPublisher; run?: AgentRun }>;
  cache: Array<PaidSourceCache & { source?: SourceWithPublisher }>;
};
