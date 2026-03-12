import Link from "next/link";
import Image from "next/image";

export default function TermsPage() {
    return (
        <main className="animate-fade-in" style={{ paddingBottom: "var(--spacing-20)" }}>
            <nav className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "var(--spacing-8)", paddingBottom: "var(--spacing-8)" }}>
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none" }}>
                    <Image src="/logo.png" alt="AuricAI Logo" width={40} height={40} style={{ filter: "invert(1)" }} />
                    <span style={{ fontSize: "1.5rem", fontWeight: "700", color: "white" }}>AuricAI</span>
                </Link>
            </nav>

            <div className="container" style={{ maxWidth: "800px", marginTop: "4rem" }}>
                <h1 style={{ fontSize: "3rem", fontWeight: "800", marginBottom: "2rem" }}>Terms of Service</h1>
                <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>Last Updated: March 11, 2026</p>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>1. Acceptance of Terms</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        By accessing or using AuricAI, you agree to be bound by these Terms of Service. If you do not agree, you may not use our services.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>2. Use of Service</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        You are responsible for your use of the service and for any content you provide. You must comply with all applicable laws and regulations. You may not use AuricAI for any illegal or unauthorized purpose, including spamming or malicious outbound activities.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>3. Subscriptions and Payments</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        We offer various subscription plans. Payments are processed through Paddle, our merchant of record. By subscribing, you agree to the payment terms associated with your chosen plan.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>4. Termination</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        We reserve the right to suspend or terminate your account at any time for violations of these terms or for any other reason.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>5. Limitation of Liability</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        AuricAI shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.
                    </p>
                </section>
            </div>
        </main>
    );
}
