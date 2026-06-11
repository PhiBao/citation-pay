import { Buffer } from "node:buffer";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import {
  CIRCLE_BATCHING_NAME,
  CIRCLE_BATCHING_SCHEME,
  CIRCLE_BATCHING_VERSION,
  GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS
} from "@circle-fin/x402-batching";
import { appUrl, arcNetwork, facilitatorUrl, paymentMode, requireRealPaymentEnv } from "@/lib/env";
import { formatMicroUsdc, microUsdcToSdkPrice } from "@/lib/price";
import type { PaymentReceipt, SourceWithPublisher } from "@/lib/types";

type SupportedKind = {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: {
    verifyingContract?: string;
    assets?: Array<{ symbol?: string; address?: string }>;
  };
};

type PaymentRequirements = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    name: string;
    version: string;
    verifyingContract: string;
  };
};

type PaymentPayload = {
  x402Version: number;
  accepted?: { network?: string };
  payload: Record<string, unknown>;
};

let supportedKindsCache: SupportedKind[] | null = null;

export function isMockPaymentMode() {
  return paymentMode() !== "real";
}

export async function createPaymentRequiredResponse(requestUrl: string, source: SourceWithPublisher) {
  const requirements = await createAllPaymentRequirements(source.publisher.wallet_address, source.price_micro_usdc);
  if (requirements.length === 0) {
    return Response.json({ error: "No Gateway payment networks available" }, { status: 503 });
  }

  const payload = {
    x402Version: 2,
    resource: {
      url: requestUrl,
      description: `Citation access for ${source.title}`,
      mimeType: "application/json"
    },
    accepts: requirements
  };

  return Response.json(
    { error: "Payment required", price: formatMicroUsdc(source.price_micro_usdc), sourceId: source.id },
    {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": encodeBase64(payload),
        "Content-Type": "application/json"
      }
    }
  );
}

export async function settlePaymentSignature(request: Request, source: SourceWithPublisher): Promise<PaymentReceipt> {
  const signature = request.headers.get("payment-signature");
  if (!signature) throw new Error("Missing Payment-Signature header");

  const paymentPayload = decodeBase64<PaymentPayload>(signature);
  const network = paymentPayload.accepted?.network;
  if (!network) throw new Error("Payment signature is missing accepted network");

  const requirements = await createPaymentRequirements(
    source.publisher.wallet_address,
    source.price_micro_usdc,
    network
  );
  if (!requirements) throw new Error(`Network ${network} is not accepted`);

  const facilitator = new BatchFacilitatorClient({ url: facilitatorUrl() });
  const verify = await facilitator.verify(paymentPayload, requirements);
  if (!verify.isValid) {
    throw new Error(verify.invalidReason || "Payment verification failed");
  }

  const settle = await facilitator.settle(paymentPayload, requirements);
  if (!settle.success) {
    throw new Error(settle.errorReason || "Payment settlement failed");
  }

  return {
    payerWallet: settle.payer || verify.payer || "",
    sellerWallet: source.publisher.wallet_address,
    amountMicroUsdc: source.price_micro_usdc,
    formattedAmount: formatMicroUsdc(source.price_micro_usdc),
    network: requirements.network,
    transferId: settle.transaction,
    status: "settled"
  };
}

export function paymentResponseHeader(receipt: PaymentReceipt) {
  return encodeBase64({
    success: true,
    transaction: receipt.transferId,
    network: receipt.network,
    payer: receipt.payerWallet
  });
}

export async function payForSource(source: SourceWithPublisher, runId: string): Promise<PaymentReceipt> {
  if (isMockPaymentMode()) {
    return {
      payerWallet: "0xMockAgentWallet",
      sellerWallet: source.publisher.wallet_address,
      amountMicroUsdc: source.price_micro_usdc,
      formattedAmount: formatMicroUsdc(source.price_micro_usdc),
      network: "mock:local",
      transferId: `mock-${runId}-${source.id}`,
      status: "mocked"
    };
  }

  requireRealPaymentEnv();
  const client = new GatewayClient({
    chain: "arcTestnet",
    privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}`
  });

  if (source.publisher.wallet_address.toLowerCase() === client.address.toLowerCase()) {
    throw new Error("Publisher receiving wallet must be different from the autonomous agent wallet");
  }

  const url = `${appUrl()}/api/sources/${source.id}/paid`;
  const support = await client.supports(url);
  if (!support.supported) {
    throw new Error(support.error || "Paid source does not support Gateway batching");
  }

  const result = await client.pay(url, {
    headers: {
      "x-agent-run-id": runId
    }
  });

  return {
    payerWallet: process.env.BUYER_ADDRESS || client.address,
    sellerWallet: source.publisher.wallet_address,
    amountMicroUsdc: Number(result.amount),
    formattedAmount: result.formattedAmount,
    network: arcNetwork(),
    transferId: result.transaction,
    status: "settled"
  };
}

async function createAllPaymentRequirements(payTo: string, amountMicroUsdc: number): Promise<PaymentRequirements[]> {
  const supportedKinds = await getSupportedKinds();
  return supportedKinds
    .filter((kind) => kind.network === arcNetwork() && kind.extra?.verifyingContract)
    .map((kind) => createRequirementsFromKind(kind, payTo, amountMicroUsdc))
    .filter((item): item is PaymentRequirements => Boolean(item));
}

async function createPaymentRequirements(payTo: string, amountMicroUsdc: number, network: string) {
  const supportedKinds = await getSupportedKinds();
  const kind = supportedKinds.find((item) => item.network === network && item.extra?.verifyingContract);
  return kind ? createRequirementsFromKind(kind, payTo, amountMicroUsdc) : null;
}

function createRequirementsFromKind(kind: SupportedKind, payTo: string, amountMicroUsdc: number): PaymentRequirements | null {
  const asset = kind.extra?.assets?.find((item) => item.symbol === "USDC")?.address;
  const verifyingContract = kind.extra?.verifyingContract;
  if (!asset || !verifyingContract) return null;
  return {
    scheme: CIRCLE_BATCHING_SCHEME,
    network: kind.network,
    asset,
    amount: microUsdcToSdkPrice(amountMicroUsdc).replace(".", "").replace(/^0+/, "") || "1",
    payTo,
    maxTimeoutSeconds: GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS,
    extra: {
      name: CIRCLE_BATCHING_NAME,
      version: CIRCLE_BATCHING_VERSION,
      verifyingContract
    }
  };
}

async function getSupportedKinds() {
  if (supportedKindsCache) return supportedKindsCache;
  const facilitator = new BatchFacilitatorClient({ url: facilitatorUrl() });
  const supported = await facilitator.getSupported();
  supportedKindsCache = supported.kinds as SupportedKind[];
  return supportedKindsCache;
}

function encodeBase64(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

function decodeBase64<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64").toString("utf-8")) as T;
}
