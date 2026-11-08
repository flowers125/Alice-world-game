/* Alice Word Game browser/backend bridge.
   Only the Supabase publishable/anon key belongs in supabase-config.js. */
(() => {
  const $ui = (id) => document.getElementById(id);
  const hasConfig = () => window.supabase?.createClient &&
    window.ALICE_SUPABASE_URL &&
    window.ALICE_SUPABASE_ANON_KEY &&
    !window.ALICE_SUPABASE_ANON_KEY.includes("PASTE_");

  const localGenerateRound = generateRound;
  const localEndSelection = endSelection;
  let client = null;
  let session = null;
  let roundId = null;
  let serverRound = false;
  let claimPending = false;

  async function accountChanged(nextSession) {
    session = nextSession || null;
    state.session = session;
    state.user = session?.user || null;
    const signedIn = !!session?.user;
    $ui("google-sign-in").hidden = signedIn;
    $ui("sign-out").hidden = !signedIn;
    $ui("profile-form").hidden = !signedIn;
    if (!signedIn) {
      $ui("account-status").textContent = "Đang chơi với tư cách khách.";
      return;
    }
    $ui("account-status").textContent = "Đã đăng nhập Google";
    const { data } = await client.from("profiles")
      .select("display_name").eq("id", session.user.id).maybeSingle();
    if (data?.display_name) $ui("display-name").value = data.display_name;
  }

  async function invoke(action, payload = {}) {
    const { data, error } = await client.functions.invoke("alice-game", {
      body: { action, ...payload }
    });
    if (error || data?.error) throw new Error(data?.error || error.message);
    return data;
  }

  async function startSecureRound() {
    clearInterval(state.timer);
    state.running = false;
    serverRound = false;
    roundId = null;
    state.serverMode = false;
    $ui("start-game").disabled = true;
    $ui("game-message").textContent = "Đang tạo lượt chơi...";
    try {
      const result = await invoke("create-round", {
        language: state.language,
        difficulty: state.difficulty
      });
      roundId = result.roundId;
      serverRound = true;
      state.roundId = roundId;
      state.serverMode = true;
      state.grid = result.grid;
      state.words = [];
      state.found.clear();
      state.selected = [];
      state.direction = null;
      state.seconds = ROUND_SECONDS;
      state.score = 0;
      state.running = true;
      $ui("game-message").textContent = "";
      renderGrid();
      updateHUD();
      state.timer = setInterval(() => {
        state.seconds = Math.max(0, state.seconds - 1);
        updateHUD();
        if (state.seconds === 0) finishRound();
      }, 1000);
    } catch (error) {
      $ui("game-message").textContent = error.message;
    } finally {
      $ui("start-game").disabled = false;
    }
  }

  generateRound = async function () {
    if (client && session) return startSecureRound();
    serverRound = false;
    roundId = null;
    state.serverMode = false;
    return localGenerateRound();
  };

  async function claimSecureWord(cells) {
    if (!roundId || claimPending || !state.running) return;
    claimPending = true;
    try {
      const result = await invoke("claim-word", {
        roundId,
        cells: cells.map(({row,col}) => [row,col])
      });
      state.found.add(String(result.foundCount));
      state.score = result.score;
      $ui("game-message").textContent = state.language === "vi" ? "Tìm thấy từ!" : "Word found!";
      playTone(660);
      updateHUD();
    } catch (error) {
      $ui("game-message").textContent = error.message.includes("already")
        ? (state.language === "vi" ? "Từ này đã được tính rồi." : "This word was already counted.")
        : (state.language === "vi" ? "Chưa đúng, thử lại nhé!" : "Not quite. Try again!");
      playTone(190);
    } finally {
      claimPending = false;
    }
  }

  endSelection = function () {
    if (!state.pointerDown) return;
    state.pointerDown = false;
    const cells = state.selected.map(({row,col}) => ({row,col}));
    if (serverRound) {
      if (cells.length > 1) claimSecureWord(cells);
      state.selected = [];
      state.direction = null;
      paintSelection();
    } else {
      localEndSelection();
    }
  };

  finishRound = async function () {
    if (!state.running) return;
    clearInterval(state.timer);
    state.running = false;
    state.pointerDown = false;
    state.selected = [];
    paintSelection();
    if (serverRound && roundId) {
      try {
        const result = await invoke("finish-round", { roundId });
        state.score = result.score;
        updateHUD();
        $ui("game-message").textContent = state.language === "vi"
          ? `Hết giờ! Điểm: ${result.score}${result.newPersonalBest ? " · Kỷ lục mới!" : ""}`
          : `Time's up! Score: ${result.score}${result.newPersonalBest ? " · New personal best!" : ""}`;
      } catch (error) {
        $ui("game-message").textContent = error.message;
      }
    } else {
      $ui("game-message").textContent = state.language === "vi"
        ? `Hết giờ! Tìm được ${state.found.size} từ. Điểm: ${state.score}`
        : `Time's up! You found ${state.found.size} words. Score: ${state.score}`;
    }
    playTone(330);
  };

  async function saveProfile(event) {
    event.preventDefault();
    try {
      const result = await invoke("update-profile", {
        displayName: $ui("display-name").value
      });
      $ui("account-status").textContent = "Đã lưu tên: " + result.profile.display_name;
    } catch (error) {
      $ui("account-status").textContent = error.message;
    }
  }

  async function showLeaderboard() {
    const list = $ui("leaderboard-list");
    list.replaceChildren();
    const language = $ui("leaderboard-language").value;
    const difficulty = $ui("leaderboard-difficulty").value;
    const { data, error } = await client.rpc("get_alice_leaderboard", {
      p_language: language,
      p_difficulty: difficulty,
      p_limit: 20
    });
    if (error || !data?.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa có dữ liệu.";
      list.appendChild(li);
      return;
    }
    data.forEach(row => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      const score = document.createElement("strong");
      name.textContent = row.display_name;
      score.textContent = String(row.score);
      li.append(name, score);
      list.appendChild(li);
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    // Replace the button so the local click handler cannot start a second round.
    const oldStart = $ui("start-game");
    const newStart = oldStart.cloneNode(true);
    oldStart.replaceWith(newStart);
    newStart.addEventListener("click", () => generateRound());

    $ui("google-sign-in").addEventListener("click", async () => {
      if (!client) return;
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin }
      });
      if (error) $ui("account-status").textContent = error.message;
    });
    $ui("sign-out").addEventListener("click", async () => {
      if (client) await client.auth.signOut();
    });
    $ui("profile-form").addEventListener("submit", saveProfile);
    $ui("leaderboard-button").addEventListener("click", async () => {
      $ui("leaderboard-dialog").showModal();
      await showLeaderboard();
    });
    $ui("leaderboard-language").addEventListener("change", showLeaderboard);
    $ui("leaderboard-difficulty").addEventListener("change", showLeaderboard);
    $ui("close-leaderboard").addEventListener("click", () => $ui("leaderboard-dialog").close());

    if (!hasConfig()) {
      $ui("account-status").textContent = "Chế độ khách · Cần thêm Supabase publishable key để bật đăng nhập.";
      return;
    }
    client = window.supabase.createClient(window.ALICE_SUPABASE_URL, window.ALICE_SUPABASE_ANON_KEY);
    state.supabase = client;
    const { data } = await client.auth.getSession();
    await accountChanged(data.session);
    client.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => accountChanged(nextSession), 0);
    });
  });
})();
