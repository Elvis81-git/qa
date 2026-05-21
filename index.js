const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// State
const rooms = {}; 
// rooms[roomId] = { host: socketId, users: [{id, name}], mode: 'wait', buzzerWinner: null, answers: {} }

function generateRoomId() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4 digits
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Host creates a room
  socket.on('createRoom', (name, callback) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      host: socket.id,
      users: [{ id: socket.id, name: name || 'Host' }],
      mode: 'wait', // wait | buzzer | quiz
      buzzerWinner: null,
      answers: {}
    };
    socket.join(roomId);
    callback({ roomId, isHost: true });
    io.to(roomId).emit('updateUsers', rooms[roomId].users);
  });

  // Player joins a room
  socket.on('joinRoom', ({ roomId, name }, callback) => {
    if (rooms[roomId]) {
      socket.join(roomId);
      rooms[roomId].users.push({ id: socket.id, name });
      callback({ success: true, isHost: false });
      io.to(roomId).emit('updateUsers', rooms[roomId].users);
      // Send current state
      socket.emit('gameState', { mode: rooms[roomId].mode, buzzerWinner: rooms[roomId].buzzerWinner, answers: rooms[roomId].answers });
    } else {
      callback({ success: false, message: 'Room not found' });
    }
  });

  // --- Buzzer Mode ---
  socket.on('startBuzzer', (roomId) => {
    if (rooms[roomId] && rooms[roomId].host === socket.id) {
      rooms[roomId].mode = 'buzzer_countdown';
      rooms[roomId].buzzerWinner = null;
      io.to(roomId).emit('buzzerCountdown');
      
      setTimeout(() => {
        if(rooms[roomId]) {
          rooms[roomId].mode = 'buzzer_active';
          io.to(roomId).emit('buzzerActive');
        }
      }, 3000); // 3 seconds countdown
    }
  });

  socket.on('buzz', (roomId) => {
    if (rooms[roomId] && rooms[roomId].mode === 'buzzer_active' && !rooms[roomId].buzzerWinner) {
      rooms[roomId].buzzerWinner = socket.id;
      const winner = rooms[roomId].users.find(u => u.id === socket.id);
      io.to(roomId).emit('buzzerWinner', winner ? winner.name : 'Unknown');
    }
  });

  socket.on('resetBuzzer', (roomId) => {
    if (rooms[roomId] && rooms[roomId].host === socket.id) {
      rooms[roomId].mode = 'wait';
      rooms[roomId].buzzerWinner = null;
      io.to(roomId).emit('buzzerReset');
    }
  });

  // --- Quiz Mode ---
  socket.on('startQuiz', ({ roomId, question, options }) => {
    if (rooms[roomId] && rooms[roomId].host === socket.id) {
      rooms[roomId].mode = 'quiz';
      rooms[roomId].answers = {};
      io.to(roomId).emit('quizQuestion', { question, options });
    }
  });

  socket.on('submitAnswer', ({ roomId, answer }) => {
    if (rooms[roomId] && rooms[roomId].mode === 'quiz') {
      const user = rooms[roomId].users.find(u => u.id === socket.id);
      if (user) {
        rooms[roomId].answers[user.name] = answer;
        io.to(roomId).emit('quizAnswersUpdate', rooms[roomId].answers);
      }
    }
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const userIndex = room.users.findIndex(u => u.id === socket.id);
      if (userIndex !== -1) {
        room.users.splice(userIndex, 1);
        if (room.host === socket.id) {
          io.to(roomId).emit('roomClosed');
          delete rooms[roomId];
        } else {
          io.to(roomId).emit('updateUsers', room.users);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
