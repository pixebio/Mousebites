const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const gridSize = 20;
const leaderboardNames = ['easy', 'medium', 'hard', 'extreme', 'drunk', 'overall'];
const accountSelect = document.getElementById('accountSelect');
const leaderboardSelect = document.getElementById('leaderboardSelect');
const diffSelect = document.getElementById('difficulty');
const scoreEl = document.getElementById('score');
const currentAccountLabel = document.getElementById('currentAccountLabel');
const leaderboardList = document.getElementById('scoreboardList');
const autoReplayToggle = document.getElementById('autoReplayToggle');
const keybindProfileSelect = document.getElementById('keybindProfileSelect');
const keybindList = document.getElementById('keybindList');
const pauseOverlay = document.getElementById('pauseOverlay');
const deathOverlay = document.getElementById('deathOverlay');
const pauseDifficulty = document.getElementById('pauseDifficulty');
const deathDifficulty = document.getElementById('deathDifficulty');
const pauseAutoReplay = document.getElementById('pauseAutoReplay');
const deathAutoReplay = document.getElementById('deathAutoReplay');
const pauseScore = document.getElementById('pauseScore');
const deathScore = document.getElementById('deathScore');
const mobileControls = document.getElementById('mobileControls');

const defaultKeybinds = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  pause: 'p',
  restart: 'r'
};

const state = {
  mode: 'easy',
  key: '',
  accounts: {},
  deletedAccounts: {},
  currentAccount: 'guest',
  keybindProfile: 'default',
  keybindProfiles: {
    default: { ...defaultKeybinds },
    profile1: { ...defaultKeybinds },
    profile2: { ...defaultKeybinds }
  },
  keybinds: { ...defaultKeybinds },
  editingKeybind: null,
  leaderboards: {
    easy: [],
    medium: [],
    hard: [],
    extreme: [],
    drunk: [],
    overall: []
  },
  score: 0,
  running: false,
  paused: false,
  screen: 'start',
  snake: [],
  food: null,
  direction: { x: 1, y: 0 },
  nextDirection: { x: 1, y: 0 },
  intervalId: null,
  appleVisibleUntil: 0,
  appleSpawnDelay: 0,
  appleCount: 0,
  autoReplay: false,
  deathOverlayVisible: false,
  goldenAppleTimer: 0,
  screenFillUntil: 0,
  lastGamepadTick: 0
};

function defaultStore() {
  return {
    key: 'snake-demo-key',
    accounts: {
      guest: { name: 'Guest', password: '', guest: true, highScore: 0 }
    },
    deletedAccounts: {},
    leaderboards: {
      easy: [],
      medium: [],
      hard: [],
      extreme: [],
      drunk: [],
      overall: []
    }
  };
}

function generateStoreKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  let out = '';
  for (let i = 0; i < 24; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function textEncode(value) {
  return new TextEncoder().encode(value);
}

function textDecode(bytes) {
  return new TextDecoder().decode(bytes);
}

function encryptText(value, key) {
  const bytes = textEncode(value);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const k = key.charCodeAt(i % key.length);
    const val = (bytes[i] ^ k ^ ((i * 13 + 7) & 255)) & 255;
    out += String.fromCharCode(val);
  }
  return btoa(out);
}

function decryptText(value, key) {
  const raw = atob(value);
  const bytes = [];
  for (let i = 0; i < raw.length; i += 1) {
    const k = key.charCodeAt(i % key.length);
    const val = (raw.charCodeAt(i) ^ k ^ ((i * 13 + 7) & 255)) & 255;
    bytes.push(val);
  }
  return textDecode(Uint8Array.from(bytes));
}

function parseStore(raw) {
  if (!raw || !raw.trim()) return defaultStore();
  try {
    const parsed = JSON.parse(raw);
    const store = defaultStore();
    const key = parsed.key || store.key;
    const encrypted = parsed.data || '';
    if (encrypted) {
      const plain = decryptText(encrypted, key);
      const obj = JSON.parse(plain);
      return {
        key,
        accounts: obj.accounts || store.accounts,
        deletedAccounts: obj.deletedAccounts || {},
        leaderboards: obj.leaderboards || store.leaderboards
      };
    }
    return {
      key,
      accounts: parsed.accounts || store.accounts,
      deletedAccounts: parsed.deletedAccounts || {},
      leaderboards: parsed.leaderboards || store.leaderboards
    };
  } catch (err) {
    return defaultStore();
  }
}

