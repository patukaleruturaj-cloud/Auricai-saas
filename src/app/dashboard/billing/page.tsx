"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
    CreditCard,
    Clock,
    AlertTriangle,
    Zap,
    Crown,
    Package,
    ArrowRight,
    CheckCircle,
    Sparkles,
    Wallet,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { plans, PLAN_LIMITS } from "@/lib/plans";
import { supabaseClient } from "@/lib/supabase-client";

// ─── TYPES ───

interface BillingState {
    plan: string;
    billingInterval: string;
    status: string;
    creditsRemaining: number;
    monthlyLimit: number;
    addonCredits: number;
    totalCredits: number;
    creditsUsed: number;
    nextResetDate: string | null;
}

// ─── PLAN CONFIG ───

const PLAN_LABELS: Record<string, string> = {
    free: "Free",
    starter: "Starter",
    basic: "Basic",
    growth: "Growth",
    pro: "Pro",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    active: { bg: "rgba(74, 222, 128, 0.15)", text: "#4ade80" },
    cancelled: { bg: "rgba(251, 191, 36, 0.15)", text: "#fbbf24" },
    past_due: { bg: "rgba(248, 113, 113, 0.15)", text: "#f87171" },
};

// ─── GLOW THEMES ───

const ADDON_THEMES = [
    { // 200 credits — blue
        glow: "rgba(59, 130, 246, 0.25)",
        glowHover: "rgba(59, 130, 246, 0.5)",
        iconColor: "#60a5fa",
        gradient: "linear-gradient(145deg, rgba(59, 130, 246, 0.06), transparent)",
        border: "rgba(59, 130, 246, 0.15)",
        borderHover: "rgba(59, 130, 246, 0.4)",
    },
    { // 600 credits — purple
        glow: "rgba(168, 85, 247, 0.25)",
        glowHover: "rgba(168, 85, 247, 0.5)",
        iconColor: "#a855f7",
        gradient: "linear-gradient(145deg, rgba(168, 85, 247, 0.06), transparent)",
        border: "rgba(168, 85, 247, 0.15)",
        borderHover: "rgba(168, 85, 247, 0.4)",
    },
    { // 1500 credits — gold
        glow: "rgba(250, 204, 21, 0.25)",
        glowHover: "rgba(250, 204, 21, 0.5)",
        iconColor: "#facc15",
        gradient: "linear-gradient(145deg, rgba(250, 204, 21, 0.06), transparent)",
        border: "rgba(250, 204, 21, 0.15)",
        borderHover: "rgba(250, 204, 21, 0.4)",
    },
];

const PLAN_THEMES: Record<string, { glow: string; glowHover: string; border: string; accent: string }> = {
    starter: {
        glow: "rgba(251, 146, 60, 0.2)",
        glowHover: "rgba(251, 146, 60, 0.45)",
        border: "rgba(251, 146, 60, 0.15)",
        accent: "#fb923c",
    },
    basic: {
        glow: "rgba(59, 130, 246, 0.2)",
        glowHover: "rgba(59, 130, 246, 0.45)",
        border: "rgba(59, 130, 246, 0.15)",
        accent: "#60a5fa",
    },
    growth: {
        glow: "rgba(168, 85, 247, 0.25)",
        glowHover: "rgba(168, 85, 247, 0.55)",
        border: "rgba(168, 85, 247, 0.2)",
        accent: "#a855f7",
    },
    pro: {
        glow: "rgba(250, 204, 21, 0.2)",
        glowHover: "rgba(250, 204, 21, 0.45)",
        border: "rgba(250, 204, 21, 0.15)",
        accent: "#facc15",
    },
};

