import { Paddle, Environment } from '@paddle/paddle-node-sdk';

const apiKey = process.env.PADDLE_API_KEY;

if (!apiKey) {
    console.warn("PADDLE_API_KEY is missing. Paddle client will not be initialized correctly.");
}

export const paddle = new Paddle(apiKey || "missing_key", {
    environment: process.env.PADDLE_ENV === 'sandbox' ? Environment.sandbox : Environment.production,
});