function serialiseStore() {
  return JSON.stringify({
    key: state.key,
    data: encryptText(JSON.stringify({
      accounts: state.accounts,
      deletedAccounts: state.deletedAccounts,
      leaderboards: state.leaderboards
    }), state.key)
  });
}

function setScreen(nextScreen) {
  state.screen = nextScreen;
  const startVisible = nextScreen === 'start';
  const pauseVisible = nextScreen === 'paused';
  const deathVisible = nextScreen === 'dead';
  document.getElementById('startScreen').classList.toggle('hidden', !startVisible);
  pauseOverlay.classList.toggle('hidden', !pauseVisible);
  deathOverlay.classList.toggle('hidden', !deathVisible);
  state.deathOverlayVisible = deathVisible;
}

function syncDifficultyLock() {
  diffSelect.disabled = state.running && state.screen !== 'dead';
  pauseDifficulty.value = state.mode;
  deathDifficulty.value = state.mode;
  pauseScore.textContent = `Score: ${Math.floor(state.score)}`;
  deathScore.textContent = `Score: ${Math.floor(state.score)}`;
  pauseAutoReplay.checked = state.autoReplay;
  deathAutoReplay.checked = state.autoReplay;
  autoReplayToggle.checked = state.autoReplay;
}

function setCurrentAccount(name) {
  state.currentAccount = name;
  const acc = state.accounts[name] || state.accounts.guest;
  currentAccountLabel.textContent = acc ? acc.name : 'Guest';
}

function updateHud() {
  scoreEl.textContent = `Score: ${Math.floor(state.score)}`;
}

function populateAccountSelect() {
  accountSelect.innerHTML = '';
  Object.keys(state.accounts).forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = state.accounts[name].name;
    if (name === state.currentAccount) option.selected = true;
    accountSelect.appendChild(option);
  });
}

function renderLeaderboards() {
  const key = leaderboardSelect.value;
  const entries = state.leaderboards[key] || [];
  leaderboardList.innerHTML = '';

  if (!entries.length) {
    const li = document.createElement('li');
    li.innerHTML = '<span>Empty</span><span>—</span>';
    leaderboardList.appendChild(li);
    return;
  }

  entries.slice(0, 5).forEach((entry, index) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>#${index + 1} ${entry.name}</span><span>${Math.floor(entry.score)}</span>`;
    leaderboardList.appendChild(li);
  });
}

