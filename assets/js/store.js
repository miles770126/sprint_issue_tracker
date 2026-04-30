/**
 * store.js
 * 데이터 저장소 — localStorage 기반 자동 저장/불러오기
 *
 * 사용법:
 *   Store.data.projects  → 프로젝트 배열
 *   Store.data.sprints   → 스프린트 배열
 *   Store.data.issues    → 이슈 배열
 *   Store.save()         → 현재 data를 localStorage에 저장
 */

const STORAGE_KEY = 'sprint_tracker_v1';

/* 최초 실행 시 사용할 샘플 데이터 */
const DEFAULT_DATA = {
  projects: [
    { id: 'p1', name: '웹 리뉴얼',  color: '#6366f1' },
    { id: 'p2', name: '모바일 앱', color: '#10b981' },
  ],
  sprints: [
    { id: 's1', name: 'Sprint 1', date: '2025-04-18', projId: 'p1' },
    { id: 's2', name: 'Sprint 2', date: '2025-05-02', projId: 'p1' },
    { id: 's3', name: 'Sprint 1', date: '2025-04-25', projId: 'p2' },
  ],
  issues: [
    {
      id: 'i1', projId: 'p1', sprintId: 's1', cat: 'live',
      title: '메인 배너 이미지 깨짐',
      content: 'Chrome 최신 버전에서 메인 배너 이미지가 렌더링되지 않음',
      solution: 'webp fallback 처리 추가',
      status: 'done', date: '2025-04-10', resolveDate: '2025-04-14',
    },
    {
      id: 'i2', projId: 'p1', sprintId: 's1', cat: 'ops',
      title: 'DB 커넥션 타임아웃',
      content: '피크 시간대 DB 연결 끊김 현상',
      solution: '커넥션 풀 사이즈 조정 및 재연결 로직 추가',
      status: 'done', date: '2025-04-11', resolveDate: '2025-04-16',
    },
    {
      id: 'i3', projId: 'p1', sprintId: 's2', cat: 'live',
      title: '결제 모듈 오류 500',
      content: '특정 카드사 결제 시 500 에러 반환. 영향 사용자 약 200명',
      solution: '',
      status: 'in-progress', date: '2025-04-20', resolveDate: '',
    },
    {
      id: 'i4', projId: 'p1', sprintId: 's2', cat: 'ops',
      title: '로그 수집 누락',
      content: '신규 서버 배포 후 일부 로그가 수집되지 않음',
      solution: '',
      status: 'todo', date: '2025-04-22', resolveDate: '',
    },
    {
      id: 'i5', projId: 'p2', sprintId: 's3', cat: 'live',
      title: 'iOS 앱 크래시',
      content: '앱 시작 시 간헐적 크래시. iOS 17.4에서 재현',
      solution: '메모리 해제 로직 수정 예정',
      status: 'in-progress', date: '2025-04-21', resolveDate: '',
    },
    {
      id: 'i6', projId: 'p2', sprintId: 's3', cat: 'ops',
      title: '푸시 알림 미발송',
      content: '특정 사용자군에서 푸시 알림이 전달되지 않는 이슈',
      solution: '',
      status: 'todo', date: '2025-04-23', resolveDate: '',
    },
  ],
  categories: ['live', 'ops'],
};

const Store = {
  data: null,

  /** localStorage에서 불러오기. 없으면 DEFAULT_DATA 사용 */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.data = raw
        ? JSON.parse(raw)
        : JSON.parse(JSON.stringify(DEFAULT_DATA));
    } catch (e) {
      console.warn('[Store] load 실패, 기본 데이터 사용:', e);
      this.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
    // 구버전 데이터 호환: categories 없으면 추가
    if (!this.data.categories) {
      this.data.categories = ['live', 'ops'];
    }
    // 구버전 이슈 호환: resolveDate 없으면 빈 문자열
    this.data.issues.forEach(i => {
      if (i.resolveDate === undefined) i.resolveDate = '';
    });
  },

  /** 현재 data를 localStorage에 저장 */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[Store] save 실패:', e);
    }
  },

  /** 초기화 (모든 데이터 삭제 후 기본값으로) */
  reset() {
    if (!confirm('모든 데이터를 초기화하시겠습니까?')) return;
    this.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    this.save();
    location.reload();
  },

  /** 현재 데이터를 JSON 파일로 다운로드 (백업) */
  exportJSON() {
    const blob = new Blob(
      [JSON.stringify(this.data, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `sprint-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /** JSON 파일에서 데이터 가져오기 (복원) */
  importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (parsed.projects && parsed.sprints && parsed.issues) {
            this.data = parsed;
            this.save();
            resolve();
          } else {
            reject(new Error('올바른 백업 파일이 아닙니다'));
          }
        } catch (err) {
          reject(new Error('파일 파싱 오류: ' + err.message));
        }
      };
      reader.readAsText(file);
    });
  },
};

// 페이지 로드 시 즉시 데이터 불러오기
Store.load();
