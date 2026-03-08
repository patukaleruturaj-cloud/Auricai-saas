"use client";

import { motion } from "framer-motion";
import { Search, Sparkles, Send } from "lucide-react";

const steps = [
    {
        icon: Search,
        title: "Identify the Prospect",
        description: "Define your target. AuricAI maps role authority, company momentum, and business context to determine the strongest conversation angle.",
        step: "01",
    },
    {
        icon: Sparkles,
        title: "AI Crafts Contextual Opener",
        description: "Not generic compliments — real business relevance.",
        step: "02",
    },
    {
        icon: Send,
        title: "Send & Track Reply Rates",
        description: "Improve messaging with built-in feedback loop.",
        step: "03",
    },
];

export default function HowItWorks() {
    return (
        <section style={{ padding: "6rem 0", borderTop: "1px solid var(--border-subtle)" }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                style={{ textAlign: "center", marginBottom: "4rem" }}
            >
                <p style={{ fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-blue)", fontWeight: "600", marginBottom: "0.75rem" }}>
                    How It Works
                </p>
                <h2 style={{ fontSize: "2.5rem", fontWeight: "700", letterSpacing: "-0.02em" }}>
                    From Profile to Personalized DM in <span className="text-gradient">3 Steps</span>
                </h2>
            </motion.div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2rem" }}>
                {steps.map((item, idx) => (
                    <motion.div
                        key={idx}
                        initial="hidden"
                        whileInView="visible"
                        whileHover="hover"
                        viewport={{ once: true }}
                        variants={{
                            hidden: { opacity: 0, y: 20 },
                            visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: idx * 0.15 } },
                            hover: { y: -4, transition: { duration: 0.2, ease: "easeOut" } }
                        }}
                        className="glass-panel"
                        style={{
                            padding: "2.5rem 2rem",
                            textAlign: "center",
                            position: "relative",
                            overflow: "hidden",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.2), 0 0 15px rgba(59,130,246,0.1)",
                            willChange: "transform, opacity"
                        }}
                    >
                        {/* Hardware-accelerated glow hover */}
                        <motion.div
                            variants={{
                                hidden: { opacity: 0 },
                                visible: { opacity: 0 },
                                hover: { opacity: 1, transition: { duration: 0.2 } }
                            }}
                            style={{
                                position: "absolute",
                                inset: 0,
                                borderRadius: "inherit",
                                boxShadow: "0 12px 30px rgba(0,0,0,0.4), 0 0 30px rgba(59,130,246,0.2)",
                                zIndex: -1,
                                pointerEvents: "none",
                                willChange: "opacity"
                            }}
                        />
                        <div style={{ position: "absolute", top: "1rem", right: "1.25rem", fontSize: "3rem", fontWeight: "800", color: "rgba(255,255,255,0.03)" }}>
                            {item.step}
                        </div>
                        <div style={{
                            width: "56px", height: "56px", borderRadius: "var(--radius-lg)",
                            background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            margin: "0 auto 1.5rem",
                            border: "1px solid var(--border-subtle)"
                        }}>
                            <item.icon size={24} color="var(--accent-blue)" />
                        </div>
                        <h3 style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "0.75rem" }}>{item.title}</h3>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", lineHeight: "1.6" }}>{item.description}</p>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
