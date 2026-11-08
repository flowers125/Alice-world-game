"use strict";

const SIZE = 10;
const ROUND_SECONDS = 60;

const FALLBACK_WORDS = {
  vi: ["alice","hoa","nắng","mây","trăng","biển","rừng","sao","mưa","gió","sách","mèo","chim","cây","nhà","đường","nước","mùa hè","bình minh","cầu vồng"],
  en: ["alice","flower","sun","moon","cloud","ocean","forest","star","rain","wind","book","cat","bird","tree","house","river","water","light","dream","spring"]
};
const DICTIONARY_URLS = { vi: "dictionaries/vi.txt", en: "dictionaries/en.txt" };

const ALPHABETS = {
  vi: Array.from("aăâbcdđeêghiklmnoôơpqrstuưvxy"),
  en: Array.from("abcdefghijklmnopqrstuvwxyz")
};
const DIRECTIONS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
const PALETTES = [
  { bg:"#e8eee4", cell:"#dce8d8", accent:"#66856a" },
  { bg:"#f4f0e8", cell:"#ebe3d6", accent:"#a78359" },
  { bg:"#e5eff5", cell:"#d6e6ef", accent:"#648ba5" },
  { bg:"#eee9f7", cell:"#e1d9f0", accent:"#8874b5" },
  { bg:"#f8ece5", cell:"#f0ddd2", accent:"#b77d67" },
  { bg:"#e6edf0", cell:"#d7e2e7", accent:"#718d9b" }
];

const state = {
  language: "vi",
  difficulty: "normal",
  grid: [],
  words: [],
  dictionary: { vi: [], en: [] },
  dictionaryReady: false,
  found: new Set(),
  selected: [],
  running: false,
  seconds: ROUND_SECONDS,
  score: 0,
  timer: null,
  pointerDown: false,
  direction: null,
  soundOn: (() => { try { return localStorage.getItem("alice-sound") !== "off"; } catch (_) { return true; } })(),
  audio: null
};

const $ = id => document.getElementById(id);
const shuffle = list => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const normalize = word => Array.from(
  word.normalize("NFC").toLocaleLowerCase(state.language).replace(/\s+/g, "")
);

function scoreFor(count) {
  const base = count === 1 ? 2 : count === 2 ? 5 : count >= 3 ? 12 : 0;
  if (state.difficulty === "very-easy") return Math.floor(base / 2);
  return base + (state.difficulty === "very-hard" ? count * 3 : 0);
}

function canPlace(grid, letters, row, col, dr, dc) {
  for (let i = 0; i < letters.length; i++) {
    const r = row + dr * i, c = col + dc * i;
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
    if (grid[r][c] && grid[r][c] !== letters[i]) return false;
  }
  return true;
}

function placeWord(grid, letters) {
  const starts = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of DIRECTIONS) starts.push([r,c,dr,dc]);
    }
  }
  for (const [r,c,dr,dc] of shuffle(starts)) {
    if (!canPlace(grid, letters, r, c, dr, dc)) continue;
    letters.forEach((letter, i) => { grid[r + dr*i][c + dc*i] = letter; });
    return true;
  }
  return false;
}

function selectCandidates(sourceWords, difficulty) {
  const minWordLength = difficulty === "very-hard" ? 4 : 2;
  const targetLimit = difficulty === "very-hard" ? 28 : 16;
  return shuffle([...new Set(sourceWords
    .filter(raw => !/\s/u.test(raw.trim()))
    .map(normalize)
    .filter(w => w.length >= minWordLength && w.length <= SIZE)
    .map(w => w.join("")))])
    .slice(0, targetLimit)
    .map(word => Array.from(word))
    .sort((a,b) => b.length - a.length);
}

