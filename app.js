/* Code-locked course viewer: login, then the same screens as preview.html (role / hub / material / quiz / stand / tasks). */
(() => {
  const app = document.getElementById('app');
  const nav = document.getElementById('nav');
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const WEEK = 1;
  let manifest = null;
  let key = null;
  const cache = new Map();
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

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

  function labHref(week) {
    return (screen, extra) => {
      extra = extra || {};
      if (screen === 'role') return '#/role';
      if (screen === 'hub') return `#/w/${week}`;
      if (screen === 'quiz') {
        const q = extra.q;
        let u = q ? `#/w/${week}/quiz/${q}` : `#/w/${week}/quiz`;
        if (extra.topic) u += `?t=${encodeURIComponent(extra.topic)}`;
        return u;
      }
      return `#/w/${week}/${screen}`;
    };
  }

  function parseHash() {
    const raw = (location.hash || '#/role').replace(/^#/, '');
    const [path, query] = raw.split('?');
    const params = new URLSearchParams(query || '');
    if (path === '/role') return { screen: 'role' };
    if (path === '/' || path === '') return { screen: 'hub', week: WEEK };
    const m = path.match(/^\/w\/(\d+)(?:\/(material|quiz|stand|tasks)(?:\/(\d+))?)?\/?$/);
    if (m) {
      return {
        week: Number(m[1]),
        screen: m[2] || 'hub',
        q: m[3] ? Number(m[3]) : 0,
        topic: params.get('t') || '',
      };
    }
    return { screen: 'hub', week: WEEK };
  }

  function opts(week, extra) {
    return Object.assign({
      week,
      role: window.MvtLab.getRole(),
      href: labHref(week),
      homeHref: '#/w/1',
      roleHref: '#/role',
      navigate: (url) => { location.hash = url.replace(/^#/, '#'); },
    }, extra || {});
  }

  function safeMarkdown(md) {
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
      a.replaceWith(doc.createTextNode(a.textContent));
    });
    return doc.body.innerHTML;
  }

  function renderNav() {
    if (!nav) return;
    if (!key) {
      nav.innerHTML = '';
      return;
    }
    const role = window.MvtLab.getRole();
    const roleBit = role
      ? `<span class="muted">${role === 'teacher' ? 'учитель' : 'учащийся'}</span><a href="#/role">Сменить роль</a>`
      : '';
    nav.innerHTML = `${roleBit}<button id="logout">Выйти</button>`;
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

  async function decodeLab(entry) {
    const labBuf = await file(entry, 'lab.json');
    if (!labBuf) return null;
    try { return JSON.parse(dec.decode(labBuf)); } catch { return null; }
  }

  async function loadWeek(week) {
    const m = await loadManifest();
    const entry = m.lessons.find((l) => l.week === week);
    if (!entry) throw new Error('Урок не найден.');
    const mdBuf = await file(entry, 'lesson.md');
    const lab = await decodeLab(entry);
    return { lessonMd: mdBuf ? dec.decode(mdBuf) : '', lab };
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
    if (!window.MvtLab.getRole() && r.screen !== 'role') {
      location.hash = '#/role';
      return;
    }
    if (r.week && r.week !== WEEK) {
      app.classList.remove('is-wide');
      app.innerHTML = '<p>Открыта неделя 1.</p>';
      return;
    }
    let pack;
    try {
      pack = await loadWeek(WEEK);
    } catch (e) {
      app.innerHTML = `<p class="err">${e && e.message ? e.message : e}</p>`;
      return;
    }
    const { lessonMd, lab } = pack;
    app.classList.toggle('is-wide', r.screen === 'quiz' || r.screen === 'stand');
    const o = opts(WEEK, { qIndex: r.q, filter: r.topic });
    if (r.screen === 'role') {
      window.MvtLab.renderRole(app, {
        ...o,
        href: () => '#/w/1',
        onPick: () => { location.hash = '#/w/1'; },
      });
      return;
    }
    if (!lab) {
      app.innerHTML = '<p class="err">Нет материалов недели 1.</p>';
      return;
    }
    if (r.screen === 'quiz') {
      window.MvtLab.renderQuiz(app, lab, WEEK, o);
      return;
    }
    if (r.screen === 'stand') {
      window.MvtLab.renderStand(app, lab, WEEK, o);
      return;
    }
    if (r.screen === 'tasks') {
      window.MvtLab.renderTasks(app, lab, WEEK, o);
      return;
    }
    if (r.screen === 'material') {
      app.innerHTML = `<p class="lab-crumb"><a href="#/w/1">← Хаб недели 1</a></p>
        <article>${safeMarkdown(lessonMd)}</article>`;
      window.MvtLab.prepareMaterial(app.querySelector('article'), lab, WEEK, o);
      return;
    }
    window.MvtLab.renderHub(app, lab, WEEK, o);
  }

  window.addEventListener('hashchange', route);
  if (!window.isSecureContext || !crypto.subtle) app.innerHTML = '<p class="err">Нужен HTTPS и современный браузер.</p>';
  else route();
})();
