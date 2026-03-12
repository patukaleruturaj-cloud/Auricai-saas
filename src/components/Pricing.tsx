"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

const PAID_PLANS = [
    {
        name: "Starter",
        planType: "starter",
        description: "Perfect for testing outbound strategies.",
        monthlyPrice: 15,
        msgs: 150,
        features: [
            "150 messages / month",
            "3 strategic message variations",
            "Core Context Intelligence",
            "Standard processing",
            "Email support",
        ],
        popular: false,
        theme: {
            glowColor: "rgba(251, 146, 60, 1)", // Orange/Amber
            shimmerColor: "rgba(251, 146, 60, 0.4)",
            bgTint: "rgba(251, 146, 60, 0.02)",
            glowBase: 0.12,
            glowHover: 0.20,
            hoverLift: -6,
            baseScale: 1,
            hoverScale: 1.02,
        }
    },
    {
        name: "Basic",
        planType: "basic",
        description: "For founders testing outbound.",
        monthlyPrice: 29,
        msgs: 400,
        features: [
            "400 credits / month",
            "3 strategic message variations",
            "Core Context Intelligence",
            "Standard processing",
            "Email support",
        ],
        popular: false,
        theme: {
            glowColor: "rgba(59, 130, 246, 1)", // Soft Blue
            shimmerColor: "rgba(59, 130, 246, 0.3)",
            bgTint: "rgba(59, 130, 246, 0.01)",
            glowBase: 0.08,
            glowHover: 0.15,
            hoverLift: -6,
            baseScale: 1,
            hoverScale: 1.02,
        }
    },
    {
        name: "Growth",
        planType: "growth",
        description: "For 1–2 SDR teams scaling outreach.",
        monthlyPrice: 49,
        msgs: 1200,
        features: [
            "1,200 credits / month",
            "3 strategic message variations",
            "Advanced Context Depth",
            "Reply Rate Optimization",
            "Smart Prospect Memory",
            "Priority processing",
            "Priority support",
        ],
        popular: true, // ← MOST POPULAR
        theme: {
            glowColor: "rgba(139, 92, 246, 1)", // Soft Purple
            shimmerColor: "rgba(139, 92, 246, 0.4)",
            bgTint: "rgba(139, 92, 246, 0.04)",
            glowBase: 0.15,
            glowHover: 0.22,
            hoverLift: -8,
            baseScale: 1.05,
            hoverScale: 1.07,
        }
    },
    {
        name: "Pro",
        planType: "pro",
        description: "For serious outbound teams maximizing reply rates.",
        monthlyPrice: 69,
        msgs: 3000,
        features: [
            "3,000 credits / month",
            "3 strategic message variations",
            "Premium Context Intelligence",
            "Advanced Signal-Based Personalization",
            "Highest priority processing",
        ],
        popular: false,
        theme: {
            glowColor: "rgba(16, 185, 129, 1)", // Premium Emerald
            shimmerColor: "rgba(16, 185, 129, 0.5)",
            bgTint: "rgba(16, 185, 129, 0.02)",
            glowBase: 0.12,
            glowHover: 0.20,
            hoverLift: -6,
            baseScale: 1,
            hoverScale: 1.02,
        }
    },
];

