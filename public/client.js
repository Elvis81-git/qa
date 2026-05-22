// 初始化 Socket.io 連線
const socket = io();

// 網頁音效合成器 (使用 Web Audio API，不需外部音訊檔)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let soundEnabled = true;

function playSound(type) {
  if (!soundEnabled) return;
  
  // 每次播放都需要建立新的 AudioContext 連線，避免瀏覽器安全阻擋
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  switch (type) {
    case 'click': // 按鈕點擊音效
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
      break;

    case 'beep': // 倒數計時嗶聲
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
      break;

    case 'go': // 搶答開始音效
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(1046.50, now + 0.15); // C6
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
      break;

    case 'success': // 搶答成功 (第一名)
      osc.type = 'sine';
      // 歡樂的和弦音
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
      break;

    case 'buzz-press': // 普通按壓搶答鈕
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.25);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
      break;

    case 'error': // 錯誤或中斷
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
      break;

    case 'correct': // 答對音效
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.setValueAtTime(800, now + 0.08);
      osc.frequency.setValueAtTime(1200, now + 0.16);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
      break;

    case 'incorrect': // 答錯音效
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.25);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
      break;
  }
}

// 音效開關按鈕事件
const soundToggleBtn = document.getElementById('sound-toggle-btn');
soundToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    soundToggleBtn.classList.remove('muted');
    soundToggleBtn.innerHTML = '<span class="icon">🔊</span>';
    playSound('click');
  } else {
    soundToggleBtn.classList.add('muted');
    soundToggleBtn.innerHTML = '<span class="icon">🔇</span>';
  }
});

// --- 畫面 DOM 元素 ---
const screenLobby = document.getElementById('screen-lobby');
const screenHost = document.getElementById('screen-host');
const screenPlayer = document.getElementById('screen-player');

// 大廳分頁切換
const tabHostBtn = document.getElementById('tab-host-btn');
const tabPlayerBtn = document.getElementById('tab-player-btn');
const panelHostSetup = document.getElementById('panel-host-setup');
const panelPlayerSetup = document.getElementById('panel-player-setup');

tabHostBtn.addEventListener('click', () => {
  playSound('click');
  tabHostBtn.classList.add('active');
  tabPlayerBtn.classList.remove('active');
  panelHostSetup.classList.add('active');
  panelPlayerSetup.classList.remove('active');
});

tabPlayerBtn.addEventListener('click', () => {
  playSound('click');
  tabPlayerBtn.classList.add('active');
  tabHostBtn.classList.remove('active');
  panelPlayerSetup.classList.add('active');
  panelHostSetup.classList.remove('active');
});

// --- 角色與遊戲狀態暫存 ---
let isHost = false;
let myName = '';
let myRoomId = '';
let currentPlayers = [];
let hasBuzzed = false;

// 隱藏所有畫面，顯示指定畫面
function showScreen(screen) {
  screenLobby.classList.remove('active');
  screenHost.classList.remove('active');
  screenPlayer.classList.remove('active');
  screen.classList.add('active');
}

// --- 房主邏輯 ---
const createRoomBtn = document.getElementById('create-room-btn');
const hostRoomIdText = document.getElementById('host-room-id');
const playersList = document.getElementById('players-list');
const connectedCountText = document.getElementById('connected-count');
const playersEmptyState = document.getElementById('players-empty-state');
const startGameBtn = document.getElementById('start-game-btn');
const resetGameBtn = document.getElementById('reset-game-btn');
const resultsEmptyState = document.getElementById('results-empty-state');
const winnerBanner = document.getElementById('winner-banner');
const winnerNameText = document.getElementById('winner-name');
const winnerTimeText = document.getElementById('winner-time');
const resultsList = document.getElementById('results-list');
const gameStatusBadge = document.getElementById('game-status-badge');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const judgeCorrectBtn = document.getElementById('judge-correct-btn');
const judgeIncorrectBtn = document.getElementById('judge-incorrect-btn');

let currentAnsweringPlayerId = null;

createRoomBtn.addEventListener('click', () => {
  playSound('click');
  socket.emit('create-room');
});

