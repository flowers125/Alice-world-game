"use strict";

const ROWS = 15;
const COLS = 20;
const MAX_WORD_LENGTH = 20;
const ROUND_SECONDS = 180;

const FALLBACK_WORDS = {
  vi: ["alice","cá","cơm","đèn","thuyền","hoa","lá","sữa","nhà","nắng","mây","trăng","biển","rừng","sao","mưa","gió","sách","mèo","chim","cây","đường","nước","bình minh","cầu vồng"],
  en: ["alice","no","yes","say","cat","dog","sun","flower","moon","cloud","ocean","forest","star","rain","wind","book","bird","tree","house","river","water","light","dream","spring"]
};
const DICTIONARY_URLS = { vi: "dictionaries/vi.txt", en: "dictionaries/en.txt" };

const ALPHABETS = {
  vi: Array.from("aăâbcdđeêghiklmnoôơpqrstuưvxyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủụứừửựýỳỷỹỵ"),
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
  validWords: new Set(),
  letterWeights: {vi: [], en: []},
  found: new Set(),
  selected: [],
  running: false,
  seconds: ROUND_SECONDS,
  score: 0,
  timer: null,
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

function buildValidWordSet(words) {
  return new Set(words
    .map(word => normalize(word).join(""))
    .filter(word => Array.from(word).length >= 2));
}

function buildLetterWeights(words) {
  const counts = new Map();
  for (const raw of words) {
    if (/\s/u.test(raw.trim())) continue;
    for (const letter of Array.from(raw.normalize("NFC").toLocaleLowerCase())) {
      counts.set(letter, (counts.get(letter) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([letter, weight]) => ({letter, weight}));
}

function randomWeightedLetter(weights, fallback) {
  if (!weights.length) return fallback[Math.floor(Math.random() * fallback.length)];
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  let pick = Math.random() * total;
  for (const item of weights) {
    pick -= item.weight;
    if (pick <= 0) return item.letter;
  }
  return weights[weights.length - 1].letter;
}

function injectStarterWords(language) {
  const starterWords = language === "vi"
    ? ["cá","cơm","đèn","thuyền","hoa","lá","sữa","nhà"]
    : ["say","no","yes"];
  const used = new Set();
  for (const word of starterWords) {
    for (const letter of Array.from(word.normalize("NFC"))) {
      let index;
      do { index = Math.floor(Math.random() * ROWS * COLS); } while (used.has(index));
      used.add(index);
      state.grid[Math.floor(index / COLS)][index % COLS] = letter;
    }
  }
}

function scoreFor(length) {
  if (length === 2) return 1;
  if (length === 3) return 2;
  if (length === 4) return 3;
  if (length === 5) return 7;
  if (length === 6) return 8;
  if (length === 7) return 9;
  if (length === 8) return 11;
  return length >= 9 ? 15 : 0;
}

function canPlace(grid, letters, row, col, dr, dc) {
  for (let i = 0; i < letters.length; i++) {
    const r = row + dr * i, c = col + dc * i;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (grid[r][c] && grid[r][c] !== letters[i]) return false;
  }
  return true;
}

function placeWord(grid, letters) {
  const starts = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
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
  const targetLimit = difficulty === "very-hard" ? 42 : 36;
  const words = shuffle([...new Set(sourceWords
    .filter(raw => !/\s/u.test(raw.trim()))
    .map(normalize)
    .filter(w => w.length >= 2 && w.length <= MAX_WORD_LENGTH)
    .map(w => w.join("")))]);
  // Keep short, everyday words present in every round instead of letting
  // long words crowd them out of the 300-cell board.
  const buckets = [
    { min: 2, max: 3, count: difficulty === "very-hard" ? 14 : 12 },
    { min: 4, max: 5, count: difficulty === "very-hard" ? 10 : 8 },
    { min: 6, max: 7, count: difficulty === "very-hard" ? 9 : 8 },
    { min: 8, max: MAX_WORD_LENGTH, count: difficulty === "very-hard" ? 9 : 8 }
  ];
  const preferred = state.language === "vi"
    ? ["cá","cơm","đèn","thuyền","hoa","lá","sữa","nhà"]
    : ["say","no","yes","bad"];
  const chosen = preferred
    .map(raw => normalize(raw).join(""))
    .filter(word => words.includes(word));
  const used = new Set(chosen);
  for (const bucket of buckets) {
    const alreadyChosen = chosen.filter(word =>
      word.length >= bucket.min && word.length <= bucket.max
    ).length;
    const needed = Math.max(0, bucket.count - alreadyChosen);
    const group = shuffle(words.filter(word =>
      word.length >= bucket.min && word.length <= bucket.max && !used.has(word)
    )).slice(0, needed);
    group.forEach(word => { chosen.push(word); used.add(word); });
  }
  if (chosen.length < targetLimit) {
    shuffle(words.filter(word => !used.has(word)))
      .slice(0, targetLimit - chosen.length)
      .forEach(word => chosen.push(word));
  }
  return chosen.map(word => Array.from(word)).sort((a,b) => b.length - a.length);
}

function generateRound() {
  clearInterval(state.timer);
  state.grid = Array.from({length:ROWS}, () => Array(COLS).fill(""));
  state.found.clear();
  state.selected = [];
  state.direction = null;
  state.seconds = ROUND_SECONDS;
  state.score = 0;

  state.words = [];
  const alphabet = ALPHABETS[state.language];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      state.grid[r][c] = randomWeightedLetter(state.letterWeights[state.language], alphabet);
    }
  }
  injectStarterWords(state.language);

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
    cell.textContent = letter ? letter.toLocaleUpperCase(state.language) : "";
    cell.disabled = !letter || !state.running;
    if (!letter) cell.classList.add("empty");
    cell.dataset.row = r;
    cell.dataset.col = c;
    cell.setAttribute("aria-label", `${letter ? letter.toLocaleUpperCase(state.language) + ", " : ""}row ${r+1}, column ${c+1}`);
    cell.setAttribute("aria-pressed", "false");
    // Bind the tap directly to each cell. This avoids relying on delegated
    // click events bubbling through the grid on mobile browsers.
    cell.addEventListener("click", () => {
      if (!state.running || cell.disabled) return;
      const position = {row:r,col:c};
      const existing = state.selected.findIndex(p => p.row === r && p.col === c);
      if (existing >= 0) state.selected.splice(existing, 1);
      else state.selected.push(position);
      paintSelection();
      renderWordBuilder();
    });
    grid.appendChild(cell);
  }));
  renderWordBuilder();
}

