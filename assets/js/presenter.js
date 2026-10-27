// assets/js/presenter.js
import * as SB from './supabase-client.js';

const toFa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

console.log('[SB] presenter.js loaded');

function clearMockPreview() {
  document.querySelectorAll('.widget[data-widget]').forEach(function(w){
    const wc = w.querySelector('.wordcloud');
    if (wc && wc.querySelector('span')) {
      wc.innerHTML = '<div style="text-align:center;padding:2.5rem 1rem;color:var(--muted);font-size:.92rem;line-height:1.8">منتظر رأی شرکت‌کنندگان…<br><span style="font-size:.78rem;opacity:.7">نتایج زنده در صفحه results.html</span></div>';
    }
    w.querySelectorAll('.opt .pct').forEach(function(p){
      if (p.textContent) { p.textContent = ''; p.style.opacity = '0'; }
    });
    w.querySelectorAll('.prompt-card').forEach(function(card){
      card.querySelectorAll('div').forEach(function(d){
        if (d.textContent.indexOf('%') > -1) d.remove();
      });
    });
  });
}

async function updateLiveWordcloud() {
  try {
    const ps = await SB.getPresenterState();
    if (SB.sectionToWidget(ps?.current_section) !== 'wc1') return;
    const wcEl = document.getElementById('wc1Cloud');
    if (!wcEl) return;
    const rows = await SB.getResults('wc1');
    if (!rows || rows.length === 0) {
      if (!wcEl.querySelector('.waiting-msg')) {
        wcEl.innerHTML = '<div class="waiting-msg" style="text-align:center;padding:2.5rem 1rem;color:var(--muted);font-size:.92rem">منتظر اولین کلمه…</div>';
      }
      return;
    }
    const maxC = Math.max(...rows.map(r => Number(r.count)));
    const sorted = rows.slice().sort((a, b) => Number(b.count) - Number(a.count));
    let html = '';
    sorted.forEach(r => {
      const c = Number(r.count);
      const size = 0.85 + (c / maxC) * 1.7;
      html += `<span style="font-size:${size}rem">${esc(r.vote_value)} (${c})</span>`;
    });
    wcEl.innerHTML = html;
  } catch(e) {}
}

async function init() {
  try {
    const t0 = Date.now();
    while (!document.querySelector('.deck') && Date.now() - t0 < 5000) {
      await new Promise(r => setTimeout(r, 50));
    }
    await new Promise(r => setTimeout(r, 200));
    console.log('[SB] starting overrides');

    const origBuildResults = window.buildResults;
    window.buildResults = async function(id) {
      try {
        const rows = await SB.getResults(id);
        renderResults(id, rows);
      } catch(e) {
        console.warn('[SB] results failed', e);
        if (origBuildResults) origBuildResults(id);
      }
    };

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
      try { await SB.submitVote({ widgetId, voteValue: value, isCorrect, points }); } catch(err) {}
    }, true);

    if (typeof window.updateActive === 'function') {
      const origUpdateActive = window.updateActive;
      window.updateActive = function(idx) {
        origUpdateActive(idx);
        const sec = document.querySelectorAll('.sec')[idx];
        if (sec) SB.updatePresenterState({ current_section: sec.id }).catch(()=>{});
      };
    }
    const activeSec = document.querySelectorAll('.sec')[0];
    if (activeSec) SB.updatePresenterState({ current_section: activeSec.id }).catch(()=>{});

    /* Live count + join notifications */
    SB.subscribeToParticipants(async (payload) => {
      try {
        const count = await SB.getParticipantCount();
        const el1 = document.getElementById('liveCount');
        const el2 = document.getElementById('liveCountBig');
        if (el1) el1.textContent = toFa(count);
        if (el2) el2.textContent = toFa(count);
        if (payload && payload.eventType === 'INSERT' && payload.new && payload.new.alias) {
          if (typeof window.enqueueJoin === 'function') {
            window.enqueueJoin(payload.new.alias);
          }
        }
      } catch(e){}
    });

    try {
      const count = await SB.getParticipantCount();
      const el1 = document.getElementById('liveCount');
      const el2 = document.getElementById('liveCountBig');
      if (el1) el1.textContent = toFa(count);
      if (el2) el2.textContent = toFa(count);
    } catch(e){}

    clearMockPreview();
    setTimeout(clearMockPreview, 800);

    setInterval(updateLiveWordcloud, 2000);
    updateLiveWordcloud();

    console.log('[SB] overrides applied');
  } catch(e) {
    console.error('[SB] init failed', e);
  }
}

