// assets/js/supabase-client.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://aqmcervucsyyqlbifmqh.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_TMwkKkKQ5MwhuqVZSKgFcg_2YfGk-Pk';
export const SESSION_CODE = 'G1-1405-05-05';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const PKEY = 'ai_' + SESSION_CODE + '_pid';
export function getPid() { try { return localStorage.getItem(PKEY); } catch(e){ return null; } }
function setPid(id) { try { localStorage.setItem(PKEY, id); } catch(e){} }

export function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/* ====== Participants ====== */
export async function registerParticipant(alias) {
  let pid = getPid();
  if (!pid) { pid = generateId(); setPid(pid); }
  const { data, error } = await supabase
    .from('participants')
    .upsert({ id: pid, session_code: SESSION_CODE, alias }, { onConflict: 'id' })
    .select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMyParticipant() {
  const pid = getPid();
  if (!pid) return null;
  const { data, error } = await supabase
    .from('participants').select('*').eq('id', pid).maybeSingle();
  if (error) return null;
  return data;
}

export async function getParticipantCount() {
  const { count, error } = await supabase
    .from('participants').select('*', { count: 'exact', head: true })
    .eq('session_code', SESSION_CODE);
  if (error) return 0;
  return count || 0;
}

/* ====== Votes ====== */
export async function submitVote({ widgetId, voteValue, statementId=null, isCorrect=null, points=0 }) {
  const pid = getPid();
  if (!pid) throw new Error('no_participant');
  const { data, error } = await supabase
    .from('votes').insert({
      participant_id: pid,
      session_code: SESSION_CODE,
      widget_id: widgetId,
      statement_id: statementId,
      vote_value: voteValue,
      is_correct: isCorrect,
      points
    }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteMultiVote(widgetId, voteValue) {
  const pid = getPid();
  if (!pid) return;
  await supabase.from('votes').delete()
    .eq('participant_id', pid).eq('widget_id', widgetId).eq('vote_value', voteValue);
}
export async function submitOrEditVotes(widgetId, values, pointsIfNew = 5) {
  const pid = getPid();
  if (!pid) throw new Error('no_participant');
  const { data, error } = await supabase.rpc('submit_or_edit_votes', {
    p_pid: pid,
    p_session: SESSION_CODE,
    p_widget: widgetId,
    p_values: values,
    p_points_if_new: pointsIfNew
  });
  if (error) throw error;
  return data;
}
export async function getMyVotes() {
  const pid = getPid();
  if (!pid) return [];
  const { data, error } = await supabase
    .from('votes').select('widget_id, statement_id, vote_value')
    .eq('participant_id', pid);
  if (error) return [];
  return data || [];
}

/* ====== Results (RPC) ====== */
export async function getResults(widgetId) {
  const { data, error } = await supabase.rpc('get_widget_results', {
    p_session: SESSION_CODE, p_widget: widgetId
  });
  if (error) throw error;
  return data || [];
}

export async function getLeaderboard(limit = 10) {
  const { data, error } = await supabase.rpc('get_leaderboard', {
    p_session: SESSION_CODE, p_limit: limit
  });
  if (error) throw error;
  return data || [];
}

export async function getWordcloud(limit = 20) {
  const { data, error } = await supabase.rpc('get_wordcloud', {
    p_session: SESSION_CODE, p_limit: limit
  });
  if (error) throw error;
  return data || [];
}

/* ====== Presenter state ====== */
export async function getPresenterState() {
  const { data, error } = await supabase
    .from('presenter_state').select('*').eq('session_code', SESSION_CODE).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updatePresenterState(patch) {
  const { data, error } = await supabase
    .from('presenter_state')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('session_code', SESSION_CODE).select().maybeSingle();
  if (error) throw error;
  return data;
}

/* ====== Realtime ====== */
export function subscribeToVotes(cb) {
  return supabase.channel('votes_' + SESSION_CODE)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'votes', filter: 'session_code=eq.' + SESSION_CODE },
      p => cb(p.new))
    .subscribe();
}

export function subscribeToParticipants(cb) {
  return supabase.channel('parts_' + SESSION_CODE)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'participants', filter: 'session_code=eq.' + SESSION_CODE },
      p => cb(p))
    .subscribe();
}

export function subscribeToPresenterState(cb) {
  return supabase.channel('ps_' + SESSION_CODE)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'presenter_state', filter: 'session_code=eq.' + SESSION_CODE },
      p => cb(p.new))
    .subscribe();
}