const UPGRADE_PLANS = [
    {
        slug: "starter",
        name: "Starter",
        description: "Perfect for testing outbound strategies.",
        priceMonthly: plans.starter.price_monthly,
        priceYearly: plans.starter.price_yearly / 12,
        msgs: plans.starter.credits,
        features: [
            "150 messages / month",
            "3 strategic message variations",
            "Core Context Intelligence",
            "Standard processing",
            "Email support",
        ],
        buttonLabel: "Get Started",
    },
    {
        slug: "basic",
        name: "Basic",
        description: "For individuals & early testers.",
        priceMonthly: plans.basic.price_monthly,
        priceYearly: plans.basic.price_yearly / 12,
        msgs: plans.basic.credits,
        features: [
            "400 messages / month",
            "3 strategic message variations",
            "Core Context Intelligence",
            "Standard processing",
            "Email support",
        ],
        buttonLabel: "Get Started",
    },
    {
        slug: "growth",
        name: "Growth",
        description: "For 1–2 SDR teams scaling outreach.",
        priceMonthly: plans.growth.price_monthly,
        priceYearly: plans.growth.price_yearly / 12,
        msgs: plans.growth.credits,
        features: [
            "1,200 messages / month",
            "3 strategic message variations",
            "Advanced Context Depth",
            "Reply Rate Optimization",
            "Smart Prospect Memory",
            "Priority processing",
        ],
        popular: true,
        buttonLabel: "Get Started",
    },
    {
        slug: "pro",
        name: "Pro",
        description: "For elite sales teams & organizations.",
        priceMonthly: plans.pro.price_monthly,
        priceYearly: plans.pro.price_yearly / 12,
        msgs: plans.pro.credits,
        features: [
            "3,000 messages / month",
            "3 strategic message variations",
            "Premium Context Intelligence",
            "Advanced Signal-Based Personalization",
            "Highest priority processing",
        ],
        buttonLabel: "Get Started",
    },
];

const ADDON_PACKS = [
    {
        credits: 200,
        price: 12,
        priceId: "pri_01kk7hem70v9mne26n9xj4047p",
    },
    {
        credits: 600,
        price: 29,
        priceId: "pri_01kk7htz1mhmet73e0jpvfsfdg",
    },
    {
        credits: 1000,
        price: 39,
        priceId: "pri_01kk7r41j1esgf3gk7k19rkkh2",
    },
];

// ─── ANIMATION VARIANTS ───

const fadeInUp = {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
};

const staggerContainer = {
    animate: { transition: { staggerChildren: 0.08 } },
};

// ─── COMPONENT ───

