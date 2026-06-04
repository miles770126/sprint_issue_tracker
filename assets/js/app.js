/**
 * app.js  — Sprint Issue Tracker  v3
 *
 * 개선 사항
 *  1. 타임라인 이슈 제목 전체 표시 (줄 바꿈)
 *  2. 카테고리 소팅 버튼 (타임라인 상단)
 *  3. 미해결 이슈 → 오늘까지 줄무늬 바 연장
 *  4. 지표 카드 클릭 → 상태별 타임라인 필터 (전체/진행중/해결완료)
 *  5. UX 개선: 스프린트 없을 때 안내, 이슈 없음 구분, 빠른 상태 변경,
 *              편집 후 상세 재오픈, 오늘 자동 스크롤, 키보드 닫기 지원
 *
 * 로드 순서: holidays.js → store.js → app.js
 */

/* =============================================================
   0. 접근 코드  ← 배포 전 반드시 변경!
============================================================= */
const ACCESS_CODE = 'sprint2025';


/* =============================================================
   1. 상수 & 전역 상태
============================================================= */
const SP_COLORS = ['#6366f1','#10b981','#f59e0b','#3b82f6','#8b5cf6','#ec4899'];
const COL_W     = 34;   // 타임라인 열 너비 px

const A = {
  curProj:      null,
  curFilter:    'all',       // 칸반 필터
  curView:      'kanban',
  selCat:       'live',
  selColor:     '#6366f1',
  openIssId:    null,
  editingIssId: null,
  editingSpId:  null,   // 스프린트 수정 모드
  tlStartDate:  null,
  tlDays:       30,
  tlStatusFilter: 'all',    // 타임라인 상태 필터: 'all' | 'in-progress' | 'done'
  tlCatFilter:    'all',    // 타임라인 카테고리 필터: 'all' | 'live' | 'ops' | ...
};


/* =============================================================
   2. 유틸
============================================================= */
const uid = () => 'x' + Math.random().toString(36).slice(2, 8);

const gp = id => Store.data.projects.find(p => p.id === id);
const gs = id => Store.data.sprints.find(s  => s.id === id);
const gi = id => Store.data.issues.find(i   => i.id === id);

const dateStr = d =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };

const parseDate = s => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const catLbl  = c => c==='live'?'라이브이슈':c==='ops'?'운영이슈':c;
const catCls  = c => c==='live'?'cb-live':c==='ops'?'cb-ops':'cb-custom';
const stLbl   = s => s==='done'?'해결완료':s==='in-progress'?'진행중':'미해결';
const sdotCls = s => s==='done'?'sd-done':s==='in-progress'?'sd-prog':'sd-todo';

const esc = str =>
  String(str||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/** 이슈 상태·카테고리 → 바 색상 */
const barColor = iss => {
  if (iss.status === 'done')        return { bg:'#d1fae5', border:'#34d399', text:'#065f46' };
  if (iss.status === 'in-progress') return { bg:'#e0e7ff', border:'#818cf8', text:'#3730a3' };
  if (iss.cat    === 'live')        return { bg:'#fee2e2', border:'#f87171', text:'#991b1b' };
  return                                   { bg:'#fef9c3', border:'#fbbf24', text:'#92400e' };
};


/* =============================================================
   3. 로그인 / 로그아웃
============================================================= */
function doLogin() {
  const pw = document.getElementById('login-pw').value;
  if (pw === ACCESS_CODE) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    sessionStorage.setItem('st_auth', '1');
    init();
  } else {
    document.getElementById('login-err').style.display = 'block';
    document.getElementById('login-pw').value = '';
    document.getElementById('login-pw').focus();
  }
}

function doLogout() {
  sessionStorage.removeItem('st_auth');
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-pw').value = '';
  document.getElementById('login-err').style.display = 'none';
}


/* =============================================================
   4. 초기화
============================================================= */
function init() {
  const t = new Date();
  t.setDate(t.getDate() - 7);
  A.tlStartDate = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  renderProjList();
  renderAll();
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-pw').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  /* ESC 키로 모달 닫기 */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    ['det-modal','iss-modal','sp-modal','proj-modal'].forEach(id => {
      document.getElementById(id)?.classList.remove('open');
    });
  });

  /* 모달 오버레이 클릭으로 닫기 */
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target === el) el.classList.remove('open');
    });
  });

  if (sessionStorage.getItem('st_auth') === '1') {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    init();
  }
});


/* =============================================================
   5. 사이드바 — 프로젝트 목록
============================================================= */
function renderProjList() {
  document.getElementById('proj-list').innerHTML =
    Store.data.projects.map(p => `
      <div class="proj-item ${A.curProj === p.id ? 'active' : ''}"
           onclick="selProj('${p.id}')">
        <div class="proj-left">
          <div class="proj-dot" style="background:${p.color}"></div>
          <span class="proj-name">${esc(p.name)}</span>
        </div>
        <button class="proj-del"
                onclick="event.stopPropagation();delProj('${p.id}')"
                title="삭제">✕</button>
      </div>`).join('');
}

function selProj(id) {
  A.curProj = id;
  document.getElementById('page-sub').textContent = gp(id)?.name ?? '';
  renderProjList();
  renderAll();
}

function delProj(id) {
  const p = gp(id); if (!p) return;
  if (!confirm(`"${p.name}" 프로젝트를 삭제할까요?\n관련 스프린트와 이슈도 함께 삭제됩니다.`)) return;
  Store.data.sprints  = Store.data.sprints.filter(s  => s.projId !== id);
  Store.data.issues   = Store.data.issues.filter(i   => i.projId !== id);
  Store.data.projects = Store.data.projects.filter(p => p.id     !== id);
  if (A.curProj === id) {
    A.curProj = null;
    document.getElementById('page-sub').textContent = '프로젝트를 선택하세요';
  }
  Store.save(); renderProjList(); renderAll();
}