function addScoreToBoard(mode, accountName, points) {
  const entry = {
    name: accountName,
    score: Math.floor(points),
    account: accountName,
    mode
  };

  const board = state.leaderboards[mode] || [];
  const next = [...board, entry].sort((a, b) => b.score - a.score).slice(0, 5);
  state.leaderboards[mode] = next;

  state.leaderboards.overall = [...(state.leaderboards.overall || []), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function saveStore() {
  const payload = serialiseStore();
  localStorage.setItem('snake-store', payload);
  try {
    fetch('scores.txt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    }).catch(() => {});
  } catch (err) {
    // ignore
  }
}

async function loadStore() {
  try {
    const local = localStorage.getItem('snake-store');
    if (local) {
      const store = parseStore(local);
      state.key = store.key;
      state.accounts = store.accounts;
      state.deletedAccounts = store.deletedAccounts || {};
      state.leaderboards = store.leaderboards;
      return;
    }

    const response = await fetch('scores.txt');
    if (response.ok) {
      const text = await response.text();
      const store = parseStore(text);
      state.key = store.key;
      state.accounts = store.accounts;
      state.deletedAccounts = store.deletedAccounts || {};
      state.leaderboards = store.leaderboards;
    } else {
      const store = defaultStore();
      state.key = store.key;
      state.accounts = store.accounts;
      state.deletedAccounts = store.deletedAccounts;
      state.leaderboards = store.leaderboards;
    }
  } catch (err) {
    const store = defaultStore();
    state.key = store.key;
    state.accounts = store.accounts;
    state.deletedAccounts = store.deletedAccounts;
    state.leaderboards = store.leaderboards;
  }
}

function ensureGuestAccount() {
  if (!state.accounts.guest) {
    state.accounts.guest = { name: 'Guest', password: '', guest: true, highScore: 0 };
  }
}

function applyModeForBoard(mode) {
  state.mode = mode;
  if (state.running) {
    state.nextDirection = { x: 1, y: 0 };
    state.direction = { x: 1, y: 0 };
    refreshTick();
  }
}

function refreshTick() {
  if (state.intervalId) clearInterval(state.intervalId);
  const tick = computeTick();
  state.intervalId = setInterval(gameTick, tick);
}

function computeTick() {
  let tick = 1000 / 7;

  if (state.mode === 'easy') tick = 1000 / 7;
  else if (state.mode === 'medium') tick = 1000 / 9;
  else if (state.mode === 'hard') tick = 1000 / 18;
  else if (state.mode === 'drunk') tick = 1000 / 8;
  else if (state.mode === 'extreme') tick = state.score >= 5 ? 1000 / 7 : 1000 / 28;

  if (state.mode === 'hard' && state.score >= 10) {
    tick = Math.max(40, tick * (1 - Math.floor(state.score / 10) * 0.12));
  }

  if (state.mode === 'medium' && state.score >= 10) {
    tick = Math.max(35, tick * (1 - Math.floor(state.score / 10) * 0.08));
  }

  if (state.mode === 'easy' && state.score >= 10) tick = Math.max(35, tick * 0.9);
  if (state.mode === 'easy' && state.score >= 25) tick = Math.max(35, tick * 0.8);
  if (state.mode === 'easy' && state.score >= 50) tick = Math.max(35, tick * 0.7);
  if (state.mode === 'easy' && state.score >= 75) tick = Math.max(35, tick * 0.6);
  if (state.mode === 'easy' && state.score >= 100) tick = Math.max(35, tick * 0.5);

  return tick;
}

function isTileBlocked(x, y) {
  return state.snake.some(seg => seg.x === x && seg.y === y);
}

function randomOpenTile() {
  const cols = canvas.width / gridSize;
  const rows = canvas.height / gridSize;
  const options = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!isTileBlocked(x, y)) {
        options.push({ x, y });
      }
    }
  }
  if (!options.length) return null;
  return options[Math.floor(Math.random() * options.length)];
}

function placeFood() {
  if (state.screenFillUntil > Date.now()) return;

  const freeTile = randomOpenTile();
  if (!freeTile) return;

  const goldenChance = 0.1;
  const shouldGolden = Math.random() < goldenChance && state.food?.type !== 'gold';

  state.food = {
    x: freeTile.x,
    y: freeTile.y,
    type: shouldGolden ? 'gold' : 'normal'
  };

  if (shouldGolden) {
    state.goldenAppleTimer = Date.now() + 3000;
  } else {
    state.goldenAppleTimer = 0;
  }

  if (state.mode === 'extreme') {
    state.appleVisibleUntil = Date.now() + 180;
    state.appleSpawnDelay = Date.now() + 180;
  }
}

function updateSpecialApples() {
  if (state.food && state.food.type === 'gold' && Date.now() >= state.goldenAppleTimer) {
    state.food.type = 'normal';
    state.goldenAppleTimer = 0;
  }

  if (state.screenFillUntil && Date.now() > state.screenFillUntil) {
    state.screenFillUntil = 0;
  }
}

function resetGame() {
  const cols = canvas.width / gridSize;
  const rows = canvas.height / gridSize;
  state.score = 0;
  state.running = true;
  state.paused = false;
  state.screen = 'playing';
  state.snake = [{ x: Math.floor(cols / 2), y: Math.floor(rows / 2) }];
  state.direction = { x: 1, y: 0 };
  state.nextDirection = { x: 1, y: 0 };
  state.appleVisibleUntil = 0;
  state.appleCount = 0;
  state.screenFillUntil = 0;
  state.goldenAppleTimer = 0;
  state.food = null;
  setScreen('playing');
  placeFood();
  updateHud();
  syncDifficultyLock();
  if (state.intervalId) clearInterval(state.intervalId);
  state.intervalId = setInterval(gameTick, computeTick());
}

