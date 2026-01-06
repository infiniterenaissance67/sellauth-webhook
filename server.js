const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Configuration - READY TO USE
const PORT = 3000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SELLAUTH_HMAC_SECRET = process.env.SELLAUTH_HMAC_SECRET;
const JUNKIE_WEBHOOK_URL = process.env.JUNKIE_WEBHOOK_URL;

// Verify Sellauth HMAC signature using X-Signature header
function verifyHMAC(payload, signature, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const calculatedSignature = hmac.digest('hex');
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(calculatedSignature)
    );
}

// Send notification to Discord
async function sendToDiscord(orderData) {
    try {
        const embed = {
            embeds: [{
                title: '🎉 New Purchase!',
                color: 0x00ff00,
                fields: [
                    {
                        name: '📦 Product',
                        value: orderData.product_name || orderData.product?.name || 'N/A',
                        inline: true
                    },
                    {
                        name: '💰 Amount',
                        value: `$${orderData.total || orderData.amount || '0.00'}`,
                        inline: true
                    },
                    {
                        name: '🆔 Order ID',
                        value: orderData.order_id || orderData.id || 'N/A',
                        inline: true
                    },
                    {
                        name: '👤 Customer Email',
                        value: orderData.customer_email || orderData.email || 'N/A',
                        inline: false
                    },
                    {
                        name: '🔑 License System',
                        value: 'Key generated via Junkie',
                        inline: false
                    },
                    {
                        name: '📅 Purchase Date',
                        value: new Date().toLocaleString(),
                        inline: false
                    }
                ],
                footer: {
                    text: 'Sellauth Purchase Logger'
                },
                timestamp: new Date().toISOString()
            }]
        };

        await axios.post(DISCORD_WEBHOOK_URL, embed);
        console.log('✅ Sent notification to Discord');
    } catch (error) {
        console.error('❌ Error sending to Discord:', error.message);
    }
}

// Forward to Junkie webhook
async function forwardToJunkie(orderData) {
    try {
        const response = await axios.post(JUNKIE_WEBHOOK_URL, orderData);
        console.log('✅ Forwarded to Junkie for key generation');
        return response.data;
    } catch (error) {
        console.error('❌ Error forwarding to Junkie:', error.message);
        throw error;
    }
}

// Main webhook endpoint that receives from Sellauth
app.post('/webhook/sellauth', async (req, res) => {
    try {
        console.log('📨 Received webhook from Sellauth');
        
        const payload = req.body;
        const signature = req.headers['x-signature'];

        // Verify HMAC signature for security
        if (signature) {
            const isValid = verifyHMAC(payload, signature, SELLAUTH_HMAC_SECRET);
            if (!isValid) {
                console.error('❌ Invalid HMAC signature');
                return res.status(401).json({ error: 'Invalid signature' });
            }
            console.log('✅ HMAC signature verified');
        } else {
            console.warn('⚠️ No signature found in request');
        }

        // Check if this is a purchase event (order.created or order.paid)
        if (payload.event === 'order.created' || payload.event === 'order.paid') {
            console.log(`💳 Purchase event detected: ${payload.event}`);

            // Forward to Junkie to generate key
            await forwardToJunkie(payload);

            // Send notification to Discord
            await sendToDiscord(payload);

            res.status(200).json({ 
                success: true, 
                message: 'Webhook processed successfully' 
            });
        } else {
            console.log(`ℹ️ Ignoring event type: ${payload.event}`);
            res.status(200).json({ 
                success: true, 
                message: 'Event ignored' 
            });
        }

    } catch (error) {
        console.error('❌ Error processing webhook:', error.message);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Webhook server running on port ${PORT}`);
    console.log(`📍 Webhook URL: http://localhost:${PORT}/webhook/sellauth`);
    console.log('⏳ Waiting for webhooks from Sellauth...');
});