socket.on('room-created', ({ roomId }) => {
  isHost = true;
  myRoomId = roomId;
  hostRoomIdText.textContent = roomId;
  
  // 更新狀態與按鈕
  gameStatusBadge.textContent = '等待玩家連線';
  gameStatusBadge.className = 'badge';
  
  showScreen(screenHost);
});

// 房主：更新連線玩家清單
socket.on('players-updated', (players) => {
  currentPlayers = players;
  connectedCountText.textContent = players.length;

  if (players.length > 0) {
    playersEmptyState.classList.add('hidden');
    // 如果有玩家連線，啟用「開始搶答」與「重設分數」按鈕
    startGameBtn.removeAttribute('disabled');
    resetScoresBtn.removeAttribute('disabled');
  } else {
    playersEmptyState.classList.remove('hidden');
    startGameBtn.setAttribute('disabled', 'true');
    resetScoresBtn.setAttribute('disabled', 'true');
  }

  // 渲染玩家列表卡片
  playersList.innerHTML = '';
  players.forEach(player => {
    const li = document.createElement('li');
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;
    li.appendChild(nameSpan);

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'player-score';
    scoreSpan.textContent = `${player.score || 0} 分`;
    li.appendChild(scoreSpan);

    playersList.appendChild(li);
  });

  // 玩家自己也更新頭部徽章的分數
  if (!isHost) {
    const me = players.find(p => p.name === myName);
    if (me) {
      playerScreenName.textContent = `${me.name} (${me.score || 0} 分)`;
    }
  }
});

// 房主：開始搶答倒數
startGameBtn.addEventListener('click', () => {
  playSound('click');
  startGameBtn.setAttribute('disabled', 'true');
  socket.emit('start-game');
});

// 房主：重設搶答
resetGameBtn.addEventListener('click', () => {
  playSound('click');
  socket.emit('reset-game');
});

// 房主：重設所有玩家分數
resetScoresBtn.addEventListener('click', () => {
  playSound('click');
  if (confirm('確定要將所有玩家的分數歸零嗎？')) {
    socket.emit('reset-scores');
  }
});

// 房主：判定答對
judgeCorrectBtn.addEventListener('click', () => {
  if (currentAnsweringPlayerId) {
    playSound('click');
    socket.emit('answer-correct', { playerId: currentAnsweringPlayerId });
  }
});

// 房主：判定答錯
judgeIncorrectBtn.addEventListener('click', () => {
  if (currentAnsweringPlayerId) {
    playSound('click');
    socket.emit('answer-incorrect', { playerId: currentAnsweringPlayerId });
  }
});

// --- 玩家邏輯 ---
const joinRoomForm = document.getElementById('join-room-form');
const playerNameInput = document.getElementById('player-name-input');
const roomIdInput = document.getElementById('room-id-input');
const playerScreenName = document.getElementById('player-screen-name');
const playerScreenRoom = document.getElementById('player-screen-room');
const buzzerStatusText = document.getElementById('buzzer-status-text');
const buzzerBtn = document.getElementById('buzzer-btn');
const playerResultCard = document.getElementById('player-result-card');
const playerResultIcon = document.getElementById('player-result-icon');
const playerResultTitle = document.getElementById('player-result-title');
const playerResultDetail = document.getElementById('player-result-detail');

joinRoomForm.addEventListener('submit', (e) => {
  e.preventDefault();
  playSound('click');
  
  myName = playerNameInput.value.trim();
  myRoomId = roomIdInput.value.trim();

  if (myName && myRoomId) {
    socket.emit('join-room', { roomId: myRoomId, name: myName });
  }
});

socket.on('join-success', ({ roomId, name }) => {
  playerScreenName.textContent = name;
  playerScreenRoom.textContent = roomId;
  resetBuzzerUI();
  showScreen(screenPlayer);
});

socket.on('join-error', (errorMsg) => {
  playSound('error');
  alert(errorMsg);
});

// 玩家按鈕搶答事件
buzzerBtn.addEventListener('click', () => {
  if (!buzzerBtn.classList.contains('active') || hasBuzzed) return;

  hasBuzzed = true;
  playSound('buzz-press');
  
  // 立即將按鈕改為已搶答外觀，防止連續點擊
  buzzerBtn.classList.remove('active');
  buzzerBtn.classList.add('buzzed');
  buzzerStatusText.textContent = '搶答送出中...';
  
  socket.emit('buzz');
});