function showStart() {
  setScreen('start');
}

function hideStart() {
  setScreen('playing');
}

function showDeathOverlay() {
  const deathScreen = document.getElementById('deathOverlay');
  const deathMessage = document.getElementById('deathScore');
  deathMessage.textContent = `Score: ${Math.floor(state.score)}`;
  deathScreen.classList.remove('hidden');
  state.deathOverlayVisible = true;
  deathDifficulty.value = state.mode;
  setScreen('dead');
}

function hideDeathOverlay() {
  setScreen('playing');
  state.deathOverlayVisible = false;
}

function togglePause() {
  if (!state.running) return;
  if (state.paused) {
    resumeGame();
  } else {
    pauseGame();
  }
}

function pauseGame() {
  if (!state.running || state.paused || state.screen === 'dead') return;
  state.paused = true;
  state.screen = 'paused';
  pauseScore.textContent = `Score: ${Math.floor(state.score)}`;
  pauseDifficulty.value = state.mode;
  pauseAutoReplay.checked = state.autoReplay;
  setScreen('paused');
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
}

function resumeGame() {
  if (!state.running || !state.paused) return;
  state.paused = false;
  state.screen = 'playing';
  setScreen('playing');
  state.intervalId = setInterval(gameTick, computeTick());
}

function canTurnTo(newDirection) {
  return !(newDirection.x === -state.direction.x && newDirection.y === -state.direction.y)
    && !(newDirection.x === -state.nextDirection.x && newDirection.y === -state.nextDirection.y);
}

function applyDirectionVector(next) {
  if (!next || !state.running) return;
  if (state.screen === 'paused' || state.screen === 'dead') return;
  if (next.x === -state.direction.x && next.y === -state.direction.y) return;
  if (next.x === -state.nextDirection.x && next.y === -state.nextDirection.y) return;
  if (state.screen === 'start') {
    resetGame();
    setScreen('playing');
  }
  state.nextDirection = next;
}

function handleKeyInput(event) {
  const key = normalizeKey(event.key);

  if (state.editingKeybind) {
    event.preventDefault();
    setKeybind(state.editingKeybind, event.key);
    state.editingKeybind = null;
    return;
  }

  const startKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];
  if (document.getElementById('startScreen') && !document.getElementById('startScreen').classList.contains('hidden') && startKeys.includes(key)) {
    resetGame();
    setScreen('playing');
    return;
  }

  if (key === normalizeKey(state.keybinds.pause)) {
    event.preventDefault();
    togglePause();
    return;
  }

  if (key === normalizeKey(state.keybinds.restart)) {
    event.preventDefault();
    resetGame();
    setScreen('playing');
    return;
  }

  if (event.key === 'Escape' && state.screen === 'paused') {
    resumeGame();
    return;
  }

  const up = key === normalizeKey(state.keybinds.up);
  const down = key === normalizeKey(state.keybinds.down);
  const left = key === normalizeKey(state.keybinds.left);
  const right = key === normalizeKey(state.keybinds.right);

  if (!(up || down || left || right)) return;
  event.preventDefault();

  let next = null;
  if (up) next = { x: 0, y: -1 };
  else if (down) next = { x: 0, y: 1 };
  else if (left) next = { x: -1, y: 0 };
  else if (right) next = { x: 1, y: 0 };

  applyDirectionVector(next);
}

function triggerGoldenAppleEffect() {
  state.screenFillUntil = Date.now() + 5000;
  state.food = null;
  state.score += 5;
  updateHud();
}

