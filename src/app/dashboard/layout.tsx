"use client";

import { useState, useEffect, createContext, useContext, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
    MessageSquarePlus,
    History,
    BarChart3,
    CreditCard,
    Settings,
    Zap,
} from "lucide-react";
import { supabaseClient } from "@/lib/supabase-client";

// ─── CREDIT CONTEXT ───
// Shared across all dashboard pages for real-time credit display
interface CreditState {
    userId: string;
    plan: string;
    creditsRemaining: number;
    monthlyLimit: number;
    addonCredits: number;
    creditsUsed: number;
    billingInterval: string;
    status: string;
    paddleSubscriptionId: string | null;
    nextResetDate: string | null;
}

interface CreditContextValue {
    credits: CreditState | null;
    loading: boolean;
    refreshCredits: () => Promise<void>;
    updateCreditsLocally: (credits_remaining: number) => void;
}

const CreditContext = createContext<CreditContextValue>({
    credits: null,
    loading: true,
    refreshCredits: async () => { },
    updateCreditsLocally: () => { },
});

export function useCredits() {
    return useContext(CreditContext);
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const [credits, setCredits] = useState<CreditState | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshCredits = useCallback(async () => {
        try {
            const res = await fetch("/api/user", { cache: "no-store" });
            if (res.ok) {
                const data = await res.json();
                const monthlyLimit = data.monthlyLimit ?? 10;
                setCredits({
                    userId: data.userId ?? "",
                    plan: data.plan ?? "free",
                    creditsRemaining: data.creditsRemaining ?? monthlyLimit,
                    monthlyLimit: monthlyLimit,
                    addonCredits: data.addonCredits ?? 0,
                    creditsUsed: data.creditsUsed ?? 0,
                    billingInterval: data.billingInterval ?? "monthly",
                    status: data.status ?? "active",
                    paddleSubscriptionId: data.paddleSubscriptionId ?? null,
                    nextResetDate: data.nextResetDate ?? null,
                });
            }
        } catch (err) {
            console.error("Failed to fetch credits:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Instant local update (called by generate page after successful generation)
    const updateCreditsLocally = useCallback(
        (creditsRemaining: number) => {
            setCredits((prev) =>
                prev
                    ? { ...prev, creditsRemaining }
                    : prev
            );
        },
        []
    );

    useEffect(() => {
        refreshCredits();
    }, [refreshCredits]);

    // ─── REALTIME SYNC (Wallet) ───
    useEffect(() => {
        if (!credits?.userId) return;

        const channel = supabaseClient
            .channel('credit-sync')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'wallet',
                    filter: `user_id=eq.${credits.userId}`,
                },
                (payload) => {
                    const { credits_remaining, addon_credits } = payload.new;
                    setCredits((prev) =>
                        prev ? {
                            ...prev,
                            creditsRemaining: credits_remaining ?? prev.creditsRemaining,
                            addonCredits: addon_credits ?? prev.addonCredits,
                            creditsUsed: Math.max(0, (prev.monthlyLimit || 0) - (credits_remaining ?? 0))
                        } : prev
                    );
                }
            )
            .subscribe();

        return () => {
            supabaseClient.removeChannel(channel);
        };
    }, [credits?.userId]);

    // ─── REALTIME SYNC (Subscription) ───
    useEffect(() => {
        if (!credits?.userId) return;

        const subChannel = supabaseClient
            .channel('sub-sync')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'subscriptions_v2',
                    filter: `user_id=eq.${credits.userId}`,
                },
                (payload) => {
                    const { plan_type, status, billing_cycle } = payload.new;
                    setCredits((prev) =>
                        prev ? {
                            ...prev,
                            plan: plan_type ?? prev.plan,
                            status: status ?? prev.status,
                            billingInterval: billing_cycle ?? prev.billingInterval,
                        } : prev
                    );
                }
            )
            .subscribe();

        return () => {
            supabaseClient.removeChannel(subChannel);
        };
    }, [credits?.userId]);

    const navItems = [
        { name: "Generate", href: "/dashboard/generate", icon: MessageSquarePlus },
        { name: "History", href: "/dashboard/history", icon: History },
        { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
        { name: "Billing", href: "/dashboard/billing", icon: CreditCard },
        { name: "Settings", href: "/dashboard/settings", icon: Settings },
    ];

    // Usage calculations
    const usagePercent = credits
        ? Math.max(0, Math.round(
            (credits.creditsUsed / Math.max(credits.monthlyLimit, 1)) * 100
        ))
        : 0;

    const planLabel = credits
        ? ({ free: "Free", starter: "Starter", growth: "Growth", pro: "Pro" }[credits.plan] ?? credits.plan)
        : "Free";

    return (
        <CreditContext.Provider
            value={{ credits, loading, refreshCredits, updateCreditsLocally }}
        >
            <div
                style={{
                    display: "flex",
                    minHeight: "100vh",
                    background: "var(--bg-base)",
                }}
            >
                {/* Sidebar */}
                <aside
                    style={{
                        width: "260px",
                        borderRight: "1px solid var(--border-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        background: "var(--bg-surface)",
                    }}
                >
                    <div
                        style={{
                            padding: "var(--spacing-6)",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            borderBottom: "1px solid var(--border-subtle)",
                            transition: "all 0.2s ease",
                            cursor: "pointer"
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "scale(1.03)";
                            e.currentTarget.style.opacity = "0.9";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "scale(1)";
                            e.currentTarget.style.opacity = "1";
                        }}
                    >
                        <Image
                            src="/logo.png"
                            alt="AuricAI Logo"
                            width={40}
                            height={40}
                            priority
                            style={{ filter: "invert(1)" }}
                        />
                        <span style={{ fontSize: "1.25rem", fontWeight: "700", letterSpacing: "-0.02em", color: "white" }}>
                            AuricAI
                        </span>
                    </div>

                    <nav
                        style={{
                            flex: 1,
                            padding: "var(--spacing-4)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "var(--spacing-2)",
                        }}
                    >
                        {navItems.map((item) => {
                            const isActive = pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "var(--spacing-3)",
                                        padding:
                                            "var(--spacing-3) var(--spacing-4)",
                                        borderRadius: "var(--radius-md)",
                                        color: isActive
                                            ? "white"
                                            : "var(--text-secondary)",
                                        background: isActive
                                            ? "rgba(255, 255, 255, 0.05)"
                                            : "transparent",
                                        border: isActive
                                            ? "1px solid var(--border-subtle)"
                                            : "1px solid transparent",
                                        textDecoration: "none",
                                        transition:
                                            "all var(--transition-fast)",
                                        fontWeight: isActive ? "500" : "400",
                                    }}
                                >
                                    <item.icon
                                        size={20}
                                        color={
                                            isActive
                                                ? "var(--accent-blue)"
                                                : "var(--text-secondary)"
                                        }
                                    />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* ─── CREDIT USAGE BAR (Sidebar) ─── */}
                    <div
                        style={{
                            padding: "0 var(--spacing-4) var(--spacing-4)",
                        }}
                    >
                        <Link
                            href="/dashboard/billing"
                            style={{ textDecoration: "none", color: "inherit" }}
                        >
                            <div
                                style={{
                                    padding:
                                        "var(--spacing-3) var(--spacing-4)",
                                    borderRadius: "var(--radius-md)",
                                    background: "rgba(255, 255, 255, 0.03)",
                                    border: "1px solid var(--border-subtle)",
                                    cursor: "pointer",
                                    transition: "all var(--transition-fast)",
                                }}
                            >
                                {/* Plan badge + credits remaining */}
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginBottom: "var(--spacing-2)",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                        }}
                                    >
                                        <Zap
                                            size={14}
                                            color="var(--accent-blue)"
                                        />
                                        <span
                                            style={{
                                                fontSize: "0.75rem",
                                                fontWeight: "600",
                                                color: "var(--text-secondary)",
                                                textTransform: "uppercase",
                                                letterSpacing: "0.04em",
                                            }}
                                        >
                                            Credits
                                        </span>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: "0.75rem",
                                            fontWeight: "600",
                                            color:
                                                usagePercent >= 90
                                                    ? "#f87171"
                                                    : "white",
                                        }}
                                    >
                                        {loading
                                            ? "…"
                                            : `${credits?.creditsRemaining ?? 0} remaining`}
                                    </span>
                                </div>

                                {/* Progress bar */}
                                <div
                                    style={{
                                        height: "6px",
                                        background: "rgba(255, 255, 255, 0.08)",
                                        borderRadius: "var(--radius-full)",
                                        overflow: "hidden",
                                        marginBottom: "var(--spacing-1)",
                                    }}
                                >
                                    <div
                                        style={{
                                            height: "100%",
                                            width: `${Math.min(usagePercent, 100)}%`,
                                            borderRadius:
                                                "var(--radius-full)",
                                            background:
                                                usagePercent >= 90
                                                    ? "linear-gradient(90deg, #f87171, #ef4444)"
                                                    : usagePercent >= 70
                                                        ? "linear-gradient(90deg, #fbbf24, #f59e0b)"
                                                        : "linear-gradient(90deg, #60a5fa, #3b82f6)",
                                            transition:
                                                "width 0.4s ease-out",
                                        }}
                                    />
                                </div>

                                {/* Usage fraction */}
                                <div
                                    style={{
                                        fontSize: "0.6875rem",
                                        color: "var(--text-secondary)",
                                    }}
                                >
                                    {loading
                                        ? "Loading credits…"
                                        : `${credits?.creditsUsed ?? 0} / ${credits?.monthlyLimit ?? 0} used`}
                                </div>
                            </div>
                        </Link>
                    </div>

                    <div
                        style={{
                            padding: "var(--spacing-6)",
                            borderTop: "1px solid var(--border-subtle)",
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--spacing-3)",
                        }}
                    >
                        <UserButton />
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                            }}
                        >
                            <span
                                style={{
                                    fontSize: "0.875rem",
                                    fontWeight: "500",
                                }}
                            >
                                Account
                            </span>
                            <span
                                style={{
                                    fontSize: "0.75rem",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                Manage profile
                            </span>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main
                    style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        height: "100vh",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            flex: 1,
                            overflowY: "auto",
                            padding: "var(--spacing-8)",
                        }}
                    >
                        <div
                            style={{
                                maxWidth: "1000px",
                                margin: "0 auto",
                            }}
                        >
                            {children}
                        </div>
                    </div>
                </main>
            </div>
        </CreditContext.Provider>
    );
}
