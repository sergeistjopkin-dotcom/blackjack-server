const https = require('https');
const http = require('http');
const fs = require('fs');

// НАСТРОЙКИ (токен уже вставлен)
const PORT = process.env.PORT || 10000;
const BOT_TOKEN = '8190709618:AAECqs5XMc5RtfctgbPUdrGSZJj2pV6ZeoU';
// ВАЖНО: Ниже вставь ссылку, которую ты только что скопировал с GitHub Pages (где открывается игра)
const GAME_URL = 'https://sergeistjopkin-dotcom.github.io/blackjack-telegram-game/'; 

// Проверяем токен при старте
if (!BOT_TOKEN || BOT_TOKEN.includes('ТВОЙ_ТОКЕН')) {
    console.error('❌ ОШИБКА: Вы не вставили реальный токен бота в BOT_TOKEN!');
    process.exit(1);
}

function sendMessage(chatId, text, keyboard = null) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', reply_markup: keyboard });
        const req = https.request({
            hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendMessage`, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, (res) => {
            let data = ''; res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject); req.write(body); req.end();
    });
}

function getMainKeyboard() {
    return { inline_keyboard: [ [ { text: '🎮 ИГРАТЬ', web_app: { url: GAME_URL } } ], [ { text: '📋 Правила', callback_data: 'rules' }, { text: '💰 Баланс', callback_data: 'balance' } ], [ { text: '❓ Помощь', callback_data: 'help' } ] ] };
}

async function handleStart(chatId, firstName) {
    const text = `🎰 <b>ДОБРО ПОЖАЛОВАТЬ В BLACKJACK 21!</b> 🃏\n\nПривет, <b>${firstName}</b>!\n\n🤖 <b>Соло-режим</b> — игра против дилера\n👥 <b>Мультиплеер</b> — с друзьями (до 4)\n\n💎 <b>Правила казино:</b> Блэкджек 3:2, Страховка, Double Down, Split\n\n💰 Стартовый баланс: <b>1000 фишек</b>\n\nНажми <b>🎮 ИГРАТЬ</b> чтобы начать!`;
    await sendMessage(chatId, text, getMainKeyboard());
}

async function handleRules(chatId) {
    await sendMessage(chatId, '📋 <b>ПРАВИЛА</b>\n\n🎯 Цель: набрать 21 очко\n🃏 Туз = 1/11, Картинки = 10\n👔 Дилер берёт до 17', { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'start' }]] });
}

async function handleBalance(chatId) {
    await sendMessage(chatId, '💰 <b>БАЛАНС</b>\n\n🪙 Фишек: 1000\n\n<i>Сохраняется автоматически</i>', { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'start' }]] });
}

async function handleHelp(chatId) {
    await sendMessage(chatId, '❓ <b>ПОМОЩЬ</b>\n\nНажми 🎮 ИГРАТЬ\nПройди квиз\nИграй!', { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'start' }]] });
}

const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'online' })); return;
    }
    if (req.url === '/webhook' && req.method === 'POST') {
        let body = ''; req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const update = JSON.parse(body);
                if (update.message?.text) {
                    const msg = update.message; const chatId = msg.chat.id; const firstName = msg.from.first_name || 'Игрок';
                    if (msg.text === '/start') await handleStart(chatId, firstName);
                    else if (msg.text === '/rules') await handleRules(chatId);
                    else if (msg.text === '/balance') await handleBalance(chatId);
                    else if (msg.text === '/help') await handleHelp(chatId);
                }
                if (update.callback_query) {
                    const cb = update.callback_query; const chatId = cb.message.chat.id; const firstName = cb.from.first_name || 'Игрок';
                    https.get(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery?callback_query_id=${cb.id}`);
                    if (cb.data === 'start') await handleStart(chatId, firstName);
                    else if (cb.data === 'rules') await handleRules(chatId);
                    else if (cb.data === 'balance') await handleBalance(chatId);
                    else if (cb.data === 'help') await handleHelp(chatId);
                }
                res.writeHead(200); res.end('OK');
            } catch(e) { res.writeHead(200); res.end('OK'); }
        }); return;
    }
    res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`🟢 Сервер на порту ${PORT}`);
    const webhookUrl = `https://blackjack-server-x391.onrender.com/webhook`;
    https.get(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`, (res) => {
        let data = ''; res.on('data', chunk => data += chunk);
        res.on('end', () => console.log('📡 Webhook:', data));
    });
});
