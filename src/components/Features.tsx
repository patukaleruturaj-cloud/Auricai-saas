"use client";

import { motion } from "framer-motion";
import { Brain, SlidersHorizontal, TrendingUp, Layers, Users, Shield } from "lucide-react";

const features = [
    {
        icon: Brain,
        title: "Hyper-Personal Context Engine",
        description: "Understands role, industry, company growth signals to craft messages that feel genuinely researched.",
    },
    {
        icon: SlidersHorizontal,
        title: "Tone Control",
        description: "Founder tone, SDR tone, Enterprise tone — match your voice to your prospect's expectations.",
    },
    {
        icon: TrendingUp,
        title: "Reply Rate Optimization",
        description: "Built-in AI suggestions to improve opener strength and maximize response probability.",
    },
    {
        icon: Layers,
        title: "Message Variations",
        description: "Generate 3 strategically different angles instantly. A/B test positioning without extra effort.",
    },
    {
        icon: Users,
        title: "Signal-Based Personalization",
        description: "AuricAI analyzes role positioning, company momentum, and recent activity signals to craft timely, relevant openers that feel intentional — not templated. Every message is built around business context, not generic compliments.",
    },
    {
        icon: Shield,
        title: "Smart Prospect Memory",
        description: "Avoid repeating the same angle twice. AuricAI remembers past outreach context.",
    },
];

export default function Features() {
    return (
        <section style={{ padding: "6rem 0", borderTop: "1px solid var(--border-subtle)" }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                style={{ textAlign: "center", marginBottom: "4rem" }}
            >
                <p style={{ fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-violet)", fontWeight: "600", marginBottom: "0.75rem" }}>
                    Core Features
                </p>
                <h2 style={{ fontSize: "2.5rem", fontWeight: "700", letterSpacing: "-0.02em" }}>
                    Built for Modern <span className="text-gradient">LinkedIn Outbound</span>
                </h2>
            </motion.div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.5rem" }}>
                {features.map((feature, idx) => (
                    <motion.div
                        key={idx}
                        initial="hidden"
                        whileInView="visible"
                        whileHover="hover"
                        viewport={{ once: true }}
                        variants={{
                            hidden: { opacity: 0, y: 20 },
                            visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: idx * 0.08 } },
                            hover: { y: -4, transition: { duration: 0.2, ease: "easeOut" } }
                        }}
                        className="glass-panel"
                        style={{
                            padding: "2rem",
                            display: "flex",
                            gap: "1.25rem",
                            alignItems: "flex-start",
                            position: "relative",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.2), 0 0 15px rgba(139,92,246,0.1)",
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
                                boxShadow: "0 12px 30px rgba(0,0,0,0.4), 0 0 30px rgba(139,92,246,0.2)",
                                zIndex: -1,
                                pointerEvents: "none",
                                willChange: "opacity"
                            }}
                        />

                        <div style={{
                            width: "48px", height: "48px", borderRadius: "var(--radius-md)", flexShrink: 0,
                            background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.12))",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            border: "1px solid var(--border-subtle)"
                        }}>
                            <feature.icon size={22} color="var(--accent-violet)" />
                        </div>
                        <div>
                            <h3 style={{ fontSize: "1.0625rem", fontWeight: "600", marginBottom: "0.5rem" }}>{feature.title}</h3>
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", lineHeight: "1.6" }}>{feature.description}</p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
