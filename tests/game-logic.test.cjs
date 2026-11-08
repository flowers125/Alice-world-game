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
  source + "\nglobalThis.__gameTest = { state, scoreFor, normalize, placeWord, selectCandidates };",
  sandbox,
);
const { state, scoreFor, normalize, placeWord, selectCandidates } = sandbox.__gameTest;

test("normal scoring follows the agreed cumulative score", () => {
  state.difficulty = "normal";
  assert.deepEqual([1, 2, 3, 4, 5].map(scoreFor), [2, 5, 12, 12, 12]);
});

test("very easy awards half the normal cumulative score, rounded down", () => {
  state.difficulty = "very-easy";
  assert.deepEqual([1, 2, 3, 4, 5].map(scoreFor), [1, 2, 6, 6, 6]);
});

test("very hard adds three points for every found word", () => {
  state.difficulty = "very-hard";
  assert.deepEqual([1, 2, 3, 4, 5].map(scoreFor), [5, 11, 21, 24, 27]);
});

test("Vietnamese normalization uses NFC, lowercase, and removes spaces", () => {
  state.language = "vi";
  assert.equal(Array.from(normalize(" ĐIỆN thoại ")).join(""), "điệnthoại");
});

test("word placement fits a ten-letter word inside the 10x10 board", () => {
  const board = Array.from({ length: 10 }, () => Array(10).fill(""));
  assert.equal(placeWord(board, Array.from("abcdefghij")), true);
  const directions = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  const found = directions.some(([dr, dc]) =>
    board.some((row, r) => row.some((_, c) => {
      const letters = Array.from({ length: 10 }, (_, i) => {
        const rr = r + dr * i, cc = c + dc * i;
        return rr < 0 || rr >= 10 || cc < 0 || cc >= 10 ? "" : board[rr][cc];
      });
      return letters.join("") === "abcdefghij";
    }))
  );
  assert.equal(found, true);
});

test("words longer than the board are rejected", () => {
  const board = Array.from({ length: 10 }, () => Array(10).fill(""));
  assert.equal(placeWord(board, Array.from("abcdefghijk")), false);
});

test("Very Hard filters short words while Normal allows them", () => {
  state.language = "en";
  const words = ["an", "cat", "word", "dream", "bright"];
  const normal = selectCandidates(words, "normal").map(chars => chars.join(""));
  const hard = selectCandidates(words, "very-hard").map(chars => chars.join(""));
  assert.equal(normal.includes("an"), true);
  assert.equal(selectCandidates(["hoa", "mùa hè", "lá"], "normal").some(chars => chars.join("") === "mùa hè"), false);
  assert.equal(hard.some(word => word.length < 4), false);
  assert.equal(hard.length, 3);
});