export default function BillingPage() {
    const { user } = useUser();
    const [billing, setBilling] = useState<BillingState | null>(null);
    const [loading, setLoading] = useState(true);
    const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
    const [isYearly, setIsYearly] = useState(false);
    const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);
    const [hoveredAddon, setHoveredAddon] = useState<number | null>(null);

    const fetchBilling = useCallback(async () => {
        try {
            const res = await fetch("/api/user", { cache: "no-store" });
            if (res.ok) {
                const data = await res.json();
                setBilling({
                    plan: data.plan ?? "free",
                    billingInterval: data.billingInterval ?? "monthly",
                    status: data.status ?? "active",
                    creditsRemaining: data.creditsRemaining ?? PLAN_LIMITS.free,
                    monthlyLimit: data.monthlyLimit ?? PLAN_LIMITS.free,
                    addonCredits: data.addonCredits ?? 0,
                    totalCredits: data.totalCredits ?? (data.creditsRemaining + data.addonCredits),
                    creditsUsed: data.creditsUsed ?? 0,
                    nextResetDate: data.nextResetDate ?? null,
                });
            }
        } catch (err) {
            console.error("Failed to fetch billing info:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBilling();

        // ─── REALTIME WALLET SUBSCRIPTION ───
        if (!user) return;

        console.log("[Realtime] Subscribing to wallet updates for user:", user.id);
        const channel = supabaseClient
            .channel(`wallet_updates_${user.id}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "wallet",
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    console.log("[Realtime] Wallet update detected, refreshing data...", payload);
                    fetchBilling();
                }
            )
            .subscribe();

        return () => {
            console.log("[Realtime] Unsubscribing from wallet updates");
            supabaseClient.removeChannel(channel);
        };
    }, [fetchBilling, user]);

    const handleCheckout = async (planId: string) => {
        setCheckoutLoading(planId);
        try {
            const res = await fetch("/api/paddle/create-checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ planId })
            });
            const data = await res.json();

            if (!res.ok) {
                console.error("Checkout API Error:", data);

                const message =
                    data?.error?.detail ||
                    data?.error?.message ||
                    data?.error ||
                    data?.message ||
                    JSON.stringify(data);

                alert(message);
                throw new Error(message);
            }

            if (data.transaction_id && (window as any).Paddle) {
                console.log("[Checkout] Opening Paddle Overlay for transaction:", data.transaction_id);
                (window as any).Paddle.Checkout.open({
                    transactionId: data.transaction_id,
                    settings: {
                        displayMode: 'overlay',
                        theme: 'dark'
                    }
                });
                return;
            }

            if (data.checkout_url) {
                console.log("[Checkout] Redirecting to Paddle:", data.checkout_url);
                window.location.href = data.checkout_url;
                return;
            }

            throw new Error("Checkout URL not returned");
        } catch (err) {
            console.error("Checkout failed:", err);
            alert(err instanceof Error ? err.message : "Checkout failed");
        } finally {
            setCheckoutLoading(null);
        }
    };

    // Derived values
    const planLabel = billing ? PLAN_LABELS[billing.plan] ?? billing.plan : "Free";
    const statusColor = billing ? STATUS_COLORS[billing.status] ?? STATUS_COLORS.active : STATUS_COLORS.active;
    const usedCredits = billing ? billing.creditsUsed : 0;
    const usagePercent = billing ? Math.round((usedCredits / Math.max(billing.monthlyLimit, 1)) * 100) : 0;
    const resetDate = billing?.nextResetDate
        ? new Date(billing.nextResetDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : "—";

    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px", color: "var(--text-secondary)" }}>
                <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                >
                    Loading billing information...
                </motion.div>
            </div>
        );
    }

    return (
        <motion.div
            initial="initial"
            animate="animate"
            variants={staggerContainer}
            style={{ display: "flex", flexDirection: "column", gap: "2rem" }}
        >
            {/* ══════════════════════════════════════════
                SECTION 0 — TOTAL CREDITS SUMMARY
               ══════════════════════════════════════════ */}
            {billing && (
                <motion.div
                    variants={fadeInUp}
                    transition={{ duration: 0.5 }}
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                        gap: "1rem",
                    }}
                >
                    {/* Main Total Card */}
                    <div className="glass-panel" style={{
                        padding: "1.5rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "1.25rem",
                        background: "linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(79, 70, 229, 0.05) 100%)",
                        border: "1px solid rgba(168, 85, 247, 0.3)",
                        boxShadow: "0 8px 32px rgba(168, 85, 247, 0.15)",
                        position: "relative",
                        overflow: "hidden",
                    }}>
                        <div style={{
                            position: "absolute",
                            top: "-20px",
                            right: "-20px",
                            width: "100px",
                            height: "100px",
                            background: "radial-gradient(circle, rgba(168, 85, 247, 0.2) 0%, transparent 70%)",
                            pointerEvents: "none",
                        }} />

                        <div style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "12px",
                            background: "rgba(168, 85, 247, 0.2)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#a855f7",
                        }}>
                            <Wallet size={24} />
                        </div>
                        <div>
                            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
                                Total Available Credits
                            </p>
                            <h2 style={{ fontSize: "2rem", fontWeight: "800", background: "linear-gradient(to right, #fff, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                                {billing.totalCredits.toLocaleString()}
                            </h2>
                        </div>
                    </div>

                    {/* Breakdown Card */}
                    <div className="glass-panel" style={{
                        padding: "1.25rem 1.5rem",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        gap: "0.5rem",
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Monthly Credits:</span>
                            <span style={{ fontWeight: "600" }}>{billing.creditsRemaining.toLocaleString()}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Extra Credits:</span>
                            <span style={{ fontWeight: "600", color: "#a855f7" }}>{billing.addonCredits.toLocaleString()}</span>
                        </div>
                        <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
                        <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                            * Extra credits never expire
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Page Header */}
            <motion.div variants={fadeInUp} transition={{ duration: 0.5 }}>
                <h1 style={{ fontSize: "2rem", fontWeight: "700", marginBottom: "0.5rem" }}>
                    Billing & Subscription
                </h1>
                <p style={{ color: "var(--text-secondary)" }}>
                    Manage your plan, credits, and payment methods.
                </p>
            </motion.div>

            {/* ══════════════════════════════════════════
                SECTION 1 — CURRENT PLAN
               ══════════════════════════════════════════ */}
            <motion.div
                variants={fadeInUp}
                transition={{ duration: 0.5 }}
                className="glass-panel"
                style={{
                    padding: "1.5rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "1rem",
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                {/* Subtle radial glow behind section */}
                <div style={{
                    position: "absolute",
                    top: "-40px",
                    left: "-40px",
                    width: "200px",
                    height: "200px",
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)",
                    pointerEvents: "none",
                }} />

                <div style={{ position: "relative" }}>
                    <p style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: "0.5rem",
                    }}>
                        Current Plan
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <Crown size={20} style={{ color: "#a78bfa" }} />
                        <h2 style={{ fontSize: "1.5rem", fontWeight: "600" }}>
                            {planLabel}
                            {billing?.billingInterval === "yearly" ? " (Yearly)" : billing?.plan !== "free" ? " (Monthly)" : ""}
                        </h2>
                        {billing && (
                            <motion.span
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                style={{
                                    background: statusColor.bg,
                                    color: statusColor.text,
                                    padding: "4px 12px",
                                    borderRadius: "100px",
                                    fontSize: "0.7rem",
                                    fontWeight: "600",
                                    textTransform: "capitalize",
                                }}
                            >
                                {billing.status}
                            </motion.span>
                        )}
                    </div>
                    <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                        {billing?.monthlyLimit ?? PLAN_LIMITS.free} messages per month
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        <Clock size={14} />
                        Next reset: {resetDate}
                    </div>
                </div>
                <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    className="secondary-button"
                    style={{ display: "flex", alignItems: "center", gap: "8px" }}
                    onClick={() => alert("Manage your subscription from Paddle.")}
                >
                    <CreditCard size={18} /> Manage Subscription
                </motion.button>
            </motion.div>

            {/* ══════════════════════════════════════════
                SECTION 2 — CREDIT USAGE
               ══════════════════════════════════════════ */}
            {billing && (
                <motion.div
                    variants={fadeInUp}
                    transition={{ duration: 0.5 }}
                    className="glass-panel"
                    style={{ padding: "1.5rem" }}
                >
                    <h3 style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "1rem" }}>
                        Credit Usage
                    </h3>

                    {/* Animated Progress bar */}
                    <div style={{
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: "999px",
                        height: "12px",
                        overflow: "hidden",
                        marginBottom: "0.75rem",
                        position: "relative",
                    }}>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(usagePercent, 100)}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            style={{
                                height: "100%",
                                borderRadius: "999px",
                                background:
                                    usagePercent >= 90
                                        ? "linear-gradient(to right, #f87171, #ef4444)"
                                        : usagePercent >= 70
                                            ? "linear-gradient(to right, #fbbf24, #f59e0b)"
                                            : "linear-gradient(to right, #60a5fa, #3b82f6)",
                                position: "relative",
                            }}
                        >
                            {/* Shimmer effect on bar */}
                            <motion.div
                                animate={{ x: ["-100%", "200%"] }}
                                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "40%",
                                    height: "100%",
                                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
                                    borderRadius: "999px",
                                }}
                            />
                        </motion.div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                        <span style={{ color: "var(--text-secondary)" }}>
                            {usedCredits} / {billing.monthlyLimit} used
                        </span>
                        <span style={{ fontWeight: "600" }}>
                            {billing.creditsRemaining} remaining
                        </span>
                    </div>

                    {/* Addon credits display */}
                    <AnimatePresence>
                        {billing.addonCredits > 0 && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{
                                    marginTop: "0.75rem",
                                    padding: "0.625rem 1rem",
                                    background: "rgba(168, 85, 247, 0.08)",
                                    border: "1px solid rgba(168, 85, 247, 0.2)",
                                    borderRadius: "8px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    fontSize: "0.875rem",
                                }}
                            >
                                <Sparkles size={16} style={{ color: "#a855f7" }} />
                                <span style={{ color: "#c084fc" }}>
                                    Extra Credits: <strong>{billing.addonCredits}</strong>
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Warning */}
                    <AnimatePresence>
                        {usagePercent >= 90 && billing.creditsRemaining > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                style={{
                                    marginTop: "0.75rem",
                                    padding: "0.625rem 1rem",
                                    background: "rgba(251, 191, 36, 0.08)",
                                    border: "1px solid rgba(251, 191, 36, 0.2)",
                                    borderRadius: "8px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    fontSize: "0.875rem",
                                    color: "#fbbf24",
                                }}
                            >
                                <AlertTriangle size={16} />
                                You&apos;ve used {usagePercent}% of your monthly credits. Consider upgrading or buying extra credits.
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}

            {/* ══════════════════════════════════════════
                SECTION 3 — BUY EXTRA CREDITS
               ══════════════════════════════════════════ */}
            {billing && billing.plan !== "free" && (
                <motion.div variants={fadeInUp} transition={{ duration: 0.5 }}>
                    <h3 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "0.5rem" }}>
                        <Package size={20} style={{ display: "inline", marginRight: "0.5rem", verticalAlign: "middle" }} />
                        Buy Extra Credits
                    </h3>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
                        Extra credits never expire and are used after your monthly credits run out.
                    </p>

                    {/* Active Subscription Requirement Warning */}
                    <AnimatePresence>
                        {billing.status !== "active" && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{
                                    marginBottom: "1.5rem",
                                    padding: "1rem",
                                    background: "rgba(248, 113, 113, 0.1)",
                                    border: "1px solid rgba(248, 113, 113, 0.2)",
                                    borderRadius: "12px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.75rem",
                                    color: "#f87171",
                                    fontSize: "0.875rem",
                                }}
                            >
                                <AlertTriangle size={18} />
                                <span>
                                    Extra credits can only be purchased with an active subscription.
                                    Renew your plan to buy additional credits.
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                        {ADDON_PACKS.map((pack, i) => {
                            const planId = `addon_${pack.credits}`;
                            const theme = ADDON_THEMES[i];
                            const isHovered = hoveredAddon === i;

                            return (
                                <motion.div
                                    key={pack.credits}
                                    variants={fadeInUp}
                                    whileHover={{ scale: 1.04, y: -4 }}
                                    whileTap={{ scale: 0.97 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                    onHoverStart={() => setHoveredAddon(i)}
                                    onHoverEnd={() => setHoveredAddon(null)}
                                    style={{
                                        padding: "1.5rem",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: "0.75rem",
                                        textAlign: "center",
                                        borderRadius: "16px",
                                        border: `1px solid ${isHovered ? theme.borderHover : theme.border}`,
                                        background: theme.gradient,
                                        boxShadow: isHovered
                                            ? `0 8px 32px ${theme.glowHover}, 0 0 0 1px ${theme.borderHover}`
                                            : `0 4px 16px ${theme.glow}`,
                                        cursor: "pointer",
                                        transition: "border-color 0.3s, box-shadow 0.3s",
                                        position: "relative",
                                        overflow: "hidden",
                                    }}
                                >
                                    {/* Background glow orb */}
                                    <div style={{
                                        position: "absolute",
                                        top: "-30px",
                                        right: "-30px",
                                        width: "100px",
                                        height: "100px",
                                        borderRadius: "50%",
                                        background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)`,
                                        opacity: isHovered ? 0.6 : 0.2,
                                        transition: "opacity 0.3s",
                                        pointerEvents: "none",
                                    }} />

                                    <motion.div
                                        animate={isHovered ? { rotate: [0, -10, 10, 0] } : {}}
                                        transition={{ duration: 0.4 }}
                                    >
                                        <Zap size={28} style={{ color: theme.iconColor }} />
                                    </motion.div>
                                    <div>
                                        <p style={{ fontSize: "1.5rem", fontWeight: "700" }}>{pack.credits}</p>
                                        <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>credits</p>
                                    </div>
                                    <p style={{ fontSize: "1.25rem", fontWeight: "600" }}>
                                        ${pack.price}
                                    </p>
                                    <motion.button
                                        whileHover={{ scale: 1.04, y: -2 }}
                                        whileTap={{ scale: 0.96 }}
                                        className={`w-full mt-4 py-2.5 rounded-full text-sm font-semibold text-white bg-gradient-to-r shadow-lg transition duration-300 flex items-center justify-center gap-2 ${i === 0 ? "from-blue-600 to-indigo-600 shadow-blue-500/30 hover:shadow-blue-500/60 hover:from-blue-500 hover:to-indigo-500" :
                                            i === 1 ? "from-indigo-600 to-purple-600 shadow-purple-500/30 hover:shadow-purple-500/60 hover:from-indigo-500 hover:to-purple-500" :
                                                "from-yellow-500 to-orange-500 shadow-yellow-400/30 hover:shadow-yellow-400/60 hover:from-yellow-400 hover:to-orange-400"
                                            }`}
                                        style={{
                                            opacity: (checkoutLoading === planId || billing.status !== "active") ? 0.6 : 1,
                                            cursor: billing.status !== "active" ? "not-allowed" : "pointer",
                                        }}
                                        disabled={!!checkoutLoading || billing.status !== "active"}
                                        onClick={() => handleCheckout(planId)}
                                    >
                                        {checkoutLoading === planId ? (
                                            <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                                                Processing...
                                            </motion.span>
                                        ) : (
                                            <><Zap size={16} fill="currentColor" /> Buy Now</>
                                        )}
                                    </motion.button>
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.div>
            )}

            {/* ══════════════════════════════════════════
                SECTION 4 — UPGRADE PLAN
               ══════════════════════════════════════════ */}
            <motion.div variants={fadeInUp} transition={{ duration: 0.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                    <h3 style={{ fontSize: "1.25rem", fontWeight: "600" }}>
                        {billing?.plan === "free" ? "Upgrade Your Plan" : "Change Plan"}
                    </h3>

                    {/* Monthly / Yearly toggle */}
                    <div style={{
                        display: "flex",
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: "10px",
                        padding: "4px",
                        gap: "4px",
                    }}>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setIsYearly(false)}
                            style={{
                                padding: "6px 16px",
                                borderRadius: "8px",
                                fontSize: "0.8rem",
                                fontWeight: "600",
                                border: "none",
                                cursor: "pointer",
                                background: !isYearly ? "rgba(96, 165, 250, 0.2)" : "transparent",
                                color: !isYearly ? "#60a5fa" : "var(--text-secondary)",
                                transition: "all 0.25s",
                            }}
                        >
                            Monthly
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setIsYearly(true)}
                            style={{
                                padding: "6px 16px",
                                borderRadius: "8px",
                                fontSize: "0.8rem",
                                fontWeight: "600",
                                border: "none",
                                cursor: "pointer",
                                background: isYearly ? "rgba(74, 222, 128, 0.2)" : "transparent",
                                color: isYearly ? "#4ade80" : "var(--text-secondary)",
                                transition: "all 0.25s",
                            }}
                        >
                            Yearly
                            <span style={{ marginLeft: "4px", fontSize: "0.7rem", opacity: 0.8 }}>Save 20%</span>
                        </motion.button>
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
                    {UPGRADE_PLANS.map((plan, i) => {
                        const isCurrent = billing?.plan === plan.slug;
                        const price = isYearly ? plan.priceYearly : plan.priceMonthly;
                        const planId = `${plan.slug}_${isYearly ? "yearly" : "monthly"}`;
                        const theme = PLAN_THEMES[plan.slug];
                        const isHovered = hoveredPlan === plan.slug;

                        return (
                            <motion.div
                                key={plan.slug}
                                variants={fadeInUp}
                                whileHover={{ y: -6 }}
                                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                                onHoverStart={() => setHoveredPlan(plan.slug)}
                                onHoverEnd={() => setHoveredPlan(null)}
                                style={{
                                    padding: "1.75rem",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.75rem",
                                    position: "relative",
                                    borderRadius: "16px",
                                    border: `1px solid ${isHovered ? theme.border : "rgba(255,255,255,0.06)"}`,
                                    boxShadow: isHovered
                                        ? `0 12px 40px ${theme.glowHover}, 0 0 0 1px ${theme.border}`
                                        : `0 2px 12px ${theme.glow}`,
                                    background: "rgba(255,255,255,0.02)",
                                    overflow: "hidden",
                                    transition: "border-color 0.3s, box-shadow 0.4s",
                                }}
                            >
                                {/* Background glow */}
                                <div style={{
                                    position: "absolute",
                                    top: "-50px",
                                    right: "-50px",
                                    width: "160px",
                                    height: "160px",
                                    borderRadius: "50%",
                                    background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)`,
                                    opacity: isHovered ? 0.5 : 0.15,
                                    transition: "opacity 0.4s",
                                    pointerEvents: "none",
                                }} />

                                {/* Most Popular badge with pulse */}
                                {plan.popular && (
                                    <div style={{ position: "absolute", top: "-1px", right: "16px" }}>
                                        <motion.div
                                            animate={{
                                                boxShadow: [
                                                    `0 0 8px ${theme.accent}40`,
                                                    `0 0 20px ${theme.accent}60`,
                                                    `0 0 8px ${theme.accent}40`,
                                                ],
                                            }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                            style={{
                                                background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent}cc)`,
                                                padding: "4px 14px",
                                                borderRadius: "0 0 10px 10px",
                                                fontSize: "0.65rem",
                                                fontWeight: "700",
                                                color: "#000",
                                                textTransform: "uppercase",
                                                letterSpacing: "0.06em",
                                            }}
                                        >
                                            Most Popular
                                        </motion.div>
                                    </div>
                                )}

                                <h4 style={{ fontSize: "1.25rem", fontWeight: "600", position: "relative" }}>{plan.name}</h4>

                                {plan.description && (
                                    <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", margin: "-0.25rem 0 0.25rem" }}>
                                        {plan.description}
                                    </p>
                                )}

                                <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                                    <AnimatePresence mode="wait">
                                        <motion.span
                                            key={price}
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            transition={{ duration: 0.2 }}
                                            style={{ fontSize: "2.25rem", fontWeight: "700" }}
                                        >
                                            ${price}
                                        </motion.span>
                                    </AnimatePresence>
                                    <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>/mo</span>
                                </div>



                                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                    {plan.features.map((f) => (
                                        <li key={f} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                                            <CheckCircle size={14} style={{ color: "#4ade80", flexShrink: 0 }} />
                                            {f}
                                        </li>
                                    ))}
                                </ul>

                                <motion.button
                                    whileHover={isCurrent ? {} : { scale: 1.04 }}
                                    whileTap={isCurrent ? {} : { scale: 0.96 }}
                                    style={{
                                        marginTop: "auto",
                                        width: "100%",
                                        padding: "0.85rem 1rem",
                                        fontSize: "0.9rem",
                                        fontWeight: "600",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: "0.5rem",
                                        borderRadius: "12px",
                                        border: isCurrent ? "1px solid rgba(255,255,255,0.1)" : "none",
                                        color: isCurrent ? "var(--text-secondary)" : "#fff",
                                        cursor: isCurrent ? "default" : "pointer",
                                        opacity: isCurrent || checkoutLoading === planId ? 0.5 : 1,
                                        background: isCurrent
                                            ? "transparent"
                                            : "linear-gradient(135deg, #7c3aed, #4f46e5)",
                                        boxShadow: isCurrent
                                            ? "none"
                                            : plan.popular
                                                ? "0 6px 24px rgba(139, 92, 246, 0.4)"
                                                : "0 4px 16px rgba(139, 92, 246, 0.3)",
                                        transition: "box-shadow 0.3s, background 0.3s",
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isCurrent) {
                                            e.currentTarget.style.background = "linear-gradient(135deg, #8b5cf6, #6366f1)";
                                            e.currentTarget.style.boxShadow = plan.popular
                                                ? "0 8px 32px rgba(139, 92, 246, 0.7)"
                                                : "0 8px 28px rgba(139, 92, 246, 0.6)";
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isCurrent) {
                                            e.currentTarget.style.background = "linear-gradient(135deg, #7c3aed, #4f46e5)";
                                            e.currentTarget.style.boxShadow = plan.popular
                                                ? "0 6px 24px rgba(139, 92, 246, 0.4)"
                                                : "0 4px 16px rgba(139, 92, 246, 0.3)";
                                        }
                                    }}
                                    disabled={isCurrent || !!checkoutLoading}
                                    onClick={() => handleCheckout(planId)}
                                >
                                    {isCurrent ? "Current Plan" : checkoutLoading === planId ? (
                                        <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                                            Processing...
                                        </motion.span>
                                    ) : (
                                        <>{plan.buttonLabel} <ArrowRight size={16} /></>
                                    )}
                                </motion.button>
                            </motion.div>
                        );
                    })}
                </div>
            </motion.div>
        </motion.div>
    );
}