/* =============================================================
   6. 뷰 전환
============================================================= */
function sw(v) {
  A.curView = v;
  ['kanban','sprint','dash'].forEach(n => {
    document.getElementById('view-' + n).classList.toggle('active', n === v);
    document.getElementById('nav-'  + n).classList.toggle('active', n === v);
  });
  document.getElementById('page-title').textContent =
    { kanban:'칸반 보드', sprint:'스프린트 뷰', dash:'타임라인' }[v];
  renderAll();
}


/* =============================================================
   7. 칸반
============================================================= */
function setF(f, btn) {
  A.curFilter = f;
  document.querySelectorAll('.flt').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderKanban();
}

function getFiltered() {
  let is = Store.data.issues;
  if (A.curProj) is = is.filter(i => i.projId === A.curProj);
  switch (A.curFilter) {
    case 'live':   is = is.filter(i => i.cat === 'live'); break;
    case 'ops':    is = is.filter(i => i.cat === 'ops');  break;
    case 'sprint': {
      const ls = Store.data.sprints
        .filter(s => !A.curProj || s.projId === A.curProj)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      if (ls) is = is.filter(i => i.sprintId === ls.id);
      break;
    }
  }
  return is;
}

function renderKanban() {
  const issues = getFiltered();
  const cols   = [
    { key:'todo',        lbl:'미해결' },
    { key:'in-progress', lbl:'진행중' },
    { key:'done',        lbl:'해결완료' },
  ];

  document.getElementById('kboard').innerHTML = cols.map(col => {
    const ci    = issues.filter(i => i.status === col.key);
    const cards = ci.length
      ? ci.map(i => {
          const sp  = gs(i.sprintId);
          const spC = sp ? SP_COLORS[Store.data.sprints.indexOf(sp) % SP_COLORS.length] : '#94a3b8';
          return `
            <div class="icard" onclick="openDet('${i.id}')">
              <div class="icard-strip" style="background:${spC}"></div>
              <div class="icard-body">
                <div class="icard-top">
                  <div class="icard-title">${esc(i.title)}</div>
                  <span class="cbadge ${catCls(i.cat)}">${catLbl(i.cat)}</span>
                </div>
                <div class="icard-meta">
                  <span class="imeta">
                    <div class="sdot ${sdotCls(i.status)}"></div>${stLbl(i.status)}
                  </span>
                  ${sp ? `<span class="imeta">${esc(sp.name)}</span>` : ''}
                  <span class="imeta">${i.date}</span>
                </div>
              </div>
            </div>`;
        }).join('')
      : '<div class="empty-col">이슈 없음</div>';

    return `
      <div class="kcol">
        <div class="kcol-head">
          <div class="kcol-title">
            <div class="sdot ${sdotCls(col.key)}"></div>${col.lbl}
          </div>
          <div class="kcol-cnt">${ci.length}</div>
        </div>
        ${cards}
      </div>`;
  }).join('');
}


/* =============================================================
   8. 스프린트 뷰
============================================================= */
function renderSprint() {
  let sps = Store.data.sprints;
  if (A.curProj) sps = sps.filter(s => s.projId === A.curProj);
  const tl = document.getElementById('sprint-tl');

  if (!sps.length) {
    tl.innerHTML = `
      <div style="background:var(--bg2);border-radius:10px;padding:40px;
                  text-align:center;color:var(--text3);font-size:13px">
        <div style="font-size:24px;margin-bottom:10px">🏃</div>
        등록된 스프린트가 없습니다<br>
        <span style="font-size:12px">상단 + 스프린트 버튼으로 추가하세요</span>
      </div>`;
    return;
  }

  sps = sps.slice().sort((a, b) => new Date(a.date) - new Date(b.date));

  tl.innerHTML = sps.map((sp, idx) => {
    const spC  = SP_COLORS[idx % SP_COLORS.length];
    const si   = Store.data.issues.filter(i => i.sprintId === sp.id);
    const proj = gp(sp.projId);
    const lc   = si.filter(i => i.cat    === 'live').length;
    const oc   = si.filter(i => i.cat    === 'ops').length;
    const dc   = si.filter(i => i.status === 'done').length;
    const uc   = si.filter(i => i.status === 'todo').length;
    const pc   = si.filter(i => i.status === 'in-progress').length;

    const rows = si.length
      ? si.map(i => `
          <div class="srow" onclick="openDet('${i.id}')">
            <div class="sdot ${sdotCls(i.status)}"></div>
            <div style="font-size:13px;line-height:1.4">${esc(i.title)}</div>
            <span class="cbadge ${catCls(i.cat)}">${catLbl(i.cat)}</span>
            <div style="font-size:11px;color:var(--text3)">${i.date}</div>
          </div>`).join('')
      : `<div style="padding:14px;text-align:center;font-size:12px;color:var(--text3)">
           이슈 없음
         </div>`;

    /* 완료율 바 */
    const total = si.length;
    const donePct = total ? Math.round(dc / total * 100) : 0;

    return `
      <div class="sprint-group">
        <div class="sprint-head" onclick="toggleSp(this)">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:9px;height:9px;border-radius:50%;background:${spC};flex-shrink:0"></div>
            <div>
              <div class="sprint-name">${esc(sp.name)}</div>
              ${proj ? `<div style="font-size:11px;color:var(--text3)">${esc(proj.name)}</div>` : ''}
            </div>
          </div>
          <div class="sprint-info">
            <div class="sprint-date">서밋일 ${sp.date}</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap">
              ${lc ? `<span class="spill" style="background:var(--live-bg);color:var(--live)">${lc} 라이브</span>` : ''}
              ${oc ? `<span class="spill" style="background:var(--ops-bg);color:var(--ops)">${oc} 운영</span>`   : ''}
              ${pc ? `<span class="spill" style="background:var(--prog-bg);color:var(--prog)">${pc} 진행</span>` : ''}
              ${dc ? `<span class="spill" style="background:var(--done-bg);color:var(--done)">${dc} 해결</span>` : ''}
              ${uc ? `<span class="spill" style="background:var(--bg2);color:var(--text3)">${uc} 미해결</span>`  : ''}
            </div>
            <!-- 수정/삭제 버튼: 클릭 시 상위 toggleSp 방지 -->
            <div style="display:flex;gap:4px;margin-left:6px" onclick="event.stopPropagation()">
              <button class="sp-action-btn" onclick="openSpEditModal('${sp.id}')" title="스프린트 수정">
                ✏️
              </button>
              <button class="sp-action-btn sp-action-del" onclick="deleteSp('${sp.id}')" title="스프린트 삭제">
                🗑
              </button>
            </div>
          </div>
        </div>
        ${total ? `
          <div style="padding:0 18px 8px;display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:4px;background:var(--bg2);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${donePct}%;background:var(--done);border-radius:2px;transition:width .4s"></div>
            </div>
            <span style="font-size:11px;color:var(--text3);white-space:nowrap">${donePct}% 완료</span>
          </div>` : ''}
        <div class="sprint-rows">${rows}</div>
      </div>`;
  }).join('');
}

