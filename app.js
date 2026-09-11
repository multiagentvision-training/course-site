/* Code-locked course viewer: access code, then teacher/student role, then all weeks. */
(() => {
  const app = document.getElementById('app');
  const nav = document.getElementById('nav');
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let manifest = null;
  let key = null;
  const cache = new Map();
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const mime = { 'audio.mp3': 'audio/mpeg', 'video.mp4': 'video/mp4', 'video.vtt': 'text/vtt', 'poster.jpg': 'image/jpeg' };

  async function loadManifest() {
    if (!manifest) manifest = await (await fetch('manifest.json', { cache: 'no-store' })).json();
    return manifest;
  }
  async function deriveKey(code, saltB64, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(saltB64), iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      true,
      ['decrypt'],
    );
  }
  async function decryptBlob(buf, aad) {
    const bytes = new Uint8Array(buf);
    const iv = bytes.slice(0, 12);
    const body = bytes.slice(12);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, body);
  }
  async function restoreKey() {
    const raw = sessionStorage.getItem('mvt.key');
    if (!raw) return false;
    try {
      key = await crypto.subtle.importKey('raw', b64(raw), { name: 'AES-GCM' }, true, ['decrypt']);
      return true;
    } catch {
      return false;
    }
  }
  async function verify() {
    try {
      const v = await decryptBlob(await (await fetch('data/verifier.bin', { cache: 'no-store' })).arrayBuffer(), 'verifier');
      return dec.decode(v) === 'multiagentvision-training-ok';
    } catch {
      return false;
    }
  }
  async function file(entry, name) {
    const meta = entry.files[name];
    if (!meta) return null;
    const id = meta.path;
    if (cache.has(id)) return cache.get(id);
    const buf = await decryptBlob(await (await fetch(meta.path)).arrayBuffer(), id.split('/').pop());
    cache.set(id, buf);
    return buf;
  }
  async function url(entry, name) {
    const buf = await file(entry, name);
    return buf ? URL.createObjectURL(new Blob([buf], { type: mime[name] })) : null;
  }
  async function decodeLab(entry) {
    const labBuf = await file(entry, 'lab.json');
    if (!labBuf) return null;
    try { return JSON.parse(dec.decode(labBuf)); } catch { return null; }
  }

  function labHref(week) {
    return (screen, extra) => {
      extra = extra || {};
      if (screen === 'role') return '#/role';
      if (screen === 'hub') return `#/w/${week}`;
      if (screen === 'quiz') {
        let u = extra.q ? `#/w/${week}/quiz/${extra.q}` : `#/w/${week}/quiz`;
        if (extra.topic) u += `?t=${encodeURIComponent(extra.topic)}`;
        return u;
      }
      return `#/w/${week}/${screen}`;
    };
  }

  function parseHash() {
    const raw = (location.hash || '#/').replace(/^#/, '');
    const [path, query] = raw.split('?');
    const params = new URLSearchParams(query || '');
    if (path === '/role') return { screen: 'role' };
    if (path === '/' || path === '') return { screen: 'list' };
    const m = path.match(/^\/w\/(\d+)(?:\/(material|quiz|stand|tasks)(?:\/(\d+))?)?\/?$/);
    if (m) {
      return {
        week: Number(m[1]),
        screen: m[2] || 'hub',
        q: m[3] ? Number(m[3]) : 0,
        topic: params.get('t') || '',
      };
    }
    return { screen: 'list' };
  }

  function labOpts(week, extra) {
    return Object.assign({
      week,
      role: window.MvtLab.getRole(),
      href: labHref(week),
      homeHref: '#/',
      roleHref: '#/role',
      navigate: (url) => { location.hash = url.replace(/^#/, '#'); },
    }, extra || {});
  }

  function mediaKind(href) {
    const h = (href || '').trim().replace(/^\.\//, '');
    return /^(narration\.md|audio\.mp3|video\.mp4)$/.test(h) ? h : null;
  }

  function safeMarkdown(md, week) {
    const html = marked.parse(md, { mangle: false, headerIds: false });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,iframe,object,embed').forEach((n) => n.remove());
    doc.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href') || '';
      if (/^https?:/.test(h) || h.startsWith('#/')) {
        if (/^https?:/.test(h)) {
          a.target = '_blank';
          a.rel = 'noopener';
        }
        return;
      }
      const kind = mediaKind(h);
      if (kind) {
        a.setAttribute('href', `#/w/${week}`);
        a.setAttribute('data-media', kind);
        return;
      }
      a.replaceWith(doc.createTextNode(a.textContent));
    });
    return doc.body.innerHTML;
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
      if (d) {
        d.open = true;
        d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  function renderNav() {
    if (!nav) return;
    if (!key) {
      nav.innerHTML = '';
      return;
    }
    const role = window.MvtLab.getRole();
    const roleLabel = role === 'teacher' ? 'учитель' : role === 'student' ? 'учащийся' : 'роль';
    nav.innerHTML = `<a href="#/">Уроки</a><a href="#/role">${roleLabel}</a><a href="#/role">Сменить роль</a><button id="logout">Выйти</button>`;
    const b = document.getElementById('logout');
    if (b) {
      b.onclick = () => {
        sessionStorage.removeItem('mvt.key');
        key = null;
        cache.clear();
        location.hash = '#/';
        route();
      };
    }
  }

  function renderLogin(msg) {
    app.classList.remove('is-wide');
    app.innerHTML = `<div class="login"><h1>Вход</h1><p class="muted">Введите код доступа, выданный организатором. Расшифровка происходит в браузере.</p>
      <input id="code" type="password" autocomplete="off" placeholder="Код доступа"><button id="go" class="primary">Открыть курс</button><div id="err" class="err">${msg || ''}</div></div>`;
    const go = document.getElementById('go');
    const input = document.getElementById('code');
    const submit = async () => {
      go.disabled = true;
      document.getElementById('err').textContent = 'Проверяю…';
      const m = await loadManifest();
      key = await deriveKey(input.value, m.kdf.salt, m.kdf.iterations);
      if (await verify()) {
        sessionStorage.setItem('mvt.key', btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', key)))));
        location.hash = '#/role';
        route();
      } else {
        key = null;
        go.disabled = false;
        document.getElementById('err').textContent = 'Код не подошёл. Проверьте раскладку и попробуйте ещё раз.';
      }
    };
    go.onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    input.focus();
  }

  async function renderList() {
    const m = await loadManifest();
    const done = JSON.parse(localStorage.getItem('mvt.done') || '[]');
    const n = m.lessons.length;
    app.innerHTML = `<h1>Уроки</h1><p class="muted">${n} недель. Неделя 1 — материал, квиз и стенд. Дальше — текст, аудио и видео. Прогресс хранится только в этом браузере.</p>
      <div class="progress"><i style="width:${Math.round(100 * done.length / n)}%"></i></div><ul class="list">` +
      m.lessons.map((l) => `<li><a href="#/w/${l.week}">${l.title}</a><span class="badge">${done.includes(l.week) ? 'пройдено' : ''}</span></li>`).join('') + '</ul>';
  }

  async function renderLabMaterial(week, entry, lab) {
    const mdBuf = await file(entry, 'lesson.md');
    const o = labOpts(week);
    app.innerHTML = `<p class="lab-crumb"><a href="#/w/${week}">← Хаб недели ${week}</a></p>
      <article>${safeMarkdown(mdBuf ? dec.decode(mdBuf) : '', week)}</article>`;
    window.MvtLab.prepareMaterial(app.querySelector('article'), lab, week, o);
  }

  async function renderPlainMaterial(week, entry) {
    const [md, narr, poster, audio, video, vtt] = await Promise.all([
      file(entry, 'lesson.md'),
      file(entry, 'narration.md'),
      url(entry, 'poster.jpg'),
      url(entry, 'audio.mp3'),
      url(entry, 'video.mp4'),
      url(entry, 'video.vtt'),
    ]);
    const m = await loadManifest();
    const i = m.lessons.findIndex((l) => l.week === week);
    const prev = m.lessons[i - 1];
    const next = m.lessons[i + 1];
    const done = JSON.parse(localStorage.getItem('mvt.done') || '[]');
    const isDone = done.includes(week);
    app.innerHTML = `<p class="lab-crumb"><a href="#/">← Уроки</a></p>
      <div id="media" class="media">
        ${video ? `<video controls playsinline preload="metadata" ${poster ? `poster="${poster}"` : ''}><source src="${video}" type="video/mp4">${vtt ? `<track kind="captions" srclang="ru" label="Русские субтитры" src="${vtt}" default>` : ''}</video>` : ''}
        ${audio ? `<audio controls preload="none" src="${audio}"></audio>` : ''}
        ${narr ? `<details class="narr"><summary>Текст озвучки</summary>${safeMarkdown(dec.decode(narr), week)}</details>` : ''}
      </div>
      <article>${safeMarkdown(md ? dec.decode(md) : '', week)}</article>
      <p><button id="done" class="primary">${isDone ? 'Снять отметку «пройдено»' : 'Отметить пройденным'}</button></p>
      <div class="pager"><span>${prev ? `<a href="#/w/${prev.week}">← ${prev.title}</a>` : ''}</span><span>${next ? `<a href="#/w/${next.week}">${next.title} →</a>` : ''}</span></div>`;
    document.getElementById('done').onclick = () => {
      const d = JSON.parse(localStorage.getItem('mvt.done') || '[]');
      const idx = d.indexOf(week);
      if (idx >= 0) d.splice(idx, 1);
      else d.push(week);
      localStorage.setItem('mvt.done', JSON.stringify(d));
      renderPlainMaterial(week, entry);
    };
  }

  async function renderWeek(week, screen, extra) {
    const m = await loadManifest();
    const entry = m.lessons.find((l) => l.week === week);
    if (!entry) {
      app.innerHTML = '<p>Урок не найден.</p>';
      return;
    }
    const lab = await decodeLab(entry);
    const Lab = window.MvtLab;
    if (!lab || !Lab) {
      await renderPlainMaterial(week, entry);
      return;
    }
    const o = labOpts(week, extra);
    app.classList.toggle('is-wide', screen === 'quiz' || screen === 'stand');
    if (screen === 'quiz') Lab.renderQuiz(app, lab, week, o);
    else if (screen === 'stand') Lab.renderStand(app, lab, week, o);
    else if (screen === 'tasks') Lab.renderTasks(app, lab, week, o);
    else if (screen === 'material') await renderLabMaterial(week, entry, lab);
    else Lab.renderHub(app, lab, week, o);
  }

  async function route() {
    renderNav();
    if (!key && !(await restoreKey())) { renderLogin(); return; }
    if (!(await verify())) {
      sessionStorage.removeItem('mvt.key');
      key = null;
      renderLogin('Сессия устарела, введите код снова.');
      return;
    }
    renderNav();
    const r = parseHash();
    const Lab = window.MvtLab;
    if (r.screen !== 'role' && Lab && !Lab.getRole()) {
      location.hash = '#/role';
      return;
    }
    app.classList.remove('is-wide');
    if (r.screen === 'role') {
      Lab.renderRole(app, {
        href: () => '#/',
        onPick: () => { location.hash = '#/'; },
      });
      return;
    }
    if (r.screen === 'list') {
      await renderList();
      return;
    }
    await renderWeek(r.week, r.screen, { qIndex: r.q, filter: r.topic });
  }

  app.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-media]');
    if (!a) return;
    e.preventDefault();
    jumpToMedia(a.getAttribute('data-media'));
  });
  window.addEventListener('hashchange', route);
  if (!window.isSecureContext || !crypto.subtle) app.innerHTML = '<p class="err">Нужен HTTPS и современный браузер.</p>';
  else route();
})();
