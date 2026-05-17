const WebSocket = require('ws');
const crypto = require('crypto');

// ============================================
// БАЗА ДАННЫХ В ПАМЯТИ (сохраняется в файл)
// ============================================
const fs = require('fs');
const DB_FILE = './blackjack_db.json';

let database = {
    players: {},  // {telegramId: {username, balance, gamesPlayed, wins}}
    rooms: {},    // {roomId: {players, gameState, createdAt}}
};

// Загружаем базу при старте
try {
    if (fs.existsSync(DB_FILE)) {
        database = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log('✅ Database loaded');
    }
} catch (e) {
    console.log('📦 New database created');
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2));
}

// ============================================
// ИГРОВАЯ ЛОГИКА (та же что у тебя)
// ============================================
function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let deck = [];
    for (let d = 0; d < 6; d++) {
        for (let s of suits) {
            for (let v of values) {
                deck.push({ value: v, suit: s });
            }
        }
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function cardValue(card) {
    if (card.value === 'A') return 11;
    if (['J', 'Q', 'K'].includes(card.value)) return 10;
    return parseInt(card.value);
}

function handValue(cards) {
    let value = 0, aces = 0;
    for (let c of cards) {
        if (c.value === 'A') { aces++; value += 11; }
        else if (['J', 'Q', 'K'].includes(c.value)) value += 10;
        else value += parseInt(c.value);
    }
    while (value > 21 && aces > 0) { value -= 10; aces--; }
    return value;
}

// ============================================
// КОМНАТЫ (Rooms)
// ============================================
function createRoom(roomId, hostId) {
    database.rooms[roomId] = {
        id: roomId,
        players: {},
        gameState: {
            phase: 'waiting',  // waiting, betting, playing, dealer, results
            dealer: [],
            deck: [],
            currentPlayer: null,
        },
        createdAt: Date.now(),
        hostId: hostId,
    };
    return database.rooms[roomId];
}

function joinRoom(roomId, playerId, username) {
    if (!database.rooms[roomId]) return null;
    if (Object.keys(database.rooms[roomId].players).length >= 4) return null;
    
    // Проверяем есть ли игрок в базе
    if (!database.players[playerId]) {
        database.players[playerId] = {
            username: username,
            balance: 1000,
            gamesPlayed: 0,
            wins: 0,
            createdAt: Date.now(),
        };
    }
    
    database.rooms[roomId].players[playerId] = {
        id: playerId,
        username: username,
        hands: [],
        bets: [],
        currentHand: 0,
        balance: database.players[playerId].balance,
        connected: true,
    };
    
    saveDB();
    return database.rooms[roomId];
}

function leaveRoom(roomId, playerId) {
    if (!database.rooms[roomId]) return;
    delete database.rooms[roomId].players[playerId];
    
    // Если комната пуста - удаляем
    if (Object.keys(database.rooms[roomId].players).length === 0) {
        delete database.rooms[roomId];
    }
    
    saveDB();
}

function broadcastRoom(roomId, message) {
    const room = database.rooms[roomId];
    if (!room) return;
    
    const data = JSON.stringify(message);
    for (let playerId in room.players) {
        const ws = connections[playerId];
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    }
}

function sendToPlayer(playerId, message) {
    const ws = connections[playerId];
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

// ============================================
// WebSocket СЕРВЕР
// ============================================
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });
const connections = {};

console.log(`🎰 Blackjack Server running on port ${PORT}`);

