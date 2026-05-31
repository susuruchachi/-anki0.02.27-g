// ★★★ すするanki - ソーシャル機能（ランキング・フレンド・チャット・対戦） ★★★

// ----------------- 🏆 デイリーランキング -----------------
async function loadDailyRanking() {
  const listDiv = document.getElementById('rankingList');
  if (!listDiv) return;
  if (!currentUser) { listDiv.innerHTML = 'ログインしてください'; return; }
  const d = getTodayStr();
  try {
    listDiv.innerHTML = '(読み込み中...)';
    const snap = await firestore.collection('susuru_anki_daily_scores').where('date', '==', d).get();
    
    if(snap.empty) { listDiv.innerHTML = 'まだ今日のスコアがありません。あなたが1番乗りです！'; return; }
    
    let scores = [];
    snap.forEach(doc => scores.push(doc.data()));
    scores.sort((a, b) => (b.score || 0) - (a.score || 0));
    scores = scores.slice(0, 10);
    
    listDiv.innerHTML = '';
    let rank = 1;
    scores.forEach(data => {
      listDiv.innerHTML += `<div><span style="display:inline-block; width:24px; color:var(--warn); font-weight:bold;">${rank}</span>: ${escapeHtml(data.name)} <span style="color:var(--success); font-weight:bold;">(${data.score}問)</span></div>`;
      rank++;
    });
  } catch(e) {
    console.error(e);
    listDiv.innerHTML = 'ランキングの取得に失敗しました。';
  }
}

// ----------------- 👥 フレンド機能 -----------------
async function loadFriends() {
  const listDiv = document.getElementById('friendsList');
  if (!listDiv) return;
  if (!currentUser) { listDiv.innerHTML = 'ログインしてください'; return; }
  
  try {
    listDiv.innerHTML = '(読み込み中...)';
    const snap = await firestore.collection('susuru_anki_profiles').doc(currentUser.uid).get();
    if (!snap.exists) { listDiv.innerHTML = 'フレンドがまだいません。'; return; }
    
    const data = snap.data();
    const friends = data.friends || [];
    if (friends.length === 0) { listDiv.innerHTML = 'フレンドがまだいません。'; return; }
    
    listDiv.innerHTML = '';
    for (let fUid of friends) {
      const fSnap = await firestore.collection('susuru_anki_profiles').doc(fUid).get();
      if (fSnap.exists) {
        const fData = fSnap.data();
        listDiv.innerHTML += `
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg3); padding:10px; border-radius:8px; margin-bottom:8px; border:1px solid var(--border);">
            <span style="font-weight:500;">👤 ${escapeHtml(fData.displayName || '名無し')}</span>
            <div style="margin-left:auto; display:flex; gap:6px;">
              <button class="btn" style="padding:4px 10px; font-size:0.75rem; width:auto;" onclick="openChat('${fUid}', '${escapeHtml(fData.displayName)}')">💬 チャット</button>
              <button class="btn btn-danger" style="padding:4px 10px; font-size:0.75rem; width:auto;" onclick="removeFriend('${fUid}')">削除</button>
            </div>
          </div>
        `;
      }
    }
  } catch (e) {
    console.error(e);
    listDiv.innerHTML = 'フレンドの読み込みに失敗しました。';
  }
}

