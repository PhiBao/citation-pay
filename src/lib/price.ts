export const MICRO_USDC = 1_000_000;

export function microUsdcToUsd(microUsdc: number) {
  return microUsdc / MICRO_USDC;
}

export function formatMicroUsdc(microUsdc: number) {
  if (!Number.isFinite(microUsdc)) return "$0.000000";
  const dollars = microUsdcToUsd(microUsdc);
  if (dollars < 0.01) {
    return `$${dollars.toFixed(6)}`;
  }
  return `$${dollars.toFixed(2)}`;
}

export function parseUsdToMicroUsdc(value: string | number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return Number.NaN;
  }
  return Math.max(1, Math.round(numeric * MICRO_USDC));
}

export function microUsdcToSdkPrice(microUsdc: number) {
  return (microUsdc / MICRO_USDC).toFixed(6);
}

export function shortAddress(address: string, chars = 4) {
  if (!address || address.length < chars * 2 + 3) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function relativeTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toISOString().slice(0, 10);
}
