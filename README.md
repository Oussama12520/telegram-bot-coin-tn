# 🤖 Nexus TopUp Telegram Bot (Node.js for Render)

This is a 24/7 dedicated Node.js Telegram Bot service built to run on **Render** (or any Node.js hosting platform).

## 🌟 Features Included
1. **Instant 24/7 Polling**: Responds to `/stats` and `/today` commands in < 0.2s without needing Webhooks.
2. **Interactive Inline Keyboard Buttons**:
   - `[ ✅ Valider (Terminée) ]`: Updates order status to `completed` & payment status to `confirmed` in MySQL.
   - `[ ❌ Annuler ]`: Updates order status to `cancelled` in MySQL.
   - `[ 🗑️ Supprimer ]`: Asks for confirmation (`[ ⚠️ CONFIRMER LA SUPPRESSION ]`) and deletes order from database.
   - `[ 💬 Contacter (WhatsApp) ]`: Direct link to client's WhatsApp chat with pre-filled message.
3. **HTTP API Notification Endpoint**: `POST /notify` to trigger order notifications from your PHP storefront.

---

## 🚀 How to Deploy on Render (Free)

### Step 1: Create a GitHub Repository
1. Push this `telegram-bot` folder (or your whole repo) to GitHub.

### Step 2: Create a Web Service on Render
1. Go to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub Repository.
4. Set the following details:
   - **Name**: `nexus-topup-bot`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Under **Environment Variables**, add:
   - `TELEGRAM_BOT_TOKEN` = `8906011226:AAH1ryuK-p3BJRh0-yQIgFa9VF8yHRWV2VQ`
   - `TELEGRAM_CHAT_ID` = `6665401611`
   - `DB_HOST` = `sql206.infinityfree.com`
   - `DB_USER` = `if0_41620120`
   - `DB_PASS` = `UwEwIeW5PU5`
   - `DB_NAME` = `if0_41620120_coins`
   - `DB_PORT` = `3306`

6. Click **Create Web Service**.

Once deployed, Render will give you a URL like:
`https://nexus-topup-bot.onrender.com`

---

## 🔗 Connecting PHP Storefront to Render

In your PHP site configuration ([`config/config.php`](file:///c:/xampp/htdocs/coins%20shop/config/config.php)), add your Render URL:

```php
define('RENDER_BOT_URL', 'https://nexus-topup-bot.onrender.com/notify');
```

And your PHP storefront will pass order alerts to Render instantly!
