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

// Initialize Telegram Bot with 24/7 Polling
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Nexus TopUp Telegram Bot initializing (Bridge Mode with AES Bypass)...');

// Initialize Express App
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        mode: 'Bridge API Mode (AES Bypass)',
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
 * Send Interactive Order Alert to Telegram
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
    const date        = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Tunis' });

    const cleanWhatsapp = whatsapp.replace(/[^0-9]/g, '');
    const waText = encodeURIComponent(`Bonjour ${customer}! Votre commande ${orderNumber} sur TopUp TN est en cours de traitement.`);
    const waUrl = `https://wa.me/${cleanWhatsapp}?text=${waText}`;

    let msg = `🛒 <b>NOUVELLE COMMANDE REÇUE !</b>\n\n`;
    msg += `🧾 <b>N° Commande:</b> <code>${orderNumber}</code>\n`;
    msg += `🎮 <b>Jeu:</b> ${gameName}\n`;
    msg += `💎 <b>Pack:</b> ${packageName}\n`;
    msg += `💰 <b>Prix:</b> <code>${price}</code>\n\n`;
    msg += `👤 <b>Client:</b> ${customer}\n`;
    msg += `🆔 <b>ID Joueur / UID:</b> <code>${playerId}</code>\n`;
    msg += `🌐 <b>Serveur:</b> ${server}\n`;
    msg += `📱 <b>WhatsApp:</b> <a href="${waUrl}">${whatsapp}</a>\n`;
    msg += `📧 <b>Email:</b> ${email}\n`;
    msg += `📅 <b>Date:</b> ${date}\n`;
    msg += `⏳ <b>Statut:</b> 🟡 <i>EN ATTENTE</i>\n`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: '✅ Valider (Terminée)', callback_data: `complete_${orderNumber}` },
                { text: '❌ Annuler', callback_data: `cancel_${orderNumber}` }
            ],
            [
                { text: '🗑️ Supprimer', callback_data: `confirmdelete_${orderNumber}` },
                { text: '💬 Contacter (WhatsApp)', url: waUrl }
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
        return bot.sendMessage(chatId, `⛔ Accès non autorisé (ID: ${chatId}).`);
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
        await bot.sendMessage(chatId, `⚠️ Erreur calcul statistiques: ${err.message}`);
    }
});

bot.onText(/\/(start|help)/i, async (msg) => {
    const chatId = msg.chat.id;
    let welcome = `👋 <b>Bienvenue sur le Bot Administrateur Nexus TopUp (Render Engine)!</b>\n\n`;
    welcome += `Commandes disponibles:\n`;
    welcome += `• /stats - Rapport des ventes & chiffre d'affaires du jour\n`;
    welcome += `• /today - Résumé des commandes d'aujourd'hui\n\n`;
    welcome += `<i>Le bot fonctionne 24/7 en direct avec des notifications instantanées et boutons d'action rapide!</i>`;

    bot.sendMessage(chatId, welcome, { parse_mode: 'HTML' });
});

/**
 * Handle Inline Keyboard Action Callbacks
 */