function generateRound() {
  clearInterval(state.timer);
  state.grid = Array.from({length:SIZE}, () => Array(SIZE).fill(""));
  state.found.clear();
  state.selected = [];
  state.direction = null;
  state.seconds = ROUND_SECONDS;
  state.score = 0;

  const sourceWords = state.dictionary[state.language].length
    ? state.dictionary[state.language]
    : FALLBACK_WORDS[state.language];
  const candidates = selectCandidates(sourceWords, state.difficulty);

  state.words = [];
  for (const word of candidates) {
    if (placeWord(state.grid, word)) state.words.push(word.join(""));
  }

  const alphabet = ALPHABETS[state.language];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!state.grid[r][c]) state.grid[r][c] = alphabet[Math.floor(Math.random()*alphabet.length)];
    }
  }

  const palette = PALETTES[Math.floor(Math.random()*PALETTES.length)];
  document.documentElement.style.setProperty("--bg", palette.bg);
  document.documentElement.style.setProperty("--cell", palette.cell);
  document.documentElement.style.setProperty("--primary", palette.accent);

  state.running = true;
  $("game-message").textContent = "";
  renderGrid();
  updateHUD();
  state.timer = setInterval(() => {
    state.seconds--;
    updateHUD();
    if (state.seconds <= 0) finishRound();
  }, 1000);
}

function renderGrid() {
  const grid = $("game-grid");
  grid.innerHTML = "";
  state.grid.forEach((row, r) => row.forEach((letter, c) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "grid-cell";
    cell.textContent = letter.toLocaleUpperCase(state.language);
    cell.dataset.row = r;
    cell.dataset.col = c;
    cell.setAttribute("aria-label", `Row ${r+1}, column ${c+1}`);
    grid.appendChild(cell);
  }));
}

function updateHUD() {
  $("timer").textContent = state.seconds;
  $("score").textContent = state.score;
}

function cellAt(x,y) {
  const el = document.elementFromPoint(x,y);
  return el && el.closest ? el.closest(".grid-cell") : null;
}

function beginSelection(cell, pointerId) {
  if (!state.running || !cell) return;
  state.pointerDown = true;
  state.pointerId = pointerId;
  state.direction = null;
  state.selected = [{row:+cell.dataset.row, col:+cell.dataset.col}];
  paintSelection();
}

function moveSelection(cell) {
  if (!state.pointerDown || !cell) return;
  const start = state.selected[0];
  const row = +cell.dataset.row, col = +cell.dataset.col;
  const dr0 = row - start.row, dc0 = col - start.col;
  if (dr0 === 0 && dc0 === 0) return;

  if (!state.direction) {
    if (!(dr0 === 0 || dc0 === 0 || Math.abs(dr0) === Math.abs(dc0))) return;
    state.direction = [Math.sign(dr0), Math.sign(dc0)];
  }
  const [dr,dc] = state.direction;
  let steps;
  if (dr === 0) {
    if (row !== start.row || dc0 * dc < 0) return;
    steps = Math.abs(dc0);
  } else if (dc === 0) {
    if (col !== start.col || dr0 * dr < 0) return;
    steps = Math.abs(dr0);
  } else {
    if (dr0 * dr < 0 || dc0 * dc < 0 || Math.abs(dr0) !== Math.abs(dc0)) return;
    steps = Math.abs(dr0);
  }
  if (steps >= SIZE) return;
  state.selected = Array.from({length:steps+1}, (_,i) => ({row:start.row+dr*i,col:start.col+dc*i}));
  paintSelection();
}

function paintSelection() {
  document.querySelectorAll(".grid-cell.selected").forEach(el => el.classList.remove("selected"));
  state.selected.forEach(({row,col}) => {
    const el = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
    if (el) el.classList.add("selected");
  });
}

function endSelection() {
  if (!state.pointerDown) return;
  state.pointerDown = false;
  const letters = state.selected.map(({row,col}) => state.grid[row][col]).join("");
  const reversed = Array.from(letters).reverse().join("");
  const found = state.selected.length > 1 && state.words.find(word =>
    (word === letters || word === reversed) && !state.found.has(word)
  );

  if (found) {
    state.found.add(found);
    state.score = scoreFor(state.found.size);
    $("game-message").textContent = state.language === "vi" ? "Tìm thấy từ!" : "Word found!";
    playTone(660);
    updateHUD();
  } else if (state.selected.length > 1) {
    $("game-message").textContent = state.language === "vi" ? "Chưa đúng, thử lại nhé!" : "Not quite. Try again!";
    playTone(190);
  }
  state.selected = [];
  state.direction = null;
  paintSelection();
}

