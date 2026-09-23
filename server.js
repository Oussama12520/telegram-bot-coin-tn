const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8906011226:AAH1ryuK-p3BJRh0-yQIgFa9VF8yHRWV2VQ';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '6665401611';

// InfinityFree Site & Bridge API settings
const SITE_URL = (process.env.SITE_URL || 'https://topuptn.free.je').replace(/\/$/, '');
const BOT_BRIDGE_KEY = process.env.BOT_BRIDGE_KEY || 'NexusTopUp_Secure_Bridge_2026';

let testCookie = null;

/**
 * Helper function to call InfinityFree PHP Bot Bridge with automatic AES security challenge solver
 */
async function callBridge(action, params = {}) {
    const url = `${SITE_URL}/api/bot_bridge.php`;
    const queryParams = { key: BOT_BRIDGE_KEY, action, ...params };
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const headers = { 'User-Agent': userAgent };
    if (testCookie) {
        headers['Cookie'] = `__test=${testCookie}`;
    }

    try {
        const response = await axios.get(url, { params: queryParams, headers, timeout: 10000 });
        if (typeof response.data === 'object' && response.data !== null) {
            return response.data;
        }

        const html = response.data;
        const matchA = typeof html === 'string' && html.match(/a=toNumbers\("([a-f0-9]+)"\)/);
        const matchB = typeof html === 'string' && html.match(/b=toNumbers\("([a-f0-9]+)"\)/);
        const matchC = typeof html === 'string' && html.match(/c=toNumbers\("([a-f0-9]+)"\)/);

        if (matchA && matchB && matchC) {
            const a = Buffer.from(matchA[1], 'hex');
            const b = Buffer.from(matchB[1], 'hex');
            const c = Buffer.from(matchC[1], 'hex');
            const decipher = crypto.createDecipheriv('aes-128-cbc', a, b);
            decipher.setAutoPadding(false);
            testCookie = Buffer.concat([decipher.update(c), decipher.final()]).toString('hex');
            
            headers['Cookie'] = `__test=${testCookie}`;
            const res2 = await axios.get(url, { params: queryParams, headers, timeout: 10000 });
            return typeof res2.data === 'object' ? res2.data : JSON.parse(res2.data);
        }

        throw new Error('Could not bypass InfinityFree security challenge.');
    } catch (err) {
        testCookie = null;
        throw err;
    }
}

// Initialize Telegram Bot with 24/7 Polling (explicitly enabling callback_query for buttons)
const bot = new TelegramBot(BOT_TOKEN, {
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            allowed_updates: ["message", "edited_message", "callback_query"]
        }
    }
});

console.log('🤖 Nexus TopUp Telegram Bot initializing (Professional Bridge Engine)...');

// Initialize Express App
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        mode: 'Bridge API Mode (Professional)',
        site: SITE_URL,
        timestamp: new Date().toISOString()
    });
});

/**
 * API Endpoint to Trigger Order Notification from Storefront
 * POST /notify
 */
