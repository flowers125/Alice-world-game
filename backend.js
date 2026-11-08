/* Alice Word Game: authenticated browser bridge. */
(() => {
  const $ui = id => document.getElementById(id);
  const hasConfig = () => window.supabase?.createClient &&
    window.ALICE_SUPABASE_URL && window.ALICE_SUPABASE_ANON_KEY &&
    !window.ALICE_SUPABASE_ANON_KEY.includes("PASTE_");

  const localGenerateRound = generateRound;
  const localEndSelection = endSelection;
  const localFinishRound = finishRound;
  let client = null;
  let session = null;
  let roundId = null;
  let secureRound = false;
  let claimQueue = Promise.resolve();
  let finishPromise = null;
  let startingRound = false;
  let leaderboardRequest = 0;
  let accountRequest = 0;

  async function callGame(action, payload = {}) {
    const {data,error} = await client.functions.invoke("alice-game",{body:{action,...payload}});
    if(error) throw new Error(data?.error || error.message || "Game request failed");
    if(data?.error) throw new Error(data.error);
    return data;
  }

  async function updateAccount(nextSession) {
    const requestId=++accountRequest;
    session=nextSession||null;
    state.session=session;
    state.user=session?.user||null;
    const signedIn=!!session?.user;
    $ui("google-sign-in").hidden=signedIn;
    $ui("sign-out").hidden=!signedIn;
    $ui("profile-form").hidden=true;
    if(!signedIn){
      state.displayName="";
      $ui("display-name").value="";
      $ui("display-name").disabled=false;
      $ui("account-status").textContent=state.language==="vi"
        ?"Đang chơi với tư cách khách · Điểm không được lưu online."
        :"Playing as guest · Scores are not saved online.";
      return;
    }
    $ui("display-name").value="";
    $ui("display-name").disabled=false;
    const currentUserId=session.user.id;
    const {data,error}=await client.from("profiles")
      .select("display_name,display_name_set_at").eq("id",currentUserId).maybeSingle();
    if(requestId!==accountRequest || session?.user?.id!==currentUserId)return;
    if(error) console.error(error);
    state.displayName=data?.display_name||"";
    const nameIsLocked=!!data?.display_name_set_at || !!data?.display_name?.trim();
    $ui("profile-form").hidden=nameIsLocked;
    if(!nameIsLocked){
      $ui("display-name").value=data?.display_name ||
        String(session.user.user_metadata?.full_name||"").slice(0,20);
    }else{
      $ui("display-name").value="";
      $ui("display-name").disabled=true;
    }
    $ui("account-status").textContent=state.language==="vi"
      ? (nameIsLocked ? "Đã đăng nhập · Tên: "+state.displayName : "Đã đăng nhập Google · Hãy đặt tên hiển thị một lần.")
      : (nameIsLocked ? "Signed in · Name: "+state.displayName : "Signed in with Google · Choose your display name once.");
  }

  async function startSecureRound() {
    if (startingRound) return;
    startingRound = true;
    if (finishPromise) await finishPromise;
    else if (state.running) await finishRound();
    clearInterval(state.timer);
    state.running=false;
    $ui("start-game").disabled=true;
    $ui("language").disabled=true;
    $ui("difficulty").disabled=true;
    $ui("game-message").textContent=state.language==="vi"?"Đang tạo lượt chơi...":"Preparing round...";
    try {
      const result=await callGame("start",{language:state.language,difficulty:state.difficulty});
      roundId=result.round_id;
      secureRound=true;
      state.grid=result.board;
      state.topic=result.topic || null;
      showRoundTopic(state.topic);
      state.words=[];
      state.found.clear();
      state.selected=[];
      state.direction=null;
      const expiresAt=Date.parse(result.expires_at);
      state.seconds=Math.max(0,Math.ceil((expiresAt-Date.now())/1000));
      state.score=0;
      state.running=true;
      $ui("game-message").textContent="";
      renderGrid();
      updateHUD();
      state.timer=setInterval(()=>{
        state.seconds=Math.max(0,Math.ceil((expiresAt-Date.now())/1000));
        updateHUD();
        if(state.seconds===0) finishRound();
      },1000);
    } catch(error) {
      $ui("game-message").textContent=error.message;
    } finally {
      $ui("start-game").disabled=false;
      $ui("language").disabled=false;
      $ui("difficulty").disabled=false;
      startingRound = false;
    }
  }

  generateRound=function(){
    if(client&&session) return startSecureRound();
    secureRound=false;
    roundId=null;
    return localGenerateRound();
  };

  window.handleWordSubmit = async function(cells){
    if(!secureRound){
      localSubmitWord(cells);
      return;
    }
    if(!roundId || cells.length < 2) return;
    const payload=cells.map(({row,col})=>({r:row,c:col}));
    const selectedRoundId=roundId;
    claimQueue=claimQueue.then(()=>claimSecureWord(payload,selectedRoundId));
    await claimQueue;
  };

  async function claimSecureWord(cells,targetRoundId){
    if(!targetRoundId)return;
    try{
      const result=await callGame("claim",{round_id:targetRoundId,cells});
      if(roundId!==targetRoundId)return;
      if(!result.valid){
        $ui("game-message").textContent=state.language==="vi"?"Từ không hợp lệ hoặc đã được tính.":"Invalid or already-counted word.";
        playTone(190);
        return;
      }
      state.found.add(result.word.normalize("NFC").toLocaleLowerCase(state.language).replace(/\\s+/g,""));
      cells.forEach(p=>{state.grid[p.r][p.c]="";});
      celebrateFoundWord(cells.map(p=>({row:p.r,col:p.c})));
      state.score=result.score;
      renderGrid();
      $ui("game-message").textContent=state.language==="vi"?"Tìm thấy từ!":"Word found!";
      playTone(660);
      updateHUD();
      showLeaderboard();
    }catch(error){
      if(roundId===targetRoundId)$ui("game-message").textContent=error.message;
    }
  }

  finishRound=function(){
    if(finishPromise)return finishPromise;
    if(!state.running)return Promise.resolve();
    finishPromise=(async()=>{
      clearInterval(state.timer);
      state.running=false;
      state.pointerDown=false;
      state.selected=[];
      paintSelection();
      if(secureRound&&roundId){
        await claimQueue;
        try{
          const result=await callGame("finish",{round_id:roundId});
          state.score=result.score;
          updateHUD();
          showLeaderboard();
          $ui("game-message").textContent=state.language==="vi"
            ? "Hết giờ! Điểm: "+result.score+" · Kỷ lục cá nhân: "+result.personal_best
            : "Time's up! Score: "+result.score+" · Personal best: "+result.personal_best;
        }catch(error){$ui("game-message").textContent=error.message;}
      }else{localFinishRound();}
      playTone(330);
    })().finally(()=>{finishPromise=null;});
    return finishPromise;
  };

  async function saveProfile(event){
    event.preventDefault();
    if(!session)return;
    const displayName=$ui("display-name").value.trim();
    if(displayName.length<2||displayName.length>20){
      $ui("account-status").textContent=state.language==="vi"?"Tên phải từ 2–20 ký tự.":"Name must be 2–20 characters.";
      return;
    }
    const {data,error}=await client.from("profiles")
      .update({display_name:displayName}).eq("id",session.user.id)
      .select("display_name,display_name_set_at").single();
    if(error){
      $ui("account-status").textContent=error.code==="23505"
        ? (state.language==="vi"?"Tên này đã được dùng.":"Name already taken.")
        : error.code==="23514"
          ? (state.language==="vi"?"Tên tài khoản đã được đặt và không thể đổi.":"Your account name is already set and cannot be changed.")
          : error.message;
      if(error.code==="23514") await updateAccount(session);
      return;
    }
    state.displayName=data.display_name;
    $ui("profile-form").hidden=true;
    $ui("display-name").value="";
    $ui("display-name").disabled=true;
    $ui("account-status").textContent=(state.language==="vi"?"Đã đặt tên: ":"Name set: ")+data.display_name;
  }

  async function showLeaderboard(){
    const requestId=++leaderboardRequest;
    const lists=[$ui("leaderboard-list"),$ui("inline-leaderboard-list")].filter(Boolean);
    lists.forEach(list=>{list.replaceChildren();});
    const vi=state.language==="vi";
    const renderMessage=message=>lists.forEach(list=>{const li=document.createElement("li");li.textContent=message;list.appendChild(li);});
    if(!client){renderMessage(vi?"Supabase chưa được cấu hình.":"Supabase is not configured.");return;}
    lists.forEach(list=>{const li=document.createElement("li");li.textContent=vi?"Đang tải bảng xếp hạng...":"Loading leaderboard...";list.appendChild(li);list.setAttribute("aria-busy","true");});
    const language=$ui("inline-leaderboard-language")?.value || $ui("leaderboard-language").value;
    const difficulty=$ui("inline-leaderboard-difficulty")?.value || $ui("leaderboard-difficulty").value;
    const {data,error}=await client.rpc("get_alice_leaderboard",{p_language:language,p_difficulty:difficulty,p_limit:20});
    if(requestId!==leaderboardRequest)return;
    lists.forEach(list=>{list.removeAttribute("aria-busy");list.replaceChildren();});
    if(error){renderMessage((vi?"Không tải được bảng xếp hạng: ":"Could not load leaderboard: ")+error.message);return;}
    if(!data?.length){renderMessage(vi?"Chưa có dữ liệu.":"No scores yet.");return;}
    data.forEach(row=>lists.forEach(list=>{const li=document.createElement("li");const name=document.createElement("span");const score=document.createElement("strong");name.textContent=row.display_name;score.textContent=String(row.score);li.append(name,score);list.appendChild(li);}));
  }

  document.addEventListener("DOMContentLoaded",async()=>{
    state.backendReady=false;
    $ui("start-game").disabled=true;
    const oldStart=$ui("start-game");
    const newStart=oldStart.cloneNode(true);
    oldStart.replaceWith(newStart);
    newStart.addEventListener("click",()=>generateRound());

    $ui("google-sign-in").addEventListener("click",async()=>{
      if(!client)return;
      const redirectTo=window.location.origin;
      const {error}=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo}});
      if(error)$ui("account-status").textContent=error.message;
    });
    $ui("sign-out").addEventListener("click",async()=>{
      if(!client)return;
      if(startingRound){
        $ui("account-status").textContent=state.language==="vi"
          ?"Hãy đợi lượt chơi khởi tạo xong rồi đăng xuất."
          :"Wait for the round to finish loading before signing out.";
        return;
      }
      if(finishPromise) await finishPromise;
      else if(secureRound&&state.running) await finishRound();
      await client.auth.signOut();
    });
    $ui("profile-form").addEventListener("submit",saveProfile);
    $ui("leaderboard-button").addEventListener("click",async()=>{
      $ui("leaderboard-dialog").showModal();await showLeaderboard();
    });
    $ui("leaderboard-language").addEventListener("change",()=>{$ui("inline-leaderboard-language").value=$ui("leaderboard-language").value;showLeaderboard();});
    $ui("leaderboard-difficulty").addEventListener("change",()=>{$ui("inline-leaderboard-language").value=$ui("leaderboard-language").value;$ui("inline-leaderboard-difficulty").value=$ui("leaderboard-difficulty").value;showLeaderboard();});
    $ui("inline-leaderboard-language").addEventListener("change",()=>{$ui("leaderboard-language").value=$ui("inline-leaderboard-language").value;showLeaderboard();});
    $ui("inline-leaderboard-difficulty").addEventListener("change",()=>{$ui("leaderboard-difficulty").value=$ui("inline-leaderboard-difficulty").value;showLeaderboard();});
    $ui("close-leaderboard").addEventListener("click",()=>$ui("leaderboard-dialog").close());

    if(!hasConfig()){
      $ui("google-sign-in").disabled=true;
      $ui("account-status").textContent=state.language==="vi"?"Chế độ khách · Chưa cấu hình Supabase.":"Guest mode · Supabase is not configured.";
      state.backendReady=true;
      $ui("start-game").disabled=!state.dictionaryReady;
      showLeaderboard();
      return;
    }
    client=window.supabase.createClient(window.ALICE_SUPABASE_URL,window.ALICE_SUPABASE_ANON_KEY);
    state.supabase=client;
    try {
      const {data,error}=await client.auth.getSession();
      if(error) throw error;
      await updateAccount(data.session);
      client.auth.onAuthStateChange((_event,nextSession)=>{setTimeout(()=>updateAccount(nextSession),0);});
    } catch(error) {
      console.error("Supabase session initialization failed",error);
      state.session=null;
      state.user=null;
      $ui("account-status").textContent=state.language==="vi"
        ?"Không thể kết nối tài khoản · Có thể chơi khách."
        :"Account connection failed · Guest play is available.";
    }
    state.backendReady=true;
    $ui("start-game").disabled=!state.dictionaryReady;
    showLeaderboard();
  });
})();