function maybeGameOver() {
  state.running = false;
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  const current = state.accounts[state.currentAccount] || state.accounts.guest;
  const boardNames = ['easy', 'medium', 'hard', 'extreme', 'drunk', 'overall'];
  const topScore = Math.floor(state.score);
  const qualifiesForTop5 = boardNames.some((name) => {
    const entries = state.leaderboards[name] || [];
    return entries.length < 5 || topScore > Math.floor(entries[entries.length - 1].score);
  });

  if (qualifiesForTop5) {
    let nameToUse = current && !current.guest ? current.name : '';
    if (!nameToUse) {
      nameToUse = prompt('New high score! Enter a name for your new account:');
    }
    if (nameToUse && nameToUse.trim()) {
      const cleanName = nameToUse.trim();
      const existing = Object.keys(state.accounts).find((key) => state.accounts[key].name.toLowerCase() === cleanName.toLowerCase());
      let chosenName = cleanName;
      if (existing) {
        chosenName = `${cleanName}_${Date.now().toString().slice(-4)}`;
      }

      const password = window.prompt(`Create a password for ${chosenName}:`);
      if (password !== null) {
        state.accounts[chosenName.toLowerCase()] = {
          name: chosenName,
          password: password || '',
          guest: false,
          highScore: Math.max(topScore, state.accounts[chosenName.toLowerCase()]?.highScore || 0)
        };
        state.currentAccount = chosenName.toLowerCase();
      }
    }
  }

  if (state.accounts[state.currentAccount]) {
    const acc = state.accounts[state.currentAccount];
    acc.highScore = Math.max(acc.highScore || 0, Math.floor(state.score));
  }

  if (state.mode === 'easy') addScoreToBoard('easy', state.accounts[state.currentAccount]?.name || 'Guest', state.score);
  if (state.mode === 'medium') addScoreToBoard('medium', state.accounts[state.currentAccount]?.name || 'Guest', state.score);
  if (state.mode === 'hard') addScoreToBoard('hard', state.accounts[state.currentAccount]?.name || 'Guest', state.score);
  if (state.mode === 'extreme') addScoreToBoard('extreme', state.accounts[state.currentAccount]?.name || 'Guest', state.score);
  if (state.mode === 'drunk') addScoreToBoard('drunk', state.accounts[state.currentAccount]?.name || 'Guest', state.score);
  addScoreToBoard('overall', state.accounts[state.currentAccount]?.name || 'Guest', state.score);

  saveStore();
  populateAccountSelect();
  renderLeaderboards();
  syncDifficultyLock();

  if (state.autoReplay) {
    state.screen = 'paused';
    setScreen('paused');
    pauseScore.textContent = `Score: ${Math.floor(state.score)}`;
    pauseDifficulty.value = state.mode;
    pauseAutoReplay.checked = state.autoReplay;
    setTimeout(() => {
      setScreen('playing');
      resetGame();
    }, 900);
    return;
  }

  showDeathOverlay();
}

function updateGame() {
  if (!state.running || state.paused) return;

  updateSpecialApples();
  state.direction = state.nextDirection;
  const head = {
    x: state.snake[0].x + state.direction.x,
    y: state.snake[0].y + state.direction.y
  };

  head.x = (head.x + canvas.width / gridSize) % (canvas.width / gridSize);
  head.y = (head.y + canvas.height / gridSize) % (canvas.height / gridSize);

  if (state.snake.some(seg => seg.x === head.x && seg.y === head.y)) {
    maybeGameOver();
    return;
  }

  state.snake.unshift(head);

  if (state.food && head.x === state.food.x && head.y === state.food.y) {
    const apple = state.food;
    if (apple.type === 'gold') {
      triggerGoldenAppleEffect();
      return;
    }

    const applePoints = (() => {
      if (state.mode === 'extreme') {
        return (Math.floor(state.score) < 5) ? 10 : 0.5;
      }
      if (state.mode === 'medium' && ((state.appleCount + 1) % 10 === 0)) return 2;
      if (state.mode === 'hard' && ((state.appleCount + 1) % 5 === 0)) return 2;
      return 1;
    })();

    state.score += applePoints;
    state.appleCount += 1;
    updateHud();
    if (state.mode === 'extreme' && Math.floor(state.score) >= 5) {
      state.nextDirection = { x: 1, y: 0 };
    }
    placeFood();
    return;
  }

  state.snake.pop();
}

function drawCell(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * gridSize + 1, y * gridSize + 1, gridSize - 2, gridSize - 2);
}

