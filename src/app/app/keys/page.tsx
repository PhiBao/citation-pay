"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { CircleNotch, Copy, Key, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { relativeTime } from "@/lib/price";

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export default function KeysPage() {
  const router = useRouter();
  const { status } = useSession();
  const toast = useToast();
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Agent key");
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/api-keys", { cache: "no-store" });
      const data = await res.json();
      setKeys(data.keys || []);
    } catch {
      toast.push("error", "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (status === "anonymous") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") void load();
  }, [status, router, toast, load]);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch("/api/account/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      setFreshKey(data.key.value);
      await load();
      toast.push("success", "API key created");
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Any agent using it will lose access immediately.")) return;
    try {
      const res = await fetch(`/api/account/api-keys?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Revoke failed");
      toast.push("success", "Key revoked");
      await load();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Revoke failed");
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">API keys</h1>
        <p className="text-sm text-zinc-500 mt-1">One key per agent. Issue a fresh one and copy the value — it won&apos;t be shown again.</p>

        <div className="mt-6 panel p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cursor agent, Claude Desktop"
            />
            <div className="flex items-end">
              <Button onClick={create} loading={creating} className="w-full">
                <Plus size={14} weight="bold" /> Mint new key
              </Button>
            </div>
          </div>
          {freshKey && (
            <div className="mt-4 panel-2 p-4">
              <div className="text-xs uppercase tracking-wider text-emerald-300 mb-2">Save this — it won&apos;t be shown again</div>
              <div className="flex items-center gap-2">
                <code className="amount text-sm text-zinc-100 break-all flex-1">{freshKey}</code>
                <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(freshKey).then(() => toast.push("success", "Copied"))}>
                  <Copy size={12} /> Copy
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 panel">
          <div className="px-5 py-3 text-xs uppercase tracking-wider text-zinc-500 hairline">Issued keys</div>
          {loading ? (
            <div className="px-5 py-8 text-sm text-zinc-500 flex items-center gap-2">
              <CircleNotch size={14} className="animate-spin" /> Loading…
            </div>
          ) : keys.length === 0 ? (
            <div className="px-5 py-8 text-sm text-zinc-500">No keys yet. Mint one above.</div>
          ) : (
            <ul className="divide-y divide-zinc-900">
              {keys.map((k) => (
                <li key={k.id} className="px-5 py-3 flex items-center gap-3">
                  <Key size={16} className="text-zinc-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200">{k.name}</div>
                    <div className="text-xs text-zinc-500 amount">{k.prefix}…</div>
                  </div>
                  <div className="text-xs text-zinc-500 text-right">
                    <div>last used {k.lastUsedAt ? relativeTime(k.lastUsedAt) : "never"}</div>
                    <div>created {relativeTime(k.createdAt)}</div>
                  </div>
                  {k.name !== "Default agent key" && (
                    <Button variant="danger" size="sm" onClick={() => revoke(k.id)}>
                      <Trash size={12} /> Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  );
}
