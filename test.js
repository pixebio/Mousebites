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
  snake: [],
  food: null,
  direction: { x: 1, y: 0 },
  nextDirection: { x: 1, y: 0 },
  intervalId: null,
  appleVisibleUntil: 0,
  appleSpawnDelay: 0,
  appleCount: 0,
  autoReplay: false,
  deathOverlayVisible: false
};

function defaultStore() {
  return {
    key: 'snake-demo-key',
    accounts: {
      guest: { name: 'Guest', password: '', guest: true, highScore: 0 }
    },
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
        leaderboards: obj.leaderboards || store.leaderboards
      };
    }
    return { key, accounts: parsed.accounts || store.accounts, leaderboards: parsed.leaderboards || store.leaderboards };
  } catch (err) {
    return defaultStore();
  }
}

function serialiseStore() {
  return JSON.stringify({
    key: state.key,
    data: encryptText(JSON.stringify({ accounts: state.accounts, leaderboards: state.leaderboards }), state.key)
  });
}

function syncDifficultyLock() {
  diffSelect.disabled = state.running;
  pauseDifficulty.value = state.mode;
  deathDifficulty.value = state.mode;
  pauseScore.textContent = `Score: ${Math.floor(state.score)}`;
  deathScore.textContent = `Score: ${Math.floor(state.score)}`;
  pauseAutoReplay.checked = state.autoReplay;
  deathAutoReplay.checked = state.autoReplay;
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
      state.leaderboards = store.leaderboards;
      return;
    }

    const response = await fetch('scores.txt');
    if (response.ok) {
      const text = await response.text();
      const store = parseStore(text);
      state.key = store.key;
      state.accounts = store.accounts;
      state.leaderboards = store.leaderboards;
    } else {
      const store = defaultStore();
      state.key = store.key;
      state.accounts = store.accounts;
      state.leaderboards = store.leaderboards;
    }
  } catch (err) {
    const store = defaultStore();
    state.key = store.key;
    state.accounts = store.accounts;
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

function placeFood() {
  let tries = 0;
  do {
    state.food = {
      x: Math.floor(Math.random() * (canvas.width / gridSize)),
      y: Math.floor(Math.random() * (canvas.height / gridSize))
    };
    tries += 1;
  } while (tries < 200 && state.snake.some(seg => seg.x === state.food.x && seg.y === state.food.y));

  if (state.mode === 'extreme') {
    state.appleVisibleUntil = Date.now() + 180;
    state.appleSpawnDelay = Date.now() + 180;
  }
}

function hideAllOverlays() {
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('pauseOverlay').classList.add('hidden');
  document.getElementById('deathOverlay').classList.add('hidden');
  state.deathOverlayVisible = false;
}

function resetGame() {
  const cols = canvas.width / gridSize;
  const rows = canvas.height / gridSize;
  state.score = 0;
  state.running = true;
  state.paused = false;
  state.snake = [{ x: Math.floor(cols / 2), y: Math.floor(rows / 2) }];
  state.direction = { x: 1, y: 0 };
  state.nextDirection = { x: 1, y: 0 };
  state.appleVisibleUntil = 0;
  state.appleCount = 0;
  hideAllOverlays();

  placeFood();
  updateHud();
  syncDifficultyLock();
  if (state.intervalId) clearInterval(state.intervalId);
  state.intervalId = setInterval(gameTick, computeTick());
}

function showStart() {
  document.getElementById('startScreen').classList.remove('hidden');
}

function hideStart() {
  document.getElementById('startScreen').classList.add('hidden');
}

function showDeathOverlay() {
  const deathScreen = document.getElementById('deathOverlay');
  const deathMessage = document.getElementById('deathScore');
  deathMessage.textContent = `Score: ${Math.floor(state.score)}`;
  deathScreen.classList.remove('hidden');
  state.deathOverlayVisible = true;
  deathDifficulty.value = state.mode;
}

function hideDeathOverlay() {
  document.getElementById('deathOverlay').classList.add('hidden');
  state.deathOverlayVisible = false;
}

function pauseGame() {
  if (!state.running || state.paused || state.deathOverlayVisible) return;
  state.paused = true;
  pauseScore.textContent = `Score: ${Math.floor(state.score)}`;
  pauseDifficulty.value = state.mode;
  pauseAutoReplay.checked = state.autoReplay;
  pauseOverlay.classList.remove('hidden');
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
}

function resumeGame() {
  if (!state.running || !state.paused) return;
  state.paused = false;
  pauseOverlay.classList.add('hidden');
  state.intervalId = setInterval(gameTick, computeTick());
}

function canTurnTo(newDirection) {
  return !(newDirection.x === -state.direction.x && newDirection.y === -state.direction.y)
    && !(newDirection.x === -state.nextDirection.x && newDirection.y === -state.nextDirection.y);
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
  const startScreen = document.getElementById('startScreen');
  if (startScreen && !startScreen.classList.contains('hidden') && startKeys.includes(key)) {
    resetGame();
    hideStart();
    return;
  }

  if (key === normalizeKey(state.keybinds.pause)) {
    if (!state.running) return;
    if (state.paused) resumeGame();
    else pauseGame();
    return;
  }

  if (key === normalizeKey(state.keybinds.restart)) {
    resetGame();
    hideAllOverlays();
    hideStart();
    return;
  }

  if (event.key === 'Escape' && state.paused) {
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

  if (next && canTurnTo(next)) {
    state.nextDirection = next;
  }
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
    pauseScore.textContent = `Score: ${Math.floor(state.score)}`;
    pauseDifficulty.value = state.mode;
    pauseAutoReplay.checked = state.autoReplay;
    pauseOverlay.classList.remove('hidden');
    setTimeout(() => {
      pauseOverlay.classList.add('hidden');
      resetGame();
      hideAllOverlays();
    }, 900);
    return;
  }

  showDeathOverlay();
}

function updateGame() {
  if (!state.running || state.paused) return;

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
    if (state.mode === 'extreme') {
      if (Math.floor(state.score) >= 5) {
        state.nextDirection = { x: 1, y: 0 };
      }
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

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.mode === 'drunk') {
    const wobbleX = Math.sin(Date.now() / 180) * 3;
    const wobbleY = Math.cos(Date.now() / 220) * 3;
    ctx.save();
    ctx.translate(wobbleX, wobbleY);
  }

  for (let i = 1; i < state.snake.length; i += 1) {
    drawCell(state.snake[i].x, state.snake[i].y, '#00ff00');
  }

  if (state.snake.length > 0) {
    drawCell(state.snake[0].x, state.snake[0].y, '#007f00');
  }

  if (state.food && (state.mode !== 'extreme' || Date.now() < state.appleVisibleUntil)) {
    drawCell(state.food.x, state.food.y, '#ff0000');
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
  if (!state.running) {
    if (state.intervalId) clearInterval(state.intervalId);
    state.intervalId = setInterval(gameTick, computeTick());
  }
}

function addAccount() {
  const name = prompt('New account name:');
  if (!name || !name.trim()) return;
  const cleanName = name.trim();
  const password = prompt(`Password for ${cleanName}:`);
  if (password === null) return;
  const key = cleanName.toLowerCase();
  if (state.accounts[key]) {
    alert('Account already exists.');
    return;
  }

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

  const confirmDelete = confirm(`Remove account ${state.accounts[selected].name}?`);
  if (!confirmDelete) return;

  delete state.accounts[selected];
  if (state.currentAccount === selected) {
    state.currentAccount = 'guest';
  }
  populateAccountSelect();
  setCurrentAccount(state.currentAccount);
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

async function init() {
  await loadStore();
  ensureGuestAccount();
  setCurrentAccount('guest');
  populateAccountSelect();
  renderLeaderboards();
  syncDifficultyLock();

  document.getElementById('startBtn').addEventListener('click', () => {
    resetGame();
    hideStart();
  });

  document.getElementById('restartBtn').addEventListener('click', () => {
    resetGame();
    hideStart();
  });

  document.getElementById('pauseRestartBtn').addEventListener('click', () => {
    resetGame();
    hideAllOverlays();
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
    if (state.running) {
      diffSelect.value = state.mode;
      return;
    }
    state.mode = event.target.value;
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

  state.mode = diffSelect.value || 'easy';
  pauseDifficulty.value = state.mode;
  deathDifficulty.value = state.mode;
  placeFood();
  updateHud();
  renderLeaderboards();
  loadKeybindProfiles();
  applyKeybindProfile('default');
  renderKeybinds();
}

init();