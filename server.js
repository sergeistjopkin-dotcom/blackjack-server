const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');

// ═══════════════════════════════════════
// КОНФИГУРАЦИЯ
// ═══════════════════════════════════════
const PORT = process.env.PORT || 10000;
const BOT_TOKEN = 'ТВОЙ_ТОКЕН_БОТА'; // Вставь токен от @BotFather
const GAME_URL = 'https://sergeistjopkin-dotcom.github.io/blackjack-telegram-game/';

// ═══════════════════════════════════════
// БАЗА ДАННЫХ
// ═══════════════════════════════════════
const DB_FILE = './blackjack_db.json';
let database = { players: {}, rooms: {} };

try {
    if (fs.existsSync(DB_FILE)) {
        database = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log('✅ Database loaded');
    }
} catch (e) {
    console.log('📦 New database created');
}

function saveDB() {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2)); } 
    catch(e) { console.error('Save error:', e); }
}

// ═══════════════════════════════════════
// TELEGRAM BOT API
// ═══════════════════════════════════════
function sendMessage(chatId, text, keyboard = null) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
        
        const options = {
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        });
        
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function sendPhoto(chatId, photoUrl, caption, keyboard = null) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            chat_id: chatId,
            photo: photoUrl,
            caption: caption,
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
        
        const options = {
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/sendPhoto`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        });
        
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Главное меню
function getMainMenu() {
    return {
        inline_keyboard: [
            [{
                text: '🎮 ИГРАТЬ',
                web_app: { url: GAME_URL }
            }],
            [
                { text: '📋 Правила', callback_data: 'rules' },
                { text: '💰 Баланс', callback_data: 'balance' }
            ],
            [
                { text: '👥 Пригласить друга', callback_data: 'invite' },
                { text: '❓ Помощь', callback_data: 'help' }
            ]
        ]
    };
}

function getRulesMenu() {
    return {
        inline_keyboard: [
            [{ text: '🔙 В главное меню', callback_data: 'menu' }]
        ]
    };
}

// Обработка команды /start
async function handleStart(chatId, userInfo) {
    const firstName = userInfo.first_name || 'Игрок';
    const username = userInfo.username || '';
    
    const welcomeText = 
`🎰 <b>ДОБРО ПОЖАЛОВАТЬ В BLACKJACK 21!</b> 🃏

Привет, ${firstName}! Добро пожаловать в премиум онлайн-блэкджек прямо в Telegram!

🏆 <b>ЧТО ТЕБЯ ЖДЁТ:</b>

🤖 <b>Соло-режим</b> — игра против дилера
👥 <b>Мультиплеер</b> — игра с друзьями (до 4 игроков)
💎 <b>Полные правила казино:</b>
  • Блэкджек (21) — выплата 3:2
  • Страховка против туза дилера
  • Double Down — удвоение ставки
  • Split — разделение пары
  • Surrender — сдаться и вернуть 50%

💰 <b>Стартовый баланс:</b> 1 000 фишек
🛡️ <b>Защита:</b> Квиз-проверка от ботов

🎯 <b>КАК ИГРАТЬ С ДРУЗЬЯМИ:</b>
1. Нажми <b>🎮 ИГРАТЬ</b>
2. Пройди квиз (3 вопроса)
3. Создай комнату — получи код
4. Отправь код друзьям

🏠 <b>Или играй один против дилера!</b>

<i>Удачи за столом!</i> 🍀`;

    await sendMessage(chatId, welcomeText, getMainMenu());
    
    // Сохраняем игрока в базу
    const playerId = userInfo.id.toString();
    if (!database.players[playerId]) {
        database.players[playerId] = {
            username: username || firstName,
            firstName: firstName,
            balance: 1000,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            createdAt: Date.now(),
            lastActive: Date.now()
        };
        saveDB();
    }
}

// Обработка callback'ов (кнопки)
async function handleCallback(chatId, data, userInfo) {
    const playerId = userInfo.id.toString();
    
    switch(data) {
        case 'menu':
            await handleStart(chatId, userInfo);
            break;
            
        case 'rules':
            const rulesText = 
`📋 <b>ПРАВИЛА BLACKJACK 21</b>

🎯 <b>ЦЕЛЬ ИГРЫ:</b>
Набрать 21 очко или больше чем у дилера, но не больше 21.

🃏 <b>КАРТЫ:</b>
• Туз = 1 или 11 очков
• Король, Дама, Валет = 10 очков
• Остальные = по номиналу

💎 <b>ДЕЙСТВИЯ:</b>
• <b>Hit</b> — взять карту
• <b>Stand</b> — остановиться
• <b>Double Down</b> — удвоить ставку (1 карта)
• <b>Split</b> — разделить пару (2 руки)
• <b>Insurance</b> — страховка (туз у дилера)
• <b>Surrender</b> — сдаться (вернуть 50%)

💰 <b>ВЫПЛАТЫ:</b>
• Блэкджек — 3:2
• Выигрыш — 1:1
• Страховка — 2:1

👔 <b>ДИЛЕР:</b>
• Берёт карту при 16 и меньше
• Останавливается при 17 и больше`;
            
            await sendMessage(chatId, rulesText, getRulesMenu());
            break;
            
        case 'balance':
            const player = database.players[playerId];
            const balance = player ? player.balance : 1000;
            const games = player ? player.gamesPlayed : 0;
            const wins = player ? player.wins : 0;
            
            const balanceText = 
`💰 <b>ВАШ БАЛАНС</b>

🪙 <b>Фишек:</b> ${balance}
🎮 <b>Сыграно игр:</b> ${games}
🏆 <b>Побед:</b> ${wins}
📊 <b>Винрейт:</b> ${games > 0 ? Math.round((wins/games)*100) : 0}%

<i>Баланс сохраняется автоматически</i>`;
            
            await sendMessage(chatId, balanceText, getRulesMenu());
            break;
            
        case 'invite':
            const inviteText = 
`👥 <b>ПРИГЛАСИТЬ ДРУЗЕЙ</b>

Отправь другу ссылку на бота:

<b>https://t.me/Blackjack21CasinoBot</b>

Или попроси друга найти бота по username:
<b>@Blackjack21CasinoBot</b>

В игре создай комнату и отправь код другу!`;
            
            await sendMessage(chatId, inviteText, getRulesMenu());
            break;
            
        case 'help':
            const helpText = 
`❓ <b>ПОМОЩЬ</b>

<b>Как начать игру?</b>
Нажми кнопку <b>🎮 ИГРАТЬ</b> внизу

<b>Как играть с друзьями?</b>
1. Нажми ИГРАТЬ
2. Пройди квиз
3. Создай комнату
4. Отправь код другу

<b>Не работает игра?</b>
• Проверь интернет
• Обнови Telegram
• Напиши /start ещё раз

<b>Проблемы с балансом?</b>
Баланс сохраняется автоматически.
При потере — напиши в поддержку.

<i>Техподдержка: @your_support</i>`;
            
            await sendMessage(chatId, helpText, getRulesMenu());
            break;
    }
}

// ═══════════════════════════════════════
// ОБРАБОТКА WEBHOOK ОТ TELEGRAM
// ═══════════════════════════════════════
function handleTelegramUpdate(update) {
    console.log('📨 Update:', JSON.stringify(update).slice(0, 200));
    
    if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const text = msg.text || '';
        const userInfo = msg.from;
        
        if (text === '/start') {
            handleStart(chatId, userInfo);
        } else if (text === '/help') {
            handleCallback(chatId, 'help', userInfo);
        } else if (text === '/rules') {
            handleCallback(chatId, 'rules', userInfo);
        } else if (text === '/balance') {
            handleCallback(chatId, 'balance', userInfo);
        } else {
            sendMessage(chatId, 'Используйте кнопки меню или команду /start', getMainMenu());
        }
    }
    
    if (update.callback_query) {
        const cb = update.callback_query;
        const chatId = cb.message.chat.id;
        const data = cb.data;
        const userInfo = cb.from;
        
        // Отвечаем на callback
        https.request({
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/answerCallbackQuery?callback_query_id=${cb.id}`,
            method: 'GET'
        }).end();
        
        handleCallback(chatId, data, userInfo);
    }
}

