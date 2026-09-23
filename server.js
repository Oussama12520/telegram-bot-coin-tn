const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8906011226:AAH1ryuK-p3BJRh0-yQIgFa9VF8yHRWV2VQ';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '6665401611';

// MySQL Connection Pool
const dbPool = mysql.createPool({
    host: process.env.DB_HOST || 'sql206.infinityfree.com',
    user: process.env.DB_USER || 'if0_41620120',
    password: process.env.DB_PASS || 'UwEwIeW5PU5',
    database: process.env.DB_NAME || 'if0_41620120_coins',
    port: parseInt(process.env.DB_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    keepAliveInitialDelay: 10000,
    enableKeepAlive: true
});

// Initialize Telegram Bot with 24/7 Polling
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Nexus TopUp Telegram Bot initializing...');

// Initialize Express App
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Nexus TopUp Telegram Bot Engine',
        timestamp: new Date().toISOString()
    });
});

/**
 * API Endpoint to Trigger Order Notification from PHP Site
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
        const statsReport = await generateStatsReport();
        await bot.sendMessage(chatId, statsReport, { parse_mode: 'HTML' });
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

            await dbPool.query("UPDATE orders SET order_status = 'completed', payment_status = 'confirmed' WHERE order_number = ?", [orderNumber]);
            await dbPool.query("INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment, created_at) SELECT id, 'pending', 'completed', 'Render Bot', 'Marked completed via Telegram button', NOW() FROM orders WHERE order_number = ?", [orderNumber]);

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

            await dbPool.query("UPDATE orders SET order_status = 'cancelled' WHERE order_number = ?", [orderNumber]);
            await dbPool.query("INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment, created_at) SELECT id, 'pending', 'cancelled', 'Render Bot', 'Cancelled via Telegram button', NOW() FROM orders WHERE order_number = ?", [orderNumber]);

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

            await dbPool.query("DELETE FROM orders WHERE order_number = ?", [orderNumber]);
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
 * Generate Sales Statistics Report from MySQL
 */
async function generateStatsReport() {
    const todayStr = new Date().toISOString().split('T')[0];

    const [todayRows] = await dbPool.query(`
        SELECT 
            COUNT(*) as total_orders,
            SUM(CASE WHEN order_status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
            SUM(CASE WHEN order_status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
            SUM(CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
            SUM(CASE WHEN order_status != 'cancelled' THEN price ELSE 0 END) as total_revenue
        FROM orders 
        WHERE DATE(created_at) = CURDATE()
    `);
    const today = todayRows[0] || {};

    const [gameRows] = await dbPool.query(`
        SELECT game_name, COUNT(*) as cnt, SUM(price) as rev 
        FROM orders 
        WHERE DATE(created_at) = CURDATE() AND order_status != 'cancelled'
        GROUP BY game_name
    `);

    const [allRows] = await dbPool.query(`
        SELECT COUNT(*) as total_all, SUM(CASE WHEN order_status != 'cancelled' THEN price ELSE 0 END) as rev_all 
        FROM orders
    `);
    const overall = allRows[0] || {};

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

    if (gameRows.length > 0) {
        msg += `🎮 <b>Détail par Jeu (Aujourd'hui):</b>\n`;
        for (const g of gameRows) {
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
