"use strict";

const SIZE = 10;
const ROUND_SECONDS = 60;

const WORDS = {
  vi: ["alice","hoa","nắng","mây","trăng","biển","rừng","sao","mưa","gió","sách","mèo","chim","cây","nhà","đường","nước","lửa","mùa hè","bình minh","cầu vồng","ánh sáng","hoa sen","bầu trời","dòng sông","cánh đồng","ngôi sao"],
  en: ["alice","flower","sun","moon","cloud","ocean","forest","star","rain","wind","book","cat","bird","tree","house","river","water","light","dream","spring","rainbow","garden","butterfly","sunshine","mountain","flowerpot"]
};

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
  found: new Set(),
  selected: [],
  running: false,
  seconds: ROUND_SECONDS,
  score: 0,
  timer: null,
  pointerDown: false,
  direction: null,
  soundOn: true,
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

function generateRound() {
  clearInterval(state.timer);
  state.grid = Array.from({length:SIZE}, () => Array(SIZE).fill(""));
  state.found.clear();
  state.selected = [];
  state.direction = null;
  state.seconds = ROUND_SECONDS;
  state.score = 0;

  const candidates = shuffle(WORDS[state.language].map(normalize)
    .filter(w => w.length >= 2 && w.length <= SIZE))
    .sort((a,b) => b.length - a.length);

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

function changeLanguage(value) {
  if (!["vi","en"].includes(value)) return;
  state.language = value;
  if (state.running) generateRound();
  else {
    $("subtitle").textContent = value === "vi" ? "Tìm những từ ẩn!" : "Find the hidden words!";
    $("start-game").textContent = value === "vi" ? "Bắt đầu" : "Start Game";
    $("game-message").textContent = "";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("start-game").addEventListener("click", generateRound);
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
  document.addEventListener("pointerup", e => {
    if (state.pointerDown && e.pointerId === state.pointerId) endSelection();
  });
  document.addEventListener("pointercancel", () => {
    state.pointerDown = false;
    state.selected = [];
    state.direction = null;
    paintSelection();
  });
});
