"use client";

import { useState, useEffect } from "react";
import { Sparkles, Copy, RefreshCw, AlertCircle, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { useCredits } from "../layout";

export default function GeneratePage() {
    const [bio, setBio] = useState("");
    const [company, setCompany] = useState("");
    const [offer, setOffer] = useState("");
    const [tone, setTone] = useState("Professional");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{
        dms: string[];
        followUp: string;
        subjectLine: string;
        credits?: { allowed: boolean; credits_remaining: number };
    } | null>(null);
    const [error, setError] = useState("");

    // Real-time credit state from sidebar context
    const { credits, refreshCredits, updateCreditsLocally } = useCredits();

    const tones = ["Friendly", "Direct", "Bold", "Professional"];

    // Auto-fill offer from user's saved default on page load
    useEffect(() => {
        const loadDefaultOffer = async () => {
            try {
                const res = await fetch("/api/profile");
                if (res.ok) {
                    const data = await res.json();
                    if (data.default_offer) {
                        setOffer(data.default_offer);
                    }
                }
            } catch {
                // silently fail — user can still type manually
            }
        };
        loadDefaultOffer();
    }, []);

    const handleGenerate = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bio, company, offer, tone }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to generate");
            setResult(data);

            // ─── INSTANT CREDIT UPDATE ───
            if (data.credits && data.credits.credits_remaining !== undefined) {
                updateCreditsLocally(
                    data.credits.credits_remaining
                );
            } else {
                // Fallback: refetch from server
                refreshCredits();
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Usage calculations for the inline bar
    const usagePercent = credits
        ? Math.max(0, Math.round(
            (credits.creditsUsed / Math.max(credits.monthlyLimit, 1)) * 100
        ))
        : 0;

    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--spacing-8)",
                alignItems: "start",
            }}
        >
            {/* Input Form */}
            <div
                className="glass-panel animate-fade-in"
                style={{
                    padding: "var(--spacing-6)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--spacing-6)",
                }}
            >
                <div>
                    <h2
                        style={{
                            fontSize: "1.5rem",
                            fontWeight: "600",
                            marginBottom: "var(--spacing-1)",
                        }}
                    >
                        Generate Openers
                    </h2>
                    <p
                        style={{
                            color: "var(--text-secondary)",
                            fontSize: "0.875rem",
                        }}
                    >
                        Turn target profiles into hyper-personalized messages.
                    </p>
                </div>

                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--spacing-4)",
                    }}
                >
                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: "0.875rem",
                                fontWeight: "500",
                                marginBottom: "var(--spacing-2)",
                            }}
                        >
                            Prospect Bio / LinkedIn About
                        </label>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            className="input-base"
                            rows={4}
                            placeholder="e.g. 10+ years in B2B SaaS sales. Passionate about scaling GTM teams..."
                        />
                    </div>

                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: "0.875rem",
                                fontWeight: "500",
                                marginBottom: "var(--spacing-2)",
                            }}
                        >
                            Company Context
                        </label>
                        <input
                            type="text"
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            className="input-base"
                            placeholder="e.g. Acme Corp recently raised Series B"
                        />
                    </div>

                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: "0.875rem",
                                fontWeight: "500",
                                marginBottom: "var(--spacing-2)",
                            }}
                        >
                            Your Offer / Value Prop
                        </label>
                        <textarea
                            value={offer}
                            onChange={(e) => setOffer(e.target.value)}
                            className="input-base"
                            rows={3}
                            placeholder="e.g. We help sales teams automate outbound workflows."
                        />
                        <p style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                            marginTop: "var(--spacing-1)",
                        }}>
                            ✏️ Editing here only affects this generation.{" "}
                            <a href="/dashboard/settings" style={{ color: "var(--accent-blue)", textDecoration: "none" }}>
                                Update your default in Settings →
                            </a>
                        </p>
                    </div>

                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: "0.875rem",
                                fontWeight: "500",
                                marginBottom: "var(--spacing-2)",
                            }}
                        >
                            Tone
                        </label>
                        <div
                            style={{
                                display: "flex",
                                gap: "var(--spacing-2)",
                                flexWrap: "wrap",
                            }}
                        >
                            {tones.map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTone(t)}
                                    style={{
                                        padding: "6px 16px",
                                        borderRadius: "var(--radius-full)",
                                        fontSize: "0.875rem",
                                        fontWeight: "500",
                                        cursor: "pointer",
                                        border:
                                            tone === t
                                                ? "1px solid var(--accent-blue)"
                                                : "1px solid var(--border-subtle)",
                                        background:
                                            tone === t
                                                ? "rgba(59, 130, 246, 0.2)"
                                                : "transparent",
                                        color:
                                            tone === t
                                                ? "white"
                                                : "var(--text-secondary)",
                                        transition:
                                            "all var(--transition-fast)",
                                    }}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleGenerate}
                    disabled={loading || !bio || !offer}
                    className="glow-button"
                    style={{
                        width: "100%",
                        opacity: loading || !bio || !offer ? 0.7 : 1,
                        marginTop: "var(--spacing-2)",
                    }}
                >
                    {loading ? (
                        <span
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                            }}
                        >
                            <RefreshCw size={18} className="spin" /> Generating...
                        </span>
                    ) : (
                        <span
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                            }}
                        >
                            <Sparkles size={18} /> Generate Options
                        </span>
                    )}
                </button>

                {error && (
                    <div
                        style={{
                            padding: "12px",
                            background: "rgba(239, 68, 68, 0.1)",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            borderRadius: "var(--radius-md)",
                            color: "#fca5a5",
                            fontSize: "0.875rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        <AlertCircle size={16} /> {error}
                    </div>
                )}
            </div>

            {/* Output Area */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--spacing-6)",
                }}
            >
                {/* ─── INLINE CREDIT USAGE BAR ─── */}
                {credits && (
                    <div
                        className="glass-panel"
                        style={{
                            padding: "var(--spacing-4) var(--spacing-6)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "var(--spacing-2)",
                            }}
                        >
                            <span
                                style={{
                                    fontSize: "0.875rem",
                                    fontWeight: "500",
                                    color: "var(--text-secondary)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                }}
                            >
                                <Zap size={14} color="var(--accent-blue)" />
                                Credits
                            </span>
                            <span
                                style={{
                                    fontSize: "0.875rem",
                                    fontWeight: "600",
                                    color:
                                        credits.creditsRemaining === 0
                                            ? "#f87171"
                                            : "white",
                                }}
                            >
                                {credits.creditsRemaining} remaining
                            </span>
                        </div>
                        <div
                            style={{
                                fontSize: "0.75rem",
                                color: "var(--text-secondary)",
                                marginTop: "4px",
                                marginBottom: "8px",
                            }}
                        >
                            {credits.creditsUsed} / {credits.monthlyLimit} used
                        </div>
                        <div
                            style={{
                                height: "6px",
                                background: "rgba(255, 255, 255, 0.1)",
                                borderRadius: "var(--radius-full)",
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    height: "100%",
                                    width: `${Math.min(100, usagePercent)}%`,
                                    background:
                                        usagePercent >= 90
                                            ? "linear-gradient(90deg, #f87171, #ef4444)"
                                            : usagePercent >= 70
                                                ? "linear-gradient(90deg, #fbbf24, #f59e0b)"
                                                : "linear-gradient(90deg, #60a5fa, #3b82f6)",
                                    borderRadius: "var(--radius-full)",
                                    transition: "width 0.4s ease-out",
                                }}
                            />
                        </div>
                        {credits.creditsRemaining === 0 && (
                            <p
                                style={{
                                    fontSize: "0.75rem",
                                    color: "#f87171",
                                    marginTop: "var(--spacing-2)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                }}
                            >
                                <AlertCircle size={12} />
                                Monthly limit reached. Upgrade your plan to continue.
                            </p>
                        )}
                        {usagePercent >= 80 &&
                            usagePercent < 100 &&
                            credits.creditsRemaining > 0 && (
                                <p
                                    style={{
                                        fontSize: "0.75rem",
                                        color: "#fbbf24",
                                        marginTop: "var(--spacing-2)",
                                    }}
                                >
                                    ⚠️ You&apos;ve used {usagePercent}% of your
                                    monthly credits.
                                </p>
                            )}
                    </div>
                )}

                {!result ? (
                    <div
                        className="glass-panel"
                        style={{
                            height: "400px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--text-secondary)",
                            borderStyle: "dashed",
                            opacity: 0.6,
                        }}
                    >
                        <Sparkles
                            size={32}
                            style={{ marginBottom: "var(--spacing-4)" }}
                            color="var(--border-subtle)"
                        />
                        <p>Your AI-crafted options will appear here.</p>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "var(--spacing-4)",
                        }}
                    >
                        {result.dms.map((dm, idx) => (
                            <div
                                key={idx}
                                className="glass-panel"
                                style={{
                                    padding: "var(--spacing-5)",
                                    borderLeft:
                                        "3px solid var(--accent-violet)",
                                }}
                            >
                                <p
                                    style={{
                                        fontSize: "0.75rem",
                                        textTransform: "uppercase",
                                        color: "var(--accent-violet)",
                                        fontWeight: "600",
                                        marginBottom: "var(--spacing-2)",
                                        letterSpacing: "0.05em",
                                    }}
                                >
                                    Option {idx + 1}
                                </p>
                                <p
                                    style={{
                                        fontSize: "0.9375rem",
                                        lineHeight: "1.6",
                                        marginBottom: "var(--spacing-4)",
                                    }}
                                >
                                    {dm}
                                </p>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: "var(--spacing-2)",
                                    }}
                                >
                                    <button
                                        className="secondary-button"
                                        style={{
                                            padding: "6px 12px",
                                            fontSize: "0.75rem",
                                            gap: "4px",
                                        }}
                                        onClick={() =>
                                            navigator.clipboard.writeText(dm)
                                        }
                                    >
                                        <Copy size={14} /> Copy
                                    </button>
                                </div>
                            </div>
                        ))}

                        <div
                            className="glass-panel"
                            style={{
                                padding: "var(--spacing-5)",
                                marginTop: "var(--spacing-2)",
                            }}
                        >
                            <p
                                style={{
                                    fontSize: "0.75rem",
                                    textTransform: "uppercase",
                                    color: "var(--accent-blue)",
                                    fontWeight: "600",
                                    marginBottom: "var(--spacing-2)",
                                    letterSpacing: "0.05em",
                                }}
                            >
                                Suggested Subject & Follow-up
                            </p>
                            <div style={{ marginBottom: "var(--spacing-4)" }}>
                                <span
                                    style={{
                                        fontSize: "0.875rem",
                                        color: "var(--text-secondary)",
                                    }}
                                >
                                    Subject:{" "}
                                </span>
                                <span
                                    style={{
                                        fontSize: "0.9375rem",
                                        fontWeight: "500",
                                    }}
                                >
                                    {result.subjectLine}
                                </span>
                            </div>
                            <div>
                                <span
                                    style={{
                                        fontSize: "0.875rem",
                                        color: "var(--text-secondary)",
                                        display: "block",
                                        marginBottom: "var(--spacing-1)",
                                    }}
                                >
                                    Follow-up:{" "}
                                </span>
                                <p
                                    style={{
                                        fontSize: "0.9375rem",
                                        fontStyle: "italic",
                                        background: "var(--bg-elevated)",
                                        padding: "12px",
                                        borderRadius: "var(--radius-sm)",
                                    }}
                                >
                                    {result.followUp}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