export default function Pricing({
    isDashboard = false,
    onPlanSelect,
}: {
    isDashboard?: boolean;
    onPlanSelect?: (planType: string, isYearly: boolean) => void;
} = {}) {
    const [isYearly, setIsYearly] = useState(false);

    return (
        <section>
            <div style={{ textAlign: "center", marginBottom: "3rem" }}>
                {/* Billing Toggle */}
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: "var(--bg-elevated)",
                        padding: "var(--spacing-1)",
                        borderRadius: "var(--radius-full)",
                        border: "1px solid var(--border-subtle)",
                    }}
                >
                    <button
                        onClick={() => setIsYearly(false)}
                        style={{
                            padding: "var(--spacing-2) var(--spacing-6)",
                            borderRadius: "var(--radius-full)",
                            background: !isYearly
                                ? "var(--accent-blue)"
                                : "transparent",
                            color: !isYearly ? "white" : "var(--text-secondary)",
                            border: "none",
                            cursor: "pointer",
                            fontWeight: "500",
                            transition: "background-color var(--transition-fast), color var(--transition-fast)",
                            willChange: "background-color, color"
                        }}
                    >
                        Monthly
                    </button>
                    <button
                        onClick={() => setIsYearly(true)}
                        style={{
                            padding: "var(--spacing-2) var(--spacing-6)",
                            borderRadius: "var(--radius-full)",
                            background: isYearly
                                ? "var(--accent-blue)"
                                : "transparent",
                            color: isYearly ? "white" : "var(--text-secondary)",
                            border: "none",
                            cursor: "pointer",
                            fontWeight: "500",
                            transition: "background-color var(--transition-fast), color var(--transition-fast)",
                            willChange: "background-color, color"
                        }}
                    >
                        Yearly{" "}
                        <span
                            style={{
                                color: "#4ade80",
                                fontSize: "0.75rem",
                                marginLeft: "4px",
                            }}
                        >
                            Save 20%
                        </span>
                    </button>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "1.5rem",
                    maxWidth: "1200px",
                    margin: "0 auto",
                }}
            >
                {PAID_PLANS.map((plan, idx) => {
                    const displayPrice = isYearly
                        ? Math.floor(plan.monthlyPrice * 0.8)
                        : plan.monthlyPrice;

                    return (
                        <motion.div
                            key={plan.name}
                            initial="hidden"
                            whileInView="visible"
                            whileHover="hover"
                            viewport={{ once: true }}
                            variants={{
                                hidden: { opacity: 0, y: 20, scale: plan.theme.baseScale },
                                visible: {
                                    opacity: 1,
                                    y: 0,
                                    scale: plan.theme.baseScale,
                                    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: idx * 0.1 }
                                },
                                hover: {
                                    y: plan.theme.hoverLift,
                                    scale: plan.theme.hoverScale,
                                    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
                                }
                            }}
                            className="glass-panel"
                            style={{
                                padding: "2rem",
                                position: "relative",
                                border: plan.popular
                                    ? "2px solid var(--accent-blue)"
                                    : "1px solid var(--border-subtle)",
                                zIndex: plan.popular ? 10 : 1,
                                borderRadius: "1rem",
                                display: "flex",
                                flexDirection: "column",
                                background: `linear-gradient(180deg, var(--bg-surface) 0%, ${plan.theme.bgTint} 100%)`,
                                willChange: "transform, opacity"
                            }}
                        >
                            {/* Glow Layer (Hardware Accelerated & Tier-Based) */}
                            <motion.div
                                variants={{
                                    hidden: { opacity: 0 },
                                    visible: { opacity: plan.theme.glowBase },
                                    hover: { opacity: plan.theme.glowHover, transition: { duration: 0.25, ease: "easeOut" } }
                                }}
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    borderRadius: "inherit",
                                    boxShadow: `0 12px 40px ${plan.theme.glowColor}`,
                                    zIndex: -1,
                                    pointerEvents: "none",
                                    willChange: "opacity"
                                }}
                            />

                            {/* Animated Shimmer Border Overlay */}
                            <div style={{
                                position: "absolute",
                                inset: plan.popular ? "-2px" : "-1px",
                                borderRadius: "inherit",
                                padding: plan.popular ? "2px" : "1px",
                                background: "transparent",
                                WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                                WebkitMaskComposite: "xor",
                                maskComposite: "exclude",
                                pointerEvents: "none",
                                overflow: "hidden"
                            }}>
                                <motion.div
                                    animate={{ x: ["-100%", "200%"] }}
                                    transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                                    style={{
                                        position: "absolute",
                                        top: 0, bottom: 0, left: "-100%", right: "-100%",
                                        background: `linear-gradient(90deg, transparent, ${plan.theme.shimmerColor}, transparent)`,
                                        willChange: "transform"
                                    }}
                                />
                            </div>

                            {plan.popular && (
                                <div
                                    style={{
                                        position: "absolute",
                                        top: "-14px",
                                        left: "50%",
                                        transform: "translate3d(-50%, 0, 0)",
                                        background:
                                            "linear-gradient(to right, #60a5fa, #3b82f6)",
                                        color: "white",
                                        padding: "6px 16px",
                                        borderRadius: "var(--radius-full)",
                                        fontSize: "0.75rem",
                                        fontWeight: "700",
                                        letterSpacing: "0.05em",
                                        boxShadow:
                                            "0 4px 15px rgba(59, 130, 246, 0.4)",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    MOST POPULAR
                                </div>
                            )}

                            <h3
                                style={{
                                    fontSize: "1.25rem",
                                    fontWeight: "600",
                                    marginBottom: "0.5rem",
                                }}
                            >
                                {plan.name}
                            </h3>
                            <p
                                style={{
                                    fontSize: "0.875rem",
                                    color: "var(--text-secondary)",
                                    marginBottom: "1.5rem",
                                    minHeight: "2.5rem",
                                }}
                            >
                                {plan.description}
                            </p>

                            <div style={{ marginBottom: "1.5rem" }}>
                                <span
                                    style={{
                                        fontSize: "2.5rem",
                                        fontWeight: "700",
                                    }}
                                >
                                    ${displayPrice}
                                </span>
                                <span style={{ color: "var(--text-secondary)" }}>
                                    /mo
                                </span>
                                {isYearly && (
                                    <p
                                        style={{
                                            fontSize: "0.875rem",
                                            color: "#4ade80",
                                            marginTop: "4px",
                                        }}
                                    >
                                        Billed ${displayPrice * 12} yearly
                                    </p>
                                )}
                                {!isYearly && (
                                    <p
                                        style={{
                                            fontSize: "0.875rem",
                                            color: "transparent",
                                            marginTop: "4px",
                                            userSelect: "none",
                                        }}
                                    >
                                        ---
                                    </p>
                                )}
                            </div>

                            {isDashboard ? (
                                <button
                                    onClick={() => onPlanSelect?.(plan.planType, isYearly)}
                                    className={
                                        plan.popular
                                            ? "glow-button"
                                            : "secondary-button"
                                    }
                                    style={{
                                        width: "100%",
                                        textAlign: "center",
                                        display: "block",
                                        marginBottom: "2rem",
                                        background: plan.popular
                                            ? "var(--accent-blue)"
                                            : undefined,
                                        border: "none",
                                        cursor: "pointer",
                                    }}
                                >
                                    Upgrade
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        // Ensure we redirect to the correct auth flow
                                        window.location.href = "/sign-up";
                                    }}
                                    className={
                                        plan.popular
                                            ? "glow-button"
                                            : "secondary-button"
                                    }
                                    style={{
                                        width: "100%",
                                        textAlign: "center",
                                        display: "block",
                                        marginBottom: "2rem",
                                        background: plan.popular
                                            ? "var(--accent-blue)"
                                            : undefined,
                                        border: "none",
                                        cursor: "pointer"
                                    }}
                                >
                                    Get Started
                                </button>
                            )}

                            <ul
                                style={{
                                    listStyle: "none",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.75rem",
                                    marginTop: "auto",
                                }}
                            >
                                {plan.features.map((feature, i) => (
                                    <li
                                        key={i}
                                        style={{
                                            display: "flex",
                                            alignItems: "flex-start",
                                            gap: "0.75rem",
                                            fontSize: "0.875rem",
                                            color: "var(--text-secondary)",
                                        }}
                                    >
                                        <Check
                                            size={16}
                                            color="var(--accent-blue)"
                                            style={{
                                                flexShrink: 0,
                                                marginTop: "2px",
                                            }}
                                        />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    );
                })}
            </div>
        </section>
    );
}
