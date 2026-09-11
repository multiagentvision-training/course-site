/* Code-locked course viewer: derives an AES-GCM key from the access code (PBKDF2-SHA256), verifies it against
   data/verifier.bin, then decrypts lesson files on demand. The code is never stored; the derived key lives in
   sessionStorage for this tab only. */
(() => {
  const app = document.getElementById('app'); const nav = document.getElementById('nav');
  const enc = new TextEncoder(); const dec = new TextDecoder();
  let manifest = null; let key = null; const cache = new Map();
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function loadManifest() { if (!manifest) manifest = await (await fetch('manifest.json', { cache: 'no-store' })).json(); return manifest; }
  async function deriveKey(code, saltB64, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(saltB64), iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  }
  async function decryptBlob(buf, aad) {
    const bytes = new Uint8Array(buf); const iv = bytes.slice(0, 12); const body = bytes.slice(12);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, body);
  }
  async function restoreKey() {
    const raw = sessionStorage.getItem('mvt.key'); if (!raw) return false;
    try { key = await crypto.subtle.importKey('raw', b64(raw), { name: 'AES-GCM' }, true, ['decrypt']); return true; } catch { return false; }
  }
  async function verify() {
    try { const v = await decryptBlob(await (await fetch('data/verifier.bin', { cache: 'no-store' })).arrayBuffer(), 'verifier');
      return dec.decode(v) === 'multiagentvision-training-ok'; } catch { return false; }
  }
  async function file(entry, name) {
    const meta = entry.files[name]; if (!meta) return null;
    const id = meta.path; if (cache.has(id)) return cache.get(id);
    const buf = await decryptBlob(await (await fetch(meta.path)).arrayBuffer(), id.split('/').pop());
    cache.set(id, buf); return buf;
  }
  const mime = { 'audio.mp3': 'audio/mpeg', 'video.mp4': 'video/mp4', 'video.vtt': 'text/vtt', 'poster.jpg': 'image/jpeg' };
  async function url(entry, name) { const buf = await file(entry, name); return buf ? URL.createObjectURL(new Blob([buf], { type: mime[name] })) : null; }

  function renderNav() { nav.innerHTML = key ? '<a href="#/">Уроки</a><button id="logout">Выйти</button>' : ''; const b = document.getElementById('logout'); if (b) b.onclick = () => { sessionStorage.removeItem('mvt.key'); key = null; cache.clear(); location.hash = '#/'; route(); }; }

  function renderLogin(msg) {
    app.innerHTML = `<div class="login"><h1>Вход</h1><p class="muted">Введите код доступа, выданный организатором. Расшифровка происходит в браузере.</p>
      <input id="code" type="password" autocomplete="off" placeholder="Код доступа"><button id="go" class="primary">Открыть курс</button><div id="err" class="err">${msg || ''}</div></div>`;
    const go = document.getElementById('go'); const input = document.getElementById('code');
    const submit = async () => { go.disabled = true; document.getElementById('err').textContent = 'Проверяю…';
      const m = await loadManifest(); key = await deriveKey(input.value, m.kdf.salt, m.kdf.iterations);
      if (await verify()) { sessionStorage.setItem('mvt.key', btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', key))))); location.hash = '#/'; route(); }
      else { key = null; go.disabled = false; document.getElementById('err').textContent = 'Код не подошёл. Проверьте раскладку и попробуйте ещё раз.'; } };
    go.onclick = submit; input.onkeydown = e => { if (e.key === 'Enter') submit(); }; input.focus();
  }

  async function renderList() {
    const m = await loadManifest(); const done = JSON.parse(localStorage.getItem('mvt.done') || '[]');
    app.innerHTML = `<h1>Уроки</h1><p class="muted">16 недель. В каждом уроке: текст, аудиоразбор и видео. Отмечайте пройденные — прогресс хранится только в этом браузере.</p>
      <div class="progress"><i style="width:${Math.round(100 * done.length / m.lessons.length)}%"></i></div><ul class="list">` +
      m.lessons.map(l => `<li><a href="#/w/${l.week}">${l.title}</a><span class="badge">${done.includes(l.week) ? 'пройдено' : ''}</span></li>`).join('') + '</ul>';
  }

  function mediaKind(href) {
    const h = (href || '').trim().replace(/^\.\//, '');
    return /^(narration\.md|audio\.mp3|video\.mp4)$/.test(h) ? h : null;
  }

  function jumpToMedia(kind) {
    const box = document.getElementById('media');
    if (!box) return;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (kind === 'audio.mp3') {
      const el = box.querySelector('audio');
      if (el) el.play().catch(() => {});
    } else if (kind === 'video.mp4') {
      const el = box.querySelector('video');
      if (el) el.play().catch(() => {});
    } else if (kind === 'narration.md') {
      const d = box.querySelector('details.narr');
      if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }
  }

  function safeMarkdown(md, week) {
    const html = marked.parse(md, { mangle: false, headerIds: false });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,iframe,object,embed').forEach(n => n.remove());
    doc.querySelectorAll('*').forEach(n => { [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || (a.name === 'href' && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); }); });
    doc.querySelectorAll('a[href]').forEach(a => {
      const h = a.getAttribute('href') || '';
      if (/^https?:/.test(h)) { a.target = '_blank'; a.rel = 'noopener'; return; }
      const kind = mediaKind(h);
      if (kind) {
        a.setAttribute('href', `#/w/${week}`);
        a.setAttribute('data-media', kind);
        return;
      }
      if (h.startsWith('#/')) return;
      a.replaceWith(doc.createTextNode(a.textContent));
    });
    return doc.body.innerHTML;
  }

  async function renderLesson(week) {
    const m = await loadManifest(); const i = m.lessons.findIndex(l => l.week === week); const entry = m.lessons[i];
    if (!entry) { app.innerHTML = '<p>Урок не найден.</p>'; return; }
    app.innerHTML = '<p class="muted">Расшифровка урока…</p>';
    try {
      const [md, narr, poster, audio, video, vtt] = await Promise.all([file(entry, 'lesson.md'), file(entry, 'narration.md'), url(entry, 'poster.jpg'), url(entry, 'audio.mp3'), url(entry, 'video.mp4'), url(entry, 'video.vtt')]);
      const done = JSON.parse(localStorage.getItem('mvt.done') || '[]'); const isDone = done.includes(week);
      const prev = m.lessons[i - 1], next = m.lessons[i + 1];
      app.innerHTML = `<div id="media" class="media">
          ${video ? `<video controls playsinline preload="metadata" ${poster ? `poster="${poster}"` : ''}><source src="${video}" type="video/mp4">${vtt ? `<track kind="captions" srclang="ru" label="Русские субтитры" src="${vtt}" default>` : ''}</video>` : ''}
          ${audio ? `<audio controls preload="none" src="${audio}"></audio>` : ''}
          ${narr ? `<details class="narr"><summary>Текст озвучки</summary>${safeMarkdown(dec.decode(narr), week)}</details>` : ''}
        </div>
        <article>${safeMarkdown(dec.decode(md), week)}</article>
        <p><button id="done" class="primary">${isDone ? 'Снять отметку «пройдено»' : 'Отметить пройденным'}</button></p>
        <div class="pager"><span>${prev ? `<a href="#/w/${prev.week}">← ${prev.title}</a>` : ''}</span><span>${next ? `<a href="#/w/${next.week}">${next.title} →</a>` : ''}</span></div>`;
      document.getElementById('done').onclick = () => { const d = JSON.parse(localStorage.getItem('mvt.done') || '[]'); const idx = d.indexOf(week); if (idx >= 0) d.splice(idx, 1); else d.push(week); localStorage.setItem('mvt.done', JSON.stringify(d)); renderLesson(week); };
      window.scrollTo(0, 0);
    } catch (e) { app.innerHTML = `<p class="err">Не удалось расшифровать урок. Выйдите и введите код заново.</p>`; }
  }

  async function route() {
    renderNav();
    if (!key && !(await restoreKey())) { renderLogin(); return; }
    if (!(await verify())) { sessionStorage.removeItem('mvt.key'); key = null; renderLogin('Сессия устарела, введите код снова.'); return; }
    renderNav();
    const h = location.hash || '#/';
    if (h === '#media') { location.replace('#/'); return; }
    const mw = h.match(/^#\/w\/(\d+)/);
    if (mw) renderLesson(parseInt(mw[1], 10)); else renderList();
  }
  app.addEventListener('click', e => {
    const a = e.target.closest('a[data-media]');
    if (!a) return;
    e.preventDefault();
    jumpToMedia(a.getAttribute('data-media'));
  });
  window.addEventListener('hashchange', route);
  if (!window.isSecureContext || !crypto.subtle) app.innerHTML = '<p class="err">Нужен HTTPS и современный браузер.</p>'; else route();
})();
