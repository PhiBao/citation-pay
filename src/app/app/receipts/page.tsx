"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { CircleNotch, Receipt } from "@phosphor-icons/react/dist/ssr";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import { shortAddress, relativeTime } from "@/lib/price";

type ReceiptRow = {
  id: string;
  amount: string;
  network: string;
  status: string;
  transferId: string;
  title?: string;
  publisher?: string;
  createdAt: string;
};

export default function ReceiptsPage() {
  const router = useRouter();
  const { status } = useSession();
  const toast = useToast();
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/receipts", { cache: "no-store" });
      const data = await res.json();
      setReceipts(data.receipts || []);
    } catch {
      toast.push("error", "Failed to load receipts");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (status === "anonymous") { router.push("/login"); return; }
    if (status === "authenticated") void load();
  }, [status, load, router]);

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Receipts</h1>
        <p className="text-sm text-zinc-500 mt-1">Every paid citation lands here with an onchain transfer ID.</p>

        <div className="mt-6 panel">
          {loading ? (
            <div className="px-5 py-8 text-sm text-zinc-500 flex items-center gap-2">
              <CircleNotch size={14} className="animate-spin" /> Loading receipts…
            </div>
          ) : receipts.length === 0 ? (
            <div className="px-5 py-12 text-center text-zinc-500">
              <Receipt size={28} className="mx-auto text-zinc-600" />
              <p className="mt-3 text-sm">No paid citations yet.</p>
              <p className="text-xs mt-1">Run a paid answer in the playground to see one.</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-900">
              {receipts.map((r) => (
                <li key={r.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{r.title || "Citation"}</div>
                    <div className="text-xs text-zinc-500 mt-0.5 amount">
                      {r.network} · {r.publisher ? `${r.publisher} · ` : ""}{shortAddress(r.transferId, 6)} · {relativeTime(r.createdAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="amount text-emerald-300">{r.amount}</div>
                    <div className="text-xs text-zinc-500 capitalize">{r.status}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  );
}
