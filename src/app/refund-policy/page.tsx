import Link from "next/link";
import Image from "next/image";

export default function RefundPolicyPage() {
    return (
        <main className="animate-fade-in" style={{ paddingBottom: "var(--spacing-20)" }}>
            <nav className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "var(--spacing-8)", paddingBottom: "var(--spacing-8)" }}>
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none" }}>
                    <Image src="/logo.png" alt="AuricAI Logo" width={40} height={40} style={{ filter: "invert(1)" }} />
                    <span style={{ fontSize: "1.5rem", fontWeight: "700", color: "white" }}>AuricAI</span>
                </Link>
            </nav>

            <div className="container" style={{ maxWidth: "800px", marginTop: "4rem" }}>
                <h1 style={{ fontSize: "3rem", fontWeight: "800", marginBottom: "2rem" }}>Refund Policy</h1>
                <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>Last Updated: March 11, 2026</p>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>1. No Refunds</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        All purchases made on AuricAI are final. Due to the nature of our service, which provides instant AI-generated content and consumes computational resources immediately upon use, we do not offer refunds once a subscription or credit package has been purchased.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>2. Free Usage Before Purchase</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        Users are encouraged to evaluate the service using the available free features or trial credits before purchasing a paid plan.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>3. Subscription Cancellation</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        You may cancel your subscription at any time. Once cancelled, you will continue to have access to the service until the end of your current billing period. No further charges will be applied after cancellation.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>4. Exceptional Circumstances</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        In rare cases such as duplicate charges or technical billing errors, AuricAI may review refund requests at its sole discretion.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>5. Contact</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        If you believe there has been a billing error, please contact us at <a href="mailto:support@auricai.tech" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>support@auricai.tech</a> and we will investigate the issue.
                    </p>
                </section>
            </div>
        </main>
    );
}