function renderResults(id, rows) {
  const overlay = document.getElementById('resultsOverlay');
  const overlayBody = document.getElementById('overlayBody');
  const overlayTitle = document.getElementById('overlayTitle');
  const meta = SB.WIDGET_META[id];
  const widgetEl = document.querySelector(`[data-widget="${id}"]`);
  const q = widgetEl?.querySelector('.widget-q')?.textContent || '';
  overlayTitle.textContent = 'نتایج · ' + q;

  const total = rows.reduce((a, r) => a + Number(r.count), 0) || 1;

  if (rows.length === 0) {
    overlayBody.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--muted)">هنوز پاسخی ثبت نشده است</p>';
    overlay.classList.add('open');
    return;
  }

  let html = `<p class="muted" style="margin-bottom:1rem">مجموع پاسخ‌ها: ${toFa(total)}</p>`;

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
        const isCorrectQ = (k === 't' && st.correct) || (k === 'f' && !st.correct);
        const bg = isCorrectQ ? 'linear-gradient(90deg, rgba(52,211,153,.18), rgba(52,211,153,.04))' : 'var(--surface)';
        const border = isCorrectQ ? '1px solid rgba(52,211,153,.55)' : '1px solid transparent';
        const check = isCorrectQ ? ' <span style="color:var(--mint);font-weight:800">✓</span>' : '';
        const color = isCorrectQ ? 'var(--mint)' : 'var(--amber)';
        html += `<div style="display:flex;justify-content:space-between;padding:.4rem .7rem;background:${bg};border:${border};border-radius:9px;margin-bottom:.3rem"><span>${l}${check}</span><span style="color:${color};font-weight:700">${pct}%</span></div>`;
      });
      html += `<div style="font-size:.82rem;color:var(--mint);margin-top:.3rem;font-weight:600">✓ پاسخ صحیح: ${st.correct?'واقعیت':'افسانه'}</div></div>`;
    });
  } else if (meta?.type === 'bestprompt') {
    meta.prompts.forEach(p => {
      const c = rows.find(r => r.vote_value === p.tag)?.count || 0;
      const pct = Math.round(c / total * 100);
      const isCorrect = p.correct === true;
      const bg = isCorrect ? 'linear-gradient(160deg, rgba(52,211,153,.18), rgba(52,211,153,.04))' : 'var(--surface)';
      const border = isCorrect ? '1px solid rgba(52,211,153,.55)' : '1px solid transparent';
      const check = isCorrect ? ' <span style="color:var(--mint)">✓</span>' : '';
      const col = isCorrect ? 'var(--mint)' : 'var(--amber)';
      html += `<div style="padding:.7rem;background:${bg};border:${border};border-radius:11px;margin-bottom:.5rem"><b>${p.tag}:${check}</b> ${esc(p.text)}<div style="color:${col};margin-top:.35rem;font-weight:700">${pct}%</div></div>`;
    });
    html += '<p style="margin-top:.9rem;color:var(--mint);font-weight:600">✓ گزینه B بهترین است</p>';
  } else if (meta?.options) {
    meta.options.forEach(o => {
      const c = rows.find(r => r.vote_value === o.k)?.count || 0;
      const pct = Math.round(c / total * 100);
      const isCorrect = o.correct === true;
      const bg = isCorrect ? 'linear-gradient(90deg, rgba(52,211,153,.18), rgba(52,211,153,.04))' : 'var(--surface)';
      const border = isCorrect ? '1px solid rgba(52,211,153,.55)' : '1px solid transparent';
      const check = isCorrect ? ' <span style="color:var(--mint);font-weight:800">✓</span>' : '';
      const color = isCorrect ? 'var(--mint)' : 'var(--amber)';
      html += `<div style="display:flex;justify-content:space-between;padding:.6rem .9rem;background:${bg};border:${border};border-radius:11px;margin-bottom:.4rem"><span>${esc(o.l)}${check}</span><span style="color:${color};font-weight:700">${pct}%</span></div>`;
    });
    const correct = meta.options.find(o => o.correct);
    if (correct) html += `<p style="margin-top:.9rem;color:var(--mint);font-weight:600">✓ پاسخ صحیح: ${esc(correct.l)}</p>`;
  } else {
    html = '<p class="muted">داده‌ای ثبت نشده</p>';
  }

  overlayBody.innerHTML = html;
  overlay.classList.add('open');
}

init();
