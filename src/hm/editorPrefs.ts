export type EditorViewMode = 'manuscript' | 'highlights' | 'preview';

const VIEW_KEY = 'speakfiction.editorView';
const CERT_KEY = 'speakfiction.certificationCollapsed';

export function loadEditorView(): EditorViewMode {
  try {
    const value = sessionStorage.getItem(VIEW_KEY);
    if (value === 'highlights' || value === 'preview') return value;
    return 'manuscript';
  } catch {
    return 'manuscript';
  }
}

export function saveEditorView(mode: EditorViewMode): void {
  try {
    sessionStorage.setItem(VIEW_KEY, mode);
  } catch {
    /* session storage may be unavailable */
  }
}

export function loadCertificationCollapsed(): boolean {
  try {
    return sessionStorage.getItem(CERT_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveCertificationCollapsed(collapsed: boolean): void {
  try {
    sessionStorage.setItem(CERT_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}
