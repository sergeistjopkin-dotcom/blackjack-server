const https = require('https');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = '8190709618:AAECqs5XMc5RtfctgbPUdrGSZJj2pV6ZeoU';
const GAME_URL = 'https://sergeistjopkin-dotcom.github.io/blackjack-telegram-game/';
const DB_FILE = './blackjack_db.json';

let DB = { players: {}, leaderboard: [] };
try { if (fs.existsSync(DB_FILE)) DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) {}
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2)); }

let gameRooms = {};

const ACHIEVEMENTS = {
  first_win: { name: '🎉 Первая победа', desc: 'Выиграть первую игру', icon: '🏆' },
  five_wins: { name: '🔥 Победная серия', desc: 'Выиграть 5 раз', icon: '🔥' },
  ten_wins: { name: '💎 Мастер', desc: 'Выиграть 10 раз', icon: '💎' },
  blackjack: { name: '⭐ Блэкджек', desc: 'Собрать 21', icon: '⭐' },
  high_roller: { name: '💰 Хайроллер', desc: 'Ставка 100+', icon: '💰' },
  comeback: { name: '🔄 Камбэк', desc: 'Выиграть после проигрыша', icon: '🔄' },
  double_down: { name: '⚡ Дабл', desc: 'Успешный Double Down', icon: '⚡' },
  insurance: { name: '🛡️ Страховка', desc: 'Выиграть страховку', icon: '🛡️' },
  balance_5000: { name: '🏦 Банкир', desc: '5000 фишек', icon: '🏦' },
  daily_login: { name: '📅 Завсегдатай', desc: '3 дня подряд', icon: '📅' }
};

function getPlayer(id) {
  if (!DB.players[id]) {
    DB.players[id] = { username: 'Player', balance: 1000, wins: 0, losses: 0, pushes: 0, blackjacks: 0, achievements: [], lastDaily: 0, loginStreak: 0, lastLogin: '', totalGames: 0 };
    saveDB();
  }
  return DB.players[id];
}

function addAchievement(p, key) {
  if (!p.achievements.includes(key)) { p.achievements.push(key); return ACHIEVEMENTS[key]; }
  return null;
}

function updateLeaderboard() {
  DB.leaderboard = Object.entries(DB.players).map(([id,p]) => ({id,username:p.username,wins:p.wins,balance:p.balance,achievements:p.achievements.length})).sort((a,b) => b.wins-a.wins||b.balance-a.balance).slice(0,20);
  saveDB();
}

function claimDailyBonus(p) {
  const now = Date.now(), oneDay = 86400000;
  if (now - p.lastDaily < oneDay) return { ok: false, hoursLeft: Math.ceil((oneDay-(now-p.lastDaily))/3600000) };
  p.lastDaily = now;
  p.loginStreak = (now - p.lastLogin < oneDay*2) ? p.loginStreak+1 : 1;
  p.lastLogin = now;
  const bonus = 100 + (p.loginStreak>1 ? p.loginStreak*10 : 0);
  p.balance += bonus;
  if (p.loginStreak >= 3) addAchievement(p, 'daily_login');
  saveDB();
  return { ok: true, bonus, streak: p.loginStreak };
}

function sendMessage(chatId, text, kb=null) {
  return new Promise(resolve => {
    const body = JSON.stringify({chat_id:chatId,text,parse_mode:'HTML',reply_markup:kb});
    const req = https.request({hostname:'api.telegram.org',path:`/bot${BOT_TOKEN}/sendMessage`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}}, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.write(body); req.end();
  });
}

function getMainKeyboard() {
  return { inline_keyboard: [[{text:'🎮 ИГРАТЬ',web_app:{url:GAME_URL}}],[{text:'🏆 Лидеры',callback_data:'leaderboard'}],[{text:'🎖️ Достижения',callback_data:'achievements'},{text:'💰 Баланс',callback_data:'balance'}],[{text:'🎁 Бонус',callback_data:'daily'}],[{text:'📋 Правила',callback_data:'rules'},{text:'❓ Помощь',callback_data:'help'}]] };
}

async function handleStart(chatId, userInfo) {
  const p = getPlayer(userInfo.id.toString());
  p.username = userInfo.username || userInfo.first_name || 'Player';
  saveDB();
  await sendMessage(chatId, `🎰 <b>BLACKJACK 21</b>\n\nПривет, <b>${p.username}</b>!\n💰 Баланс: <b>${p.balance}</b>\n🏆 Побед: <b>${p.wins}</b>\n\nНажми 🎮 ИГРАТЬ!`, getMainKeyboard());
}

async function handleLeaderboard(chatId) {
  updateLeaderboard();
  const top = DB.leaderboard.slice(0,10);
  let text = '🏆 <b>ЛИДЕРЫ</b>\n\n';
  top.forEach((p,i) => text += `${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1+'.'} <b>${p.username}</b> — ${p.wins} побед\n`);
  await sendMessage(chatId, text, {inline_keyboard:[[{text:'🔙 Назад',callback_data:'start'}]]});
}

async function handleAchievements(chatId, userId) {
  const p = getPlayer(userId);
  let text = '🎖️ <b>ДОСТИЖЕНИЯ</b>\n\n';
  for (let k in ACHIEVEMENTS) text += `${p.achievements.includes(k)?'✅':'🔒'} ${ACHIEVEMENTS[k].icon} ${ACHIEVEMENTS[k].name}\n`;
  await sendMessage(chatId, text, {inline_keyboard:[[{text:'🔙 Назад',callback_data:'start'}]]});
}

