import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIZE = 10;
const DIRECTIONS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
const ALPHABETS = {
  vi: Array.from("aăâbcdđeêghiklmnoôơpqrstuưvxy"),
  en: Array.from("abcdefghijklmnopqrstuvwxyz"),
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const shuffle = <T>(items: T[]): T[] => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function placeWord(grid: string[][], word: string) {
  const letters = Array.from(word);
  const starts: number[][] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of DIRECTIONS) starts.push([r,c,dr,dc]);
    }
  }
  for (const [r,c,dr,dc] of shuffle(starts)) {
    let valid = true;
    for (let i = 0; i < letters.length; i++) {
      const rr = r + dr*i, cc = c + dc*i;
      if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE ||
          (grid[rr][cc] && grid[rr][cc] !== letters[i])) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    const path = [];
    for (let i = 0; i < letters.length; i++) {
      const rr = r + dr*i, cc = c + dc*i;
      grid[rr][cc] = letters[i];
      path.push([rr,cc]);
    }
    return path;
  }
  return null;
}

function scoreFor(count: number, difficulty: string) {
  const base = count === 1 ? 2 : count === 2 ? 5 : count >= 3 ? 12 : 0;
  return base + (difficulty === "very-hard" ? count * 3 : 0);
}

function validatePath(cells: unknown, grid: string[][]) {
  if (!Array.isArray(cells) || cells.length < 2 || cells.length > SIZE) return null;
  const coords = cells as unknown[];
  const parsed = coords.map((p) => {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [r,c] = p;
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    return [r,c] as [number,number];
  });
  if (parsed.some(p => !p)) return null;
  const points = parsed as [number,number][];
  const dr = points[1][0] - points[0][0];
  const dc = points[1][1] - points[0][1];
  if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) return null;
  const stepR = Math.sign(dr), stepC = Math.sign(dc);
  if (dr === 0 && dc === 0) return null;
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] !== points[0][0] + stepR*i ||
        points[i][1] !== points[0][1] + stepC*i) return null;
  }
  const word = points.map(([r,c]) => grid[r][c]).join("");
  return { word, reversed: Array.from(word).reverse().join("") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Server configuration missing" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in required" }, 401);

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);
  const user = authData.user;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const action = body?.action;

    if (action === "create-round") {
      const language = body.language;
      const difficulty = body.difficulty;
      if (!["vi","en"].includes(language) || !["normal","very-hard"].includes(difficulty)) {
        return json({ error: "Invalid game settings" }, 400);
      }
      const { data: profile } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      if (!profile?.display_name) return json({ error: "Choose a display name before playing" }, 409);

      const { data: dictionary, error: dictionaryError } = await admin.rpc("pick_dictionary_words", {
        p_language: language,
        p_limit: 1800,
      });
      if (dictionaryError || !dictionary?.length) {
        return json({ error: "Dictionary is not imported yet" }, 503);
      }

      const candidates = shuffle([...new Set(dictionary.map((x: {word:string}) =>
        x.word.normalize("NFC").toLocaleLowerCase(language).replace(/\s+/g,"")
      ))]).filter((w: string) => Array.from(w).length >= 2 && Array.from(w).length <= SIZE)
        .slice(0, 45).sort((a: string,b: string) => Array.from(b).length - Array.from(a).length);

      const grid = Array.from({length:SIZE}, () => Array(SIZE).fill(""));
      const placed: {word:string;path:number[][]}[] = [];
      for (const word of candidates) {
        const path = placeWord(grid, word);
        if (path) placed.push({word, path});
        if (placed.length >= 28) break;
      }
      if (placed.length < 5) return json({ error: "Not enough valid dictionary words" }, 503);

      const alphabet = ALPHABETS[language as "vi" | "en"];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        if (!grid[r][c]) grid[r][c] = alphabet[Math.floor(Math.random()*alphabet.length)];
      }

      const { data: round, error: roundError } = await admin.from("game_rounds").insert({
        user_id: user.id,
        language,
        difficulty,
        grid,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }).select("id,created_at,expires_at").single();
      if (roundError || !round) return json({ error: "Could not create round" }, 500);

      const rows = placed.map(item => ({ round_id: round.id, word: item.word, path: item.path }));
      const { error: wordsError } = await admin.from("round_words").insert(rows);
      if (wordsError) {
        await admin.from("game_rounds").delete().eq("id", round.id);
        return json({ error: "Could not save round words" }, 500);
      }
      return json({ roundId: round.id, grid, expiresAt: round.expires_at });
    }

    if (action === "claim-word") {
      const roundId = body.roundId;
      if (typeof roundId !== "string") return json({ error: "Invalid round" }, 400);
      const { data: round, error } = await admin.from("game_rounds")
        .select("id,user_id,grid,difficulty,expires_at,status,found_count,score")
        .eq("id", roundId).eq("user_id", user.id).maybeSingle();
      if (error || !round) return json({ error: "Round not found" }, 404);
      if (round.status !== "active" || Date.now() > new Date(round.expires_at).getTime()) {
        await admin.from("game_rounds").update({status:"expired"}).eq("id", roundId);
        return json({ error: "Round has ended" }, 410);
      }
      const checked = validatePath(body.cells, round.grid as string[][]);
      if (!checked) return json({ error: "Invalid straight-line selection" }, 400);
      const { data: target } = await admin.from("round_words").select("word,path")
        .eq("round_id", roundId).in("word", [checked.word, checked.reversed]).maybeSingle();
      if (!target) return json({ error: "Word not found" }, 404);
      const submitted = body.cells;
      const expected = target.path as number[][];
      const samePath = (a: number[][], b: number[][]) => JSON.stringify(a) === JSON.stringify(b);
      if (!samePath(submitted, expected) && !samePath(submitted, [...expected].reverse())) {
        return json({ error: "Selection does not match the hidden word path" }, 400);
      }

      const { data: claim, error: claimError } = await admin.rpc("claim_alice_word", {
        p_round_id: roundId,
        p_user_id: user.id,
        p_word: target.word,
      });
      if (claimError) return json({ error: "Could not validate word" }, 500);
      const result = Array.isArray(claim) ? claim[0] : claim;
      if (!result?.found) return json({ error: "Word already claimed or round ended" }, 409);
      return json({ found: true, foundCount: result.found_count, score: result.score });
    }

    if (action === "finish-round") {
      const roundId = body.roundId;
      const { data: round } = await admin.from("game_rounds")
        .select("id,user_id,language,difficulty,score,status,expires_at")
        .eq("id",roundId).eq("user_id",user.id).maybeSingle();
      if (!round) return json({ error: "Round not found" }, 404);
      if (round.status === "active" && Date.now() < new Date(round.expires_at).getTime()) {
        return json({ error: "Round is still active" }, 409);
      }
      await admin.from("game_rounds").update({status:"finished"}).eq("id",roundId);
      const { data: best } = await admin.from("personal_bests").select("score")
        .eq("user_id",user.id).eq("language",round.language).eq("difficulty",round.difficulty).maybeSingle();
      let personalBest = best?.score ?? 0;
      if (round.score > personalBest) {
        const { error: bestError } = await admin.from("personal_bests").upsert({
          user_id:user.id, language:round.language, difficulty:round.difficulty,
          score:round.score, achieved_at:new Date().toISOString(), round_id:round.id,
        }, { onConflict:"user_id,language,difficulty" });
        if (bestError) return json({ error:"Could not save personal best" },500);
        personalBest = round.score;
      }
      return json({ score:round.score, personalBest, newPersonalBest:round.score > (best?.score ?? 0) });
    }

    if (action === "update-profile") {
      const name = String(body.displayName || "").trim().normalize("NFC");
      if (name.length < 2 || name.length > 20 || /[<>]/.test(name)) {
        return json({ error: "Display name must be 2-20 characters" }, 400);
      }
      const { data, error } = await admin.from("profiles").update({display_name:name,updated_at:new Date().toISOString()})
        .eq("id",user.id).select("display_name").single();
      if (error) return json({ error: "Display name is already used or invalid" }, 409);
      return json({ profile:data });
    }

    if (action === "leaderboard") {
      const language = body.language, difficulty = body.difficulty;
      if (!["vi","en"].includes(language) || !["normal","very-hard"].includes(difficulty)) {
        return json({ error: "Invalid leaderboard" }, 400);
      }
      const { data, error } = await admin.rpc("get_alice_leaderboard", {
        p_language:language, p_difficulty:difficulty, p_limit:20,
      });
      if (error) return json({ error:"Could not load leaderboard" },500);
      return json({ entries:data || [] });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (_) {
    return json({ error: "Unexpected server error" }, 500);
  }
});
