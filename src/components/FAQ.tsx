"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const faqs = [
    {
        question: "Do you scrape LinkedIn?",
        answer: "No. AuricAI does not scrape, crawl, or automate any actions on LinkedIn. You paste the prospect's info manually. We simply help you write better, more relevant openers.",
    },
    {
        question: "Is this automation?",
        answer: "No. AuricAI is a writing assistant, not a bot. It generates personalized message drafts that you review, edit, and send yourself. Full human control at every step.",
    },
    {
        question: "Can I cancel anytime?",
        answer: "Yes. All plans are month-to-month by default. You can cancel your subscription at any time from the billing dashboard — no questions asked, no hidden fees.",
    },
    {
        question: "Is there a free trial?",
        answer: "Every new account gets 5 free generations to test the quality before committing to a plan. No credit card required to start.",
    },
];

export default function FAQ() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    return (
        <section style={{ padding: "6rem 0", borderTop: "1px solid var(--border-subtle)" }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                style={{ textAlign: "center", marginBottom: "3rem", willChange: "transform, opacity" }}
            >
                <h2 style={{ fontSize: "2rem", fontWeight: "700" }}>Frequently Asked Questions</h2>
            </motion.div>

            <div style={{ maxWidth: "700px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {faqs.map((faq, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: idx * 0.05 }}
                        className="glass-panel"
                        style={{ overflow: "hidden", willChange: "transform, opacity" }}
                    >
                        <button
                            onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                            style={{
                                width: "100%", padding: "1.25rem 1.5rem",
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                background: "transparent", border: "none", color: "var(--text-primary)",
                                cursor: "pointer", fontSize: "1rem", fontWeight: "500", fontFamily: "inherit", textAlign: "left",
                            }}
                        >
                            {faq.question}
                            <ChevronDown
                                size={18}
                                style={{
                                    transform: openIndex === idx ? "rotate(180deg)" : "rotate(0deg)",
                                    transition: "transform 0.2s ease",
                                    flexShrink: 0,
                                    color: "var(--text-secondary)"
                                }}
                            />
                        </button>
                        <AnimatePresence>
                            {openIndex === idx && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                    style={{ willChange: "height, opacity" }}
                                >
                                    <div style={{ padding: "0 1.5rem 1.25rem", color: "var(--text-secondary)", fontSize: "0.9375rem", lineHeight: "1.7" }}>
                                        {faq.answer}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