async function handleBalance(chatId, userId) {
  const p = getPlayer(userId);
  await sendMessage(chatId, `💰 Баланс: <b>${p.balance}</b>\n🏆 Побед: ${p.wins}\n💀 Поражений: ${p.losses}\n⭐ Блэкджеков: ${p.blackjacks}`, {inline_keyboard:[[{text:'🔙 Назад',callback_data:'start'}]]});
}

async function handleDaily(chatId, userId) {
  const p = getPlayer(userId);
  const r = claimDailyBonus(p);
  if (r.ok) await sendMessage(chatId, `🎁 +${r.bonus} фишек!\n📅 Серия: ${r.streak} дн.\n💰 Баланс: ${p.balance}`, getMainKeyboard());
  else await sendMessage(chatId, `⏰ Бонус через ${r.hoursLeft} ч.`);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  
  if (req.url === '/health') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({status:'online',rooms:Object.keys(gameRooms).length}));
    return;
  }
  
  if (req.url === '/api/player' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { action, userId, data } = JSON.parse(body);
        const p = getPlayer(userId); let result = {};
        switch(action) {
          case 'get': result = p; break;
          case 'recordGame':
            p.totalGames++;
            if (data.result==='win') { p.wins++; if(p.wins>=10)addAchievement(p,'ten_wins'); else if(p.wins>=5)addAchievement(p,'five_wins'); else if(p.wins===1)addAchievement(p,'first_win'); }
            else if (data.result==='loss') p.losses++; else p.pushes++;
            if (data.blackjack) { p.blackjacks++; addAchievement(p,'blackjack'); }
            if (data.balance >= 5000) addAchievement(p,'balance_5000');
            p.balance = data.balance;
            saveDB(); updateLeaderboard();
            result = p;
            break;
          case 'daily': result = claimDailyBonus(p); break;
          case 'leaderboard': updateLeaderboard(); result = DB.leaderboard.slice(0,10); break;
        }
        res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(result));
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
        }
        if (update.callback_query) {
          const cb = update.callback_query, chatId = cb.message.chat.id, uid = cb.from.id.toString();
          https.get(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery?callback_query_id=${cb.id}`);
          if (cb.data==='start') await handleStart(chatId, cb.from);
          else if (cb.data==='leaderboard') await handleLeaderboard(chatId);
          else if (cb.data==='achievements') await handleAchievements(chatId, uid);
          else if (cb.data==='balance') await handleBalance(chatId, uid);
          else if (cb.data==='daily') await handleDaily(chatId, uid);
          else if (cb.data==='rules') await sendMessage(chatId, '📋 Блэкджек: набрать 21\nТуз=1/11\nДилер до 17\nВыплаты: BJ 3:2', {inline_keyboard:[[{text:'🔙 Назад',callback_data:'start'}]]});
          else if (cb.data==='help') await sendMessage(chatId, '❓ Нажми 🎮 ИГРАТЬ\nПройди квиз\nИграй!', {inline_keyboard:[[{text:'🔙 Назад',callback_data:'start'}]]});
        }
        res.writeHead(200); res.end('OK');
      } catch(e) { res.writeHead(200); res.end('OK'); }
    });
    return;
  }
  res.writeHead(404); res.end('Not found');
});

// WebSocket
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  let playerId = null, currentRoom = null;
  console.log('🔗 WebSocket подключение');
  
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }
    console.log('📨', msg.type);
    
    if (msg.type === 'join_multi') {
      playerId = msg.userId; currentRoom = msg.roomId;
      if (!gameRooms[currentRoom]) {
        gameRooms[currentRoom] = { id: currentRoom, players: {}, host: playerId, createdAt: Date.now() };
        console.log('🏠 Комната создана:', currentRoom);
      }
      if (Object.keys(gameRooms[currentRoom].players).length >= 4) {
        ws.send(JSON.stringify({ type: 'error', message: 'Комната заполнена' })); return;
      }
      gameRooms[currentRoom].players[playerId] = { id: playerId, username: msg.username, ws };
      const players = Object.values(gameRooms[currentRoom].players).map(p => ({ id: p.id, username: p.username }));
      ws.send(JSON.stringify({ type: 'joined_room', roomId: currentRoom, players }));
      broadcastRoom(currentRoom, { type: 'room_update', players });
    }
    
    if (msg.type === 'leave_room') {
      if (currentRoom && gameRooms[currentRoom]) {
        delete gameRooms[currentRoom].players[playerId];
        const players = Object.values(gameRooms[currentRoom].players).map(p => ({ id: p.id, username: p.username }));
        broadcastRoom(currentRoom, { type: 'room_update', players });
        if (Object.keys(gameRooms[currentRoom].players).length === 0) delete gameRooms[currentRoom];
      }
    }
  });
  
  ws.on('close', () => {
    if (currentRoom && gameRooms[currentRoom]) {
      delete gameRooms[currentRoom].players[playerId];
      broadcastRoom(currentRoom, { type: 'room_update', players: Object.values(gameRooms[currentRoom].players).map(p => ({ id: p.id, username: p.username })) });
    }
  });
});

function broadcastRoom(roomId, msg) {
  const room = gameRooms[roomId];
  if (!room) return;
  const data = JSON.stringify(msg);
  for (let pid in room.players) {
    if (room.players[pid].ws?.readyState === 1) room.players[pid].ws.send(data);
  }
}

setInterval(() => { const now = Date.now(); for (let id in gameRooms) { if (now - gameRooms[id].createdAt > 3600000) delete gameRooms[id]; } }, 3600000);

server.listen(PORT, () => {
  console.log(`🟢 Сервер на порту ${PORT}`);
  https.get(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=https://blackjack-server-x391.onrender.com/webhook`, res => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => console.log('📡 Webhook:', d));
  });
});