function drawBoardBackground() {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#071f29');
  gradient.addColorStop(1, '#0d332f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(125, 211, 252, 0.14)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function draw() {
  drawBoardBackground();

  if (state.mode === 'drunk') {
    const wobbleX = Math.sin(Date.now() / 180) * 3;
    const wobbleY = Math.cos(Date.now() / 220) * 3;
    ctx.save();
    ctx.translate(wobbleX, wobbleY);
  }

  if (state.screenFillUntil > Date.now()) {
    for (let y = 0; y < canvas.height / gridSize; y += 1) {
      for (let x = 0; x < canvas.width / gridSize; x += 1) {
        drawCell(x, y, '#ff6b6b');
      }
    }
  }

  for (let i = 1; i < state.snake.length; i += 1) {
    drawCell(state.snake[i].x, state.snake[i].y, '#6ee7a7');
  }

  if (state.snake.length > 0) {
    drawCell(state.snake[0].x, state.snake[0].y, '#0a5a3d');
  }

  if (state.food && !(state.screenFillUntil > Date.now())) {
    drawCell(state.food.x, state.food.y, state.food.type === 'gold' ? '#ffd166' : '#ff5d73');
  }

  if (state.mode === 'drunk') {
    ctx.restore();
  }
}

function gameTick() {
  if (!state.running || state.paused) return;
  updateGame();
  draw();
}

function setDifficulty(mode) {
  if (state.running) return;
  state.mode = mode;
  diffSelect.value = mode;
  pauseDifficulty.value = mode;
  deathDifficulty.value = mode;
  if (state.intervalId) clearInterval(state.intervalId);
  state.intervalId = setInterval(gameTick, computeTick());
}

function addAccount() {
  const name = prompt('New account name:');
  if (!name || !name.trim()) return;
  const cleanName = name.trim();
  const key = cleanName.toLowerCase();

  if (state.accounts[key]) {
    alert('Account already exists.');
    return;
  }

  const deleted = state.deletedAccounts[key];
  if (deleted) {
    const restoreChoice = window.confirm(`A deleted account named "${cleanName}" exists. Restore it?`);
    if (restoreChoice) {
      const oldPassword = prompt(`Enter the old password for ${cleanName}:`);
      if (oldPassword === null) return;
      if (oldPassword !== deleted.password) {
        alert('Incorrect password for the deleted account.');
        return;
      }
      state.accounts[key] = {
        name: deleted.name || cleanName,
        password: deleted.password || '',
        guest: !!deleted.guest,
        highScore: Number.isFinite(deleted.highScore) ? deleted.highScore : 0
      };
      delete state.deletedAccounts[key];
      state.currentAccount = key;
      populateAccountSelect();
      setCurrentAccount(key);
      saveStore();
      return;
    }
  }

  const password = prompt(`Password for ${cleanName}:`);
  if (password === null) return;

  state.accounts[key] = {
    name: cleanName,
    password: password || '',
    guest: false,
    highScore: 0
  };
  state.currentAccount = key;
  populateAccountSelect();
  setCurrentAccount(key);
  saveStore();
}

function removeAccount() {
  if (Object.keys(state.accounts).length <= 1) {
    alert('Cannot remove the last account.');
    return;
  }

  const selected = accountSelect.value || state.currentAccount;
  if (!selected || selected === 'guest') {
    alert('The guest account cannot be removed.');
    return;
  }

  const account = state.accounts[selected];
  if (!account) return;

  const typedPassword = prompt(`Type the password for ${account.name} to remove the account:`);
  if (typedPassword === null) return;
  if (typedPassword !== account.password) {
    alert('Incorrect password.');
    return;
  }

  const confirmDelete = confirm(`Remove account ${account.name}?`);
  if (!confirmDelete) return;

  state.deletedAccounts[selected] = {
    ...account,
    deletedAt: Date.now()
  };
  delete state.accounts[selected];
  if (state.currentAccount === selected) {
    state.currentAccount = 'guest';
  }
  populateAccountSelect();
  setCurrentAccount(state.currentAccount);
  saveStore();
}

function renameAccount() {
  const selected = accountSelect.value || state.currentAccount;
  if (!selected || selected === 'guest') {
    alert('The guest account cannot be renamed.');
    return;
  }

  const account = state.accounts[selected];
  if (!account) return;

  const typedPassword = prompt(`Enter the current password for ${account.name}:`);
  if (typedPassword === null) return;
  if (typedPassword !== account.password) {
    alert('Incorrect password.');
    return;
  }

  const nextName = prompt(`New name for ${account.name}:`, account.name);
  if (!nextName || !nextName.trim()) return;

  const cleanName = nextName.trim();
  const existing = Object.keys(state.accounts).find((name) => name !== selected && state.accounts[name].name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    alert('That account name is already in use.');
    return;
  }

  account.name = cleanName;
  state.accounts[selected] = account;
  populateAccountSelect();
  setCurrentAccount(selected);
  saveStore();
}

function switchAccount() {
  const selected = accountSelect.value;
  if (!selected) return;
  const account = state.accounts[selected];
  if (!account) return;

  if (!account.guest) {
    const typedPassword = prompt(`Password for ${account.name}:`);
    if (typedPassword === null) return;
    if (typedPassword !== account.password) {
      alert('Incorrect password.');
      return;
    }
  }

  state.currentAccount = selected;
  setCurrentAccount(selected);
}

function normalizeKey(key) {
  if (!key) return 'unbound';
  return key.length === 1 ? key.toLowerCase() : key;
}

function getKeyLabel(key) {
  if (!key) return 'Unbound';
  return key === ' ' ? 'Space' : key;
}

function saveKeybindProfiles() {
  localStorage.setItem('snake-keybind-profiles', JSON.stringify(state.keybindProfiles));
}

function loadKeybindProfiles() {
  const raw = localStorage.getItem('snake-keybind-profiles');
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.default) state.keybindProfiles.default = { ...defaultKeybinds, ...parsed.default };
    if (parsed.profile1) state.keybindProfiles.profile1 = { ...defaultKeybinds, ...parsed.profile1 };
    if (parsed.profile2) state.keybindProfiles.profile2 = { ...defaultKeybinds, ...parsed.profile2 };
  } catch (err) {
    // ignore malformed keybind data
  }
}

