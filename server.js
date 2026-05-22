const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 提供 public 資料夾的靜態檔案
app.use(express.static(path.join(__dirname, 'public')));

// 儲存所有房間的狀態
// 結構: { [roomId]: { hostId, players: [{ id, name, buzzTime }], status: 'lobby'|'countdown'|'active', activeTime: null, buzzes: [] } }
const rooms = new Map();

// 產生隨機的 4 位數房間號碼
function generateRoomId() {
  let roomId;
  do {
    roomId = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(roomId));
  return roomId;
}

io.on('connection', (socket) => {
  console.log(`連線已建立: ${socket.id}`);

  // 1. 房主建立房間
  socket.on('create-room', () => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      hostId: socket.id,
      players: [],
      status: 'lobby', // lobby, countdown, active
      activeTime: null,
      buzzes: []
    });

    socket.join(roomId);
    socket.roomId = roomId;
    socket.isHost = true;

    socket.emit('room-created', { roomId });
    console.log(`房主 ${socket.id} 建立了房間: ${roomId}`);
  });

  // 2. 玩家加入房間
  socket.on('join-room', ({ roomId, name }) => {
    const cleanRoomId = roomId.trim();
    const cleanName = name.trim();

    if (!rooms.has(cleanRoomId)) {
      return socket.emit('join-error', '找不到此房間號碼，請確認後再試！');
    }

    const room = rooms.get(cleanRoomId);
    
    // 檢查名字是否重複
    const nameExists = room.players.some(p => p.name === cleanName);
    if (nameExists) {
      return socket.emit('join-error', '此名字已有人使用，請換一個名字！');
    }

    // 加入玩家列表
    const player = {
      id: socket.id,
      name: cleanName,
      score: 0,
      joinedAt: Date.now()
    };
    room.players.push(player);

    socket.join(cleanRoomId);
    socket.roomId = cleanRoomId;
    socket.isHost = false;
    socket.playerName = cleanName;

    socket.emit('join-success', { roomId: cleanRoomId, name: cleanName });
    
    // 通知房間所有人（特別是房主）玩家列表更新
    io.to(cleanRoomId).emit('players-updated', room.players);
    console.log(`玩家 ${cleanName} (${socket.id}) 加入了房間 ${cleanRoomId}`);
  });

  // 3. 房主開始倒數
  socket.on('start-game', () => {
    const roomId = socket.roomId;
    if (!roomId || !socket.isHost) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // 重設搶答狀態
    room.status = 'countdown';
    room.activeTime = null;
    room.buzzes = [];

    // 發送通知給所有人開始倒數 3 秒
    // 傳送伺服器當前時間以利時間同步
    const serverTime = Date.now();
    io.to(roomId).emit('game-starting', { serverTime, countdownMs: 3000 });
    console.log(`房間 ${roomId} 開始倒數`);

    // 3 秒後開啟搶答功能
    setTimeout(() => {
      const currentRoom = rooms.get(roomId);
      if (currentRoom && currentRoom.status === 'countdown') {
        currentRoom.status = 'active';
        currentRoom.activeTime = Date.now();
        io.to(roomId).emit('buzzer-active', { activeTime: currentRoom.activeTime });
        console.log(`房間 ${roomId} 搶答按鈕已啟用`);
      }
    }, 3000);
  });

  // 4. 玩家按下搶答按鈕
  socket.on('buzz', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.status !== 'active') {
      // 若尚未開始或已結束，則不處理（或者可以回傳搶答無效）
      return socket.emit('buzz-failed', '搶答尚未開始或已結束！');
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // 檢查此玩家是否已經按過
    const alreadyBuzzed = room.buzzes.some(b => b.id === socket.id);
    if (alreadyBuzzed) return;

    const buzzTime = Date.now();
    const elapsed = buzzTime - room.activeTime; // 反應時間（毫秒）

    const buzzRecord = {
      id: player.id,
      name: player.name,
      time: buzzTime,
      elapsed: elapsed // 反應毫秒數
    };

    room.buzzes.push(buzzRecord);

    // 即時廣播目前搶答排序給所有人（房主與玩家）
    io.to(roomId).emit('buzz-updated', room.buzzes);
    console.log(`房間 ${roomId} - 玩家 ${player.name} 搶答成功，反應時間: ${elapsed}ms`);
  });

  // 5. 房主判定：答對
  socket.on('answer-correct', ({ playerId }) => {
    const roomId = socket.roomId;
    if (!roomId || !socket.isHost) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.score += 1;
      // 廣播答對消息給所有人，並附帶更新後的玩家清單（包含分數）
      io.to(roomId).emit('answer-result', { playerId, name: player.name, result: 'correct', players: room.players });
      io.to(roomId).emit('players-updated', room.players);
      console.log(`房間 ${roomId} - 玩家 ${player.name} 答對了！目前分數: ${player.score}`);
    }
  });

  // 6. 房主判定：答錯
  socket.on('answer-incorrect', ({ playerId }) => {
    const roomId = socket.roomId;
    if (!roomId || !socket.isHost) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (player) {
      // 廣播答錯消息給所有人
      io.to(roomId).emit('answer-result', { playerId, name: player.name, result: 'incorrect' });
      
      // 答錯後，自動將該玩家從搶答隊伍（buzzes）中移出
      // 如此一來，搶答名單中的下一位玩家會自動遞補為第一位
      room.buzzes = room.buzzes.filter(b => b.id !== playerId);
      io.to(roomId).emit('buzz-updated', room.buzzes);
      console.log(`房間 ${roomId} - 玩家 ${player.name} 答錯，機會遞補給下一位`);
    }
  });

  // 7. 房主重設所有玩家分數
  socket.on('reset-scores', () => {
    const roomId = socket.roomId;
    if (!roomId || !socket.isHost) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.players.forEach(p => p.score = 0);
    io.to(roomId).emit('players-updated', room.players);
    console.log(`房間 ${roomId} - 房主重設了所有玩家的分數`);
  });

  // 8. 房主重設搶答
  socket.on('reset-game', () => {
    const roomId = socket.roomId;
    if (!roomId || !socket.isHost) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.status = 'lobby';
    room.activeTime = null;
    room.buzzes = [];

    io.to(roomId).emit('game-reset');
    console.log(`房間 ${roomId} 已由房主重設`);
  });

  // 6. 斷線處理
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    if (socket.isHost) {
      // 如果是房主斷線，通知房間內所有人，並刪除該房間
      io.to(roomId).emit('host-disconnected', '房主已離線，房間關閉。');
      rooms.delete(roomId);
      console.log(`房主斷線，刪除房間: ${roomId}`);
    } else {
      // 如果是玩家斷線，從列表中移除並更新
      room.players = room.players.filter(p => p.id !== socket.id);
      // 如果該玩家已搶答，也從搶答清單中移除
      room.buzzes = room.buzzes.filter(b => b.id !== socket.id);

      io.to(roomId).emit('players-updated', room.players);
      io.to(roomId).emit('buzz-updated', room.buzzes);
      console.log(`玩家 ${socket.playerName} 斷線，已從房間 ${roomId} 移除`);
      
      // 如果房間內已無人，可考慮清除房間
      if (room.players.length === 0 && !io.sockets.adapter.rooms.get(roomId)) {
        // 為了保險，若連房主都不在了就清除
        rooms.delete(roomId);
        console.log(`房間 ${roomId} 已無任何連線，自動刪除`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`伺服器正運行在 http://localhost:${PORT}`);
});
