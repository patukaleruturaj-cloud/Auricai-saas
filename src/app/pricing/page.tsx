import Pricing from "@/components/Pricing";
import Link from "next/link";
import Image from "next/image";

export default function PricingPage() {
    return (
        <main className="animate-fade-in" style={{ paddingBottom: "var(--spacing-20)" }}>
            <nav className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "var(--spacing-8)", paddingBottom: "var(--spacing-8)" }}>
                <Link href="/" style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    textDecoration: "none"
                }}>
                    <Image
                        src="/logo.png"
                        alt="AuricAI Logo"
                        width={40}
                        height={40}
                        priority
                        style={{ filter: "invert(1)" }}
                    />
                    <span style={{ fontSize: "1.5rem", fontWeight: "700", color: "white" }}>AuricAI</span>
                </Link>
                <div style={{ display: "flex", gap: "var(--spacing-4)" }}>
                    <Link href="/sign-in" className="secondary-button" style={{ padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
                        Login
                    </Link>
                    <Link href="/sign-up" className="glow-button" style={{ padding: "0.5rem 1rem", fontSize: "0.875rem", background: "var(--accent-blue)" }}>
                        Get Started
                    </Link>
                </div>
            </nav>

            <section className="container" style={{ padding: "4rem 0", textAlign: "center" }}>
                <p style={{ fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-violet)", fontWeight: "600", marginBottom: "0.75rem" }}>
                    Simple, Scalable Pricing
                </p>
                <h1 style={{ fontSize: "3.5rem", fontWeight: "800", marginBottom: "1.5rem", letterSpacing: "-0.02em" }}>
                    The right plan for your <span className="text-gradient">outbound.</span>
                </h1>
                <p style={{ fontSize: "1.125rem", color: "var(--text-secondary)", maxWidth: "600px", margin: "0 auto 4rem auto", lineHeight: "1.6" }}>
                    Whether you're a solo founder or a scaling sales team, we have a plan that fits your volume. All plans include our core AI context engine.
                </p>
                <Pricing />
            </section>
        </main>
    );
}
