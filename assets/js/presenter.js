// assets/js/presenter.js
import * as SB from './supabase-client.js';

const toFa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function waitFor(sel, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function loop() {
      const el = document.querySelector(sel);
      if (el) return resolve(el);
      if (Date.now() - t0 > timeout) return reject(new Error('timeout ' + sel));
      setTimeout(loop, 50);
    })();
  });
}

async function init() {
  await waitFor('.deck');
  await new Promise(r => setTimeout(r, 200));

  window.SB = SB;
  window.SB.isReal = true;
  console.log('[SB] presenter connected');

  /* ---- Override buildResults ---- */
  const origBuildResults = window.buildResults;
  window.buildResults = async function(id) {
    try {
      const rows = await SB.getResults(id);
      renderResults(id, rows);
    } catch(e) {
      console.warn('[SB] results failed, fallback', e);
      if (origBuildResults) origBuildResults(id);
    }
  };

  /* ---- Override renderLB ---- */
  const origRenderLB = window.renderLB;
  window.renderLB = async function(el) {
    if (!el) return;
    try {
      const rows = await SB.getLeaderboard(10);
      el.innerHTML = '';
      if (!rows.length) {
        el.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted);font-size:.85rem">هنوز کسی امتیاز نگرفته</div>';
        return;
      }
      rows.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'lb-row' + (i===0?' top1':i===1?' top2':i===2?' top3':'');
        row.innerHTML = `<span class="lb-rank">${i+1}</span><span class="lb-name">${esc(r.alias)}</span><span class="lb-score">${r.score}</span>`;
        el.appendChild(row);
      });
    } catch(e) {
      if (origRenderLB) origRenderLB(el);
    }
  };

  window.renderLB(document.getElementById('lbBreak'));
  window.renderLB(document.getElementById('lbFinal'));

  /* ---- Hook submitVote into click handlers ---- */
  document.addEventListener('click', async (e) => {
    const opt = e.target.closest('.opt');
    if (!opt) return;
    const widget = opt.closest('.widget[data-widget]');
    if (!widget) return;
    const widgetId = widget.dataset.widget;
    const value = opt.dataset.key;
    if (!value) return;
    let points = 5, isCorrect = null;
    if (opt.dataset.correct === 'true') { points = 20; isCorrect = true; }
    else if (opt.dataset.correct === 'false') { points = 3; isCorrect = false; }
    try {
      await SB.submitVote({ widgetId, voteValue: value, isCorrect, points });
    } catch(err) {
      // duplicate or rate-limit — expected, ignore
    }
  }, true);

  document.addEventListener('click', async (e) => {
    const card = e.target.closest('.prompt-card');
    if (!card) return;
    const widget = card.closest('.widget[data-widget]');
    if (!widget) return;
    const widgetId = widget.dataset.widget;
    const tag = card.querySelector('.prompt-tag')?.textContent?.trim() || '';
    const isCorrect = tag === 'B' ? true : false;
    const points = isCorrect ? 20 : 5;
    try {
      await SB.submitVote({ widgetId, voteValue: tag, isCorrect, points });
    } catch(err) {}
  }, true);

  /* ---- Sync current section ---- */
  const origUpdateActive = window.updateActive;
  if (typeof origUpdateActive === 'function') {
    window.updateActive = function(idx) {
      origUpdateActive(idx);
      const sec = document.querySelectorAll('.sec')[idx];
      if (sec) SB.updatePresenterState({ current_section: sec.id }).catch(()=>{});
    };
    const activeSec = document.querySelectorAll('.sec')[0];
    if (activeSec) SB.updatePresenterState({ current_section: activeSec.id }).catch(()=>{});
  }

  /* ---- Realtime: participant count ---- */
  SB.subscribeToParticipants(async () => {
    try {
      const count = await SB.getParticipantCount();
      const el = document.getElementById('liveCount');
      if (el) el.textContent = toFa(count);
    } catch(e){}
  });

  try {
    const count = await SB.getParticipantCount();
    const el = document.getElementById('liveCount');
    if (el) el.textContent = toFa(count);
  } catch(e){}

  /* ===== پچ: پاک کردن پیش‌نمایش ماک از ویجت‌ها ===== */
  setTimeout(function(){
    document.querySelectorAll('.widget[data-widget]').forEach(function(w){
      const wc = w.querySelector('.wordcloud');
      if (wc) {
        wc.innerHTML = '<div style="text-align:center;padding:2.5rem 1rem;color:var(--muted);font-size:.92rem;line-height:1.8">منتظر رأی شرکت‌کنندگان…<br><span style="font-size:.78rem;opacity:.7">نتایج زنده در صفحه results.html</span></div>';
      }
      w.querySelectorAll('.opt .pct').forEach(function(p){
        p.textContent = '';
        p.style.opacity = '0';
      });
      w.querySelectorAll('.prompt-card').forEach(function(card){
        const last = card.querySelector('div:last-child');
        if (last && last.textContent.indexOf('%') > -1) last.remove();
      });
    });
    console.log('[SB] mock preview cleared');
  }, 400);
}

