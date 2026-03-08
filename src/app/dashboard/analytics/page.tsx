import { BarChart3, TrendingUp, Users, Clock, Database } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { getWallet } from "@/lib/credits";

export default async function AnalyticsPage() {
    const session = await auth();
    if (!session.userId) redirect("/sign-in");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Use Promise.all for parallel fetching
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const [
        { data: stats },
        creditState,
        { count: weekCount },
        { count: monthCount }
    ] = await Promise.all([
        supabase.from("user_stats").select("*").eq("user_id", session.userId).single(),
        getWallet(session.userId),
        supabase.from("generations").select('*', { count: 'exact', head: true }).eq("user_id", session.userId).gte("created_at", oneWeekAgo.toISOString()),
        supabase.from("generations").select('*', { count: 'exact', head: true }).eq("user_id", session.userId).gte("created_at", oneMonthAgo.toISOString())
    ]);

    const totalGenerations = stats?.total_generations || 0;
    const lastGeneratedAt = stats?.last_generated_at
        ? new Date(stats.last_generated_at).toLocaleDateString()
        : "Never";

    const messagesRemaining = creditState?.credits_remaining ?? creditState?.monthly_limit ?? 10;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-6)" }}>
            <div>
                <h1 style={{ fontSize: "2rem", fontWeight: "700", marginBottom: "var(--spacing-2)" }}>Analytics & Performance</h1>
                <p style={{ color: "var(--text-secondary)" }}>Track your outbound messaging volume.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--spacing-4)" }}>
                {/* Total Generations */}
                <div className="glass-panel animate-fade-in" style={{ padding: "var(--spacing-6)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", marginBottom: "var(--spacing-4)" }}>
                        <BarChart3 size={18} color="var(--accent-blue)" /> <span style={{ fontSize: "0.875rem", fontWeight: "500" }}>Total Generated</span>
                    </div>
                    <p style={{ fontSize: "2.5rem", fontWeight: "700" }}>{totalGenerations}</p>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                        All time generations
                    </p>
                </div>

                {/* Messages Remaining */}
                <div className="glass-panel animate-fade-in" style={{ padding: "var(--spacing-6)", animationDelay: "100ms" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", marginBottom: "var(--spacing-4)" }}>
                        <Database size={18} color="var(--accent-violet)" /> <span style={{ fontSize: "0.875rem", fontWeight: "500" }}>Messages Remaining</span>
                    </div>
                    <p style={{ fontSize: "2.5rem", fontWeight: "700" }}>{messagesRemaining}</p>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                        Current billing cycle
                    </p>
                </div>

                {/* Last Generated */}
                <div className="glass-panel animate-fade-in" style={{ padding: "var(--spacing-6)", animationDelay: "200ms" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", marginBottom: "var(--spacing-4)" }}>
                        <Clock size={18} /> <span style={{ fontSize: "0.875rem", fontWeight: "500" }}>Last Generated</span>
                    </div>
                    <p style={{ fontSize: "1.5rem", fontWeight: "700", minHeight: "3rem", display: "flex", alignItems: "center" }}>{lastGeneratedAt}</p>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                        Most recent activity
                    </p>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--spacing-4)", marginTop: "var(--spacing-2)" }}>
                <div className="glass-panel animate-fade-in" style={{ padding: "var(--spacing-6)", animationDelay: "300ms", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "4px" }}>Generations This Week</p>
                        <p style={{ fontSize: "2rem", fontWeight: "700" }}>{weekCount || 0}</p>
                    </div>
                    <TrendingUp size={32} opacity={0.2} color="var(--accent-blue)" />
                </div>
                <div className="glass-panel animate-fade-in" style={{ padding: "var(--spacing-6)", animationDelay: "400ms", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "4px" }}>Generations This Month</p>
                        <p style={{ fontSize: "2rem", fontWeight: "700" }}>{monthCount || 0}</p>
                    </div>
                    <TrendingUp size={32} opacity={0.2} color="var(--accent-violet)" />
                </div>
            </div>

            <div className="glass-panel" style={{ padding: "var(--spacing-8)", minHeight: "150px", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "var(--spacing-4)" }}>
                <p style={{ color: "var(--text-secondary)" }}>Interactive charting available in Scale plan.</p>
            </div>
        </div>
    );
}
