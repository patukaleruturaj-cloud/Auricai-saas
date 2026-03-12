#!/usr/bin/env node
/**
 * AuricAI — Start an ngrok tunnel for Paddle webhook development.
 * 
 * Usage:
 *   1. Install ngrok: npm install @ngrok/ngrok
 *   2. Set NGROK_AUTHTOKEN env variable (get from https://dashboard.ngrok.com/get-started/your-authtoken)
 *   3. Run: node scripts/start-tunnel.mjs
 * 
 * The script will print the public URL to use in Paddle's webhook settings.
 */

import ngrok from '@ngrok/ngrok';

const PORT = process.env.PORT || 3000;

async function main() {
    const authtoken = process.env.NGROK_AUTHTOKEN;
    if (!authtoken) {
        console.error('❌ NGROK_AUTHTOKEN is required. Get yours from:');
        console.error('   https://dashboard.ngrok.com/get-started/your-authtoken');
        console.error('');
        console.error('Then run:');
        console.error(`   NGROK_AUTHTOKEN=your_token node scripts/start-tunnel.mjs`);
        process.exit(1);
    }

    console.log(`🔄 Starting ngrok tunnel on port ${PORT}...`);

    const listener = await ngrok.forward({
        addr: PORT,
        authtoken,
    });

    const url = listener.url();
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Tunnel active!`);
    console.log(`   Public URL: ${url}`);
    console.log(`   Webhook URL: ${url}/api/paddle/webhook`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('📋 Next steps:');
    console.log('   1. Go to Paddle Dashboard → Developer Tools → Notifications');
    console.log(`   2. Set webhook URL to: ${url}/api/paddle/webhook`);
    console.log('   3. Make a test purchase');
    console.log('   4. Watch your Next.js server logs for [Webhook] messages');
    console.log('');
    console.log('Press Ctrl+C to stop the tunnel.');

    // Keep alive
    process.stdin.resume();
}

main().catch((err) => {
    console.error('❌ Failed to start tunnel:', err.message);
    process.exit(1);
});