app.post('/notify', async (req, res) => {
    try {
        const order = req.body;
        if (!order || !order.order_number) {
            return res.status(400).json({ error: 'Missing order_number parameter.' });
        }

        await sendOrderAlert(order);
        return res.json({ success: true, message: 'Notification dispatched to Telegram.' });
    } catch (err) {
        console.error('Error sending order notification:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Send Professional Interactive Order Alert to Telegram
 */
async function sendOrderAlert(order) {
    const orderNumber = order.order_number || 'N/A';
    const gameName    = order.game_name || 'N/A';
    const packageName = order.package_name || 'N/A';
    const price       = `${parseFloat(order.price || 0).toFixed(3)} ${order.currency || 'TND'}`;
    const customer    = order.customer_name || 'N/A';
    const playerId    = order.player_id || 'N/A';
    const server      = order.platform_or_server || 'N/A';
    const whatsapp    = order.customer_whatsapp || 'N/A';
    const email       = order.customer_email || 'N/A';
    const date        = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Tunis' });

    const cleanWhatsapp = whatsapp.replace(/[^0-9]/g, '');
    const waText = encodeURIComponent(`Hello ${customer}! Your order ${orderNumber} on TopUp TN is being processed.`);
    const waUrl = `https://wa.me/${cleanWhatsapp}?text=${waText}`;

    let msg = `<b>NEW ORDER RECEIVED</b> — <code>#${orderNumber}</code>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `<b>ORDER DETAILS</b>\n`;
    msg += `• <b>Game:</b> ${gameName}\n`;
    msg += `• <b>Package:</b> ${packageName}\n`;
    msg += `• <b>Amount Due:</b> <code>${price}</code>\n\n`;
    msg += `<b>CUSTOMER INFORMATION</b>\n`;
    msg += `• <b>Client Name:</b> ${customer}\n`;
    msg += `• <b>Player ID / UID:</b> <code>${playerId}</code>\n`;
    msg += `• <b>Server / Platform:</b> ${server}\n`;
    msg += `• <b>WhatsApp:</b> <a href="${waUrl}">${whatsapp}</a>\n`;
    msg += `• <b>Email:</b> ${email}\n\n`;
    msg += `<b>STATUS:</b> <code>PENDING</code>\n`;
    msg += `<i>Submitted: ${date}</i>`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: 'Mark Completed', callback_data: `complete_${orderNumber}` },
                { text: 'Cancel Order', callback_data: `cancel_${orderNumber}` }
            ],
            [
                { text: 'Delete Record', callback_data: `confirmdelete_${orderNumber}` },
                { text: 'Open WhatsApp', url: waUrl }
            ]
        ]
    };

    return bot.sendMessage(CHAT_ID, msg, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: keyboard
    });
}

/**
 * Handle Telegram Commands (/stats, /today, /start, /help)
 */
bot.onText(/\/(stats|today)/i, async (msg) => {
    const chatId = msg.chat.id;
    if (CHAT_ID && String(chatId) !== String(CHAT_ID)) {
        return bot.sendMessage(chatId, `Access Denied (ID: ${chatId}).`);
    }

    try {
        const statsData = await callBridge('stats');
        if (!statsData.success) {
            throw new Error(statsData.error || 'Failed to fetch statistics from bridge.');
        }

        const report = formatStatsReport(statsData);
        await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
    } catch (err) {
        console.error('Stats Generation Error:', err.message);
        await bot.sendMessage(chatId, `Statistics Error: ${err.message}`);
    }
});

bot.onText(/\/(start|help)/i, async (msg) => {
    const chatId = msg.chat.id;
    let welcome = `<b>NEXUS TOPUP ADMIN SERVICE</b>\n`;
    welcome += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    welcome += `<b>Available Commands:</b>\n`;
    welcome += `• <code>/stats</code> — Daily sales & revenue report\n`;
    welcome += `• <code>/today</code> — Summary of today's active orders\n\n`;
    welcome += `<i>System status: Operational 24/7. Order notifications are dispatched automatically.</i>`;

    bot.sendMessage(chatId, welcome, { parse_mode: 'HTML' });
});

/**
 * Handle Inline Keyboard Action Callbacks
 */
bot.on('callback_query', async (query) => {
    const callbackId = query.id;
    const data = query.data || '';
    const message = query.message;
    if (!message) return;

    const chatId = message.chat.id;
    const messageId = message.message_id;
    const oldText = message.text || '';

    const safeAnswer = async (text, alert = false) => {
        try {
            await bot.answerCallbackQuery(callbackId, { text, show_alert: alert });
        } catch (e) {
            // Ignore if Telegram callback expired
        }
    };

    try {
        // 1. MARK AS COMPLETED
        if (data.startsWith('complete_')) {
            const orderNumber = data.replace('complete_', '');
            const res = await callBridge('complete', { order_number: orderNumber });
            if (!res.success) throw new Error(res.error || 'Failed to update order');

            await safeAnswer(`Order ${orderNumber} marked as Completed.`);

            let newText = oldText.replace(/STATUS:.*/i, 'STATUS: <code>COMPLETED & PAID</code>');
            if (newText === oldText) newText += '\n\nSTATUS: <code>COMPLETED & PAID</code>';

            await bot.editMessageText(newText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Completed', callback_data: 'none' },
                            { text: 'Delete Record', callback_data: `confirmdelete_${orderNumber}` }
                        ]
                    ]
                }
            });
            return;
        }

        // 2. MARK AS CANCELLED
        if (data.startsWith('cancel_')) {
            const orderNumber = data.replace('cancel_', '');
            const res = await callBridge('cancel', { order_number: orderNumber });
            if (!res.success) throw new Error(res.error || 'Failed to cancel order');

            await safeAnswer(`Order ${orderNumber} cancelled.`);

            let newText = oldText.replace(/STATUS:.*/i, 'STATUS: <code>CANCELLED</code>');
            if (newText === oldText) newText += '\n\nSTATUS: <code>CANCELLED</code>';

            await bot.editMessageText(newText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Cancelled', callback_data: 'none' },
                            { text: 'Delete Record', callback_data: `confirmdelete_${orderNumber}` }
                        ]
                    ]
                }
            });
            return;
        }

        // 3. CONFIRM DELETE (Step 1)
        if (data.startsWith('confirmdelete_')) {
            const orderNumber = data.replace('confirmdelete_', '');
            await safeAnswer('Confirmation required to delete order.');

            let confirmText = oldText;
            if (!confirmText.includes('CONFIRM DELETION')) {
                confirmText += `\n\n⚠️ <b>CONFIRM DELETION: Are you sure you want to delete Order #${orderNumber} permanently?</b>`;
            }

            await bot.editMessageText(confirmText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: `Confirm Delete #${orderNumber}`, callback_data: `delete_${orderNumber}` }
                        ],
                        [
                            { text: 'Dismiss / Keep Order', callback_data: `canceldelete_${orderNumber}` }
                        ]
                    ]
                }
            });
            return;
        }

        // 4. EXECUTE DELETE (Step 2)
        if (data.startsWith('delete_')) {
            const orderNumber = data.replace('delete_', '');
            const res = await callBridge('delete', { order_number: orderNumber });
            if (!res.success) throw new Error(res.error || 'Failed to delete order');

            await safeAnswer(`Order ${orderNumber} permanently deleted.`);

            await bot.editMessageText(`<b>ORDER DELETED</b> — <code>#${orderNumber}</code>\n<i>The order record has been permanently removed from the database.</i>`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML'
            });
            return;
        }

        // 5. CANCEL DELETE (Restore original buttons)
        if (data.startsWith('canceldelete_')) {
            const orderNumber = data.replace('canceldelete_', '');
            await safeAnswer('Deletion cancelled.');

            let restoredText = oldText.replace(/\n\n⚠️ <b>CONFIRM DELETION:.*/s, '');

            const cleanWhatsapp = '';
            const waText = encodeURIComponent(`Hello! Your order ${orderNumber} on TopUp TN is being processed.`);
            const waUrl = `https://wa.me/${cleanWhatsapp}?text=${waText}`;

            await bot.editMessageText(restoredText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Mark Completed', callback_data: `complete_${orderNumber}` },
                            { text: 'Cancel Order', callback_data: `cancel_${orderNumber}` }
                        ],
                        [
                            { text: 'Delete Record', callback_data: `confirmdelete_${orderNumber}` },
                            { text: 'Open WhatsApp', url: waUrl }
                        ]
                    ]
                }
            });
            return;
        }
    } catch (err) {
        console.error('Callback processing error:', err.message);
        await safeAnswer(`Error: ${err.message}`, true);
    }
});