function toggleSp(head) {
  const body = head.nextElementSibling?.nextElementSibling ?? head.nextElementSibling;
  /* progress bar + rows 둘 다 토글 */
  const children = Array.from(head.parentElement.children).slice(1);
  children.forEach(el => {
    el.style.display = el.style.display === 'none' ? '' : 'none';
  });
}


/* =============================================================
   9. 타임라인 대시보드
============================================================= */
function tlNav(dir)      { A.tlStartDate = addDays(A.tlStartDate, dir * A.tlDays); renderDash(); }
function tlToday()       {
  const t = new Date(); t.setDate(t.getDate() - 7);
  A.tlStartDate = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  renderDash();
}
function tlRangeChange() {
  A.tlDays = parseInt(document.getElementById('tl-range-sel').value, 10);
  renderDash();
}

/* ── 4번 개선: 지표 카드 클릭 → 타임라인 상태 필터 ── */
function setTlStatus(status) {
  A.tlStatusFilter = status;
  renderDash();
}

/* ── 2번 개선: 카테고리 소팅 버튼 렌더 ── */
function renderCatSortBar() {
  const cats = ['all', ...Store.data.categories];
  const labels = { all: '전체' };
  Store.data.categories.forEach(c => { labels[c] = catLbl(c); });

  document.getElementById('cat-sort-bar').innerHTML =
    cats.map(c => {
      const isOn = A.tlCatFilter === c;
      let cls = 'cat-sort-btn';
      if (isOn) {
        if (c === 'all')          cls += ' on';
        else if (c === 'live')    cls += ' on-live';
        else if (c === 'ops')     cls += ' on-ops';
        else                      cls += ' on';
      }
      return `<button class="${cls}" onclick="setTlCat('${c}')">${labels[c] || catLbl(c)}</button>`;
    }).join('');
}

function setTlCat(cat) {
  A.tlCatFilter = cat;
  renderDash();
}

/* ── 대시보드 메인 ── */
function renderDash() {
  let issues = Store.data.issues;
  if (A.curProj) issues = issues.filter(i => i.projId === A.curProj);

  const tot  = issues.length;
  const done = issues.filter(i => i.status === 'done').length;
  const prog = issues.filter(i => i.status === 'in-progress').length;
  const todo = issues.filter(i => i.status === 'todo').length;
  const pct  = tot ? Math.round(done / tot * 100) : 0;

  /* 4번: 지표 카드 — 클릭 가능, 현재 필터 강조 */
  const metrics = [
    { key:'all',         lbl:'전체 이슈',  val:tot,  sub:`해결률 ${pct}%`,  p:pct,  color:'#6366f1' },
    { key:'in-progress', lbl:'진행중',     val:prog, sub:'처리 대기',         p:tot?Math.round(prog/tot*100):0, color:'#f59e0b' },
    { key:'done',        lbl:'해결 완료',  val:done, sub:`${pct}% 완료`,    p:pct,  color:'#10b981' },
    { key:'todo',        lbl:'미해결',     val:todo, sub:'확인 필요',          p:tot?Math.round(todo/tot*100):0, color:'#ef4444' },
  ];

  document.getElementById('dash-metrics').innerHTML = metrics.map(m => `
    <div class="metric-card ${A.tlStatusFilter === m.key ? 'active-card' : ''}"
         onclick="setTlStatus('${m.key}')">
      <div class="metric-label">${m.lbl}</div>
      <div class="metric-val">${m.val}</div>
      <div class="metric-sub">${m.sub}</div>
      <div class="bar-wrap">
        <div class="bar-fill" style="width:${m.p}%;background:${m.color}"></div>
      </div>
    </div>`).join('');

  /* 2번: 카테고리 소팅 버튼 */
  renderCatSortBar();

  renderTimeline();
}

