"use client";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "ghost" | "danger";
type Size = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const variantClass: Record<Variant, string> = {
  primary:
    "btn-primary hover:bg-emerald-500 active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed",
  ghost:
    "btn-ghost hover:border-emerald-400/30 hover:bg-emerald-400/5 active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed",
  danger:
    "btn-danger hover:bg-rose-500/10 active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
};

const sizeClass: Record<Size, string> = {
  sm: "!py-1.5 !px-3 !text-xs",
  md: "!py-2.5 !px-4 !text-sm"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = "", variant = "primary", size = "md", loading, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={`${variantClass[variant]} ${sizeClass[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border-2 border-current border-r-transparent animate-spin" />
          <span>Working…</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
});