bot.on('callback_query', async (query) => {
    const callbackId = query.id;
    const data = query.data || '';
    const message = query.message;
    const chatId = message.chat.id;
    const messageId = message.message_id;
    const oldText = message.text || '';

    try {
        // 1. MARK AS COMPLETED
        if (data.startsWith('complete_')) {
            const orderNumber = data.replace('complete_', '');

            const res = await callBridge('complete', { order_number: orderNumber });
            if (!res.success) throw new Error(res.error || 'Failed to update order');

            await bot.answerCallbackQuery(callbackId, { text: `✅ Commande ${orderNumber} terminée!` });

            let newText = oldText.replace(/⏳ Statut:.*/, '⏳ Statut: ✅ TERMINÉE');
            if (newText === oldText) newText += '\n\n✅ Statut: TERMINÉE';

            await bot.editMessageText(newText, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ TERMINÉE', callback_data: 'none' },
                            { text: '🗑️ Supprimer', callback_data: `confirmdelete_${orderNumber}` }
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

            await bot.answerCallbackQuery(callbackId, { text: `❌ Commande ${orderNumber} annulée.` });

            let newText = oldText.replace(/⏳ Statut:.*/, '⏳ Statut: ❌ ANNULÉE');
            if (newText === oldText) newText += '\n\n❌ Statut: ANNULÉE';

            await bot.editMessageText(newText, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '❌ ANNULÉE', callback_data: 'none' },
                            { text: '🗑️ Supprimer', callback_data: `confirmdelete_${orderNumber}` }
                        ]
                    ]
                }
            });
            return;
        }

        // 3. CONFIRM DELETE (Step 1)
        if (data.startsWith('confirmdelete_')) {
            const orderNumber = data.replace('confirmdelete_', '');

            await bot.answerCallbackQuery(callbackId, { text: '⚠️ Confirmation requise!' });

            await bot.editMessageReplyMarkup({
                inline_keyboard: [
                    [
                        { text: `⚠️ CONFIRMER LA SUPPRESSION DE ${orderNumber}`, callback_data: `delete_${orderNumber}` }
                    ],
                    [
                        { text: '↩️ Non, Annuler', callback_data: `canceldelete_${orderNumber}` }
                    ]
                ]
            }, {
                chat_id: chatId,
                message_id: messageId
            });
            return;
        }

        // 4. EXECUTE DELETE (Step 2)
        if (data.startsWith('delete_')) {
            const orderNumber = data.replace('delete_', '');

            const res = await callBridge('delete', { order_number: orderNumber });
            if (!res.success) throw new Error(res.error || 'Failed to delete order');

            await bot.answerCallbackQuery(callbackId, { text: `🗑️ Commande ${orderNumber} supprimée!` });

            await bot.editMessageText(`🗑️ <b>COMMANDE <code>${orderNumber}</code> SUPPRIMÉE</b>\n<i>La commande a été définitivement retirée de la base de données.</i>`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML'
            });
            return;
        }

        // 5. CANCEL DELETE (Restore buttons)
        if (data.startsWith('canceldelete_')) {
            const orderNumber = data.replace('canceldelete_', '');

            await bot.answerCallbackQuery(callbackId, { text: 'Suppression annulée.' });

            await bot.editMessageReplyMarkup({
                inline_keyboard: [
                    [
                        { text: '✅ Valider (Terminée)', callback_data: `complete_${orderNumber}` },
                        { text: '❌ Annuler', callback_data: `cancel_${orderNumber}` }
                    ],
                    [
                        { text: '🗑️ Supprimer', callback_data: `confirmdelete_${orderNumber}` }
                    ]
                ]
            }, {
                chat_id: chatId,
                message_id: messageId
            });
            return;
        }
    } catch (err) {
        console.error('Callback execution error:', err.message);
        bot.answerCallbackQuery(callbackId, { text: `⚠️ Erreur: ${err.message}` });
    }
});

/**
 * Format Sales Statistics HTML Report
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
    const date       = new Date().toLocaleDateString('fr-FR');

    let msg = `📊 <b>STATISTIQUES DES VENTES DU ${date}</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `🛒 <b>Commandes Aujourd'hui:</b> ${totCount}\n`;
    msg += `✅ <b>Terminées:</b> ${compCount}\n`;
    msg += `⏳ <b>En Attente:</b> ${pendCount}\n`;
    msg += `❌ <b>Annulées:</b> ${cancCount}\n`;
    msg += `💰 <b>Chiffre d'affaires du jour:</b> <code>${revenue}</code>\n\n`;

    if (games.length > 0) {
        msg += `🎮 <b>Détail par Jeu (Aujourd'hui):</b>\n`;
        for (const g of games) {
            msg += ` • <b>${g.game_name}:</b> ${g.cnt} commandes (<code>${parseFloat(g.rev || 0).toFixed(3)} TND</code>)\n`;
        }
        msg += `\n`;
    }

    msg += `🏆 <b>Total Réseau (Historique):</b>\n`;
    msg += ` • Commandes totales: ${overall.total_all || 0}\n`;
    msg += ` • Chiffre global: <code>${totAllRev}</code>\n`;
    msg += `\n📅 <i>Généré le ${new Date().toLocaleTimeString('fr-FR')}</i>`;

    return msg;
}

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Nexus TopUp Telegram Bot Server listening on port ${PORT}`);
});