/* ── 타임라인 렌더링 ── */
function renderTimeline() {
  const days   = A.tlDays;
  const start  = A.tlStartDate;
  const todayS = dateStr(new Date());
  const today  = new Date();

  const MO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const fmtRange = (s, e) => {
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth())
      return `${s.getFullYear()}년 ${MO[s.getMonth()]} ${s.getDate()}일 — ${e.getDate()}일`;
    if (s.getFullYear() === e.getFullYear())
      return `${s.getFullYear()}년 ${MO[s.getMonth()]} — ${MO[e.getMonth()]}`;
    return `${s.getFullYear()}년 ${MO[s.getMonth()]} — ${e.getFullYear()}년 ${MO[e.getMonth()]}`;
  };
  document.getElementById('tl-range-title').textContent =
    fmtRange(start, addDays(start, days - 1));

  const daysArr = [];
  for (let i = 0; i < days; i++) daysArr.push(addDays(start, i));
  const DOW = ['일','월','화','수','목','금','토'];

  /* ── 날짜 헤더 ── */
  let hdr = '<div class="tl-header-row">';
  hdr += '<div class="tl-label-col">이슈</div>';
  hdr += '<div class="tl-date-header">';
  let prevMonth = -1;
  daysArr.forEach(d => {
    const ds  = dateStr(d);
    const dow = d.getDay();
    const isW = dow === 0 || dow === 6;
    const isH = !!KR_HOLIDAYS[ds];
    const isT = ds === todayS;

    if (d.getMonth() !== prevMonth) {
      hdr += `<div class="month-label"><span>${MO[d.getMonth()]}</span></div>`;
      prevMonth = d.getMonth();
    }

    let cls = 'date-col';
    if (isH)      cls += ' holiday-col';
    else if (isW) cls += ' weekend-col';
    if (isT)      cls += ' today-col';

    const numEl = isT
      ? `<div class="date-num-circle">${d.getDate()}</div>`
      : `<div class="date-num">${d.getDate()}</div>`;

    const subEl = isH
      ? `<div class="date-hol-name">${KR_HOLIDAYS[ds]}</div>`
      : isT ? '<div class="date-today-lbl">오늘</div>' : '';

    hdr += `<div class="${cls}" style="width:${COL_W}px">
      <div class="date-dow">${DOW[dow]}</div>
      ${numEl}${subEl}
    </div>`;
  });
  hdr += '</div></div>';

  /* ── 이슈 필터 (상태 + 카테고리) ── */
  let issues  = Store.data.issues;
  let sprints = Store.data.sprints;
  if (A.curProj) {
    issues  = issues.filter(i  => i.projId === A.curProj);
    sprints = sprints.filter(s => s.projId === A.curProj);
  }

  /* 4번: 상태 필터 */
  if (A.tlStatusFilter === 'in-progress') issues = issues.filter(i => i.status === 'in-progress');
  else if (A.tlStatusFilter === 'done')   issues = issues.filter(i => i.status === 'done');
  else if (A.tlStatusFilter === 'todo')   issues = issues.filter(i => i.status === 'todo');

  /* 2번: 카테고리 필터 */
  if (A.tlCatFilter !== 'all') issues = issues.filter(i => i.cat === A.tlCatFilter);

  /* ── 프로젝트별 그룹핑 ── */
  const groups = {};
  Store.data.projects.forEach(p => {
    if (A.curProj && p.id !== A.curProj) return;
    groups[p.id] = { proj:p, sprints:[], unassigned:[] };
  });
  sprints.forEach(sp => {
    if (groups[sp.projId]) groups[sp.projId].sprints.push({...sp});
  });
  issues.forEach(iss => {
    if (!groups[iss.projId]) return;
    const g  = groups[iss.projId];
    const sp = g.sprints.find(s => s.id === iss.sprintId);
    if (sp) { if (!sp.issues) sp.issues = []; sp.issues.push(iss); }
    else      g.unassigned.push(iss);
  });

  /* 헬퍼: 셀 배경 */
  const cellBg = d => {
    const ds = dateStr(d);
    if (KR_HOLIDAYS[ds])        return '#fff5f5';
    const dw = d.getDay();
    if (dw === 0 || dw === 6)   return '#faf5ff';
    if (ds === todayS)          return '#f0f0ff';
    return 'transparent';
  };

  const makeCells = () =>
    daysArr.map(d =>
      `<div class="tl-cell" style="width:${COL_W}px;background:${cellBg(d)}"></div>`
    ).join('');

  /* ───────────────────────────────────────────────────────
     핵심: 이슈 바 생성
     1번: 제목은 바 아래에 레이블 컬럼에서 전체 표시 (바 자체에는 짧게)
     3번: 미해결/진행중 → 오늘까지 줄무늬 바 연장
  ─────────────────────────────────────────────────────── */
  const makeBar = iss => {
    const issStart = parseDate(iss.date);
    if (!issStart) return '';

    const tlEnd     = addDays(start, days - 1);
    const isResolved = iss.status === 'done' && iss.resolveDate;

    /* 바 종료 날짜:
       - 해결완료 + 해결일 있음 → 해결일
       - 미해결/진행중          → 오늘 (타임라인 범위 안에서)
       - 해결완료인데 해결일 없음 → 발생일만 표시 */
    let barEnd;
    if (isResolved) {
      barEnd = parseDate(iss.resolveDate);
    } else if (iss.status !== 'done') {
      barEnd = today;
    } else {
      barEnd = issStart; // 해결완료인데 해결일 없으면 하루짜리
    }

    if (issStart > tlEnd || barEnd < start) return '';

    const clampStart = issStart < start ? start : issStart;
    const clampEnd   = barEnd   > tlEnd  ? tlEnd  : barEnd;

    const si      = Math.round((clampStart - start) / 86400000);
    const ei      = Math.round((clampEnd   - start) / 86400000);
    const span    = ei - si + 1;
    const leftPx  = si * COL_W + 1;
    const widthPx = Math.max(span * COL_W - 2, COL_W);
    const col     = barColor(iss);

    /* 줄무늬 (미해결/진행중) */
    const isUnresolved = iss.status !== 'done';
    const stripeStyle  = isUnresolved
      ? `background-image:repeating-linear-gradient(
           -45deg,
           transparent,transparent 5px,
           rgba(255,255,255,.3) 5px,rgba(255,255,255,.3) 10px
         );background-size:20px 20px;
         animation:stripe-move 1.4s linear infinite;`
      : '';

    /* ▼ 시작 마커 */
    let startMarker = '';
    if (issStart >= start && issStart <= tlEnd) {
      const sx = Math.round((issStart - start) / 86400000) * COL_W + COL_W / 2;
      startMarker = `
        <div style="position:absolute;left:${sx - 1}px;top:4px;height:20px;
                    width:2px;background:${col.border};border-radius:1px;
                    opacity:.85;pointer-events:none;z-index:2"></div>
        <div style="position:absolute;left:${sx - 5}px;top:0px;
                    width:0;height:0;
                    border-left:5px solid transparent;
                    border-right:5px solid transparent;
                    border-top:6px solid ${col.border};
                    opacity:.85;pointer-events:none;z-index:2"></div>`;
    }

    /* ✓ 종료 마커 (해결완료 + 해결일) */
    let endMarker = '';
    if (isResolved) {
      const rd = parseDate(iss.resolveDate);
      if (rd >= start && rd <= tlEnd) {
        const ex = Math.round((rd - start) / 86400000) * COL_W + COL_W / 2;
        endMarker = `
          <div style="position:absolute;left:${ex - 1}px;top:4px;height:20px;
                      width:2px;background:${col.border};border-radius:1px;
                      opacity:.85;pointer-events:none;z-index:2"></div>
          <div style="position:absolute;left:${ex + 3}px;top:0px;
                      font-size:11px;font-weight:700;color:${col.border};
                      line-height:1;pointer-events:none;z-index:2">✓</div>`;
      }
    }

    return `
      <div style="position:relative;height:100%;min-height:36px;pointer-events:none;overflow:visible">
        ${startMarker}
        ${endMarker}

        <!-- ① 색깔 바 (기간 표시 전용, overflow:hidden 으로 줄무늬 클리핑) -->
        <div style="position:absolute;left:${leftPx}px;top:7px;height:22px;
                    width:${widthPx}px;
                    border-radius:4px;
                    border:1px solid ${col.border};
                    background:${col.bg};
                    overflow:hidden;
                    pointer-events:all;cursor:pointer;
                    ${stripeStyle}"
             onclick="openDet('${iss.id}')">
        </div>

        <!-- 제목 레이어: 배경 없음 → 바 끝 지점이 시각적으로 그대로 보임 -->
        <div style="position:absolute;left:${leftPx}px;top:7px;height:22px;
                    z-index:3;display:flex;align-items:center;gap:5px;
                    padding-left:7px;pointer-events:none;white-space:nowrap;">
          <div style="width:7px;height:7px;border-radius:50%;
                      background:${col.border};flex-shrink:0"></div>
          <span style="font-size:11px;font-weight:500;color:${col.text};white-space:nowrap;">
            ${esc(iss.title)}
          </span>
        </div>

      </div>`;
  };

  /* 스프린트 서밋 세로선 */
  const makeSprintLines = psprints =>
    psprints.map(sp => {
      const spD = parseDate(sp.date);
      if (!spD || spD < start || spD > addDays(start, days - 1)) return '';
      const sx      = Math.round((spD - start) / 86400000) * COL_W + COL_W / 2;
      const origSp  = gs(sp.id);
      const spColor = origSp
        ? SP_COLORS[Store.data.sprints.indexOf(origSp) % SP_COLORS.length]
        : '#94a3b8';
      return `
        <div class="sprint-vline" style="left:${sx}px;background:${spColor}"></div>
        <div class="sprint-vline-label"
             style="left:${sx + 4}px;color:${spColor};background:var(--bg2)">
          ${esc(sp.name)}
        </div>`;
    }).join('');

  /* ── 본문 HTML ── */
  let body   = '<div class="tl-body">';
  let hasAny = false;

  Object.values(groups).forEach(({ proj, sprints: psprints, unassigned }) => {
    const allIss = [...psprints.flatMap(s => s.issues || []), ...unassigned];
    if (allIss.length === 0 && psprints.length === 0) return;
    hasAny = true;

    body += '<div class="tl-sprint-section">';

    /* 프로젝트 헤더 */
    body += `
      <div class="tl-proj-header">
        <div class="tl-proj-label" style="color:${proj.color}">
          <div style="width:8px;height:8px;border-radius:50%;
                      background:${proj.color};flex-shrink:0"></div>
          ${esc(proj.name)}
        </div>
        <div class="tl-proj-bg" style="width:${daysArr.length * COL_W}px">
          ${makeSprintLines(psprints)}
        </div>
      </div>`;

    /* 스프린트별 이슈 행 */
    psprints.forEach(sp => {
      const si = sp.issues || [];
      if (si.length) {
        /* 스프린트 소속 표시 행 */
        body += `
          <div style="display:flex;min-height:20px;border-bottom:0.5px solid var(--border)">
            <div style="width:180px;flex-shrink:0;padding:3px 10px 3px 22px;
                        font-size:11px;color:var(--text3);
                        border-right:0.5px solid var(--border);background:var(--bg3);
                        position:sticky;left:0;z-index:5;display:flex;align-items:center;gap:5px">
              <div style="width:6px;height:6px;border-radius:50%;
                           background:${SP_COLORS[Store.data.sprints.indexOf(gs(sp.id)) % SP_COLORS.length]}"></div>
              ${esc(sp.name)}
            </div>
            <div style="flex:1;background:var(--bg2);width:${daysArr.length * COL_W}px"></div>
          </div>`;

        si.forEach(iss => {
          body += `
            <div class="tl-row">
              <div class="tl-row-label"
                   onclick="scrollToIssueDate('${iss.id}')"
                   title="클릭: 발생일로 이동 / 타임라인 바 클릭: 상세보기">${esc(iss.title)}</div>
              <div class="tl-cells" style="overflow:visible">
                ${makeCells()}
                <div class="tl-bar-container" style="overflow:visible">
                  ${makeBar(iss)}
                </div>
              </div>
            </div>`;
        });
      } else {
        body += `
          <div class="no-issue-row">
            <div class="no-issue-label" style="width:180px">${esc(sp.name)} — 이슈 없음</div>
            <div style="flex:1"></div>
          </div>`;
      }
    });

    /* 스프린트 미배정 이슈 */
    if (unassigned.length) {
      body += `
        <div style="display:flex;min-height:20px;border-bottom:0.5px solid var(--border)">
          <div style="width:180px;flex-shrink:0;padding:3px 10px 3px 22px;
                      font-size:11px;color:var(--text3);
                      border-right:0.5px solid var(--border);background:var(--bg3);
                      position:sticky;left:0;z-index:5">미배정</div>
          <div style="flex:1;background:var(--bg2)"></div>
        </div>`;
      unassigned.forEach(iss => {
        body += `
          <div class="tl-row">
            <div class="tl-row-label"
                 onclick="scrollToIssueDate('${iss.id}')"
                 title="클릭: 발생일로 이동 / 타임라인 바 클릭: 상세보기">${esc(iss.title)}</div>
            <div class="tl-cells" style="overflow:visible">
              ${makeCells()}
              <div class="tl-bar-container" style="overflow:visible">
                ${makeBar(iss)}
              </div>
            </div>
          </div>`;
      });
    }

    body += '</div>';
  });

  if (!hasAny) {
    const filterMsg = A.tlStatusFilter !== 'all' || A.tlCatFilter !== 'all'
      ? '현재 필터 조건에 해당하는 이슈가 없습니다'
      : '이 기간에 표시할 이슈가 없습니다';
    body += `<div class="empty-tl">${filterMsg}</div>`;
  }

  body += '</div>';
  document.getElementById('tl-inner').innerHTML = hdr + body;

  /* 5번 UX: 오늘 날짜가 보이도록 자동 스크롤 */
  requestAnimationFrame(() => {
    const scroll = document.getElementById('tl-scroll');
    if (!scroll) return;
    const todayOff = Math.round((today - start) / 86400000);
    if (todayOff > 0 && todayOff < days) {
      const scrollX = Math.max(0, todayOff * COL_W - 180 - 100);
      scroll.scrollLeft = scrollX;
    }
  });
}