async function addFriend() {
  const input = document.getElementById('txtFriendUid');
  if (!input) return;
  const fUid = input.value.trim();
  if (!fUid) return alert("UIDを入力してください。");
  if (!currentUser) return alert("ログインが必要です。");
  if (fUid === currentUser.uid) return alert("自分自身をフレンドに追加することはできません。");
  
  try {
    const targetSnap = await firestore.collection('susuru_anki_profiles').doc(fUid).get();
    if (!targetSnap.exists) return alert("指定されたUIDのユーザーが見つかりません。");
    
    await firestore.collection('susuru_anki_profiles').doc(currentUser.uid).update({
      friends: firebase.firestore.FieldValue.arrayUnion(fUid)
    });
    await firestore.collection('susuru_anki_profiles').doc(fUid).update({
      friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
    
    alert("✅ フレンドを登録しました！");
    input.value = '';
    loadFriends();
  } catch (e) {
    console.error(e);
    alert("フレンド追加に失敗しました。");
  }
}

async function removeFriend(fUid) {
  if (!confirm("本当にこのフレンドを削除しますか？")) return;
  try {
    await firestore.collection('susuru_anki_profiles').doc(currentUser.uid).update({
      friends: firebase.firestore.FieldValue.arrayRemove(fUid)
    });
    await firestore.collection('susuru_anki_profiles').doc(fUid).update({
      friends: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
    });
    alert("フレンドを削除しました。");
    loadFriends();
  } catch (e) {
    console.error(e);
  }
}

// ----------------- 💬 フレンドチャット -----------------
let activeChatFriendUid = null;
let chatUnsubscribe = null;

function openChat(friendUid, friendName) {
  activeChatFriendUid = friendUid;
  const box = document.getElementById('chatBox');
  if (!box) return;
  box.style.display = 'flex';
  document.getElementById('chatTitle').innerText = `💬 ${friendName} とのチャット`;
  listenChat();
}

function closeChat() {
  if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
  const box = document.getElementById('chatBox');
  if (box) box.style.display = 'none';
  activeChatFriendUid = null;
}

function listenChat() {
  if (!currentUser || !activeChatFriendUid) return;
  const chatId = [currentUser.uid, activeChatFriendUid].sort().join('_');
  const list = document.getElementById('chatMessageList');
  if (!list) return;
  
  if (chatUnsubscribe) chatUnsubscribe();
  
  chatUnsubscribe = firestore.collection('susuru_anki_chats').doc(chatId).collection('messages')
    .orderBy('date', 'asc').limit(50)
    .onSnapshot(snap => {
      list.innerHTML = '';
      if (snap.empty) { list.innerHTML = '<p style="text-align:center; color:var(--text3); font-size:0.8rem; margin-top:10px;">メッセージがありません。</p>'; return; }
      snap.forEach(doc => {
        const d = doc.data();
        const isMe = d.sender === currentUser.uid;
        list.innerHTML += `
          <div style="display:flex; justify-content:${isMe ? 'flex-end' : 'flex-start'}; margin-bottom:8px;">
            <div style="background:${isMe ? 'var(--accent)' : 'var(--bg3)'}; color:var(--text); padding:8px 12px; border-radius:12px; max-width:70%; font-size:0.85rem; word-break:break-all; border:1px solid ${isMe ? 'transparent' : 'var(--border)'};">
              ${escapeHtml(d.text)}
            </div>
          </div>
        `;
      });
      list.scrollTop = list.scrollHeight;
    });
}

async function sendMessage() {
  const input = document.getElementById('txtChatMessage');
  if (!input) return;
  const text = input.value.trim();
  if (!text || !activeChatFriendUid || !currentUser) return;
  
  const chatId = [currentUser.uid, activeChatFriendUid].sort().join('_');
  try {
    await firestore.collection('susuru_anki_chats').doc(chatId).collection('messages').add({
      sender: currentUser.uid,
      text: text,
      date: firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = '';
  } catch (e) {
    console.error(e);
  }
}

// ----------------- ⚔️ オンライン対戦機能 -----------------
let currentMatchId = null;
let matchUnsubscribe = null;
let matchQuestions = [];
let matchCurrentIdx = 0;
let matchScore = 0;
let matchTimer = null;
let matchTimeLeft = 0;

function initOnlineMatchPage() {
  const container = document.getElementById('onlineMatchScopeSelectors');
  if (container) {
    container.innerHTML = '';
    createOnlineMatchScopeSelect(0, getTopLevelCategories());
  }
  const gameView = document.getElementById('onlineGameView');
  if (gameView) gameView.style.display = 'none';
}

function createOnlineMatchScopeSelect(depth, categoriesToShow) {
  if (categoriesToShow.length === 0) return;
  const container = document.getElementById('onlineMatchScopeSelectors');
  if (!container) return;

  const select = document.createElement('select');
  select.className = 'form-control';
  select.style.marginBottom = '8px';

  if (depth === 0) {
    const optAll = document.createElement('option');
    optAll.value = "all";
    optAll.innerText = "🌐 全てから出題";
    select.appendChild(optAll);
  }
  const optDefault = document.createElement('option');
  optDefault.value = "";
  optDefault.innerText = depth === 0 ? "📁 トップカテゴリー..." : "📂 サブカテゴリー...";
  optDefault.disabled = true;
  optDefault.selected = true;
  select.appendChild(optDefault);

  categoriesToShow.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.innerText = depth === 0 ? `📁 ${cat}` : `📂 ${cat}`;
    select.appendChild(opt);
  });
  
  select.onchange = (e) => {
    const val = e.target.value;
    const selects = Array.from(container.querySelectorAll('select'));
    selects.forEach((sel, idx) => { if (idx > depth) sel.remove(); });
    
    if (val === "all") {
      selectedScopePath = ["all"];
      return;
    }
    
    selectedScopePath[depth] = val;
    selectedScopePath = selectedScopePath.slice(0, depth + 1);
    const children = categoryTree[val] || [];
    if (children.length > 0) {
      createOnlineMatchScopeSelect(depth + 1, children);
    }
  };
  
  container.appendChild(select);
}

function startOnlineMatching() {
  if (!currentUser) return alert("オンライン対戦にはログインが必要です。");
  const qCount = parseInt(document.getElementById('onlineMatchQuestionCount').value) || 10;
  const timeLimit = parseInt(document.getElementById('onlineMatchTimeLimit').value) || 15;
  const scope = selectedScopePath.length > 0 && selectedScopePath[0] !== "all" ? selectedScopePath[selectedScopePath.length - 1] : "all";
  
  startOnlineMatch(scope, qCount, timeLimit, false);
}

function createQuickMatch() {
  if (!currentUser) return alert("招待リンク作成にはログインが必要です。");
  const qCount = parseInt(document.getElementById('onlineMatchQuestionCount').value) || 10;
  const timeLimit = parseInt(document.getElementById('onlineMatchTimeLimit').value) || 15;
  const scope = selectedScopePath.length > 0 && selectedScopePath[0] !== "all" ? selectedScopePath[selectedScopePath.length - 1] : "all";
  
  startOnlineMatch(scope, qCount, timeLimit, true);
}

async function startOnlineMatch(scope, qCount, timeLimit, isPrivate) {
  showOnlineMatchOverlay("🔍 対戦相手を探しています...");
  
  try {
    if (!isPrivate) {
      const snap = await firestore.collection('susuru_anki_matches')
        .where('status', '==', 'waiting')
        .where('scope', '==', scope)
        .where('qCount', '==', qCount)
        .where('isPrivate', '==', false)
        .limit(1).get();
        
      if (!snap.empty) {
        const doc = snap.docs[0];
        if (doc.data().player1 !== currentUser.uid) {
          currentMatchId = doc.id;
          await firestore.collection('susuru_anki_matches').doc(currentMatchId).update({
            status: 'playing',
            player2: currentUser.uid,
            player2Name: currentUser.displayName || '名無し'
          });
          listenToMatch();
          return;
        }
      }
    }
    
    let pool = [];
    if (scope === 'all') {
      pool = [...db];
    } else {
      const subCats = typeof getAllSubcategories === 'function' ? getAllSubcategories(scope) : [scope];
      pool = db.filter(q => subCats.includes(q.category));
    }
    if (pool.length === 0) pool = [...db];
    if (pool.length === 0) {
      removeOnlineMatchOverlay();
      return alert("⚠️ 出題できる問題カードがありません。先にカードを作成してください。");
    }
    
    pool.sort(() => Math.random() - 0.5);
    const selectedQuestions = pool.slice(0, qCount).map(q => ({
      id: q.id, question: q.question, answer: q.answer
    }));
    
    const matchData = {
      status: 'waiting',
      player1: currentUser.uid,
      player1Name: currentUser.displayName || '名無し',
      player2: null,
      player2Name: null,
      scope: scope,
      qCount: qCount,
      timeLimit: timeLimit,
      isPrivate: isPrivate,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      questions: selectedQuestions,
      player1Score: null,
      player2Score: null,
      player1Finished: false,
      player2Finished: false
    };
    
    const ref = await firestore.collection('susuru_anki_matches').add(matchData);
    currentMatchId = ref.id;
    
    if (isPrivate) {
      const inviteLink = `${window.location.origin}${window.location.pathname}?match_id=${currentMatchId}`;
      showOnlineMatchOverlay(`
        <span style="font-size:0.95rem; font-weight:bold; color:var(--warn);">📋 招待リンクが完成しました</span><br><br>
        <input type="text" value="${inviteLink}" id="inviteLinkInput" readonly style="width:100%; padding:8px; background:var(--bg3); color:var(--text); border:1px solid var(--border); border-radius:6px; text-align:center; font-size:0.8rem;"><br>
        <button class="btn" style="margin-top:10px; padding:6px 14px; font-size:0.8rem; width:auto;" onclick="copyInviteLink()">🔗 リンクをコピー</button><br><br>
        <span style="font-size:0.8rem; color:var(--text2);">相手が参加するまでこのままお待ちください...</span>
      `, true);
    }
    
    listenToMatch();
  } catch (e) {
    console.error(e);
    removeOnlineMatchOverlay();
    alert("対戦ルームの作成に失敗しました: " + e.message);
  }
}

window.copyInviteLink = function() {
  const input = document.getElementById('inviteLinkInput');
  if (input) {
    input.select();
    document.execCommand('copy');
    alert('✅ 招待リンクをコピーしました！友達に共有してください。');
  }
}

function listenToMatch() {
  if (matchUnsubscribe) matchUnsubscribe();
  
  matchUnsubscribe = firestore.collection('susuru_anki_matches').doc(currentMatchId)
    .onSnapshot((doc) => {
      if (!doc.exists) return;
      const data = doc.data();
      
      if (data.status === 'playing') {
        const isPlayer1 = data.player1 === currentUser.uid;
        const myFinished = isPlayer1 ? data.player1Finished : data.player2Finished;
        
        if (!myFinished && !document.getElementById('onlineGameView')) {
          matchQuestions = data.questions || [];
          matchCurrentIdx = 0;
          matchScore = 0;
          startOnlineGameUI(data);
        }
        
        if (data.player1Finished && data.player2Finished) {
          showMatchResult(data);
          if (matchUnsubscribe) { matchUnsubscribe(); matchUnsubscribe = null; }
        } else {
          updateGameWaitingStatus(data);
        }
      }
    }, (err) => console.error(err));
}

function startOnlineGameUI(matchData) {
  removeOnlineMatchOverlay();
  const pg = document.getElementById('pgOnlineMatch');
  if (!pg) return;
  
  Array.from(pg.children).forEach(child => {
    if (child.id !== 'onlineGameView') child.style.display = 'none';
  });
  
  let gameView = document.getElementById('onlineGameView');
  if (!gameView) {
    gameView = document.createElement('div');
    gameView.id = 'onlineGameView';
    gameView.style.cssText = 'width:100%; flex:1; display:flex; flex-direction:column; padding:16px;';
    pg.appendChild(gameView);
  }
  gameView.style.display = 'flex';
  
  renderOnlineQuestion(matchData.timeLimit);
}

function renderOnlineQuestion(timeLimit) {
  const gameView = document.getElementById('onlineGameView');
  if (!gameView || matchCurrentIdx >= matchQuestions.length) {
    finishOnlineGame();
    return;
  }
  
  const q = matchQuestions[matchCurrentIdx];
  let choices = [q.answer];
  let dummys = [...new Set(db.filter(item => item.answer !== q.answer).map(item => item.answer))];
  dummys.sort(() => Math.random() - 0.5);
  for (let i = 0; i < 3; i++) {
    if (dummys[i]) choices.push(dummys[i]);
    else choices.push(`ダミー候補 ${i+1}`);
  }
  choices.sort(() => Math.random() - 0.5);
  
  gameView.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:var(--text2); margin-bottom:12px;">
      <span>⚔️ オンライン対戦中</span>
      <span>🎯 問題: ${matchCurrentIdx + 1} / ${matchQuestions.length}</span>
    </div>
    <div style="background:var(--bg3); border:1px solid var(--border); border-radius:8px; height:6px; width:100%; margin-bottom:20px; overflow:hidden;">
      <div id="onlineTimerBar" style="background:var(--accent); height:100%; width:100%; transition: width 1s linear;"></div>
    </div>
    
    <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:24px; min-height:140px; margin-bottom:20px; text-align:center;">
      <div style="font-size:1.15rem; font-weight:bold; word-break:break-all; white-space:pre-wrap;">${escapeHtml(q.question)}</div>
    </div>
    
    <div style="display:grid; grid-template-columns:1fr; gap:10px; margin-bottom:20px;">
      ${choices.map(c => `
        <button class="btn btn-secondary" style="justify-content:center; padding:12px; font-size:0.9rem; text-align:center; word-break:break-all;" onclick="submitOnlineAnswer('${escapeHtml(c.replace(/'/g, "\\'"))}', '${escapeHtml(q.answer.replace(/'/g, "\\'"))}')">
          ${escapeHtml(c)}
        </button>
      `).join('')}
    </div>
  `;
  
  clearInterval(matchTimer);
  matchTimeLeft = timeLimit;
  const bar = document.getElementById('onlineTimerBar');
  
  matchTimer = setInterval(() => {
    matchTimeLeft--;
    if (bar) bar.style.width = `${(matchTimeLeft / timeLimit) * 100}%`;
    if (matchTimeLeft <= 0) {
      clearInterval(matchTimer);
      matchCurrentIdx++;
      renderOnlineQuestion(timeLimit);
    }
  }, 1000);
}

window.submitOnlineAnswer = function(chosen, correct) {
  clearInterval(matchTimer);
  if (chosen === correct) matchScore++;
  matchCurrentIdx++;
  const timeLimit = parseInt(document.getElementById('onlineMatchTimeLimit').value) || 15;
  renderOnlineQuestion(timeLimit);
}

async function finishOnlineGame() {
  clearInterval(matchTimer);
  const gameView = document.getElementById('onlineGameView');
  if (gameView) {
    gameView.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:24px;">
        <div style="font-size:2rem; margin-bottom:12px;">🏁</div>
        <div style="font-size:1.2rem; font-weight:bold; margin-bottom:6px;">あなたの解答が完了しました！</div>
        <div style="font-size:1.1rem; color:var(--success); font-weight:bold; margin-bottom:20px;">スコア: ${matchScore} / ${matchQuestions.length}</div>
        <div id="matchWaitStatus" style="font-size:0.85rem; color:var(--text2);">🔄 対戦相手の完了を待っています...</div>
      </div>
    `;
  }
  
  try {
    const doc = await firestore.collection('susuru_anki_matches').doc(currentMatchId).get();
    const isPlayer1 = doc.data().player1 === currentUser.uid;
    if (isPlayer1) {
      await firestore.collection('susuru_anki_matches').doc(currentMatchId).update({
        player1Score: matchScore, player1Finished: true
      });
    } else {
      await firestore.collection('susuru_anki_matches').doc(currentMatchId).update({
        player2Score: matchScore, player2Finished: true
      });
    }
  } catch (e) {
    console.error(e);
  }
}

function updateGameWaitingStatus(data) {
  const statusDiv = document.getElementById('matchWaitStatus');
  if (!statusDiv) return;
  const isPlayer1 = data.player1 === currentUser.uid;
  const oppName = isPlayer1 ? (data.player2Name || "相手") : (data.player1Name || "相手");
  statusDiv.innerText = isPlayer1 ? (data.player2Finished ? `💡 ${oppName} は解き終わっています。結果集計中...` : `🔄 ${oppName} の解答を待っています...`) : (data.player1Finished ? `💡 ${oppName} は解き終わっています。結果集計中...` : `🔄 ${oppName} の解答を待っています...`);
}

function showMatchResult(data) {
  const gameView = document.getElementById('onlineGameView');
  if (!gameView) return;
  
  const isPlayer1 = data.player1 === currentUser.uid;
  const myScore = isPlayer1 ? data.player1Score : data.player2Score;
  const oppScore = isPlayer1 ? data.player2Score : data.player1Score;
  const oppName = isPlayer1 ? (data.player2Name || "相手") : (data.player1Name || "相手");
  
  let title = "引き分け 🤔"; let color = "var(--warn)";
  if (myScore > oppScore) { title = "あなたの勝ち！ 🎉"; color = "var(--success)"; }
  else if (myScore < oppScore) { title = "あなたの負け... 😢"; color = "var(--danger)"; }
  
  gameView.innerHTML = `
    <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:16px;">
      <div style="font-size:1.5rem; font-weight:bold; color:${color}; margin-bottom:20px;">${title}</div>
      <div style="background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:16px; width:100%; max-width:300px; margin-bottom:24px; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; justify-content:space-between; font-size:0.95rem;">
          <span style="font-weight:bold; color:var(--accent);">あなた:</span><span>${myScore} 問正解</span>
        </div>
        <div style="border-top:1px solid var(--border); padding-top:10px; display:flex; justify-content:space-between; font-size:0.95rem;">
          <span style="color:var(--text2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${escapeHtml(oppName)}:</span><span>${oppScore} 問正解</span>
        </div>
      </div>
      <button class="btn" style="width:100%; max-width:180px;" onclick="quitOnlineMatchUI()">ロビーに戻る</button>
    </div>
  `;
}

window.quitOnlineMatchUI = function() {
  const gameView = document.getElementById('onlineGameView');
  if (gameView) { gameView.style.display = 'none'; gameView.innerHTML = ''; }
  const pg = document.getElementById('pgOnlineMatch');
  if (pg) {
    Array.from(pg.children).forEach(child => { if (child.id !== 'onlineGameView') child.style.display = ''; });
  }
  currentMatchId = null;
  initOnlineMatchPage();
}

function showOnlineMatchOverlay(htmlContent, showCancel = true) {
  let overlay = document.getElementById('onlineMatchOverlayZone');
  if (!overlay) {
    overlay = document.createElement('div'); overlay.id = 'onlineMatchOverlayZone';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(8,12,20,0.95); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; color:var(--text); font-family:sans-serif;';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div style="background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:20px; width:100%; max-width:360px; text-align:center; box-shadow:0 8px 24px rgba(0,0,0,0.5);">
      <div style="margin-bottom:16px; font-size:1rem; line-height:1.5;">${htmlContent}</div>
      ${showCancel ? `<button class="btn btn-secondary" style="width:100%;" onclick="cancelOnlineMatch()">キャンセル</button>` : ''}
    </div>
  `;
}

function removeOnlineMatchOverlay() {
  const overlay = document.getElementById('onlineMatchOverlayZone');
  if (overlay) overlay.remove();
}

window.cancelOnlineMatch = async function() {
  removeOnlineMatchOverlay();
  if (matchUnsubscribe) { matchUnsubscribe(); matchUnsubscribe = null; }
  if (currentMatchId) {
    try {
      const docRef = firestore.collection('susuru_anki_matches').doc(currentMatchId);
      const doc = await docRef.get();
      if (doc.exists && doc.data().status === 'waiting') await docRef.delete();
    } catch (e) { console.error(e); }
    currentMatchId = null;
  }
}

// 🔗 招待リンクからの自動参加フック処理
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('match_id');
    if (matchId && currentUser) {
      if (typeof openPage === 'function') openPage('pgOnlineMatch');
      showOnlineMatchOverlay("⚡ 対戦ルームへ接続中...");
      try {
        const doc = await firestore.collection('susuru_anki_matches').doc(matchId).get();
        if (doc.exists) {
          const data = doc.data();
          if (data.status === 'waiting' && data.player1 !== currentUser.uid) {
            currentMatchId = doc.id;
            await firestore.collection('susuru_anki_matches').doc(currentMatchId).update({
              status: 'playing', player2: currentUser.uid, player2Name: currentUser.displayName || '名無し'
            });
            listenToMatch();
          } else if (data.player1 === currentUser.uid || data.player2 === currentUser.uid) {
            currentMatchId = doc.id; listenToMatch();
          } else {
            removeOnlineMatchOverlay(); alert("⚠️ この対戦はすでに満員か終了しています。");
          }
        } else {
          removeOnlineMatchOverlay(); alert("⚠️ 対戦ルームが見つかりません。");
        }
      } catch (e) { console.error(e); removeOnlineMatchOverlay(); }
    }
  }, 1500);
});