function applyKeybindProfile(profileName) {
  const profile = state.keybindProfiles[profileName] || state.keybindProfiles.default;
  state.keybindProfile = profileName;
  state.keybinds = { ...profile };
  renderKeybinds();
  saveKeybindProfiles();
}

function renderKeybinds() {
  keybindList.innerHTML = '';
  const actionLabels = [
    ['up', 'Up'],
    ['down', 'Down'],
    ['left', 'Left'],
    ['right', 'Right'],
    ['pause', 'Pause'],
    ['restart', 'Restart']
  ];

  actionLabels.forEach(([action, label]) => {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr auto';
    row.style.gap = '8px';
    row.style.alignItems = 'center';

    const name = document.createElement('span');
    name.textContent = label;

    const button = document.createElement('button');
    button.textContent = getKeyLabel(state.keybinds[action]);
    button.dataset.action = action;
    button.addEventListener('click', () => {
      state.editingKeybind = action;
      button.textContent = 'Press a key...';
    });

    row.appendChild(name);
    row.appendChild(button);
    keybindList.appendChild(row);
  });
}

function setKeybind(action, key) {
  const normalized = normalizeKey(key);
  const profile = state.keybindProfiles[state.keybindProfile] || state.keybindProfiles.default;
  profile[action] = normalized;
  state.keybinds[action] = normalized;
  renderKeybinds();
  saveKeybindProfiles();
}

function handleMobileDirection(directionName) {
  const map = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  const vector = map[directionName];
  if (vector) {
    applyDirectionVector(vector);
    return;
  }

  if (directionName === 'pause') {
    togglePause();
  }
  if (directionName === 'restart') {
    resetGame();
    setScreen('playing');
  }
}

function updateMobileControls() {
  const isMobile = window.matchMedia('(max-width: 760px)').matches || ('ontouchstart' in window && window.innerWidth < 760);
  mobileControls.classList.toggle('visible', isMobile);
}

function handleGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = pads[0];
  if (!pad) return;

  const axes = pad.axes;
  const horizontal = Math.round(axes[0] || 0);
  const vertical = Math.round(axes[1] || 0);

  if (Math.abs(horizontal) > 0.5 || Math.abs(vertical) > 0.5) {
    if (Math.abs(horizontal) > Math.abs(vertical)) {
      applyDirectionVector(horizontal > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
    } else {
      applyDirectionVector(vertical > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
    }
  }

  const pausePressed = pad.buttons[9]?.pressed || pad.buttons[7]?.pressed;
  if (pausePressed) togglePause();

  const restartPressed = pad.buttons[8]?.pressed || pad.buttons[6]?.pressed;
  if (restartPressed) {
    resetGame();
    setScreen('playing');
  }
}

async function init() {
  await loadStore();
  ensureGuestAccount();
  setCurrentAccount('guest');
  populateAccountSelect();
  renderLeaderboards();
  syncDifficultyLock();

  document.getElementById('startBtn').addEventListener('click', () => {
    resetGame();
    setScreen('playing');
  });

  document.getElementById('restartBtn').addEventListener('click', () => {
    resetGame();
    setScreen('playing');
  });

  document.getElementById('pauseRestartBtn').addEventListener('click', () => {
    resetGame();
    setScreen('playing');
  });

  document.getElementById('deathRestartBtn').addEventListener('click', () => {
    hideDeathOverlay();
    resetGame();
  });

  document.getElementById('resumeBtn').addEventListener('click', () => {
    resumeGame();
  });

  document.getElementById('switchAccountBtn').addEventListener('click', switchAccount);
  document.getElementById('addAccountBtn').addEventListener('click', addAccount);
  document.getElementById('renameAccountBtn').addEventListener('click', renameAccount);
  document.getElementById('removeAccountBtn').addEventListener('click', removeAccount);

  autoReplayToggle.addEventListener('change', () => {
    state.autoReplay = autoReplayToggle.checked;
    pauseAutoReplay.checked = state.autoReplay;
    deathAutoReplay.checked = state.autoReplay;
  });

  pauseAutoReplay.addEventListener('change', () => {
    state.autoReplay = pauseAutoReplay.checked;
    autoReplayToggle.checked = state.autoReplay;
    deathAutoReplay.checked = state.autoReplay;
  });

  deathAutoReplay.addEventListener('change', () => {
    state.autoReplay = deathAutoReplay.checked;
    autoReplayToggle.checked = state.autoReplay;
    pauseAutoReplay.checked = state.autoReplay;
  });

  diffSelect.addEventListener('change', (event) => {
    const next = event.target.value;
    if (state.running && state.screen === 'playing') {
      diffSelect.value = state.mode;
      return;
    }
    state.mode = next;
    pauseDifficulty.value = state.mode;
    deathDifficulty.value = state.mode;
    if (!state.running) {
      if (state.intervalId) clearInterval(state.intervalId);
      state.intervalId = setInterval(gameTick, computeTick());
    }
  });

  pauseDifficulty.addEventListener('change', (event) => {
    state.mode = event.target.value;
    diffSelect.value = state.mode;
    if (!state.running) {
      if (state.intervalId) clearInterval(state.intervalId);
      state.intervalId = setInterval(gameTick, computeTick());
    }
  });

  deathDifficulty.addEventListener('change', (event) => {
    state.mode = event.target.value;
    diffSelect.value = state.mode;
    if (!state.running) {
      if (state.intervalId) clearInterval(state.intervalId);
      state.intervalId = setInterval(gameTick, computeTick());
    }
  });

  keybindProfileSelect.addEventListener('change', (event) => {
    applyKeybindProfile(event.target.value);
  });

  leaderboardSelect.addEventListener('change', renderLeaderboards);
  document.addEventListener('keydown', handleKeyInput);

  document.querySelectorAll('[data-direction]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      handleMobileDirection(button.dataset.direction);
    });
  });

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      handleMobileDirection(button.dataset.action);
    });
  });

  window.addEventListener('resize', updateMobileControls);
  window.addEventListener('gamepadconnected', () => {});
  setInterval(handleGamepad, 90);

  state.mode = diffSelect.value || 'easy';
  pauseDifficulty.value = state.mode;
  deathDifficulty.value = state.mode;
  updateMobileControls();
  placeFood();
  updateHud();
  renderLeaderboards();
  loadKeybindProfiles();
  applyKeybindProfile('default');
  renderKeybinds();
  setScreen('start');
  draw();
}

init();