"use client";
import { formatMicroUsdc, parseUsdToMicroUsdc } from "@/lib/price";

export function MicroUsdc({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`amount ${className}`}>{formatMicroUsdc(value)}</span>;
}

export function UsdInput({
  name,
  defaultValue = "0.001",
  min = "0.000001",
  max,
  label = "Max spend (USDC)",
  hint,
  onValueChange
}: {
  name: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  label?: string;
  hint?: string;
  onValueChange?: (value: string) => void;
}) {
  const initial = (() => {
    const micro = parseUsdToMicroUsdc(defaultValue);
    return Number.isFinite(micro) ? micro / 1_000_000 : Number(defaultValue);
  })();
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="flex items-center rounded-[10px] border border-zinc-800 bg-zinc-950 pl-3 pr-1 py-1 focus-within:border-emerald-400/60 focus-within:ring-2 focus-within:ring-emerald-400/15">
        <span className="text-zinc-500 mr-1">$</span>
        <input
          name={name}
          type="number"
          step="0.000001"
          min={min}
          max={max}
          defaultValue={initial}
          onChange={(e) => onValueChange?.(e.target.value)}
          className="w-full bg-transparent py-1.5 text-sm amount outline-none"
        />
        <span className="text-xs text-zinc-500 amount">USDC</span>
      </div>
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </div>
  );
}
