"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useRegisterSite } from "@/lib/hooks/useSiteGrade";
import { useWallet } from "@/lib/genlayer/wallet";
import { error } from "@/lib/utils/toast";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const isHttps = (v: string) => /^https:\/\/[^\s/]+\S*$/.test(v.trim());

export function RegisterSiteModal() {
  const { isConnected, isLoading } = useWallet();
  const { registerSite, isRegistering, isSuccess } = useRegisterSite();

  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isConnected && isOpen && !isRegistering) setIsOpen(false);
  }, [isConnected, isOpen, isRegistering]);

  useEffect(() => {
    if (isSuccess) {
      setUrl("");
      setErr("");
      setIsOpen(false);
    }
  }, [isSuccess]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      error("Please connect your wallet first");
      return;
    }
    if (!isHttps(url)) {
      setErr("Must be a full https:// URL");
      return;
    }
    registerSite({ url: url.trim() });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isRegistering) {
      setUrl("");
      setErr("");
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="gradient" disabled={!isConnected || isLoading}>
          <Plus className="w-4 h-4 mr-2" />
          Grade a Site
        </Button>
      </DialogTrigger>
      <DialogContent className="brand-card border-2 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Grade a Site</DialogTitle>
          <DialogDescription>
            Paste the page to grade. Validators each load it once and the first grade is stored on-chain. Pages that
            do not answer HTTP 200 with HTML are rejected. Anyone can re-audit it later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="url">Page URL</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setErr("");
              }}
              placeholder="https://your-dapp.xyz"
              className={`font-mono text-sm ${err ? "border-destructive" : ""}`}
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsOpen(false)} disabled={isRegistering}>
              Cancel
            </Button>
            <Button type="submit" variant="gradient" className="flex-1" disabled={isRegistering}>
              {isRegistering ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Grading...
                </>
              ) : (
                "Register & Grade"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
