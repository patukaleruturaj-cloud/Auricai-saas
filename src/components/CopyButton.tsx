"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy", err);
        }
    };

    return (
        <button
            onClick={handleCopy}
            className="btn-secondary"
            style={{ padding: "0.5rem", borderRadius: "100%", width: "40px", height: "40px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
            title="Copy to clipboard"
        >
            {copied ? <Check size={16} color="var(--accent-green)" /> : <Copy size={16} />}
        </button>
    );
}
