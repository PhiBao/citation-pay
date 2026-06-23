"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Coins, Copy, Lightning, Wallet } from "@phosphor-icons/react/dist/ssr";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMicroUsdc } from "@/lib/price";

type AccountData = {
  account: {
    balanceMicroUsdc: number;
    circleWalletAddress: string | null;
    circleWalletId: string | null;
  };
};

export default function DepositPage() {
  const router = useRouter();
  const { status, refresh } = useSession();
  const toast = useToast();
  const [data, setData] = useState<AccountData | null>(null);
  const [amount, setAmount] = useState("1.00");
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "anonymous") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      void loadAccount();
    }
  }, [status, router]);

  async function loadAccount() {
    const res = await fetch("/api/account", { cache: "no-store" });
    const d = await res.json();
    setData(d);
  }

  async function faucet() {
    setBusy(true);
    try {
      const res = await fetch("/api/wallets/deposit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "faucet", amountUsd: amount })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Faucet failed");
      toast.push("success", `Credited ${formatMicroUsdc(result.creditedMicroUsdc)} USDC on Arc.`);
      await refresh();
      await loadAccount();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Faucet failed");
    } finally {
      setBusy(false);
    }
  }

  async function deposit() {
    if (!txHash) {
      toast.push("error", "Paste your Arc transaction hash.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/wallets/deposit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "deposit", amountUsd: amount, txHash })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Deposit failed");
      toast.push("success", `Credited ${formatMicroUsdc(result.creditedMicroUsdc)} USDC.`);
      setTxHash("");
      await refresh();
      await loadAccount();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  function copyAddress() {
    if (data?.account?.circleWalletAddress) {
      void navigator.clipboard.writeText(data.account.circleWalletAddress).then(() =>
        toast.push("success", "Address copied")
      );
    }
  }

  return (
    <div className="mx-auto max-w-[800px] px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Fund your account on Arc</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Arc-native USDC. Fund your balance directly on Arc Testnet.
        </p>

        <div className="mt-6 panel p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-3">
            <Wallet size={12} className="text-emerald-400" /> Your Arc wallet
          </div>
          <div className="flex items-center justify-between gap-3 panel-2 p-4">
            <code className="amount text-sm text-zinc-200 break-all flex-1">
              {data?.account?.circleWalletAddress || "minting…"}
            </code>
            {data?.account?.circleWalletAddress && (
              <Button variant="ghost" size="sm" onClick={copyAddress}>
                <Copy size={12} /> Copy
              </Button>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
            <span>Current balance</span>
            <span className="amount text-emerald-300">
              {data ? formatMicroUsdc(data.account.balanceMicroUsdc) : "—"}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-3">
              <Lightning size={12} className="text-emerald-400" /> Faucet credit
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Get testnet USDC instantly. The platform credits your balance on Arc Testnet.
            </p>
            <Input
              label="Amount (USDC)"
              name="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="amount"
            />
            <Button onClick={faucet} loading={busy} className="mt-3 w-full">
              <Coins size={14} weight="bold" /> Credit from faucet
            </Button>
          </div>

          <div className="panel p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-3">
              <Wallet size={12} className="text-emerald-400" /> Manual deposit
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Sent USDC to your Arc wallet? Paste the transaction hash to credit your balance.
            </p>
            <Input
              label="Amount (USDC)"
              name="depositAmount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="amount"
            />
            <Input
              label="Arc tx hash (optional)"
              name="txHash"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="0x…"
              className="mt-3 amount"
            />
            <Button onClick={deposit} loading={busy} variant="ghost" className="mt-3 w-full">
              Credit from deposit
            </Button>
          </div>
        </div>

        <div className="mt-4 panel-2 p-4 text-xs text-zinc-500">
          <span className="text-zinc-300">TestMint faucet:</span> get up to $10k testnet USDC at{" "}
          <a
            href="https://testmint.myproceeds.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-300 hover:underline"
          >
            testmint.myproceeds.xyz
          </a>
          . Send it to your Arc wallet address above, then paste the tx hash.
        </div>
      </motion.div>
    </div>
  );
}
