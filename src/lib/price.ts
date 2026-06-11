export const MICRO_USDC = 1_000_000;

export function microUsdcToUsd(microUsdc: number) {
  return microUsdc / MICRO_USDC;
}

export function formatMicroUsdc(microUsdc: number) {
  const dollars = microUsdcToUsd(microUsdc);
  if (dollars < 0.01) {
    return `$${dollars.toFixed(6)}`;
  }
  return `$${dollars.toFixed(2)}`;
}

export function parseUsdToMicroUsdc(value: string | number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Price must be a positive number");
  }
  return Math.max(1, Math.round(numeric * MICRO_USDC));
}

export function microUsdcToSdkPrice(microUsdc: number) {
  return (microUsdc / MICRO_USDC).toFixed(6);
}
