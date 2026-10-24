/** Best-effort clipboard source label. Browsers do not expose the true copy origin (e.g. a specific app). */

export function describePasteSource(data: DataTransfer): string {
  const types = [...data.types];
  if (types.includes('text/html')) {
    const html = data.getData('text/html').slice(0, 4000).toLowerCase();
    if (html.includes('docs.google.com') || html.includes('google docs')) return 'Paste · likely Google Docs';
    if (html.includes('microsoft') || html.includes('mso-') || html.includes('word')) return 'Paste · likely Microsoft Word';
    if (html.includes('scrivener')) return 'Paste · likely Scrivener';
    if (html.includes('chatgpt') || html.includes('openai')) return 'Paste · likely an AI chat (HTML)';
    return 'Paste · rich clipboard (Word, Pages, web, or similar)';
  }
  if (types.includes('text/rtf')) return 'Paste · RTF clipboard';
  if (types.includes('text/plain')) return 'Paste · plain text clipboard';
  if (types.includes('Files')) return 'Paste · files';
  return types.length ? `Paste · ${types.join(', ')}` : 'Paste · clipboard';
}
