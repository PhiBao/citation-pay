import { XMLParser } from "fast-xml-parser";
import { sha256 } from "@/lib/crypto";

export type ImportedFeedItem = {
  title: string;
  canonicalUrl: string;
  excerpt: string;
  contentHash: string;
  publishedAt: string | null;
};

export type ImportedFeed = {
  title: string;
  items: ImportedFeedItem[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true
});

export function assertPublicHttpUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Feed URL is invalid");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Feed URL must use http or https");
  }
  const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
  if (blockedHosts.has(url.hostname) || url.hostname.endsWith(".local")) {
    throw new Error("Feed URL must be publicly reachable");
  }
  return url.toString();
}

export async function importRssFeed(rawUrl: string): Promise<ImportedFeed> {
  const url = assertPublicHttpUrl(rawUrl);
  const response = await fetch(url, {
    headers: {
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.8"
    },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) {
    throw new Error(`Feed fetch failed with HTTP ${response.status}`);
  }
  const xml = await response.text();
  const parsed = parser.parse(xml);
  const rssChannel = parsed.rss?.channel;
  const atomFeed = parsed.feed;

  if (rssChannel) {
    const items = asArray(rssChannel.item).slice(0, 40).map(normalizeRssItem).filter(isImportedFeedItem);
    return {
      title: textValue(rssChannel.title) || new URL(url).hostname,
      items
    };
  }

  if (atomFeed) {
    const items = asArray(atomFeed.entry).slice(0, 40).map(normalizeAtomItem).filter(isImportedFeedItem);
    return {
      title: textValue(atomFeed.title) || new URL(url).hostname,
      items
    };
  }

  throw new Error("Feed is not valid RSS or Atom");
}

function normalizeRssItem(item: unknown): ImportedFeedItem | null {
  if (!isRecord(item)) return null;
  const title = cleanText(textValue(item.title));
  const link = cleanText(textValue(item.link) || textValue(item.guid));
  const body = textValue(item.description) || textValue(item["content:encoded"]) || title;
  return normalizeItem(title, link, body, textValue(item.pubDate));
}

function normalizeAtomItem(item: unknown): ImportedFeedItem | null {
  if (!isRecord(item)) return null;
  const title = cleanText(textValue(item.title));
  const link = atomLink(item.link);
  const body = textValue(item.summary) || textValue(item.content) || title;
  return normalizeItem(title, link, body, textValue(item.published) || textValue(item.updated));
}

function normalizeItem(title: string, link: string, body: string, date: string): ImportedFeedItem | null {
  if (!title || !link) return null;
  let canonicalUrl = link;
  try {
    canonicalUrl = new URL(link).toString();
  } catch {
    return null;
  }
  const excerpt = cleanText(stripHtml(body)).slice(0, 700);
  return {
    title: title.slice(0, 180),
    canonicalUrl,
    excerpt: excerpt || title,
    contentHash: sha256(`${canonicalUrl}|${title}`),
    publishedAt: parseDate(date)
  };
}

function atomLink(link: unknown) {
  if (Array.isArray(link)) {
    const alternate = link.find((entry) => isRecord(entry) && (!entry["@_rel"] || entry["@_rel"] === "alternate"));
    return textValue(alternate?.["@_href"] || alternate);
  }
  if (isRecord(link)) return textValue(link["@_href"] || link["#text"]);
  return textValue(link);
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (isRecord(value) && typeof value["#text"] === "string") return value["#text"];
  return "";
}

function asArray(value: unknown) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isImportedFeedItem(value: ImportedFeedItem | null): value is ImportedFeedItem {
  return value !== null;
}
