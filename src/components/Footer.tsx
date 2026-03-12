import Link from "next/link";
import Image from "next/image";

export default function Footer() {
    return (
        <footer style={{ borderTop: "1px solid var(--border-subtle)", padding: "4rem 0 2rem 0", background: "var(--bg-main)" }}>
            <div className="container">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "3rem", marginBottom: "3rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <Image src="/logo.png" alt="AuricAI Logo" width={24} height={24} style={{ filter: "invert(1)" }} />
                            <span style={{ fontSize: "1.25rem", fontWeight: "700", color: "white" }}>AuricAI</span>
                        </div>
                        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                            Hyper-personalized LinkedIn openers that actually get replies.
                        </p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <h4 style={{ fontSize: "0.875rem", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "white" }}>Product</h4>
                        <Link href="/" style={{ fontSize: "0.875rem", color: "var(--text-secondary)", textDecoration: "none" }} className="hover-link">Home</Link>
                        <Link href="/pricing" style={{ fontSize: "0.875rem", color: "var(--text-secondary)", textDecoration: "none" }} className="hover-link">Pricing</Link>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <h4 style={{ fontSize: "0.875rem", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "white" }}>Legal</h4>
                        <Link href="/privacy" style={{ fontSize: "0.875rem", color: "var(--text-secondary)", textDecoration: "none" }} className="hover-link">Privacy Policy</Link>
                        <Link href="/terms" style={{ fontSize: "0.875rem", color: "var(--text-secondary)", textDecoration: "none" }} className="hover-link">Terms of Service</Link>
                        <Link href="/refund-policy" style={{ fontSize: "0.875rem", color: "var(--text-secondary)", textDecoration: "none" }} className="hover-link">Refund Policy</Link>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <h4 style={{ fontSize: "0.875rem", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "white" }}>Contact</h4>
                        <a href="mailto:support@auricai.tech" style={{ fontSize: "0.875rem", color: "var(--text-secondary)", textDecoration: "none" }} className="hover-link">support@auricai.tech</a>
                    </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        © {new Date().getFullYear()} AuricAI. All rights reserved.
                    </p>
                </div>
            </div>
            <style dangerouslySetInnerHTML={{
                __html: `
        .hover-link:hover {
          color: white !important;
          transition: color 0.2s ease;
        }
      `}} />
        </footer>
    );
}
