// ★ ユーティリティ関数

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function toggleLightMode(forceOn = false) {
  const isLight = forceOn || !document.body.classList.contains('light-mode');
  if(isLight) document.body.classList.add('light-mode'); else document.body.classList.remove('light-mode');
  localStorage.setItem('theme_light', isLight);
  if(chartInstance) renderStatsAndCharts();
}