/* ====== Widget meta for join.html UI ====== */
export const WIDGET_META = {
  wc1: { type: 'wordcloud', q: 'هوش مصنوعی در یک کلمه برای شما چیست؟' },
  p1: { type: 'single', q: 'کدام مهم‌تر است؟',
    options: [{ k:'data', l:'داده باکیفیت' }, { k:'algo', l:'الگوریتم پیشرفته' }] },
  q1: { type: 'quiz', q: 'هر جمله را علامت بزنید.', statements: [
    { id:'q1a', text:'هوش مصنوعی همیشه دقیق است.', correct:false },
    { id:'q1b', text:'هوش مصنوعی می‌تواند فکت جعلی بسازد.', correct:true },
    { id:'q1c', text:'هوش مصنوعی بافتار سازمانی را کامل می‌فهمد.', correct:false },
    { id:'q1d', text:'خروجی روان، همیشه درست است.', correct:false }
  ]},
  p2: { type: 'single', q: 'کدام امروز در بانک‌های ایران فعال است؟',
    options: [
      { k:'a', l:'اعتبارسنجی هوشمند' }, { k:'b', l:'کشف تقلب' },
      { k:'c', l:'چت‌بات خدمات' }, { k:'d', l:'هر چهار مورد', correct:true }
    ] },
  p3: { type: 'multi', q: 'کدام کار را می‌سپارید؟ (چند گزینه)',
    options: [
      { k:'a', l:'خلاصه بخشنامه' }, { k:'b', l:'پیش‌نویس نامه' },
      { k:'c', l:'جدول صورت‌جلسه' }, { k:'d', l:'محاسبه تسهیلات' },
      { k:'e', l:'پاسخ به مشتری' }, { k:'f', l:'استعلام قانون' }
    ] },
  bp1: { type: 'bestprompt', q: 'کدام دستور بهترین است؟',
    prompts: [
      { id:'bp1a', tag:'A', text:'«درباره ضمانت‌نامه یک متن بنویس.»' },
      { id:'bp1b', tag:'B', text:'«نقش: کارشناس حقوقی. زمینه: بخشنامه جدید ضمانت. وظیفه: ۳ تغییر عمده در جدول ۳ ستونی. لحن: رسمی. حداکثر ۳ بند.»', correct:true },
      { id:'bp1c', tag:'C', text:'«یک متن رسمی کامل درباره همه ضوابط ضمانت‌نامه، حداکثر ۵۰۰ کلمه.»' }
    ] },
  sc1: { type: 'single', q: 'خلاصه بخشنامه ۱۰ صفحه‌ای؟',
    options: [{ k:'yes', l:'✓ قابل واگذاری' }, { k:'rev', l:'⚠ نیازمند بازبینی' }, { k:'no', l:'✕ غیرقابل' }] },
  sc2: { type: 'single', q: 'تهیه صورت‌جلسه؟',
    options: [{ k:'yes', l:'✓ قابل واگذاری' }, { k:'rev', l:'⚠ نیازمند بازبینی' }, { k:'no', l:'✕ غیرقابل' }] },
  sc3: { type: 'single', q: 'پاسخ پرتکرار به شعب؟',
    options: [{ k:'yes', l:'✓ قابل واگذاری' }, { k:'rev', l:'⚠ نیازمند بازبینی' }, { k:'no', l:'✕ غیرقابل' }] },
  sc4: { type: 'single', q: 'دسته‌بندی شکایات؟',
    options: [{ k:'yes', l:'✓ قابل واگذاری' }, { k:'rev', l:'⚠ نیازمند بازبینی' }, { k:'no', l:'✕ غیرقابل' }] },
  sc5: { type: 'single', q: 'کنترل مدارک تسهیلات؟',
    options: [{ k:'yes', l:'✓ قابل واگذاری' }, { k:'rev', l:'⚠ نیازمند بازبینی' }, { k:'no', l:'✕ غیرقابل' }] },
  q2: { type: 'quiz2', q: 'کدام داده را می‌توانید آپلود کنید؟',
    options: [
      { k:'a', l:'گزارش مالی مشتری با کد ملی', correct:false },
      { k:'b', l:'بخشنامه علنی بانک مرکزی', correct:true },
      { k:'c', l:'فهرست پرونده‌های تسهیلات', correct:false },
      { k:'d', l:'تصویر کارت ملی', correct:false }
    ] },
  p4: { type: 'single', q: 'مسئولیت خطا را می‌پذیرید؟',
    options: [{ k:'yes', l:'بله، با بازبینی کامل' }, { k:'no', l:'خیر، فقط با تأیید مافوق' }] },
  cm1: { type: 'single', q: 'از هفته آینده چه می‌کنید؟',
    options: [
      { k:'a', l:'یک کار ساده را امتحان می‌کنم' },
      { k:'b', l:'فعلاً نظاره‌گرم' },
      { k:'c', l:'برای واحد من هنوز زود است' }
    ] }
};

export function sectionToWidget(sectionId) {
  if (!sectionId) return null;
  if (sectionId.startsWith('station-')) return sectionId.slice(8);
  return null;
}