wss.on('connection', (ws) => {
    let playerId = null;
    let currentRoom = null;
    
    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        
        switch (msg.type) {
            
            // ══════ АУТЕНТИФИКАЦИЯ ══════
            case 'auth':
                // Проверяем Telegram данные
                playerId = msg.telegramId || crypto.randomUUID();
                const username = msg.username || 'Player';
                
                // Отправляем подтверждение
                sendToPlayer(playerId, {
                    type: 'auth_ok',
                    playerId: playerId,
                    balance: database.players[playerId]?.balance || 1000,
                });
                
                connections[playerId] = ws;
                console.log(`👤 ${username} connected`);
                break;
            
            // ══════ КОМНАТЫ ══════
            case 'create_room':
                currentRoom = msg.roomId || crypto.randomUUID().slice(0, 6).toUpperCase();
                createRoom(currentRoom, playerId);
                joinRoom(currentRoom, playerId, msg.username);
                
                sendToPlayer(playerId, {
                    type: 'room_created',
                    roomId: currentRoom,
                    inviteLink: `https://t.me/ВАШ_БОТ?start=${currentRoom}`,
                });
                
                broadcastRoom(currentRoom, {
                    type: 'room_update',
                    players: Object.values(database.rooms[currentRoom].players).map(p => ({
                        id: p.id,
                        username: p.username,
                    })),
                });
                break;
            
            case 'join_room':
                currentRoom = msg.roomId;
                const room = joinRoom(currentRoom, playerId, msg.username);
                
                if (!room) {
                    sendToPlayer(playerId, { type: 'error', message: 'Комната не найдена или заполнена' });
                    break;
                }
                
                sendToPlayer(playerId, { type: 'room_joined', roomId: currentRoom });
                
                broadcastRoom(currentRoom, {
                    type: 'room_update',
                    players: Object.values(room.players).map(p => ({
                        id: p.id,
                        username: p.username,
                    })),
                });
                break;
            
            // ══════ ИГРОВЫЕ ДЕЙСТВИЯ ══════
            case 'place_bet':
                if (!currentRoom) break;
                const room2 = database.rooms[currentRoom];
                const player2 = room2.players[playerId];
                if (!player2) break;
                
                // Списываем ставку
                player2.bets = [msg.amount];
                player2.balance -= msg.amount;
                
                broadcastRoom(currentRoom, {
                    type: 'bet_placed',
                    playerId: playerId,
                    username: player2.username,
                    amount: msg.amount,
                });
                break;
            
            case 'start_game':
                if (!currentRoom) break;
                const room3 = database.rooms[currentRoom];
                
                // Раздаём карты
                const deck = createDeck();
                room3.gameState = {
                    phase: 'playing',
                    dealer: [deck.pop(), deck.pop()],
                    deck: deck,
                    currentPlayer: Object.keys(room3.players)[0],
                };
                
                for (let pid in room3.players) {
                    room3.players[pid].hands = [[deck.pop(), deck.pop()]];
                    room3.players[pid].currentHand = 0;
                }
                
                broadcastRoom(currentRoom, {
                    type: 'game_started',
                    players: Object.values(room3.players).map(p => ({
                        id: p.id,
                        username: p.username,
                        cards: p.hands[0],
                        value: handValue(p.hands[0]),
                    })),
                    dealer: [room3.gameState.dealer[0], { hidden: true }],
                });
                break;
            
            case 'hit':
                if (!currentRoom) break;
                const room4 = database.rooms[currentRoom];
                const player4 = room4.players[playerId];
                const newCard = room4.gameState.deck.pop();
                player4.hands[player4.currentHand].push(newCard);
                
                broadcastRoom(currentRoom, {
                    type: 'player_hit',
                    playerId: playerId,
                    card: newCard,
                    value: handValue(player4.hands[player4.currentHand]),
                    bust: handValue(player4.hands[player4.currentHand]) > 21,
                });
                break;
            
            case 'stand':
                if (!currentRoom) break;
                broadcastRoom(currentRoom, {
                    type: 'player_stand',
                    playerId: playerId,
                });
                break;
            
            case 'double':
                if (!currentRoom) break;
                const room5 = database.rooms[currentRoom];
                const player5 = room5.players[playerId];
                player5.balance -= player5.bets[0];
                player5.bets[0] *= 2;
                const doubleCard = room5.gameState.deck.pop();
                player5.hands[player5.currentHand].push(doubleCard);
                
                broadcastRoom(currentRoom, {
                    type: 'player_double',
                    playerId: playerId,
                    card: doubleCard,
                    value: handValue(player5.hands[player5.currentHand]),
                    bet: player5.bets[0],
                });
                break;
            
            case 'leave_room':
                leaveRoom(currentRoom, playerId);
                currentRoom = null;
                sendToPlayer(playerId, { type: 'left_room' });
                break;
        }
    });
    
    ws.on('close', () => {
        if (currentRoom) {
            leaveRoom(currentRoom, playerId);
            broadcastRoom(currentRoom, {
                type: 'player_disconnected',
                playerId: playerId,
            });
        }
        if (playerId) {
            delete connections[playerId];
        }
        console.log(`👋 Player disconnected: ${playerId}`);
    });
});

// Очистка старых комнат каждые 30 минут
setInterval(() => {
    const now = Date.now();
    for (let roomId in database.rooms) {
        if (now - database.rooms[roomId].createdAt > 3600000) { // 1 час
            delete database.rooms[roomId];
        }
    }
    saveDB();
}, 1800000);

console.log('🃏 Blackjack Server Ready!');