function finishRound() {
  clearInterval(state.timer);
  state.running = false;
  state.pointerDown = false;
  state.selected = [];
  paintSelection();
  $("game-message").textContent = state.language === "vi"
    ? `Hết giờ! Tìm được ${state.found.size} từ. Điểm: ${state.score}`
    : `Time's up! You found ${state.found.size} words. Score: ${state.score}`;
  playTone(330);
}

function playTone(frequency) {
  if (!state.soundOn) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    state.audio = state.audio || new AudioContextClass();
    const oscillator = state.audio.createOscillator();
    const gain = state.audio.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(state.audio.destination);
    oscillator.start();
    oscillator.stop(state.audio.currentTime + 0.11);
  } catch (_) {}
}

function applyLanguage() {
  const vi = state.language === "vi";
  document.documentElement.lang = state.language;
  $("subtitle").textContent = vi ? "Tìm những từ ẩn!" : "Find the hidden words!";
  $("timer-label").textContent = vi ? "Thời gian" : "Time";
  $("score-label").textContent = vi ? "Điểm" : "Score";
  $("start-game").textContent = vi ? "Bắt đầu" : "Start Game";
  $("help-button").textContent = vi ? "Cách chơi" : "How to play";
  $("sound-button").textContent = vi
    ? (state.soundOn ? "Âm thanh: Bật" : "Âm thanh: Tắt")
    : (state.soundOn ? "Sound: On" : "Sound: Off");
  $("difficulty").options[0].textContent = vi ? "Rất dễ" : "Very Easy";
  $("difficulty").options[1].textContent = vi ? "Bình thường" : "Normal";
  $("difficulty").options[2].textContent = vi ? "Rất khó" : "Very Hard";
  $("help-title").textContent = vi ? "Cách chơi" : "How to play";
  $("help-copy").textContent = vi
    ? "Tìm các từ ẩn bằng cách kéo qua những chữ cái theo đường thẳng: ngang, dọc hoặc chéo. Từ có thể xuất hiện theo cả hai chiều. Mỗi từ chỉ được tính điểm một lần. Bạn có 60 giây! Rất dễ nhận một nửa điểm của Bình thường; Rất khó yêu cầu từ dài ít nhất 4 chữ và thưởng thêm 3 điểm mỗi từ."
    : "Find hidden words by dragging in a straight line: horizontally, vertically, or diagonally. Words may appear in either direction. Each word scores only once. You have 60 seconds! Very Hard has more words, with a minimum length of 4 letters, and awards 3 bonus points per word.";
  $("close-help").textContent = vi ? "Đã hiểu" : "Got it";
  $("google-sign-in").textContent = vi ? "Đăng nhập Google" : "Sign in with Google";
  $("sign-out").textContent = vi ? "Đăng xuất" : "Sign out";
  $("display-name-label").textContent = vi ? "Tên hiển thị" : "Display name";
  $("display-name").placeholder = vi ? "Tên hiển thị" : "Display name";
  $("save-profile").textContent = vi ? "Lưu tên" : "Save name";
  $("leaderboard-button").textContent = vi ? "Bảng xếp hạng" : "Leaderboard";
  $("leaderboard-title").textContent = vi ? "Bảng xếp hạng" : "Leaderboard";
  $("close-leaderboard").textContent = vi ? "Đóng" : "Close";
  $("leaderboard-difficulty").options[0].textContent = vi ? "Rất dễ" : "Very Easy";
  $("leaderboard-difficulty").options[1].textContent = vi ? "Bình thường" : "Normal";
  $("leaderboard-difficulty").options[2].textContent = vi ? "Rất khó" : "Very Hard";
  $("language").setAttribute("aria-label", vi ? "Ngôn ngữ" : "Language");
  $("difficulty").setAttribute("aria-label", vi ? "Độ khó" : "Difficulty");
  if (state.user) {
    $("account-status").textContent = vi ? "Đã đăng nhập Google." : "Signed in with Google.";
  } else if (!window.ALICE_SUPABASE_URL || !window.ALICE_SUPABASE_ANON_KEY) {
    $("account-status").textContent = vi
      ? "Chế độ khách · Chưa cấu hình Supabase."
      : "Guest mode · Supabase is not configured.";
  } else {
    $("account-status").textContent = vi
      ? "Đang chơi với tư cách khách · Điểm không được lưu online."
      : "Playing as guest · Scores are not saved online.";
  }
}