// 重設玩家搶答按鈕與狀態
function resetBuzzerUI() {
  hasBuzzed = false;
  buzzerBtn.disabled = true;
  buzzerBtn.className = 'buzzer-button';
  buzzerStatusText.textContent = '等待房主開始...';
  buzzerStatusText.style.color = 'var(--text-secondary)';
  playerResultCard.classList.add('hidden');
}

// --- 同步倒數邏輯 (雙端共用) ---
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');
const countdownProgressBar = document.getElementById('countdown-progress-bar');

socket.on('game-starting', ({ serverTime, countdownMs }) => {
  // 開啟倒數覆蓋層
  countdownOverlay.classList.add('active');
  
  // 更新狀態標籤
  if (isHost) {
    gameStatusBadge.textContent = '準備搶答倒數中';
    gameStatusBadge.className = 'badge countdown';
  } else {
    buzzerStatusText.textContent = '預備搶答...';
  }

  let count = 3;
  countdownNumber.textContent = count;
  playSound('beep');

  // 設定 SVG 圓環倒數動畫
  const totalLength = 565.48; // 2 * Math.PI * 90
  countdownProgressBar.style.strokeDashoffset = '0';

  // 使用精確的定時器進行 3 秒倒數
  const startTime = Date.now();
  const duration = countdownMs; // 3000ms

  const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // 更新圓環進度
    countdownProgressBar.style.strokeDashoffset = (totalLength * progress).toString();

    // 換算剩餘秒數
    const newCount = 3 - Math.floor(elapsed / 1000);
    if (newCount !== count && newCount > 0) {
      count = newCount;
      countdownNumber.textContent = count;
      playSound('beep');
    }

    if (elapsed >= duration) {
      clearInterval(interval);
      countdownOverlay.classList.remove('active');
      playSound('go');

      if (isHost) {
        gameStatusBadge.textContent = '搶答中！';
        gameStatusBadge.className = 'badge active';
        resetGameBtn.removeAttribute('disabled');
      } else {
        // 啟用玩家搶答按鈕
        buzzerStatusText.textContent = '請搶答！！！';
        buzzerStatusText.style.color = 'var(--primary-cyan)';
        buzzerBtn.disabled = false;
        buzzerBtn.classList.add('active');
      }
    }
  }, 30);
});

// --- 搶答結果即時更新 ---
socket.on('buzz-updated', (buzzes) => {
  if (buzzes.length === 0) {
    if (isHost) {
      winnerBanner.classList.add('hidden');
      resultsList.innerHTML = '';
      resultsEmptyState.classList.remove('hidden');
      currentAnsweringPlayerId = null;
    }
    return;
  }

  // 1. 播放搶答成功的音效 (如果是第一個按下的)
  if (buzzes.length === 1) {
    playSound('success');
  }

  // --- 房主畫面更新 ---
  if (isHost) {
    resultsEmptyState.classList.add('hidden');
    
    // 渲染第一名 Banner
    const winner = buzzes[0];
    currentAnsweringPlayerId = winner.id; // 記錄當前答題者 ID
    winnerNameText.textContent = winner.name;
    winnerTimeText.textContent = `反應時間: ${(winner.elapsed / 1000).toFixed(3)} 秒`;
    winnerBanner.classList.remove('hidden');

    // 渲染後續排名
    resultsList.innerHTML = '';
    buzzes.slice(1).forEach((buzz, index) => {
      const li = document.createElement('li');
      
      const rank = document.createElement('span');
      rank.className = 'rank-badge';
      rank.textContent = index + 2; // 因為是 slice(1)，所以從第二名開始

      const nameSpan = document.createElement('span');
      nameSpan.className = 'runner-name';
      nameSpan.textContent = buzz.name;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'runner-time';
      timeSpan.textContent = `+${((buzz.elapsed - winner.elapsed) / 1000).toFixed(3)} 秒`;

      const leftDiv = document.createElement('div');
      leftDiv.appendChild(rank);
      leftDiv.appendChild(nameSpan);

      li.appendChild(leftDiv);
      li.appendChild(timeSpan);
      resultsList.appendChild(li);
    });
  }

  // --- 玩家畫面更新 ---
  if (!isHost) {
    // 找出自己的搶答順序
    const myRankIndex = buzzes.findIndex(b => b.name === myName);
    
    if (myRankIndex !== -1) {
      // 關閉按鈕狀態
      buzzerBtn.disabled = true;
      buzzerBtn.className = 'buzzer-button buzzed';

      const myRecord = buzzes[myRankIndex];
      playerResultCard.classList.remove('hidden');

      if (myRankIndex === 0) {
        // 第一名
        playerResultIcon.textContent = '👑';
        playerResultTitle.textContent = '您搶到了第一名！';
        playerResultTitle.style.color = 'var(--warning-amber)';
        playerResultDetail.textContent = `反應速度極快！時間：${(myRecord.elapsed / 1000).toFixed(3)} 秒。`;
        buzzerStatusText.textContent = '搶答結束！您是第一名！';
        buzzerStatusText.style.color = 'var(--warning-amber)';
      } else {
        // 後續名次
        const winnerRecord = buzzes[0];
        const gap = ((myRecord.elapsed - winnerRecord.elapsed) / 1000).toFixed(3);
        playerResultIcon.textContent = '🥈';
        playerResultTitle.textContent = `搶答成功！獲得第 ${myRankIndex + 1} 名`;
        playerResultTitle.style.color = 'var(--text-primary)';
        playerResultDetail.textContent = `您的反應時間：${(myRecord.elapsed / 1000).toFixed(3)} 秒 (落後第一名 ${gap} 秒)。`;
        buzzerStatusText.textContent = `搶答結束！您獲得第 ${myRankIndex + 1} 名`;
        buzzerStatusText.style.color = 'var(--text-secondary)';
      }
    }
  }
});

