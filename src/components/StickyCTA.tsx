"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";

export default function StickyCTA() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setVisible(window.scrollY > 600);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: "100%", opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                        position: "fixed",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        zIndex: 50,
                        background: "rgba(10, 10, 12, 0.85)",
                        backdropFilter: "blur(16px)",
                        borderTop: "1px solid var(--border-subtle)",
                        padding: "0.875rem 0",
                        willChange: "transform, opacity"
                    }}
                >
                    <div style={{
                        maxWidth: "1200px",
                        margin: "0 auto",
                        padding: "0 1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}>
                        <p style={{ fontSize: "0.9375rem", fontWeight: "500" }}>
                            Start generating LinkedIn DMs in seconds
                        </p>
                        <button
                            onClick={() => window.location.href = "/sign-up"}
                            className="glow-button"
                            style={{
                                padding: "0.5rem 1.25rem",
                                fontSize: "0.875rem",
                                gap: "6px",
                                border: "none",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center"
                            }}
                        >
                            Get Started Free <ArrowRight size={16} />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