/* =============================================================
   9-extra. 왼쪽 레이블 클릭 → 해당 이슈 발생일로 타임라인 이동
   - 발생일이 현재 뷰 범위 밖이면 tlStartDate를 발생일 기준으로 재설정
   - 이미 범위 안이면 해당 열로 수평 스크롤만
============================================================= */
function scrollToIssueDate(issId) {
  const iss = gi(issId);
  if (!iss || !iss.date) return;

  const issDate = parseDate(iss.date);
  const tlEnd   = addDays(A.tlStartDate, A.tlDays - 1);

  if (issDate < A.tlStartDate || issDate > tlEnd) {
    /* 발생일을 뷰 왼쪽에서 7일 여백을 두고 배치 */
    const newStart = addDays(issDate, -7);
    A.tlStartDate  = new Date(newStart.getFullYear(), newStart.getMonth(), newStart.getDate());
    renderDash();   /* 타임라인 재렌더 후 스크롤 */
  }

  /* 발생일 열 위치로 수평 스크롤 */
  requestAnimationFrame(() => {
    const scroll = document.getElementById('tl-scroll');
    if (!scroll) return;
    const offsetDays = Math.round((issDate - A.tlStartDate) / 86400000);
    /* 왼쪽 레이블 컬럼(180px) 고려, 발생일이 화면 중앙쯤 오도록 */
    const scrollX = Math.max(0, offsetDays * COL_W - 260);
    scroll.scrollTo({ left: scrollX, behavior: 'smooth' });
  });
}