/* ---- Render results from RPC rows ---- */
function renderResults(id, rows) {
  const overlay = document.getElementById('resultsOverlay');
  const overlayBody = document.getElementById('overlayBody');
  const overlayTitle = document.getElementById('overlayTitle');
  const meta = SB.WIDGET_META[id];
  const widgetEl = document.querySelector(`[data-widget="${id}"]`);
  const q = widgetEl?.querySelector('.widget-q')?.textContent || '';
  overlayTitle.textContent = 'نتایج · ' + q;

  const total = rows.reduce((a, r) => a + Number(r.count), 0) || 1;
  let html = `<p class="muted" style="margin-bottom:1rem">مجموع پاسخ‌ها: ${toFa(total)}</p>`;

  if (rows.length === 0) {
    overlayBody.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--muted)">هنوز پاسخی ثبت نشده است</p>';
    overlay.classList.add('open');
    return;
  }

  if (meta?.type === 'wordcloud') {
    html += '<div class="wordcloud">';
    rows.sort((a,b) => b.count - a.count).forEach(r => {
      const size = 0.85 + (r.count / total) * 2;
      html += `<span style="font-size:${size}rem">${esc(r.vote_value)} (${r.count})</span>`;
    });
    html += '</div>';
  } else if (meta?.type === 'quiz') {
    meta.statements.forEach(st => {
      const stRows = rows.filter(r => r.statement_id === st.id);
      const stTotal = stRows.reduce((a,r) => a + Number(r.count), 0) || 1;
      html += `<div style="margin-bottom:1.2rem"><div style="font-weight:700;margin-bottom:.5rem">${esc(st.text)}</div>`;
      [['t','واقعیت'],['f','افسانه'],['u','مطمئن نیستم']].forEach(([k,l]) => {
        const c = stRows.find(r => r.vote_value === k)?.count || 0;
        const pct = Math.round(c / stTotal * 100);
        html += `<div style="display:flex;justify-content:space-between;padding:.4rem .7rem;background:var(--surface);border-radius:9px;margin-bottom:.3rem"><span>${l}</span><span style="color:var(--amber);font-weight:700">${pct}%</span></div>`;
      });
      html += `<div style="font-size:.82rem;color:var(--mint);margin-top:.3rem;font-weight:600">✓ پاسخ صحیح: ${st.correct?'واقعیت':'افسانه'}</div></div>`;
    });
  } else if (meta?.type === 'bestprompt') {
    meta.prompts.forEach(p => {
      const c = rows.find(r => r.vote_value === p.tag)?.count || 0;
      const pct = Math.round(c / total * 100);
      html += `<div style="padding:.7rem;background:var(--surface);border-radius:11px;margin-bottom:.5rem"><b>${p.tag}:</b> ${esc(p.text)}<div style="color:var(--amber);margin-top:.35rem;font-weight:700">${pct}%</div></div>`;
    });
    html += '<p style="margin-top:.9rem;color:var(--mint);font-weight:600">✓ گزینه B بهترین است</p>';
  } else if (meta?.options) {
    meta.options.forEach(o => {
      const c = rows.find(r => r.vote_value === o.k)?.count || 0;
      const pct = Math.round(c / total * 100);
      html += `<div style="display:flex;justify-content:space-between;padding:.6rem .9rem;background:var(--surface);border-radius:11px;margin-bottom:.4rem"><span>${esc(o.l)}</span><span style="color:var(--amber);font-weight:700">${pct}%</span></div>`;
    });
    const correct = meta.options.find(o => o.correct);
    if (correct) html += `<p style="margin-top:.9rem;color:var(--mint);font-weight:600">✓ پاسخ صحیح: ${esc(correct.l)}</p>`;
  } else {
    html = '<p class="muted">داده‌ای ثبت نشده</p>';
  }

  overlayBody.innerHTML = html;
  overlay.classList.add('open');
}

init().catch(e => console.error('[SB] init failed', e));
