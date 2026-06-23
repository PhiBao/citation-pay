import { getStore } from "@/lib/db";
import { ensureAccountWallet } from "@/lib/wallets/wallets";
import { nowIso, randomToken } from "@/lib/crypto";
import { formatMicroUsdc } from "@/lib/price";
import type { Account } from "@/lib/types";

type FaucetRequest = {
  accountId: string;
  amountUsd: string;
};

type ArcDepositRequest = {
  accountId: string;
  amountUsd: string;
  txHash?: string;
};

type SendRequest = {
  publisherId: string;
  toAddress: string;
  amountUsd: string;
};

function hasArcRpc() {
  return Boolean(process.env.ARC_RPC_URL);
}

export function isArcAvailable() {
  return hasArcRpc();
}

export async function faucetCredit(req: FaucetRequest) {
  const store = getStore();
  const account = await store.getAccount(req.accountId);
  if (!account) throw new Error("Account not found");

  const amountUsd = Number(req.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error("Amount must be a positive number");
  }
  const amountMicro = Math.round(amountUsd * 1_000_000);

  await store.creditAccount(account.id, amountMicro, `Faucet credit ${formatMicroUsdc(amountMicro)} on Arc Testnet`);
  await store.recordWalletEvent({
    account_id: account.id,
    publisher_id: null,
    kind: "faucet",
    amount_micro_usdc: amountMicro,
    tx_hash: `faucet-${randomToken(12)}`,
    network: "ARC-TESTNET",
    from_address: "0x0000000000000000000000000000000000000000",
    to_address: account.circle_wallet_address,
    status: "confirmed",
    metadata: { source: "arc-testnet-faucet" },
    confirmed_at: nowIso()
  });

  return { creditedMicroUsdc: amountMicro, network: "ARC-TESTNET" };
}

export async function depositFromArc(req: ArcDepositRequest) {
  const store = getStore();
  const account = await store.getAccount(req.accountId);
  if (!account) throw new Error("Account not found");
  const wallet = await ensureAccountWallet(req.accountId);

  const amountUsd = Number(req.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error("Amount must be a positive number");
  }
  const amountMicro = Math.round(amountUsd * 1_000_000);

  await store.creditAccount(
    account.id,
    amountMicro,
    `Arc deposit ${formatMicroUsdc(amountMicro)} to ${wallet.address}`
  );
  await store.recordWalletEvent({
    account_id: account.id,
    publisher_id: null,
    kind: "deposit",
    amount_micro_usdc: amountMicro,
    tx_hash: req.txHash || `arc-deposit-${randomToken(12)}`,
    network: "ARC-TESTNET",
    from_address: null,
    to_address: wallet.address,
    status: "confirmed",
    metadata: { source: "arc-native-deposit" },
    confirmed_at: nowIso()
  });

  return { creditedMicroUsdc: amountMicro, recipientAddress: wallet.address, network: "ARC-TESTNET" };
}

export async function withdrawPublisher(req: SendRequest) {
  const store = getStore();
  const publisher = await store.getPublisher(req.publisherId);
  if (!publisher) throw new Error("Publisher not found");
  if (!/^0x[a-fA-F0-9]{40}$/.test(req.toAddress)) {
    throw new Error("Recipient must be a 0x address");
  }
  const amountUsd = Number(req.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error("Amount must be a positive number");
  }
  const amountMicro = Math.round(amountUsd * 1_000_000);

  if (!hasArcRpc()) {
    await store.recordWalletEvent({
      account_id: null,
      publisher_id: publisher.id,
      kind: "withdrawal",
      amount_micro_usdc: amountMicro,
      tx_hash: `mock-${randomToken(12)}`,
      network: "ARC-TESTNET",
      from_address: publisher.wallet_address,
      to_address: req.toAddress,
      status: "confirmed",
      metadata: { mocked: true },
      confirmed_at: nowIso()
    });
    return { mocked: true, amountMicroUsdc: amountMicro, recipientAddress: req.toAddress };
  }

  try {
    const { AppKit } = await import("@circle-fin/app-kit");
    const { createViemAdapterFromPrivateKey } = await import("@circle-fin/adapter-viem-v2");
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: (process.env.PLATFORM_SETTLEMENT_PRIVATE_KEY || process.env.BUYER_PRIVATE_KEY || "") as `0x${string}`
    });
    const kit = new AppKit();
    const result = await kit.send({
      from: { adapter, chain: "Arc_Testnet" },
      to: req.toAddress,
      amount: amountUsd.toFixed(2),
      token: "USDC"
    });
    await store.recordWalletEvent({
      account_id: null,
      publisher_id: publisher.id,
      kind: "withdrawal",
      amount_micro_usdc: amountMicro,
      tx_hash: String((result as { txHash?: string }).txHash ?? randomToken(16)),
      network: "ARC-TESTNET",
      from_address: publisher.wallet_address,
      to_address: req.toAddress,
      status: "pending",
      metadata: { sendResult: String(result) },
      confirmed_at: null
    });
    return { mocked: false, amountMicroUsdc: amountMicro, recipientAddress: req.toAddress };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await store.recordWalletEvent({
      account_id: null,
      publisher_id: publisher.id,
      kind: "withdrawal",
      amount_micro_usdc: amountMicro,
      tx_hash: `simulated-${randomToken(12)}`,
      network: "ARC-TESTNET",
      from_address: publisher.wallet_address,
      to_address: req.toAddress,
      status: "confirmed",
      metadata: { simulated: true, sendError: message },
      confirmed_at: nowIso()
    });
    return { mocked: true, amountMicroUsdc: amountMicro, recipientAddress: req.toAddress, note: "Simulated on Arc" };
  }
}

export async function sweepToSettlement(account: Account, amountMicroUsdc: number) {
  const store = getStore();
  if (!account.circle_wallet_id) {
    await ensureAccountWallet(account.id);
  }
  await store.recordWalletEvent({
    account_id: account.id,
    publisher_id: null,
    kind: "sweep",
    amount_micro_usdc: amountMicroUsdc,
    tx_hash: `internal-sweep-${randomToken(8)}`,
    network: "ARC-TESTNET",
    from_address: account.circle_wallet_address,
    to_address: process.env.PLATFORM_SETTLEMENT_ADDRESS || process.env.BUYER_ADDRESS || "",
    status: "confirmed",
    metadata: { mocked: !hasArcRpc() },
    confirmed_at: nowIso()
  });
}
