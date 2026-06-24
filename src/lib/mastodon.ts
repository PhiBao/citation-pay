/* Mastodon public API client — no auth needed for public content. */
import { sha256 } from "@/lib/crypto";

const USER_AGENT = "CitationPay/0.2 (Mastodon sidecar; +https://lepton.thecanteenapp.com)";

type MastodonAccount = {
  id: string;
  username: string;
  acct: string; // @handle@instance
  display_name: string;
  avatar: string;
  url: string;
};

type MastodonStatus = {
  id: string;
  uri: string; // activitypub URI
  url: string | null; // HTML URL
  created_at: string;
  account: MastodonAccount;
  content: string; // HTML
  visibility: string;
  language: string | null;
  tags: Array<{ name: string; url: string }>;
  reblogs_count: number;
  favourites_count: number;
  replies_count: number;
};

type MastodonSearchResult = {
  accounts: MastodonAccount[];
  statuses: MastodonStatus[];
  hashtags: Array<{ name: string; url: string; history: unknown[] }>;
};

export type ImportedMastodonPost = {
  id: string;
  account: {
    id: string;
    username: string;
    acct: string;
    display_name: string;
    url: string;
  };
  uri: string;
  url: string;
  created_at: string;
  textContent: string;
  contentHtml: string;
  tags: string[];
  citationsHash: string;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": USER_AGENT
    },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    throw new Error(`Mastodon API ${response.status}: ${await response.text().catch(() => "no body").then((s) => s.slice(0, 200))}`);
  }
  return response.json() as Promise<T>;
}

export function parseInstanceUrl(raw: string): { origin: string; host: string } {
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    throw new Error("Invalid Mastodon instance URL");
  }
  return { origin: url.origin, host: url.host };
}

export async function fetchPublicTimeline(instanceUrl: string, limit = 40): Promise<ImportedMastodonPost[]> {
  const { origin } = parseInstanceUrl(instanceUrl);
  const statuses = await fetchJson<MastodonStatus[]>(
    `${origin}/api/v1/timelines/public?limit=${limit}&local=true`
  );

  return statuses
    .filter((status) => status.visibility === "public" && status.content)
    .map((status) => {
      const textContent = stripHtml(status.content).slice(0, 700);
      return {
        id: status.id,
        account: {
          id: status.account.id,
          username: status.account.username,
          acct: status.account.acct,
          display_name: status.account.display_name || status.account.username,
          url: status.account.url
        },
        uri: status.uri,
        url: status.url || status.uri,
        created_at: status.created_at,
        textContent: textContent || status.account.display_name || status.account.username,
        contentHtml: status.content,
        tags: (status.tags || []).map((t) => t.name),
        citationsHash: sha256(`mastodon:${status.uri}`)
      };
    });
}

export async function searchHashtag(instanceUrl: string, hashtag: string, limit = 40): Promise<ImportedMastodonPost[]> {
  const { origin } = parseInstanceUrl(instanceUrl);
  const tag = hashtag.startsWith("#") ? hashtag : `#${hashtag}`;
  const result = await fetchJson<MastodonSearchResult>(
    `${origin}/api/v2/search?q=${encodeURIComponent(tag)}&type=statuses&limit=${limit}`
  );

  return (result.statuses || [])
    .filter((status) => status.visibility === "public" && status.content)
    .map((status) => {
      const textContent = stripHtml(status.content).slice(0, 700);
      return {
        id: status.id,
        account: {
          id: status.account.id,
          username: status.account.username,
          acct: status.account.acct,
          display_name: status.account.display_name || status.account.username,
          url: status.account.url
        },
        uri: status.uri,
        url: status.url || status.uri,
        created_at: status.created_at,
        textContent: textContent || status.account.display_name || status.account.username,
        contentHtml: status.content,
        tags: (status.tags || []).map((t) => t.name),
        citationsHash: sha256(`mastodon:${status.uri}`)
      };
    });
}

export async function getInstanceInfo(instanceUrl: string): Promise<{
  title: string;
  description: string;
  version: string;
  uri: string;
  urls: { streaming_api: string };
  stats: { user_count: number; status_count: number; domain_count: number };
}> {
  const { origin } = parseInstanceUrl(instanceUrl);
  return fetchJson(`${origin}/api/v1/instance`);
}