function changeLanguage(value) {
  if (!["vi","en"].includes(value)) return;
  state.language = value;
  applyLanguage();
  if (state.running) generateRound();
  else $("game-message").textContent = "";
}

async function loadDictionaries() {
  $("start-game").disabled = true;
  $("game-message").textContent = state.language === "vi" ? "Đang tải từ điển..." : "Loading dictionaries...";
  const results = await Promise.all(["vi", "en"].map(async language => {
    try {
      const response = await fetch(DICTIONARY_URLS[language], { cache: "no-cache" });
      if (!response.ok) throw new Error("Dictionary request failed");
      const text = await response.text();
      return [language, text.split(/\r?\n/)
        .map(word => word.normalize("NFC").trim())
        .filter(Boolean)];
    } catch (_) {
      return [language, FALLBACK_WORDS[language]];
    }
  }));
  results.forEach(([language, words]) => { state.dictionary[language] = words; });
  state.dictionaryReady = true;
  $("start-game").disabled = state.backendReady === false;
  $("game-message").textContent = "";
}

document.addEventListener("DOMContentLoaded", () => {
  const artSets = [["🌼","🌿","🍃","🌷","🦋"],["🐇","🌸","🍀","🐝","🌱"],["🐈","🌻","🍃","🦋","🌼"],["🦊","🌿","🌷","🍀","🐦"]];
  const art = document.createElement("div");
  art.className = "ambient-art";
  art.setAttribute("aria-hidden", "true");
  const motifs = artSets[Math.floor(Math.random() * artSets.length)];
  for (let i = 0; i < 18; i++) {
    const item = document.createElement("span");
    item.textContent = motifs[i % motifs.length];
    item.style.left = (4 + Math.random() * 92) + "%";
    item.style.top = (3 + Math.random() * 94) + "%";
    item.style.fontSize = (18 + Math.random() * 22) + "px";
    item.style.transform = `rotate(${-25 + Math.random() * 50}deg)`;
    art.appendChild(item);
  }
  document.body.prepend(art);
  $("start-game").addEventListener("click", generateRound);
  loadDictionaries().catch(() => {
    state.dictionaryReady = true;
    $("start-game").disabled = state.backendReady === false;
    $("game-message").textContent = state.language === "vi" ? "Dùng bộ từ dự phòng." : "Using fallback words.";
  });
  applyLanguage();
  $("sound-button").addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    try { localStorage.setItem("alice-sound", state.soundOn ? "on" : "off"); } catch (_) {}
    applyLanguage();
    if (state.soundOn) playTone(660);
  });
  $("help-button").addEventListener("click", () => $("help-dialog").showModal());
  $("close-help").addEventListener("click", () => $("help-dialog").close());
  $("language").addEventListener("change", e => changeLanguage(e.target.value));
  $("difficulty").addEventListener("change", e => {
    state.difficulty = e.target.value;
    if (state.running) generateRound();
  });

  $("game-grid").addEventListener("pointerdown", e => {
    const cell = e.target.closest(".grid-cell");
    if (!cell) return;
    e.preventDefault();
    beginSelection(cell, e.pointerId);
  });
  document.addEventListener("pointermove", e => {
    if (!state.pointerDown || e.pointerId !== state.pointerId) return;
    moveSelection(cellAt(e.clientX,e.clientY));
  });
  window.addEventListener("pointerup", e => {
    if (state.pointerDown && e.pointerId === state.pointerId) endSelection();
  }, true);
  window.addEventListener("pointercancel", e => {
    if (!state.pointerDown || e.pointerId !== state.pointerId) return;
    state.pointerDown = false;
    state.selected = [];
    state.direction = null;
    $("game-message").textContent = state.language === "vi"
      ? "Thao tác kéo đã bị gián đoạn, hãy thử lại."
      : "Selection was interrupted. Please try again.";
    paintSelection();
  }, true);
});
