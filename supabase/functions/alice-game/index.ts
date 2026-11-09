import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
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
function placeWord(board: string[][], word: string) {
  const dirs = shuffle([[0,1],[1,0],[1,1],[1,-1],[-1,0],[0,-1],[-1,-1],[-1,1]]);
  const letters = Array.from(normalize(word));
  if (!letters.length || letters.length > 20) return false;
  for (const [dr, dc] of dirs) {
    for (const [r,c] of shuffle(Array.from({length:300},(_,i)=>[Math.floor(i/20),i%20]))) {
      const er = r + dr * (letters.length - 1);
      const ec = c + dc * (letters.length - 1);
      if (er < 0 || er >= 15 || ec < 0 || ec >= 20) continue;
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
const TOPICS = [
  {id:"fruit",vi:"Hoa quả",en:"Fruits",words:{vi:["táo","cam","chuối","xoài","lê","ổi","mít","dừa","nho","đào","dưa","mận"],en:["apple","banana","orange","mango","pear","grape","lemon","peach","fruit","melon","berry","plum"]}},
  {id:"ocean",vi:"Đại dương",en:"Ocean",words:{vi:["biển","cá","tôm","cua","sò","sóng","nước","thuyền","ốc","mực"],en:["ocean","sea","fish","crab","wave","water","ship","whale","shark","coral","shell","squid"]}},
  {id:"cooking",vi:"Nấu ăn",en:"Cooking",words:{vi:["cơm","canh","thịt","trứng","bánh","sữa","muối","đường","dầu","bếp","nồi","chảo","rau","mì"],en:["rice","soup","meat","egg","bread","milk","salt","sugar","oil","kitchen","pot","pan","food","cook"]}},
  {id:"colors",vi:"Màu sắc",en:"Colors",words:{vi:["đỏ","xanh","tím","vàng","đen","trắng","hồng","nâu","xám","cam"],en:["red","blue","purple","yellow","black","white","pink","brown","gray","green","orange"]}},
  {id:"animals",vi:"Động vật",en:"Animals",words:{vi:["mèo","chó","voi","hổ","gấu","thỏ","chim","dê","bò","cá","ngựa"],en:["cat","dog","elephant","tiger","bear","rabbit","bird","goat","cow","fish","horse","lion"]}},
  {id:"nature",vi:"Thiên nhiên",en:"Nature",words:{vi:["hoa","lá","cây","núi","sông","mưa","gió","mây","trăng","sao","đất","cỏ"],en:["flower","leaf","tree","mountain","river","rain","wind","cloud","moon","star","earth","grass"]}},
  {id:"school",vi:"Trường học",en:"School",words:{vi:["sách","bút","vở","bàn","ghế","lớp","thầy","cô","học","bảng","giấy","mực"],en:["book","pen","notebook","desk","chair","class","teacher","school","study","board","paper","ink"]}},
  {id:"names",vi:"Tên người",en:"Names",words:{vi:["an","bình","lan","mai","nam","minh","linh","hoa","hùng","ngọc","phúc","vy"],en:["alice","anna","ben","david","emma","jack","james","leo","lily","lucy","mia","noah"]}}
];

function makeBoard(words: {word:string;normalized:string}[], language: string, difficulty: string) {
  const board = Array.from({length:15},()=>Array(20).fill(""));
  const placed: string[] = [];
  const targetLimit = Math.min(difficulty === "very-hard" ? 42 : 36, words.length);
  const eligible = shuffle(words.filter(item => {
    const length = Array.from(normalize(item.normalized)).length;
    return length >= 2 && length <= 20;
  })).sort((a,b)=>Array.from(normalize(b.normalized)).length-Array.from(normalize(a.normalized)).length);
  for (const item of eligible) {
    if (placed.length >= targetLimit) break;
    if (placeWord(board,item.normalized)) placed.push(item.normalized);
  }
  const alphabet = language === "vi"
    ? Array.from("aăâbcdđeêghiklmnoôơpqrstuưvxyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủụứừửữựýỳỷỹỵ")
    : Array.from("abcdefghijklmnopqrstuvwxyz");
  for (let r=0;r<15;r++) for (let c=0;c<20;c++) {
    if (!board[r][c]) board[r][c]=alphabet[Math.floor(Math.random()*alphabet.length)];
  }
  return {board,placed};
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
    const isGoogleUser = user.app_metadata?.provider === "google" ||
      (user.identities || []).some((identity: any) => identity.provider === "google");
    if (!isGoogleUser) return reply({error:"Google sign-in required"},403);

    const body = await req.json();
    const action = body.action;

    if (action === "start") {
      const language = body.language === "en" ? "en" : "vi";
      const difficulty = body.difficulty === "very-hard" ? "very-hard" : body.difficulty === "very-easy" ? "very-easy" : "normal";
      const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
      const {data:letterRows,error:letterError} = await admin.from("dictionary_words")
        .select("normalized").eq("language",language).eq("is_active",true)
        .not("normalized","ilike","% %").limit(5000);
      if (letterError) throw letterError;
      const counts = new Map<string,number>();
      for (const item of (letterRows || []) as any[]) {
        for (const letter of Array.from(normalize(item.normalized))) {
          counts.set(letter,(counts.get(letter)||0)+1);
        }
      }
      const weighted = [...counts.entries()];
      const fallback = language === "vi"
        ? Array.from("aăâbcdđeêghiklmnoôơpqrstuưvxyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủụứừửựýỳỷỹỵ")
        : Array.from("abcdefghijklmnopqrstuvwxyz");
      const pickLetter = () => {
        if (!weighted.length) return fallback[Math.floor(Math.random()*fallback.length)];
        const total = weighted.reduce((sum,item)=>sum+item[1],0);
        let pick = Math.random()*total;
        for (const [letter,weight] of weighted) {
          pick -= weight;
          if (pick <= 0) return letter;
        }
        return weighted[weighted.length-1][0];
      };
      const board = Array.from({length:15},()=>Array.from({length:20},()=>pickLetter()));
      const starterWords = language === "vi"
        ? ["cá","cơm","đèn","thuyền","hoa","lá","sữa","nhà"]
        : ["say","no","yes"];
      const used = new Set<number>();
      for (const word of starterWords) {
        for (const letter of Array.from(normalize(word))) {
          let index = Math.floor(Math.random()*300);
          while (used.has(index)) index = Math.floor(Math.random()*300);
          used.add(index);
          board[Math.floor(index/20)][index%20] = letter;
        }
      }
      const started = new Date();
      const expires = new Date(started.getTime()+180000);
      const {data:round,error:roundError} = await admin.from("game_rounds").insert({
        user_id:user.id, language,difficulty,board,target_words:[],
        started_at:started.toISOString(),expires_at:expires.toISOString()
      }).select("id,started_at,expires_at").single();
      if (roundError) throw roundError;
      return reply({round_id:round.id,board,topic:{id:topic.id,label:topic[language]},started_at:round.started_at,expires_at:round.expires_at,seconds:180});
    }

    if (action === "claim") {
      const roundId = String(body.round_id || "");
      const cells = body.cells;
      if (!roundId || !Array.isArray(cells) || cells.length < 2 || cells.length > 20) return reply({error:"Invalid selection"},400);
      const {data:round,error:roundError} = await admin.from("game_rounds")
        .select("id,user_id,language,difficulty,board,expires_at,status")
        .eq("id",roundId).eq("user_id",user.id).maybeSingle();
      if (roundError) throw roundError;
      if (!round || round.status !== "active" || Date.now() > Date.parse(round.expires_at)) return reply({error:"Round expired"},410);

      const path = cells.map((p:any)=>({r:Number(p.r),c:Number(p.c)}));
      const seen = new Set<string>();
      if (path.some((p:any)=>!Number.isInteger(p.r)||!Number.isInteger(p.c)||p.r<0||p.r>14||p.c<0||p.c>19)) return reply({error:"Invalid cell"},400);
      for (const p of path) {
        const key = p.r + ":" + p.c;
        if (seen.has(key)) return reply({error:"A cell can only be selected once"},400);
        seen.add(key);
        if (!round.board?.[p.r]?.[p.c]) return reply({valid:false,reason:"cell_already_used"},200);
      }

      const formed = normalize(path.map((p:any)=>round.board[p.r][p.c]).join(""));
      const length = Array.from(formed).length;
      if (length < 2 || length > 20) return reply({valid:false,reason:"invalid_length"},200);
      const {data:dictionaryWord,error:dictionaryError} = await admin.from("dictionary_words")
        .select("word,normalized").eq("language",round.language).eq("is_active",true)
        .eq("normalized",formed).maybeSingle();
      if (dictionaryError) throw dictionaryError;
      if (!dictionaryWord) return reply({valid:false,reason:"not_a_dictionary_word"},200);

      const points = length===2 ? 1 : length===3 ? 2 : length===4 ? 3 : length===5 ? 7 : length===6 ? 8 : length===7 ? 9 : length===8 ? 11 : 15;
      const {data:record,error:recordError} = await admin.rpc("alice_record_word",{
        p_round_id:roundId,p_user_id:user.id,p_normalized:formed,p_points:points,p_cells:path
      });
      if(recordError) throw recordError;
      if(!record?.ok) return reply({valid:false,reason:record?.reason||"already_found"},200);
      return reply({valid:true,word:dictionaryWord.word,points,score:record.score});
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