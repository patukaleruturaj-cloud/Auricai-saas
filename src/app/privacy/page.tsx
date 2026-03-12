import Link from "next/link";
import Image from "next/image";

export default function PrivacyPage() {
    return (
        <main className="animate-fade-in" style={{ paddingBottom: "var(--spacing-20)" }}>
            <nav className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "var(--spacing-8)", paddingBottom: "var(--spacing-8)" }}>
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none" }}>
                    <Image src="/logo.png" alt="AuricAI Logo" width={40} height={40} style={{ filter: "invert(1)" }} />
                    <span style={{ fontSize: "1.5rem", fontWeight: "700", color: "white" }}>AuricAI</span>
                </Link>
            </nav>

            <div className="container" style={{ maxWidth: "800px", marginTop: "4rem" }}>
                <h1 style={{ fontSize: "3rem", fontWeight: "800", marginBottom: "2rem" }}>Privacy Policy</h1>
                <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>Last Updated: March 11, 2026</p>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>1. Information We Collect</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        We collect information you provide directly to us when you create an account, use our services, or communicate with us. This may include your email address, name, and any LinkedIn profile data or company information you provide for our AI to analyze.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>2. How We Use Information</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        We use the information we collect to provide, maintain, and improve our services, including our AI-powered personalization engine. We do not sell your personal information to third parties.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>3. Data Security</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        We implement reasonable security measures to protect your information from unauthorized access, alteration, or destruction. We use industry-standard encryption and secure authentication providers like Clerk.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "1rem" }}>4. Contact Us</h2>
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        If you have any questions about this Privacy Policy, please contact us at <a href="mailto:auricai155@gmail.com" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>support@auricai.tech</a>.
                    </p>
                </section>
            </div>
        </main>
    );
}
