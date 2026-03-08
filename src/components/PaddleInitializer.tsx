"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";

export default function PaddleInitializer() {
    const router = useRouter();

    return (
        <Script
            src="https://cdn.paddle.com/paddle/v2/paddle.js"
            onLoad={() => {
                if (typeof window !== "undefined" && (window as any).Paddle) {
                    (window as any).Paddle.Environment.set("sandbox");
                    (window as any).Paddle.Initialize({
                        token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,
                        eventCallback: (event: any) => {
                            console.log("[Paddle Event]", event.name, event);
                            if (
                                event.name === "checkout.completed" ||
                                event.name === "checkout.closed"
                            ) {
                                // Give webhook 2 seconds to process, then refresh
                                setTimeout(() => {
                                    window.location.reload();
                                }, 2000);
                            }
                        },
                    });
                }
            }}
        />
    );
}
