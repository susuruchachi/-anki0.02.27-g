// ----------------- 一括追加 -----------------
let targetBulkCategory = "";
function showBulkAddModal(catName) {
  targetBulkCategory = catName; document.getElementById('bulkAddTitle').innerText = `一括追加: ${catName}`;
  document.getElementById('txtBulkAdd').value = ''; document.getElementById('bulkAddOverlay').style.display = 'flex';
}
function closeBulkAdd() { document.getElementById('bulkAddOverlay').style.display = 'none'; }

function submitBulkAdd() {
  const text = document.getElementById('txtBulkAdd').value.trim();
  if(!text) { closeBulkAdd(); return; }
  
  // ★ 権限チェック
  let targetSharedDocId = null;
  const existingCard = db.find(q => q.category === targetBulkCategory && q.sharedDocId);
  if (existingCard) {
    targetSharedDocId = existingCard.sharedDocId;
    const perm = sharedDocPermissions[targetSharedDocId];
    if (!perm || !perm.canEdit) { closeBulkAdd(); return alert("🔒 この共有/公開カテゴリーは閲覧専用のため、問題を追加できません。"); }
  }
  
  let count = 0;
  text.split(/\r?\n/).forEach(line => {
    let idx = line.indexOf(','); if(idx === -1) idx = line.indexOf('、');
    if(idx !== -1) {
      const q = line.substring(0, idx).trim(), a = line.substring(idx + 1).trim();
      if(q && a) {
        const newCard = { id: 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36), question: q, answer: a, category: targetBulkCategory, level: 0, correct: 0, incorrect: 0, streak: 0, wrongStreak: 0, shikkariStreak: 0 };
        if (targetSharedDocId) { newCard.sharedDocId = targetSharedDocId; updateCardInSharedDoc(targetSharedDocId, newCard, 'add'); }
        db.push(newCard);
        count++;
      }
    }
  });
  autoMerge(); alert(`${count}件の問題を追加しました！`); closeBulkAdd();
  if (document.getElementById('pgBox').classList.contains('active')) renderBox();
  if (document.getElementById('pgTree').classList.contains('active')) renderTree();
}