function celebrateFoundWord(cells) {
  cells.forEach(({row,col},i)=>{const el=document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);if(!el)return;el.classList.remove("word-found");void el.offsetWidth;el.classList.add("word-found");el.style.animationDelay=`${i*18}ms`;window.setTimeout(()=>{el.classList.remove("word-found");el.style.animationDelay="";},850+i*18);});
}

function updateHUD() {
  $("timer").textContent = state.seconds;
  $("score").textContent = state.score;
}

function renderWordBuilder() {
  const word = state.selected.map(({row,col}) => state.grid[row][col]).join("").toLocaleUpperCase(state.language);
  $("word-builder").textContent = word || (state.language === "vi" ? "Chọn chữ cái để ghép từ" : "Tap letters to build a word");
  $("confirm-word").disabled = !state.running || state.selected.length < 2;
  $("clear-word").disabled = !state.selected.length;
}

function clearWordSelection() {
  state.selected = [];
  paintSelection();
  renderWordBuilder();
}

function localSubmitWord(cells) {
  if (!state.running || cells.length < 2) return;
  const word = cells.map(({row,col}) => state.grid[row][col]).join("").normalize("NFC").toLocaleLowerCase(state.language);
  const key = normalize(word).join("");
  const length = Array.from(word).length;
  if (length < 2 || !state.validWords.has(key) || state.found.has(key)) {
    $("game-message").textContent = state.language === "vi" ? "Từ không hợp lệ, thử ghép từ khác nhé!" : "Not a valid word. Try another!";
    playTone(190);
    return;
  }
  state.found.add(key);
  state.score += scoreFor(length);
  cells.forEach(({row,col}) => { state.grid[row][col] = ""; });
  $("game-message").textContent = (state.language === "vi" ? "Tìm thấy: " : "Found: ") + word.toLocaleUpperCase(state.language);
  playTone(660);
  renderGrid();
  updateHUD();
  if (state.grid.every(row => row.every(letter => !letter))) finishRound();
}

window.handleWordSubmit = async cells => localSubmitWord(cells);

async function confirmSelectedWord() {
  if (!state.running || state.selected.length < 2) return;
  const cells = state.selected.slice();
  clearWordSelection();
  await window.handleWordSubmit(cells);
}

function paintSelection() {
  document.querySelectorAll(".grid-cell.selected").forEach(el => { el.classList.remove("selected"); el.setAttribute("aria-pressed", "false"); });
  state.selected.forEach(({row,col}) => {
    const el = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
    if (el) { el.classList.add("selected"); el.setAttribute("aria-pressed", "true"); }
  });
}

function finishRound() {
  clearInterval(state.timer);
  state.running = false;
  state.selected = [];
  paintSelection();
  renderWordBuilder();
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
  $("confirm-word").textContent = "OK";
  $("clear-word").textContent = vi ? "Xóa chọn" : "Clear";
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
    ? "Click lần lượt từng chữ cái bất kỳ để ghép thành từ có nghĩa, sau đó nhấn OK hoặc Enter. Từ hợp lệ sẽ được tính điểm và các chữ đã dùng biến mất, ô trống không sinh chữ mới. Bạn có 180 giây!"
    : "Tap letters in any order to build a meaningful word, then press OK or Enter. Valid words score points and their cells disappear. Empty cells stay empty. You have 180 seconds!";
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
    const name = state.displayName || "";
    $("account-status").textContent = vi
      ? (name ? "Đã đăng nhập · Tên: " + name : "Đã đăng nhập Google · Hãy đặt tên hiển thị một lần.")
      : (name ? "Signed in · Name: " + name : "Signed in with Google · Choose your display name once.");
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
  state.validWords = buildValidWordSet(state.dictionary[state.language]);
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
  results.forEach(([language, words]) => {
    state.dictionary[language] = words;
    state.letterWeights[language] = buildLetterWeights(words);
  });
  state.validWords = buildValidWordSet(state.dictionary[state.language]);
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

  $("confirm-word").addEventListener("click", confirmSelectedWord);
  $("clear-word").addEventListener("click", clearWordSelection);
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && state.running && state.selected.length >= 2) {
      e.preventDefault();
      confirmSelectedWord();
    }
  });
});
