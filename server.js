const https = require('https');
const http = require('http');
const fs = require('fs');

// ═══════════════════ КОНФИГ ═══════════════════
const PORT = process.env.PORT || 10000;
const BOT_TOKEN = '8190709618:AAECqs5XMc5RtfctgbPUdrGSZJj2pV6ZeoU';
const GAME_URL = 'https://sergeistjopkin-dotcom.github.io/blackjack-telegram-game/';
const DB_FILE = './blackjack_db.json';

// ═══════════════════ БАЗА ДАННЫХ ═══════════════════
let DB = { players: {}, leaderboard: [] };

try { if (fs.existsSync(DB_FILE)) DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
catch(e) { console.log('📦 Новая база'); }

function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2)); }

// Достижения
const ACHIEVEMENTS = {
  first_win: { name: '🎉 Первая победа', desc: 'Выиграть первую игру', icon: '🏆' },
  five_wins: { name: '🔥 Победная серия', desc: 'Выиграть 5 раз', icon: '🔥' },
  ten_wins: { name: '💎 Мастер блэкджека', desc: 'Выиграть 10 раз', icon: '💎' },
  blackjack: { name: '⭐ Натуральный блэкджек', desc: 'Собрать блэкджек (21)', icon: '⭐' },
  high_roller: { name: '💰 Хайроллер', desc: 'Поставить 100+ фишек', icon: '💰' },
  comeback: { name: '🔄 Камбэк', desc: 'Выиграть после проигрыша', icon: '🔄' },
  double_down: { name: '⚡ Дабл мастер', desc: 'Успешный Double Down', icon: '⚡' },
  insurance: { name: '🛡️ Застрахован', desc: 'Выиграть страховку', icon: '🛡️' },
  balance_5000: { name: '🏦 Банкир', desc: 'Накопить 5000 фишек', icon: '🏦' },
  daily_login: { name: '📅 Постоянный игрок', desc: 'Заходить 3 дня подряд', icon: '📅' }
};

function getPlayer(id) {
  if (!DB.players[id]) {
    DB.players[id] = {
      username: 'Player', balance: 1000, wins: 0, losses: 0, pushes: 0,
      blackjacks: 0, achievements: [], lastDaily: 0, loginStreak: 0, lastLogin: '',
      totalGames: 0
    };
    saveDB();
  }
  return DB.players[id];
}

function addAchievement(player, key) {
  if (!player.achievements.includes(key)) {
    player.achievements.push(key);
    return ACHIEVEMENTS[key];
  }
  return null;
}

function updateLeaderboard() {
  DB.leaderboard = Object.entries(DB.players)
    .map(([id, p]) => ({ id, username: p.username, wins: p.wins, balance: p.balance, achievements: p.achievements.length }))
    .sort((a, b) => b.wins - a.wins || b.balance - a.balance)
    .slice(0, 20);
  saveDB();
}

function claimDailyBonus(player) {
  const now = Date.now();
  const oneDay = 86400000;
  if (now - player.lastDaily < oneDay) {
    const hoursLeft = Math.ceil((oneDay - (now - player.lastDaily)) / 3600000);
    return { ok: false, hoursLeft };
  }
  
  player.lastDaily = now;
  player.loginStreak = (now - player.lastLogin < oneDay * 2) ? player.loginStreak + 1 : 1;
  player.lastLogin = now;
  
  const bonus = 100 + (player.loginStreak > 1 ? player.loginStreak * 10 : 0);
  player.balance += bonus;
  
  if (player.loginStreak >= 3) addAchievement(player, 'daily_login');
  
  saveDB();
  return { ok: true, bonus, streak: player.loginStreak };
}

