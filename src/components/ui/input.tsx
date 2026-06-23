"use client";
import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

const baseInput =
  "w-full rounded-[10px] border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/15";

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", label, hint, error, id, ...rest },
  ref
) {
  const inputId = id || rest.name || Math.random().toString(36).slice(2);
  return (
    <label className="block" htmlFor={inputId}>
      {label && (
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      )}
      <input ref={ref} id={inputId} className={`${baseInput} ${error ? "border-rose-500/50" : ""} ${className}`} {...rest} />
      {hint && !error && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-400">{error}</span>}
    </label>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className = "", label, hint, error, id, ...rest },
  ref
) {
  const inputId = id || rest.name || Math.random().toString(36).slice(2);
  return (
    <label className="block" htmlFor={inputId}>
      {label && (
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      )}
      <textarea
        ref={ref}
        id={inputId}
        className={`${baseInput} min-h-[120px] resize-y ${error ? "border-rose-500/50" : ""} ${className}`}
        {...rest}
      />
      {hint && !error && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-400">{error}</span>}
    </label>
  );
});
