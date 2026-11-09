const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("script.js", "utf8");
const sandbox = {
  document: { addEventListener() {}, documentElement: { style: { setProperty() {} } } },
  localStorage: { getItem() { return "off"; } },
  window: {},
  console,
  setInterval() { return 1; },
  clearInterval() {},
};
vm.runInNewContext(
  source + "\nglobalThis.__gameTest = { state, scoreFor, normalize, ROWS, COLS, buildLetterWeights, buildValidWordSet, randomWeightedLetter, injectStarterWords };",
  sandbox,
);
const { state, scoreFor, normalize, ROWS, COLS, buildLetterWeights, buildValidWordSet, randomWeightedLetter, injectStarterWords } = sandbox.__gameTest;

test("letter-length scoring matches the agreed table", () => {
  assert.deepEqual(
    Array.from({ length: 10 }, (_, index) => scoreFor(index + 1)),
    [0, 1, 2, 3, 7, 8, 9, 11, 15, 15],
  );
});

test("all three difficulty modes use the agreed word-length score table", () => {
  for (const mode of ["very-easy", "normal", "very-hard"]) {
    state.difficulty = mode;
    assert.deepEqual([2, 3, 4, 5, 6, 7, 8, 9].map(scoreFor), [1, 2, 3, 7, 8, 9, 11, 15]);
  }
});

test("Vietnamese normalization uses NFC, lowercase, and removes spaces", () => {
  state.language = "vi";
  assert.equal(Array.from(normalize(" ĐIỆN thoại ")).join(""), "điệnthoại");
});

test("the board dimensions remain 15 by 20", () => {
  assert.equal(ROWS, 15);
  assert.equal(COLS, 20);
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill("x"));
  assert.equal(board.flat().length, 300);
});

test("valid-word dictionary accepts single and multi-syllable entries without spaces", () => {
  state.language = "vi";
  const valid = buildValidWordSet(["cá", "bình minh", "tình yêu", "bạn bè", "một ngày mới"]);
  for (const word of ["cá", "bìnhminh", "tìnhyêu", "bạnbè", "mộtngàymới"]) {
    assert.equal(valid.has(word), true, "missing valid entry: " + word);
  }
  assert.equal(valid.has("khongcotu"), false);
});

test("letter weights are based on dictionary letter frequency", () => {
  const weights = buildLetterWeights(["cá", "cơm", "hoa", "mùa hè"]);
  const map = new Map(weights.map(item => [item.letter, item.weight]));
  assert.equal(map.get("c"), 2);
  assert.equal(map.get("á"), 1);
  assert.equal(map.has(" "), false);
  assert.equal(randomWeightedLetter([{ letter: "z", weight: 1 }], ["a"]), "z");
});

test("starter words are seeded into the 300-cell Vietnamese board", () => {
  state.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
  injectStarterWords("vi");
  const letters = state.grid.flat().join("");
  for (const word of ["cá", "cơm", "đèn", "thuyền", "hoa", "lá", "sữa", "nhà"]) {
    for (const letter of Array.from(word)) {
      assert.equal(letters.includes(letter), true, "missing starter letter: " + letter);
    }
  }
});