/**
 * Format Sales Statistics HTML Report (Professional Executive Theme)
 */
function formatStatsReport(data) {
    const today   = data.today || {};
    const games   = data.games || [];
    const overall = data.overall || {};

    const totCount   = today.total_orders || 0;
    const compCount  = today.completed_orders || 0;
    const pendCount  = today.pending_orders || 0;
    const cancCount  = today.cancelled_orders || 0;
    const revenue    = `${parseFloat(today.total_revenue || 0).toFixed(3)} TND`;
    const totAllRev  = `${parseFloat(overall.rev_all || 0).toFixed(3)} TND`;
    const date       = new Date().toLocaleDateString('en-GB');

    let msg = `<b>SALES & REVENUE REPORT</b>\n`;
    msg += `<code>${date}</code>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `<b>TODAY'S METRICS</b>\n`;
    msg += `• <b>Total Orders:</b> ${totCount}\n`;
    msg += `• <b>Completed:</b> ${compCount}\n`;
    msg += `• <b>Pending:</b> ${pendCount}\n`;
    msg += `• <b>Cancelled:</b> ${cancCount}\n`;
    msg += `• <b>Gross Revenue:</b> <code>${revenue}</code>\n\n`;

    if (games.length > 0) {
        msg += `<b>PRODUCT BREAKDOWN</b>\n`;
        for (const g of games) {
            msg += `• <b>${g.game_name}:</b> ${g.cnt} orders (<code>${parseFloat(g.rev || 0).toFixed(3)} TND</code>)\n`;
        }
        msg += `\n`;
    }

    msg += `<b>ALL-TIME SUMMARY</b>\n`;
    msg += `• <b>Total Volume:</b> ${overall.total_all || 0} orders\n`;
    msg += `• <b>Total Lifetime Revenue:</b> <code>${totAllRev}</code>\n`;
    msg += `\n<i>Report Generated: ${new Date().toLocaleTimeString('en-GB')}</i>`;

    return msg;
}

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Nexus TopUp Telegram Bot Server listening on port ${PORT}`);
});
