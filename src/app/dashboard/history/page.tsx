import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MessageSquare, Clock } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";

export default async function HistoryPage() {
    const session = await auth();
    if (!session.userId) redirect("/sign-in");

    // Query generations by Clerk user_id (TEXT column) — no join needed
    const { data: historyData, error } = await supabaseAdmin
        .from("generations")
        .select("id, prospect_bio, tone, generated_options, subject, follow_up, created_at")
        .eq("user_id", session.userId)
        .order("created_at", { ascending: false })
        .limit(50);

    if (error) {
        console.error("[history] query error:", error);
    }

    const history = historyData || [];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-6)" }}>
            <div>
                <h1 style={{ fontSize: "2rem", fontWeight: "700", marginBottom: "var(--spacing-2)" }}>
                    Generation History
                </h1>
                <p style={{ color: "var(--text-secondary)" }}>
                    {history.length > 0
                        ? `${history.length} generation${history.length !== 1 ? "s" : ""} saved.`
                        : "Your past generations will appear here."}
                </p>
            </div>

            {history.length === 0 ? (
                <div
                    className="glass-panel"
                    style={{ padding: "var(--spacing-12)", textAlign: "center", color: "var(--text-secondary)" }}
                >
                    <MessageSquare size={48} style={{ opacity: 0.2, margin: "0 auto var(--spacing-4)" }} />
                    <p>You haven&apos;t generated any openers yet.</p>
                    <p style={{ fontSize: "0.875rem", marginTop: "var(--spacing-2)" }}>
                        Head to the Generate page to create your first outreach message.
                    </p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {history.map((item) => {
                        const preview =
                            item.prospect_bio && item.prospect_bio.length > 120
                                ? item.prospect_bio.substring(0, 120) + "..."
                                : item.prospect_bio || "No bio provided";

                        const options: string[] = item.generated_options?.dms || [];

                        return (
                            <div
                                key={item.id}
                                className="glass-panel animate-fade-in"
                                style={{ padding: "1.5rem" }}
                            >
                                {/* Header */}
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "flex-start",
                                        marginBottom: "1rem",
                                        gap: "1rem",
                                    }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {item.tone && (
                                            <span
                                                style={{
                                                    fontSize: "0.75rem",
                                                    textTransform: "uppercase",
                                                    background: "var(--bg-elevated)",
                                                    padding: "3px 8px",
                                                    borderRadius: "var(--radius-sm)",
                                                    color: "var(--text-secondary)",
                                                    marginRight: "8px",
                                                    display: "inline-block",
                                                    marginBottom: "6px",
                                                }}
                                            >
                                                {item.tone}
                                            </span>
                                        )}
                                        <p
                                            style={{
                                                fontWeight: "500",
                                                fontSize: "0.9375rem",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {preview}
                                        </p>
                                    </div>
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "4px",
                                            color: "var(--text-secondary)",
                                            fontSize: "0.875rem",
                                            flexShrink: 0,
                                        }}
                                    >
                                        <Clock size={14} />
                                        {new Date(item.created_at).toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric",
                                        })}
                                    </div>
                                </div>

                                {/* Expandable content */}
                                <details style={{ cursor: "pointer" }}>
                                    <summary
                                        style={{
                                            outline: "none",
                                            color: "var(--accent-blue)",
                                            fontWeight: "500",
                                            fontSize: "0.875rem",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.5rem",
                                        }}
                                    >
                                        View Generated Options ({options.length})
                                    </summary>

                                    <div style={{ marginTop: "1rem" }}>

                                        {/* DM Variations */}
                                        {options.length > 0 && (
                                            <div style={{ marginBottom: "1.5rem" }}>
                                                <h4
                                                    style={{
                                                        fontSize: "0.75rem",
                                                        color: "var(--text-secondary)",
                                                        marginBottom: "0.5rem",
                                                        textTransform: "uppercase",
                                                        letterSpacing: "0.05em",
                                                    }}
                                                >
                                                    Generated Openers
                                                </h4>
                                                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                                    {options.map((opt: string, idx: number) => (
                                                        <div
                                                            key={idx}
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "flex-start",
                                                                gap: "0.75rem",
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    flex: 1,
                                                                    padding: "1rem",
                                                                    background: "var(--bg-elevated)",
                                                                    borderRadius: "var(--radius-md)",
                                                                    border: "1px solid var(--border-subtle)",
                                                                    fontSize: "0.9375rem",
                                                                    lineHeight: "1.5",
                                                                }}
                                                            >
                                                                <span
                                                                    style={{
                                                                        fontSize: "0.7rem",
                                                                        textTransform: "uppercase",
                                                                        color: "var(--accent-violet)",
                                                                        fontWeight: "600",
                                                                        display: "block",
                                                                        marginBottom: "6px",
                                                                    }}
                                                                >
                                                                    Option {idx + 1}
                                                                </span>
                                                                {opt}
                                                            </div>
                                                            <CopyButton text={opt} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Subject Line */}
                                        {item.subject && (
                                            <div style={{ marginBottom: "1.5rem" }}>
                                                <h4
                                                    style={{
                                                        fontSize: "0.75rem",
                                                        color: "var(--text-secondary)",
                                                        marginBottom: "0.5rem",
                                                        textTransform: "uppercase",
                                                        letterSpacing: "0.05em",
                                                    }}
                                                >
                                                    Suggested Subject
                                                </h4>
                                                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                                                    <div
                                                        style={{
                                                            flex: 1,
                                                            padding: "1rem",
                                                            background: "var(--bg-elevated)",
                                                            borderRadius: "var(--radius-md)",
                                                            border: "1px solid var(--border-subtle)",
                                                            fontSize: "0.9375rem",
                                                            lineHeight: "1.5",
                                                            fontWeight: "500",
                                                        }}
                                                    >
                                                        {item.subject}
                                                    </div>
                                                    <CopyButton text={item.subject} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Follow-up Message */}
                                        {item.follow_up && (
                                            <div>
                                                <h4
                                                    style={{
                                                        fontSize: "0.75rem",
                                                        color: "var(--text-secondary)",
                                                        marginBottom: "0.5rem",
                                                        textTransform: "uppercase",
                                                        letterSpacing: "0.05em",
                                                    }}
                                                >
                                                    Follow-up Message
                                                </h4>
                                                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                                                    <div
                                                        style={{
                                                            flex: 1,
                                                            padding: "1rem",
                                                            background: "var(--bg-elevated)",
                                                            borderRadius: "var(--radius-md)",
                                                            border: "1px solid var(--border-subtle)",
                                                            fontSize: "0.9375rem",
                                                            lineHeight: "1.5",
                                                            fontStyle: "italic",
                                                            whiteSpace: "pre-wrap",
                                                        }}
                                                    >
                                                        {item.follow_up}
                                                    </div>
                                                    <CopyButton text={item.follow_up} />
                                                </div>
                                            </div>
                                        )}

                                    </div>
                                </details>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
