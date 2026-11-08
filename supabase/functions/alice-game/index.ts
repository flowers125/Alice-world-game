import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: cors });

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

function normalize(value: string) {
  return value.normalize("NFC").toLocaleLowerCase().replace(/[\s\u200B-\u200D]+/gu, "");
}
function shuffle<T>(items: T[]) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function totalScore(count: number, hard: boolean) {
  const base = count === 1 ? 2 : count === 2 ? 5 : count >= 3 ? 12 : 0;
  return base + (hard ? count * 3 : 0);
}
function placeWord(board: string[][], word: string) {
  const dirs = shuffle([[0,1],[1,0],[1,1],[1,-1],[-1,0],[0,-1],[-1,-1],[-1,1]]);
  const letters = Array.from(normalize(word));
  if (!letters.length || letters.length > 10) return false;
  for (const [dr, dc] of dirs) {
    for (const [r,c] of shuffle(Array.from({length:100},(_,i)=>[Math.floor(i/10),i%10]))) {
      const er = r + dr * (letters.length - 1);
      const ec = c + dc * (letters.length - 1);
      if (er < 0 || er >= 10 || ec < 0 || ec >= 10) continue;
      let fits = true;
      for (let i=0;i<letters.length;i++) {
        const existing = board[r+dr*i][c+dc*i];
        if (existing && existing !== letters[i]) { fits=false; break; }
      }
      if (!fits) continue;
      for (let i=0;i<letters.length;i++) board[r+dr*i][c+dc*i]=letters[i];
      return true;
    }
  }
  return false;
}
function makeBoard(words: {word:string;normalized:string}[], language: string) {
  const board = Array.from({length:10},()=>Array(10).fill(""));
  const placed: string[] = [];
  for (const item of shuffle(words)) {
    if (placed.length >= 28) break;
    if (placeWord(board,item.normalized)) placed.push(item.normalized);
  }
  const alphabet = language === "vi"
    ? Array.from("aăâbcdđeêghiklmnoôơpqrstuưvxyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ")
    : Array.from("abcdefghijklmnopqrstuvwxyz");
  for (let r=0;r<10;r++) for (let c=0;c<10;c++) {
    if (!board[r][c]) board[r][c]=alphabet[Math.floor(Math.random()*alphabet.length)];
  }
  return {board, placed};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:cors});
  if (req.method !== "POST") return reply({error:"POST required"},405);
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i,"");
    if (!token) return reply({error:"Authentication required"},401);
    const userClient = createClient(url,anonKey,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false}});
    const {data:{user},error:userError} = await userClient.auth.getUser(token);
    if (userError || !user) return reply({error:"Invalid session"},401);

    const body = await req.json();
    const action = body.action;

    if (action === "start") {
      const language = body.language === "en" ? "en" : "vi";
      const difficulty = body.difficulty === "very-hard" ? "very-hard" : "normal";
      const {data: dictionary,error:dictError} = await admin
        .from("dictionary_words").select("word,normalized")
        .eq("language",language).eq("is_active",true).limit(5000);
      if (dictError) throw dictError;
      if (!dictionary?.length) return reply({error:"Dictionary is empty"},503);
      const candidates = shuffle(dictionary.filter((x:any)=>Array.from(x.normalized || "").length>=2 && Array.from(x.normalized || "").length<=10));
      const {board,placed} = makeBoard(candidates,language);
      if (placed.length < 5) return reply({error:"Not enough eligible dictionary words"},503);
      const started = new Date();
      const expires = new Date(started.getTime()+60000);
      const {data:round,error:roundError} = await admin.from("game_rounds").insert({
        user_id:user.id, language,difficulty,board,target_words:placed,
        started_at:started.toISOString(),expires_at:expires.toISOString()
      }).select("id,started_at,expires_at").single();
      if (roundError) throw roundError;
      return reply({round_id:round.id,board,started_at:round.started_at,expires_at:round.expires_at,seconds:60});
    }

    if (action === "claim") {
      const roundId = String(body.round_id || "");
      const cells = body.cells;
      if (!roundId || !Array.isArray(cells) || cells.length < 2 || cells.length > 10) return reply({error:"Invalid selection"},400);
      const {data:round,error:roundError} = await admin.from("game_rounds")
        .select("id,user_id,language,difficulty,board,target_words,expires_at,status")
        .eq("id",roundId).eq("user_id",user.id).maybeSingle();
      if (roundError) throw roundError;
      if (!round || round.status !== "active" || Date.now() > Date.parse(round.expires_at)) return reply({error:"Round expired"},410);
      const path = cells.map((p:any)=>({r:Number(p.r),c:Number(p.c)}));
      if (path.some((p:any)=>!Number.isInteger(p.r)||!Number.isInteger(p.c)||p.r<0||p.r>9||p.c<0||p.c>9)) return reply({error:"Invalid cell"},400);
      const dr = path[1].r-path[0].r, dc=path[1].c-path[0].c;
      if (!(dr===0||dc===0||Math.abs(dr)===Math.abs(dc))) return reply({error:"Path must be straight"},400);
      const sr=Math.sign(dr), sc=Math.sign(dc);
      for(let i=1;i<path.length;i++) {
        if(path[i].r!==path[0].r+sr*i || path[i].c!==path[0].c+sc*i) return reply({error:"Path must be continuous and straight"},400);
      }
      const formed = normalize(path.map((p:any)=>round.board[p.r][p.c]).join(""));
      const reverse = normalize(Array.from(formed).reverse().join(""));
      const targets = (round.target_words || []) as string[];
      const matched = targets.find(w=>normalize(w)===formed || normalize(w)===reverse);
      if (!matched) return reply({valid:false,reason:"not_a_hidden_word"},200);
      const {count:foundCount,error:countError} = await admin.from("round_words")
        .select("id",{count:"exact",head:true}).eq("round_id",roundId);
      if (countError) throw countError;
      const nextCount=(foundCount||0)+1;
      const hard=round.difficulty==="very-hard";
      const points=totalScore(nextCount,hard)-totalScore(nextCount-1,hard);
      const {data:record,error:recordError} = await admin.rpc("alice_record_word",{
        p_round_id:roundId,p_user_id:user.id,p_normalized:normalize(matched),p_points:points
      });
      if(recordError) throw recordError;
      if(!record?.ok) return reply({valid:false,reason:record?.reason||"already_found"},200);
      return reply({valid:true,word:matched,added:record.added,score:record.score});
    }

    if (action === "finish") {
      const roundId=String(body.round_id||"");
      if(!roundId) return reply({error:"round_id required"},400);
      const {data,error} = await admin.rpc("alice_finish_round",{p_round_id:roundId,p_user_id:user.id});
      if(error) throw error;
      return reply(data);
    }
    return reply({error:"Unknown action"},400);
  } catch (error) {
    console.error("alice-game error",error);
    return reply({error:"Internal server error"},500);
  }
});