// ═══════════════════ TELEGRAM BOT ═══════════════════
function sendMessage(chatId, text, keyboard = null) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: keyboard });
    const req = https.request({
      hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendMessage`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.write(body); req.end();
  });
}

function getMainKeyboard() {
  return { inline_keyboard: [
    [{ text: '🎮 ИГРАТЬ', web_app: { url: GAME_URL } }],
    [{ text: '🏆 Таблица лидеров', callback_data: 'leaderboard' }],
    [{ text: '🎖️ Достижения', callback_data: 'achievements' }, { text: '💰 Баланс', callback_data: 'balance' }],
    [{ text: '🎁 Ежедневный бонус', callback_data: 'daily' }],
    [{ text: '📋 Правила', callback_data: 'rules' }, { text: '❓ Помощь', callback_data: 'help' }]
  ]};
}

async function handleStart(chatId, userInfo) {
  const p = getPlayer(userInfo.id.toString());
  p.username = userInfo.username || userInfo.first_name || 'Player';
  saveDB();
  
  const text = `🎰 <b>BLACKJACK 21 — ПРЕМИУМ</b> 🃏\n\n` +
    `Привет, <b>${p.username}</b>!\n\n` +
    `💰 Баланс: <b>${p.balance} фишек</b>\n` +
    `🏆 Побед: <b>${p.wins}</b> | Игр: <b>${p.totalGames}</b>\n` +
    `🎖️ Достижений: <b>${p.achievements.length}/10</b>\n\n` +
    `🎁 <b>Ежедневный бонус ждёт!</b>\n\n` +
    `Нажми <b>🎮 ИГРАТЬ</b> чтобы начать!`;
  
  await sendMessage(chatId, text, getMainKeyboard());
}

async function handleLeaderboard(chatId) {
  updateLeaderboard();
  const top = DB.leaderboard.slice(0, 10);
  let text = '🏆 <b>ТАБЛИЦА ЛИДЕРОВ</b>\n\n';
  top.forEach((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    text += `${medal} <b>${p.username}</b> — ${p.wins} побед | 🪙${p.balance} | 🎖️${p.achievements}\n`;
  });
  if (!top.length) text += 'Пока нет игроков. Стань первым!';
  await sendMessage(chatId, text, { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'start' }]] });
}

async function handleAchievements(chatId, userId) {
  const p = getPlayer(userId);
  let text = '🎖️ <b>ВАШИ ДОСТИЖЕНИЯ</b>\n\n';
  let count = 0;
  for (let key in ACHIEVEMENTS) {
    const a = ACHIEVEMENTS[key];
    const unlocked = p.achievements.includes(key);
    text += `${unlocked ? '✅' : '🔒'} ${a.icon} <b>${a.name}</b> — ${a.desc}\n`;
    if (unlocked) count++;
  }
  text += `\n🎯 Прогресс: <b>${count}/10</b>`;
  await sendMessage(chatId, text, { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'start' }]] });
}

async function handleBalance(chatId, userId) {
  const p = getPlayer(userId);
  const text = `💰 <b>БАЛАНС</b>\n\n` +
    `🪙 Фишек: <b>${p.balance}</b>\n` +
    `🏆 Побед: <b>${p.wins}</b>\n` +
    `💀 Поражений: <b>${p.losses}</b>\n` +
    `🤝 Ничьих: <b>${p.pushes}</b>\n` +
    `⭐ Блэкджеков: <b>${p.blackjacks}</b>\n` +
    `🎮 Всего игр: <b>${p.totalGames}</b>\n` +
    `📅 Дней подряд: <b>${p.loginStreak}</b>`;
  await sendMessage(chatId, text, { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'start' }]] });
}

async function handleDaily(chatId, userId) {
  const p = getPlayer(userId);
  const result = claimDailyBonus(p);
  if (result.ok) {
    const text = `🎁 <b>ЕЖЕДНЕВНЫЙ БОНУС!</b>\n\n` +
      `+${result.bonus} фишек!\n` +
      `📅 Серия: ${result.streak} дней\n` +
      `💰 Новый баланс: <b>${p.balance}</b>`;
    await sendMessage(chatId, text, getMainKeyboard());
  } else {
    await sendMessage(chatId, `⏰ Бонус будет доступен через <b>${result.hoursLeft} ч.</b>\nПриходите позже!`, getMainKeyboard());
  }
}
// ═══════════════════ WEBSOCKET ДЛЯ МУЛЬТИПЛЕЕРА ═══════════════════
const WebSocket = require('ws');

let gameRooms = {};

// WebSocket будет создан ПОСЛЕ основного сервера
function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws) => {
    let playerId = null;
    let currentRoom = null;
    
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch(e) { return; }
      
      if (msg.type === 'join_multi') {
        playerId = msg.userId;
        currentRoom = msg.roomId;
        
        if (!gameRooms[currentRoom]) {
          gameRooms[currentRoom] = {
            id: currentRoom,
            players: {},
            host: playerId,
            createdAt: Date.now()
          };
        }
        
        if (Object.keys(gameRooms[currentRoom].players).length >= 4) {
          ws.send(JSON.stringify({ type: 'error', message: 'Комната заполнена' }));
          return;
        }
        
        gameRooms[currentRoom].players[playerId] = {
          id: playerId,
          username: msg.username,
          ws: ws
        };
        
        broadcastMulti(currentRoom, {
          type: 'room_update',
          players: Object.values(gameRooms[currentRoom].players).map(p => ({ id: p.id, username: p.username }))
        });
        
        ws.send(JSON.stringify({
          type: 'joined_room',
          roomId: currentRoom,
          players: Object.values(gameRooms[currentRoom].players).map(p => ({ id: p.id, username: p.username }))
        }));
      }
      
      if (msg.type === 'leave_room') {
        if (currentRoom && gameRooms[currentRoom]) {
          delete gameRooms[currentRoom].players[playerId];
          broadcastMulti(currentRoom, {
            type: 'room_update',
            players: Object.values(gameRooms[currentRoom].players).map(p => ({ id: p.id, username: p.username }))
          });
        }
      }
    });
    
    ws.on('close', () => {
      if (currentRoom && gameRooms[currentRoom]) {
        delete gameRooms[currentRoom].players[playerId];
      }
    });
  });
  
  return wss;
}

function broadcastMulti(roomId, message) {
  const room = gameRooms[roomId];
  if (!room) return;
  for (let pid in room.players) {
    const p = room.players[pid];
    if (p.ws && p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(message));
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (let roomId in gameRooms) {
    if (now - gameRooms[roomId].createdAt > 3600000) {
      delete gameRooms[roomId];
    }
  }
}, 3600000);

wsServer.on('connection', (ws) => {
  let playerId = null;
  let currentRoom = null;
  
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }
    
    switch(msg.type) {
      case 'join_multi':
        playerId = msg.userId;
        currentRoom = msg.roomId;
        
        if (!gameRooms[currentRoom]) {
          gameRooms[currentRoom] = {
            id: currentRoom,
            players: {},
            host: playerId,
            createdAt: Date.now()
          };
        }
        
        if (Object.keys(gameRooms[currentRoom].players).length >= 4) {
          ws.send(JSON.stringify({ type: 'error', message: 'Комната заполнена' }));
          return;
        }
        
        gameRooms[currentRoom].players[playerId] = {
          id: playerId,
          username: msg.username,
          ws: ws
        };
        
        broadcastMulti(currentRoom, {
          type: 'room_update',
          players: Object.values(gameRooms[currentRoom].players).map(p => ({ id: p.id, username: p.username }))
        });
        
        ws.send(JSON.stringify({
          type: 'joined_room',
          roomId: currentRoom,
          players: Object.values(gameRooms[currentRoom].players).map(p => ({ id: p.id, username: p.username }))
        }));
        break;
        
      case 'leave_room':
        if (currentRoom && gameRooms[currentRoom]) {
          delete gameRooms[currentRoom].players[playerId];
          broadcastMulti(currentRoom, {
            type: 'room_update',
            players: Object.values(gameRooms[currentRoom].players).map(p => ({ id: p.id, username: p.username }))
          });
          if (Object.keys(gameRooms[currentRoom].players).length === 0) {
            delete gameRooms[currentRoom];
          }
        }
        break;
    }
  });
  
  ws.on('close', () => {
    if (currentRoom && gameRooms[currentRoom]) {
      delete gameRooms[currentRoom].players[playerId];
    }
  });
});

function broadcastMulti(roomId, message) {
  const room = gameRooms[roomId];
  if (!room) return;
  for (let pid in room.players) {
    const p = room.players[pid];
    if (p.ws && p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(message));
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (let roomId in gameRooms) {
    if (now - gameRooms[roomId].createdAt > 3600000) {
      delete gameRooms[roomId];
    }
  }
}, 3600000);

console.log('🎮 WebSocket для мультиплеера запущен на порту 8080');

// ═══════════════════ HTTP + WEBHOOK ═══════════════════
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({status:'online',players:Object.keys(DB.players).length}));
    return;
  }
  
  if (req.url === '/api/player' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { action, userId, data } = JSON.parse(body);
        const p = getPlayer(userId);
        let result = {};
        
        switch(action) {
          case 'get': result = p; break;
          case 'updateBalance': p.balance = data.balance; saveDB(); result = p; break;
          case 'recordGame':
            p.totalGames++;
            if (data.result === 'win') { p.wins++; if (p.wins >= 10) addAchievement(p, 'ten_wins'); else if (p.wins >= 5) addAchievement(p, 'five_wins'); else if (p.wins === 1) addAchievement(p, 'first_win'); }
            else if (data.result === 'loss') p.losses++;
            else p.pushes++;
            if (data.blackjack) { p.blackjacks++; addAchievement(p, 'blackjack'); }
            if (data.balance >= 5000) addAchievement(p, 'balance_5000');
            if (data.newAchievements) data.newAchievements.forEach(a => addAchievement(p, a));
            p.balance = data.balance;
            saveDB();
            updateLeaderboard();
            result = p;
            break;
          case 'daily': result = claimDailyBonus(p); break;
          case 'leaderboard': updateLeaderboard(); result = DB.leaderboard.slice(0, 10); break;
        }
        
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify(result));
      } catch(e) { res.writeHead(400); res.end(JSON.stringify({error:e.message})); }
    });
    return;
  }
  
  if (req.url === '/webhook' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        if (update.message?.text) {
          const m = update.message, chatId = m.chat.id, uid = m.from.id.toString();
          if (m.text === '/start') await handleStart(chatId, m.from);
          else if (m.text === '/leaderboard') await handleLeaderboard(chatId);
        }
        if (update.callback_query) {
          const cb = update.callback_query, chatId = cb.message.chat.id, uid = cb.from.id.toString();
          https.get(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery?callback_query_id=${cb.id}`);
          if (cb.data === 'start') await handleStart(chatId, cb.from);
          else if (cb.data === 'leaderboard') await handleLeaderboard(chatId);
          else if (cb.data === 'achievements') await handleAchievements(chatId, uid);
          else if (cb.data === 'balance') await handleBalance(chatId, uid);
          else if (cb.data === 'daily') await handleDaily(chatId, uid);
          else if (cb.data === 'rules') await sendMessage(chatId, '📋 <b>ПРАВИЛА</b>\n\n🎯 Цель: набрать 21\n🃏 Туз = 1/11\n👔 Дилер берёт до 17\n\n💰 Выплаты:\nБлэкджек: 3:2\nВыигрыш: 1:1\nСтраховка: 2:1', {inline_keyboard:[[{text:'🔙 Назад',callback_data:'start'}]]});
          else if (cb.data === 'help') await sendMessage(chatId, '❓ <b>ПОМОЩЬ</b>\n\nНажми 🎮 ИГРАТЬ\nПройди квиз\nДелай ставки!', {inline_keyboard:[[{text:'🔙 Назад',callback_data:'start'}]]});
        }
        res.writeHead(200); res.end('OK');
      } catch(e) { res.writeHead(200); res.end('OK'); }
    });
    return;
  }
  res.writeHead(404); res.end('Not found');
});

// Подключаем WebSocket к серверу
const wss = setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`🟢 Сервер на порту ${PORT} (HTTP + WebSocket)`);
  https.get(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=https://blackjack-server-x391.onrender.com/webhook`, (res) => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => console.log('📡 Webhook:', d));
  });
});
