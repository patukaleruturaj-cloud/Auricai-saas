"use client";

import { motion } from "framer-motion";
import { X, Check } from "lucide-react";

const manualItems = [
    "5–10 minutes per DM",
    "Inconsistent quality",
    "Hard to scale",
    "Burnout risk",
];

const auricItems = [
    "10 seconds per DM",
    "Consistent personalization",
    "Scalable to thousands",
    "Built for teams",
];

export default function Comparison() {
    return (
        <section style={{ padding: "6rem 0", borderTop: "1px solid var(--border-subtle)" }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                style={{ textAlign: "center", marginBottom: "4rem", willChange: "transform, opacity" }}
            >
                <p style={{ fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-blue)", fontWeight: "600", marginBottom: "0.75rem" }}>
                    Why AuricAI
                </p>
                <h2 style={{ fontSize: "2.5rem", fontWeight: "700", letterSpacing: "-0.02em" }}>
                    Manual Personalization vs <span className="text-gradient">AuricAI</span>
                </h2>
            </motion.div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", maxWidth: "800px", margin: "0 auto" }}>
                {/* Manual Column */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                        padding: "2.5rem 2rem",
                        borderRadius: "var(--radius-lg)",
                        background: "rgba(239, 68, 68, 0.04)",
                        border: "1px solid rgba(239, 68, 68, 0.15)",
                        willChange: "transform, opacity"
                    }}
                >
                    <h3 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "2rem", color: "var(--text-secondary)" }}>
                        Manual Outreach
                    </h3>
                    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                        {manualItems.map((item, idx) => (
                            <li key={idx} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.9375rem" }}>
                                <X size={18} color="#ef4444" style={{ flexShrink: 0 }} />
                                <span style={{ color: "var(--text-secondary)" }}>{item}</span>
                            </li>
                        ))}
                    </ul>
                </motion.div>

                {/* AuricAI Column */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                        padding: "2.5rem 2rem",
                        borderRadius: "var(--radius-lg)",
                        background: "rgba(59, 130, 246, 0.04)",
                        border: "1px solid rgba(59, 130, 246, 0.2)",
                        boxShadow: "0 0 30px rgba(59, 130, 246, 0.08)",
                        willChange: "transform, opacity"
                    }}
                >
                    <h3 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "2rem" }}>
                        <span className="text-gradient">AuricAI</span>
                    </h3>
                    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                        {auricItems.map((item, idx) => (
                            <li key={idx} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.9375rem" }}>
                                <Check size={18} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </motion.div>
            </div>
        </section>
    );
}
