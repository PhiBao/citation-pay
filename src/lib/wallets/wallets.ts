import { getStore } from "@/lib/db";
import { hasCircleWalletApiEnv } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import type { Publisher } from "@/lib/types";

type WalletInfo = { id: string; address: string };

const ARC_TESTNET_CHAIN = "ARC-TESTNET";
const USDC_ARC_TESTNET = "USDC";

function circleBaseUrl() {
  return "https://api.circle.com/v1/w3s";
}

function platformWalletSetId() {
  return process.env.CIRCLE_WALLET_SET_ID || process.env.CIRCLE_WALLET_ID || "";
}

async function circleRequest<T = unknown>(path: string, init: RequestInit): Promise<T> {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) throw new Error("CIRCLE_API_KEY is not set");
  const response = await fetch(`${circleBaseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      ...(init.headers as Record<string, string> | undefined)
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Circle API ${response.status}: ${text.slice(0, 240)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function ensureWalletSet() {
  const setId = platformWalletSetId();
  if (setId) return setId;
  if (!hasCircleWalletApiEnv()) return "";
  const result = await circleRequest<{ data?: { walletSet?: { id?: string } } }>("/walletSets", {
    method: "POST",
    body: JSON.stringify({ name: `citationpay-${randomToken(6)}`, idempotencyKey: randomToken(16) })
  });
  return result.data?.walletSet?.id || "";
}

export function mockWalletFor(seed: string): WalletInfo {
  // Deterministic mock wallet from a seed string, so dev works without Circle credentials.
  const baseAddress = `0x${sha1Hex(seed)}`.padEnd(42, "0").slice(0, 42).toLowerCase();
  return { id: `mock-wallet-${sha1Hex(seed).slice(0, 12)}`, address: baseAddress };
}

function sha1Hex(input: string) {
  // small, fast deterministic hex for dev/mock use only
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  return hex.padStart(16, "0");
}

export async function createDevWallet(seed: string): Promise<WalletInfo> {
  if (!hasCircleWalletApiEnv()) {
    return mockWalletFor(seed);
  }
  try {
    const walletSetId = await ensureWalletSet();
    if (!walletSetId) return mockWalletFor(seed);
    const result = await circleRequest<{
      data?: { wallets?: Array<{ id?: string; address?: string }> };
    }>("/wallets", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: randomToken(20),
        walletSetId,
        blockchains: [ARC_TESTNET_CHAIN],
        accountType: "EOA",
        metadata: [{ name: "seed", ref: seed.slice(0, 64) }]
      })
    });
    const wallet = result.data?.wallets?.[0];
    if (!wallet?.id || !wallet.address) return mockWalletFor(seed);
    return { id: wallet.id, address: wallet.address.toLowerCase() };
  } catch (err) {
    console.warn("Circle wallet creation failed, falling back to mock wallet:", err instanceof Error ? err.message : err);
    return mockWalletFor(seed);
  }
}

export async function ensureAccountWallet(accountId: string): Promise<WalletInfo> {
  const store = getStore();
  const account = await store.getAccount(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);
  if (account.circle_wallet_id && account.circle_wallet_address) {
    return { id: account.circle_wallet_id, address: account.circle_wallet_address };
  }
  const wallet = await createDevWallet(`account:${accountId}`);
  await store.attachAccountWallet(accountId, wallet.id, wallet.address);
  return wallet;
}

export async function ensurePublisherWallet(publisher: Publisher): Promise<WalletInfo> {
  // For seeded publishers we already have a wallet address. Otherwise we mint one.
  if (publisher.wallet_address && publisher.wallet_address.startsWith("0x") && publisher.wallet_address.length === 42) {
    return { id: `seed-${publisher.id}`, address: publisher.wallet_address.toLowerCase() };
  }
  const wallet = await createDevWallet(`publisher:${publisher.id}`);
  const store = getStore();
  await store.listPublishers(); // no-op to ensure loaded
  return wallet;
}

export async function getOnchainUsdcBalance(address: string): Promise<number> {
  // Read onchain USDC balance via viem against Arc testnet RPC.
  try {
    const rpcUrl = process.env.ARC_RPC_URL;
    if (!rpcUrl) return 0;
    const { createPublicClient, http, erc20Abi, formatUnits } = await import("viem");
    const client = createPublicClient({ transport: http(rpcUrl) });
    // USDC on Arc Testnet — the same contract used by x402 gateway; 6 decimals.
    const usdc = process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
    const balance = (await client.readContract({
      address: usdc as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address as `0x${string}`]
    })) as bigint;
    return Number(formatUnits(balance, 6)) * 1_000_000;
  } catch {
    return 0;
  }
}

export function isWalletFeatureAvailable() {
  return hasCircleWalletApiEnv();
}

export { USDC_ARC_TESTNET };