// ═══════════════════════════════════════
// HTTP СЕРВЕР
// ═══════════════════════════════════════
const httpServer = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Health check
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            players: Object.keys(database.players).length,
            rooms: Object.keys(database.rooms).length,
            uptime: process.uptime()
        }));
        return;
    }
    
    // Webhook от Telegram
    if (req.url === '/webhook' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const update = JSON.parse(body);
                handleTelegramUpdate(update);
                res.writeHead(200);
                res.end('OK');
            } catch(e) {
                res.writeHead(400);
                res.end('Error');
            }
        });
        return;
    }
    
    res.writeHead(404);
    res.end('Not found');
});

// ═══════════════════════════════════════
// WEBSOCKET СЕРВЕР
// ═══════════════════════════════════════
const wss = new WebSocket.Server({ server: httpServer });
const connections = {};

wss.on('connection', (ws) => {
    let playerId = null;
    let currentRoom = null;
    
    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch(e) { return; }
        
        switch(msg.type) {
            case 'auth':
                playerId = msg.telegramId || 'player_' + Date.now();
                connections[playerId] = ws;
                
                if (!database.players[playerId]) {
                    database.players[playerId] = {
                        username: msg.username || 'Player',
                        balance: 1000,
                        gamesPlayed: 0,
                        wins: 0,
                    };
                    saveDB();
                }
                
                ws.send(JSON.stringify({
                    type: 'auth_ok',
                    playerId: playerId,
                    balance: database.players[playerId].balance,
                    username: database.players[playerId].username,
                }));
                break;
                
            case 'create_room':
                if (!playerId) return;
                currentRoom = msg.roomId || ('R' + Math.random().toString(36).substring(2,6).toUpperCase());
                
                database.rooms[currentRoom] = {
                    id: currentRoom,
                    players: {},
                    createdAt: Date.now(),
                };
                
                database.rooms[currentRoom].players[playerId] = {
                    id: playerId,
                    username: msg.username || database.players[playerId]?.username || 'Player',
                    balance: database.players[playerId]?.balance || 1000,
                };
                
                saveDB();
                
                ws.send(JSON.stringify({
                    type: 'room_created',
                    roomId: currentRoom,
                    players: getRoomPlayers(currentRoom),
                }));
                break;
                
            case 'join_room':
                if (!playerId) return;
                currentRoom = msg.roomId;
                
                if (!database.rooms[currentRoom]) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Комната не найдена' }));
                    break;
                }
                
                database.rooms[currentRoom].players[playerId] = {
                    id: playerId,
                    username: msg.username || database.players[playerId]?.username || 'Player',
                    balance: database.players[playerId]?.balance || 1000,
                };
                
                saveDB();
                
                ws.send(JSON.stringify({
                    type: 'room_joined',
                    roomId: currentRoom,
                    players: getRoomPlayers(currentRoom),
                }));
                
                broadcastRoom(currentRoom, {
                    type: 'player_joined',
                    username: msg.username,
                    players: getRoomPlayers(currentRoom),
                });
                break;
        }
    });
    
    ws.on('close', () => {
        if (currentRoom && database.rooms[currentRoom]) {
            delete database.rooms[currentRoom].players[playerId];
            broadcastRoom(currentRoom, {
                type: 'player_left',
                players: getRoomPlayers(currentRoom),
            });
            if (Object.keys(database.rooms[currentRoom].players).length === 0) {
                delete database.rooms[currentRoom];
            }
            saveDB();
        }
        if (playerId) delete connections[playerId];
    });
});

function getRoomPlayers(roomId) {
    const room = database.rooms[roomId];
    if (!room) return [];
    return Object.values(room.players).map(p => ({
        id: p.id,
        username: p.username,
    }));
}

function broadcastRoom(roomId, message) {
    const room = database.rooms[roomId];
    if (!room) return;
    for (let pid in room.players) {
        const ws = connections[pid];
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
}

// ═══════════════════════════════════════
// ЗАПУСК
// ═══════════════════════════════════════
httpServer.listen(PORT, () => {
    console.log(`🃏 Сервер запущен на порту ${PORT}`);
    console.log(`🤖 Бот: @Bot`);
    console.log(`🌐 Health: http://localhost:${PORT}/health`);
    console.log(`📡 Webhook: http://localhost:${PORT}/webhook`);
    
    // Устанавливаем webhook
    const webhookUrl = `https://blackjack-server-x391.onrender.com/webhook`;
    
    https.request({
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
        method: 'GET'
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('📡 Webhook setup:', data);
        });
    }).end();
});