/* =============================================================
   10. 전체 렌더
============================================================= */
function renderAll() {
  renderKanban();
  renderSprint();
  renderDash();
}


/* =============================================================
   11. 모달 헬퍼
============================================================= */
function om(id) { document.getElementById(id).classList.add('open');    }
function cm(id) { document.getElementById(id).classList.remove('open'); }

function populateSels() {
  ['sp-proj','iss-proj'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = Store.data.projects
      .map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  });
  const isp = document.getElementById('iss-sp');
  if (isp) {
    isp.innerHTML = '<option value="">선택 안함</option>'
      + Store.data.sprints
          .map(s => `<option value="${s.id}">${esc(s.name)} (${s.date})</option>`)
          .join('');
  }
}

function renderCatTags() {
  document.getElementById('cat-area').innerHTML =
    Store.data.categories.map(c => {
      const isSel = A.selCat === c;
      const cls   = isSel ? (c==='live'?'sel-live':c==='ops'?'sel-ops':'sel-c') : '';
      return `<span class="cat-tag ${cls}" onclick="selCat('${c}')">${catLbl(c)}</span>`;
    }).join('')
    + `<button class="add-cat" onclick="addCat()">+ 카테고리</button>`;
}

function selCat(c)  { A.selCat = c; renderCatTags(); }