// --- 重設遊戲狀態 ---
socket.on('game-reset', () => {
  if (isHost) {
    gameStatusBadge.textContent = '等待開始';
    gameStatusBadge.className = 'badge';
    
    startGameBtn.removeAttribute('disabled');
    resetGameBtn.setAttribute('disabled', 'true');
    
    // 清空房主排行畫面
    winnerBanner.classList.add('hidden');
    resultsList.innerHTML = '';
    resultsEmptyState.classList.remove('hidden');
  } else {
    resetBuzzerUI();
  }
});

// --- 房主斷線處理 ---
socket.on('host-disconnected', (msg) => {
  playSound('error');
  alert(msg);
  // 重新整理頁面回到大廳
  window.location.reload();
});

// --- 監聽回答判定結果 ---
socket.on('answer-result', ({ playerId, name, result, players }) => {
  if (result === 'correct') {
    playSound('correct');

    if (isHost) {
      gameStatusBadge.textContent = '答對了！';
      gameStatusBadge.className = 'badge';
      // 答對後清空答題者 ID，等待下一輪搶答
      currentAnsweringPlayerId = null;
    } else {
      if (myName === name) {
        playerResultIcon.textContent = '🎉';
        playerResultTitle.textContent = '答對了！加 1 分';
        playerResultTitle.style.color = 'var(--success-green)';
        playerResultDetail.textContent = '恭喜！您的分數已更新。';
        buzzerStatusText.textContent = '答對了！加 1 分';
        buzzerStatusText.style.color = 'var(--success-green)';
      } else {
        buzzerStatusText.textContent = `玩家 ${name} 答對了！`;
        buzzerStatusText.style.color = 'var(--text-secondary)';
      }
      // 關閉搶答狀態
      buzzerBtn.disabled = true;
      buzzerBtn.className = 'buzzer-button';
    }
  } else if (result === 'incorrect') {
    playSound('incorrect');

    if (isHost) {
      gameStatusBadge.textContent = '答錯！機會遞補';
      gameStatusBadge.className = 'badge countdown';
    } else {
      if (myName === name) {
        playerResultIcon.textContent = '❌';
        playerResultTitle.textContent = '答錯了！';
        playerResultTitle.style.color = 'var(--danger-red)';
        playerResultDetail.textContent = '很遺憾，機會已讓給下一位搶答玩家。';
        buzzerStatusText.textContent = '答錯了！';
        buzzerStatusText.style.color = 'var(--danger-red)';
      } else {
        buzzerStatusText.textContent = `玩家 ${name} 答錯，機會遞補中...`;
        buzzerStatusText.style.color = 'var(--warning-amber)';
      }
    }
  }
});
