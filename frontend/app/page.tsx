"use client";

import { Navbar } from "@/components/Navbar";
import { SitesTable } from "@/components/SitesTable";
import { GradePanel } from "@/components/GradePanel";
import { GateLookup } from "@/components/GateLookup";
import { TransactionPanel } from "@/components/TransactionPanel";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <Navbar />

      {/* Main Content - Padding to account for fixed navbar */}
      <main className="flex-grow pt-20 pb-12 px-4 md:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">SiteGrade</h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              A neutral, on-chain grade for the frontend behind a dApp. GenLayer validators independently load the page and reach consensus on its security headers and accessibility, so a grant programme, directory or wallet can gate on it instead of trusting a self-reported badge.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            <div className="lg:col-span-8 animate-slide-up">
              <h2 className="text-xl font-bold mb-4">Graded Sites</h2>
              <SitesTable />
            </div>

            <div className="lg:col-span-4 space-y-6 animate-slide-up" style={{ animationDelay: "100ms" }}>
              <GradePanel />
              <GateLookup />
              <TransactionPanel />
            </div>
          </div>

          {/* Info Section */}
          <div className="mt-8 glass-card p-6 md:p-8 animate-fade-in" style={{ animationDelay: "200ms" }}>
            <h2 className="text-2xl font-bold mb-4">How it Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="text-accent font-bold text-lg">1. Register a Page</div>
                <p className="text-sm text-muted-foreground">
                  Paste the URL of a dApp frontend. Validators load it once; a page that does not answer HTTP 200 with
                  HTML is rejected, so the registry does not fill with dead links.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-accent font-bold text-lg">2. Validators Audit, Independently</div>
                <p className="text-sm text-muted-foreground">
                  Anyone can trigger an audit. Every validator fetches the page itself and checks six security headers
                  and ten accessibility rules. Consensus is reached on coarse pass/fail results, and an LLM only judges
                  whether link and image labels are descriptive.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-accent font-bold text-lg">3. Integrators Gate on It</div>
                <p className="text-sm text-muted-foreground">
                  A directory, grant programme or contract calls <code className="text-xs">meets_grade(site_id, &quot;C&quot;)</code>{" "}
                  before it links or funds a frontend, and gets a signal no single reviewer decided.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-2">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <a
              href="https://genlayer.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              Powered by GenLayer
            </a>
            <a
              href="https://studio.genlayer.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              Studio
            </a>
            <a
              href="https://docs.genlayer.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