function addCat() {
  const n = prompt('새 카테고리 이름:');
  if (!n || Store.data.categories.includes(n)) return;
  Store.data.categories.push(n);
  A.selCat = n;
  Store.save(); renderCatTags();
}

function sc(el) {
  A.selColor = el.dataset.color;
  document.querySelectorAll('.co').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
}


/* =============================================================
   12. 이슈 등록 모달
============================================================= */
function openIssModal() {
  A.editingIssId = null;
  populateSels(); renderCatTags();
  ['iss-title','iss-content','iss-sol','iss-threads','iss-resolve-date'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('iss-status').value = 'todo';
  document.getElementById('iss-date').value   = dateStr(new Date());
  document.getElementById('iss-modal-title').textContent = '이슈 등록';
  document.getElementById('iss-submit-btn').textContent  = '등록';
  om('iss-modal');
}


/* =============================================================
   13. 이슈 편집 모달
============================================================= */
function openEditModal() {
  const i = gi(A.openIssId); if (!i) return;
  A.editingIssId = i.id;

  populateSels();
  A.selCat = i.cat;
  renderCatTags();

  document.getElementById('iss-proj').value          = i.projId      || '';
  document.getElementById('iss-sp').value            = i.sprintId    || '';
  document.getElementById('iss-date').value          = i.date        || '';
  document.getElementById('iss-resolve-date').value  = i.resolveDate || '';
  document.getElementById('iss-title').value         = i.title       || '';
  document.getElementById('iss-content').value       = i.content     || '';
  document.getElementById('iss-sol').value           = i.solution    || '';
  document.getElementById('iss-threads').value       = (i.threads || []).join('\n');
  document.getElementById('iss-status').value        = i.status      || 'todo';

  document.getElementById('iss-modal-title').textContent = '이슈 편집';
  document.getElementById('iss-submit-btn').textContent  = '저장';

  cm('det-modal');
  om('iss-modal');
}


/* =============================================================
   14. 이슈 등록 / 편집 공통 제출
============================================================= */
function submitIss() {
  const t = document.getElementById('iss-title').value.trim();
  if (!t) { alert('이슈 제목을 입력하세요'); return; }

  /* 관련 스레드: 줄 바꿈으로 구분된 URL 목록 → 배열로 저장 (빈 줄 제거) */
  const rawThreads = document.getElementById('iss-threads').value;
  const threads    = rawThreads
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const payload = {
    projId:      document.getElementById('iss-proj').value,
    sprintId:    document.getElementById('iss-sp').value,
    cat:         A.selCat,
    title:       t,
    content:     document.getElementById('iss-content').value.trim(),
    solution:    document.getElementById('iss-sol').value.trim(),
    threads,
    status:      document.getElementById('iss-status').value,
    date:        document.getElementById('iss-date').value,
    resolveDate: document.getElementById('iss-resolve-date').value,
  };

  if (A.editingIssId) {
    const i = gi(A.editingIssId); if (!i) return;
    Object.assign(i, payload);
    A.openIssId = i.id;
  } else {
    const newIss = { id: uid(), ...payload };
    Store.data.issues.push(newIss);
    A.openIssId = newIss.id;
  }

  Store.save();
  cm('iss-modal');
  A.editingIssId = null;
  renderAll();

  setTimeout(() => openDet(A.openIssId), 80);
}


/* =============================================================
   15. 이슈 상세 팝업
============================================================= */

/**
 * 텍스트를 안전하게 HTML로 변환
 * - XSS 방지: 특수문자 이스케이프
 * - 줄바꿈(\n) → <br>
 * - 연속 공백 보존 (white-space: pre-wrap 대신 &nbsp; 변환)
 */
function textToHtml(str) {
  if (!str) return '';
  return esc(str)
    .replace(/\n/g, '<br>')          // 줄바꿈
    .replace(/  /g, ' &nbsp;');      // 연속 공백 (2칸 → 1칸 + nbsp)
}

function openDet(id) {
  A.openIssId = id;
  const i = gi(id); if (!i) return;
  const sp   = gs(i.sprintId);
  const proj = gp(i.projId);

  document.getElementById('det-title').textContent = i.title;
  document.getElementById('det-pname').textContent = proj ? proj.name : '';
  document.getElementById('det-cat').innerHTML =
    `<span class="cbadge ${catCls(i.cat)}">${catLbl(i.cat)}</span>`;
  document.getElementById('det-sp').textContent   = sp ? sp.name : '—';
  document.getElementById('det-date').textContent =
    i.date + (i.resolveDate ? ` → ${i.resolveDate}` : '');

  /* 줄바꿈·띄어쓰기 보존하여 innerHTML로 삽입 */
  document.getElementById('det-cont').innerHTML = i.content  ? textToHtml(i.content)  : '<span style="color:var(--text3)">—</span>';
  document.getElementById('det-sol').innerHTML  = i.solution ? textToHtml(i.solution) : '<span style="color:var(--text3)">—</span>';

  /* 관련 스레드 렌더링 */
  const threadsSec = document.getElementById('det-threads-sec');
  const threadsEl  = document.getElementById('det-threads');
  const threads    = i.threads || [];
  if (threads.length > 0) {
    threadsSec.style.display = '';
    threadsEl.innerHTML = threads.map((url) => {
      const isSlack  = url.includes('slack.com');
      const isNotion = url.includes('notion.so') || url.includes('notion.site');
      const isGithub = url.includes('github.com');
      const icon = isSlack  ? '💬'
                 : isNotion ? '📄'
                 : isGithub ? '🐙'
                 : '🔗';
      let label = url;
      try {
        const u = new URL(url);
        label = u.hostname + (u.pathname.length > 40 ? u.pathname.slice(0, 38) + '…' : u.pathname);
      } catch (_) {}
      return `<div style="margin-bottom:6px">
        <a href="${esc(url)}" target="_blank" rel="noopener"
           style="display:inline-flex;align-items:center;gap:7px;
                  padding:5px 10px;border-radius:6px;
                  border:0.5px solid var(--border2);
                  background:var(--bg2);
                  font-size:12px;color:var(--acc);text-decoration:none;
                  transition:background .12s;max-width:100%;word-break:break-all;"
           onmouseover="this.style.background='var(--acc-bg)'"
           onmouseout="this.style.background='var(--bg2)'">
          <span style="flex-shrink:0">${icon}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px"
                title="${esc(url)}">${esc(label)}</span>
          <span style="flex-shrink:0;font-size:10px;color:var(--text3)">↗</span>
        </a>
      </div>`;
    }).join('');
  } else {
    threadsSec.style.display = 'none';
    threadsEl.innerHTML = '';
  }

  document.getElementById('det-stog').innerHTML =
    ['todo','in-progress','done'].map(s =>
      `<button class="sbtn ${i.status === s ? 'a-'+s : ''}"
               onclick="chgSt('${id}','${s}',this)">${stLbl(s)}</button>`
    ).join('');

  om('det-modal');
}


/* =============================================================
   16. 해결 상태 변경
============================================================= */
function chgSt(id, s, btn) {
  const i = gi(id); if (!i) return;
  i.status = s;
  if (s === 'done' && !i.resolveDate) {
    i.resolveDate = dateStr(new Date());
    document.getElementById('det-date').textContent =
      i.date + ` → ${i.resolveDate}`;
  }
  Store.save();
  document.querySelectorAll('.sbtn').forEach(b => b.className = 'sbtn');
  btn.className = `sbtn a-${s}`;
  renderAll();
}


/* =============================================================
   17. 이슈 삭제
============================================================= */
function delIss() {
  if (!confirm('이슈를 삭제할까요?')) return;
  Store.data.issues = Store.data.issues.filter(i => i.id !== A.openIssId);
  Store.save(); cm('det-modal'); renderAll();
}


/* =============================================================
   18. 프로젝트 추가
============================================================= */
function openProjModal() {
  document.querySelectorAll('.co').forEach(el => el.classList.remove('selected'));
  document.querySelector(`.co[data-color="${A.selColor}"]`)?.classList.add('selected');
  om('proj-modal');
}

function addProj() {
  const n = document.getElementById('pname').value.trim();
  if (!n) { alert('프로젝트 이름을 입력하세요'); return; }
  Store.data.projects.push({ id: uid(), name: n, color: A.selColor });
  Store.save(); cm('proj-modal');
  document.getElementById('pname').value = '';
  renderProjList();
}


/* =============================================================
   19. 스프린트 등록 / 수정 / 삭제
============================================================= */

/** 신규 등록 모달 열기 */
function openSpModal() {
  A.editingSpId = null;
  populateSels();
  document.getElementById('sp-name').value = '';
  document.getElementById('sp-date').value = '';
  document.getElementById('sp-modal-title').textContent = '스프린트 등록';
  document.getElementById('sp-submit-btn').textContent  = '등록';
  om('sp-modal');
}

/** 수정 모달 열기 — 기존 값을 폼에 채움 */
function openSpEditModal(spId) {
  const sp = gs(spId); if (!sp) return;
  A.editingSpId = spId;
  populateSels();

  document.getElementById('sp-name').value  = sp.name;
  document.getElementById('sp-date').value  = sp.date;
  /* 프로젝트 셀렉트 값 맞추기 */
  const projSel = document.getElementById('sp-proj');
  if (projSel) projSel.value = sp.projId || '';

  document.getElementById('sp-modal-title').textContent = '스프린트 수정';
  document.getElementById('sp-submit-btn').textContent  = '저장';
  om('sp-modal');
}

/** 등록/수정 공통 제출 */
function submitSp() {
  const n   = document.getElementById('sp-name').value.trim();
  const d   = document.getElementById('sp-date').value;
  const pid = document.getElementById('sp-proj').value;
  if (!n || !d) { alert('이름과 서밋일을 입력하세요'); return; }

  if (A.editingSpId) {
    /* 수정 */
    const sp = gs(A.editingSpId); if (!sp) return;
    sp.name   = n;
    sp.date   = d;
    sp.projId = pid;
  } else {
    /* 신규 */
    Store.data.sprints.push({ id: uid(), name: n, date: d, projId: pid });
  }

  Store.save();
  cm('sp-modal');
  A.editingSpId = null;
  document.getElementById('sp-name').value = '';
  renderAll();
}

/** 스프린트 삭제 */
function deleteSp(spId) {
  const sp = gs(spId); if (!sp) return;
  const issCount = Store.data.issues.filter(i => i.sprintId === spId).length;
  const msg = issCount
    ? `"${sp.name}"을 삭제할까요?\n이 스프린트에 연결된 이슈 ${issCount}개는 '미배정' 상태로 변경됩니다.`
    : `"${sp.name}"을 삭제할까요?`;
  if (!confirm(msg)) return;

  /* 연결된 이슈의 sprintId를 빈 문자열로 초기화 (이슈 자체는 유지) */
  Store.data.issues.forEach(i => {
    if (i.sprintId === spId) i.sprintId = '';
  });
  Store.data.sprints = Store.data.sprints.filter(s => s.id !== spId);
  Store.save();
  renderAll();
}

/* 하위 호환 — 기존 addSp 호출 방지 */
function addSp() { submitSp(); }
