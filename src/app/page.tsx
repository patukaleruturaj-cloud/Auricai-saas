"use client";

import Pricing from "@/components/Pricing";
import HowItWorks from "@/components/HowItWorks";
import Features from "@/components/Features";
import Comparison from "@/components/Comparison";
import FAQ from "@/components/FAQ";
import StickyCTA from "@/components/StickyCTA";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";

export default function Home() {
  const [demoStep, setDemoStep] = useState(0);

  // Simple animation sequence for the hero demo
  useEffect(() => {
    const timer = setInterval(() => {
      setDemoStep((prev) => (prev + 1) % 5);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="animate-fade-in" style={{ paddingBottom: "var(--spacing-12)" }}>
      {/* Navbar Minimal */}
      <nav className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "var(--spacing-8)", paddingBottom: "var(--spacing-8)" }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          transition: "transform var(--transition-normal), opacity var(--transition-normal)",
          willChange: "transform, opacity",
          cursor: "pointer"
        }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale3d(1.03, 1.03, 1)";
            e.currentTarget.style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale3d(1, 1, 1)";
            e.currentTarget.style.opacity = "1";
          }}>
          <Image
            src="/logo.png"
            alt="AuricAI Logo"
            width={40}
            height={40}
            priority
            style={{ filter: "invert(1)" }}
          />
          <h1 style={{ fontSize: "1.5rem", fontWeight: "700", letterSpacing: "-0.02em", color: "white" }}>AuricAI</h1>
        </div>
        <div style={{ display: "flex", gap: "var(--spacing-4)" }}>
          <Link href="/sign-in" className="secondary-button" style={{ padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
            Login
          </Link>
          <Link href="/sign-up" className="glow-button" style={{ padding: "0.5rem 1rem", fontSize: "0.875rem", background: "var(--accent-blue)" }}>
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4rem", alignItems: "center", minHeight: "80vh", padding: "4rem 0" }}>
        {/* Left Copy */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "flex", flexDirection: "column", gap: "2rem", willChange: "transform, opacity" }}
        >
          <h1 style={{ fontSize: "4.5rem", fontWeight: "800", lineHeight: "1.05", letterSpacing: "-0.03em" }}>
            Turn LinkedIn Cold DMs Into <br />
            <span style={{
              background: "linear-gradient(to right, #60a5fa, #3b82f6)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text"
            }}>
              Revenue Conversations.
            </span>
          </h1>
          <p style={{ fontSize: "1.25rem", color: "var(--text-secondary)", maxWidth: "540px", lineHeight: "1.6" }}>
            Generate hyper-personalized LinkedIn openers that feel 1:1 written — at scale. Built for SDRs, founders, and outbound teams who care about reply rates.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "1rem" }}>
            <Link href="/sign-up" className="glow-button" style={{
              padding: "1.25rem 2rem", fontSize: "1.125rem", gap: "0.5rem",
              background: "var(--accent-blue)",
              boxShadow: "0 0 40px rgba(59, 130, 246, 0.3)"
            }}>
              Generate My First LinkedIn DM Free <ArrowRight size={20} />
            </Link>
            <Link href="#how-it-works" className="secondary-button" style={{ padding: "1.25rem 2rem", fontSize: "1.125rem" }}>
              See How It Works
            </Link>
          </div>
          <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: "-0.5rem" }}>
            No scraping. No automation spam. Just relevance.
          </span>
        </motion.div>

        {/* Right Demo Animation (Restored from the original) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          className="glass-panel"
          style={{ padding: "var(--spacing-6)", display: "flex", flexDirection: "column", gap: "var(--spacing-4)", position: "relative", willChange: "transform, opacity" }}
        >
          <div style={{ position: "absolute", top: "-10px", right: "-10px", width: "100px", height: "100px", background: "var(--accent-blue)", filter: "blur(60px)", zIndex: -1, opacity: 0.2 }}></div>

          <div style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: "var(--spacing-4)" }}>
            <p style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.05em", marginBottom: "var(--spacing-2)" }}>Target Prospect</p>
            <div style={{ display: "flex", gap: "var(--spacing-3)", alignItems: "center" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Image src="/logo.png" alt="AuricAI Logo" width={24} height={24} style={{ filter: "invert(1)", objectFit: "contain" }} />
              </div>
              <div>
                <p style={{ fontWeight: "600" }}>Sarah Jenkins</p>
                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>VP of Sales @ TechCorp</p>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)", minHeight: "150px" }}>
            {demoStep === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "var(--spacing-4)", background: "rgba(0,0,0,0.3)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", fontStyle: "italic" }}>
                Mapping Prospect Context...
              </motion.div>
            )}
            {demoStep === 1 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "var(--spacing-4)", background: "rgba(0,0,0,0.3)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", fontStyle: "italic" }}>
                Identifying role authority...
              </motion.div>
            )}
            {demoStep === 2 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "var(--spacing-4)", background: "rgba(0,0,0,0.3)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", fontStyle: "italic" }}>
                Understanding company positioning...
              </motion.div>
            )}
            {demoStep === 3 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)", padding: "var(--spacing-4)", color: "var(--text-secondary)", fontStyle: "italic" }}>
                <Sparkles size={16} className="text-gradient" />
                <p>Detecting industry signals...</p>
              </motion.div>
            )}
            {demoStep >= 4 && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ padding: "var(--spacing-4)", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-focus)", position: "relative" }}>
                <p style={{ fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent-blue)", fontWeight: "600", marginBottom: "var(--spacing-2)" }}>Generated Opener</p>
                <p style={{ fontSize: "0.9375rem", lineHeight: "1.6" }}>
                  "Hey Sarah — noticed TechCorp expanding the sales team recently. Curious if outbound personalization is something your team is experimenting with this quarter?"
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      <div id="how-it-works" className="container">
        <HowItWorks />
        <Features />
        <Comparison />

        <section style={{ padding: "6rem 0", borderTop: "1px solid var(--border-subtle)", textAlign: "center" }}>
          <p style={{ fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-violet)", fontWeight: "600", marginBottom: "0.75rem" }}>
            Simple, Scalable Pricing
          </p>
          <h2 style={{ fontSize: "2.5rem", fontWeight: "700", marginBottom: "3rem" }}>
            Start free. Scale as your <span className="text-gradient">outbound grows.</span>
          </h2>
          <Pricing />
        </section>

        <FAQ />
      </div>

      <StickyCTA />
    </main>
  );
}
