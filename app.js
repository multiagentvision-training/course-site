/* Code-locked course viewer: weeks skeleton + topic shelf, same quiz engine. */
(() => {
  const app = document.getElementById('app');
  const nav = document.getElementById('nav');
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let manifest = null;
  let contentKey = null;
  let teacherKey = null;
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
      false,
      ['decrypt'],
    );
  }
  function unlocked() {
    return Boolean(contentKey);
  }

  async function decryptWith(cryptoKey, buf, aad) {
    const bytes = new Uint8Array(buf);
    const iv = bytes.slice(0, 12);
    const body = bytes.slice(12);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, cryptoKey, body);
  }

  async function verifyBlob(cryptoKey, path, aad, expected) {
    try {
      const v = await decryptWith(cryptoKey, await (await fetch(path, { cache: 'no-store' })).arrayBuffer(), aad);
      return dec.decode(v) === expected;
    } catch {
      return false;
    }
  }

  async function unwrapContentKey(cryptoKey, wrappedB64) {
    const raw = await decryptWith(cryptoKey, b64(wrappedB64), 'content-key');
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  }

  function clearSession() {
    contentKey = null;
    teacherKey = null;
    cache.clear();
    if (window.MvtLab) {
      window.MvtLab.setTeacherUnlocked(false);
      window.MvtLab.setCapability('');
    }
  }

  async function file(entry, name) {
    const meta = entry && entry.files && entry.files[name];
    if (!meta) return null;
    const id = meta.path;
    if (cache.has(id)) return cache.get(id);
    const isTeacherFile = name === 'lab.teacher.json';
    const k = isTeacherFile ? teacherKey : contentKey;
    if (!k) return null;
    const buf = await decryptWith(k, await (await fetch(meta.path)).arrayBuffer(), id.split('/').pop());
    cache.set(id, buf);
    return buf;
  }
  async function url(entry, name) {
    const buf = await file(entry, name);
    return buf ? URL.createObjectURL(new Blob([buf], { type: mime[name] })) : null;
  }
  async function decodeLab(entry) {
    if (teacherKey && entry && entry.files && entry.files['lab.teacher.json']) {
      const teacherBuf = await file(entry, 'lab.teacher.json');
      if (teacherBuf) {
        try { return JSON.parse(dec.decode(teacherBuf)); } catch { /* fall through to student copy */ }
      }
    }
    const labBuf = await file(entry, 'lab.json');
    if (!labBuf) return null;
    try { return JSON.parse(dec.decode(labBuf)); } catch { return null; }
  }

  function quizQuery(extra) {
    extra = extra || {};
    const p = [];
    if (extra.topic) p.push(`t=${encodeURIComponent(extra.topic)}`);
    if (extra.rand) p.push(`rand=${encodeURIComponent(String(extra.rand))}`);
    return p.length ? `?${p.join('&')}` : '';
  }

  function weekHref(week) {
    return (screen, extra) => {
      extra = extra || {};
      if (screen === 'role') return '#/role';
      if (screen === 'hub') return `#/w/${week}`;
      if (screen === 'quiz') {
        const u = extra.q ? `#/w/${week}/quiz/${extra.q}` : `#/w/${week}/quiz`;
        return u + quizQuery(extra);
      }
      return `#/w/${week}/${screen}`;
    };
  }

  function topicHref(slug) {
    return (screen, extra) => {
      extra = extra || {};
      if (screen === 'role') return '#/role';
      if (screen === 'hub') return `#/t/${slug}`;
      if (screen === 'quiz') {
        const u = extra.q ? `#/t/${slug}/quiz/${extra.q}` : `#/t/${slug}/quiz`;
        return u + quizQuery(extra);
      }
      return `#/t/${slug}/${screen}`;
    };
  }

  function parseHash() {
    const raw = (location.hash || '#/').replace(/^#/, '');
    const [path, query] = raw.split('?');
    const params = new URLSearchParams(query || '');
    if (path === '/role') return { screen: 'role' };
    if (path === '/catalog') return { screen: 'catalog', kind: params.get('k') || '' };
    if (path === '/weeks') return { screen: 'weeks' };
    if (path === '/' || path === '') return { screen: 'home' };
    const tw = path.match(/^\/w\/(\d+)(?:\/(material|quiz|stand|tasks)(?:\/(\d+))?)?\/?$/);
    if (tw) {
      return {
        week: Number(tw[1]),
        screen: tw[2] || 'hub',
        q: tw[3] ? Number(tw[3]) : 0,
        topic: params.get('t') || '',
        rand: params.get('rand') || '',
        area: 'week',
      };
    }
    const tc = path.match(/^\/t\/([a-z0-9-]+)(?:\/(material|quiz|stand|tasks)(?:\/(\d+))?)?\/?$/);
    if (tc) {
      return {
        slug: tc[1],
        screen: tc[2] || 'hub',
        q: tc[3] ? Number(tc[3]) : 0,
        topic: params.get('t') || '',
        rand: params.get('rand') || '',
        area: 'topic',
      };
    }
    return { screen: 'home' };
  }

  function weekOpts(week, extra) {
    return Object.assign({
      week,
      kind: 'week',
      storageId: String(week),
      role: window.MvtLab.getRole(),
      href: weekHref(week),
      homeHref: '#/weeks',
      homeLabel: '← Недели',
      roleHref: '#/role',
      navigate: (url) => { location.hash = url.replace(/^#/, '#'); },
    }, extra || {});
  }

  function topicOpts(slug, extra) {
    return Object.assign({
      week: slug,
      kind: 'topic',
      storageId: 't.' + slug,
      quizRequired: false,
      role: window.MvtLab.getRole(),
      href: topicHref(slug),
      homeHref: '#/catalog',
      homeLabel: '← Полка',
      roleHref: '#/role',
      heading: extra && extra.heading,
      navigate: (url) => { location.hash = url.replace(/^#/, '#'); },
    }, extra || {});
  }

  function mediaKind(href) {
    const h = (href || '').trim().replace(/^\.\//, '');
    return /^(narration\.md|audio\.mp3|video\.mp4)$/.test(h) ? h : null;
  }

  function escapeHtml(value) {
    return window.MvtLab.escapeHtml(value);
  }

  function sanitizeHtmlTree(doc) {
    doc.querySelectorAll('script,iframe,object,embed,form,math,svg,link,meta,base,style,template,textarea,noscript').forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const val = (attr.value || '').trim();
        if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction' || name === 'xlink:href' || name === 'style') {
          el.removeAttribute(attr.name);
          return;
        }
        if (['href', 'src', 'poster', 'action', 'cite', 'data', 'srcset'].includes(name)) {
          if (/^(https?:|\/|#\/|#)/i.test(val) || mediaKind(val.replace(/^\.\//, ''))) return;
          el.removeAttribute(attr.name);
        }
      });
    });
  }

  function safeMarkdown(md, week) {
    const html = marked.parse(md, { mangle: false, headerIds: false });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    sanitizeHtmlTree(doc);
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
      if (kind && week) {
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
    if (!unlocked()) {
      nav.innerHTML = '';
      return;
    }
    const role = window.MvtLab.getRole();
    const roleLabel = role === 'teacher' ? 'учитель' : role === 'student' ? 'учащийся' : 'роль';
    const roleLink = teacherKey
      ? `<a href="#/role">${roleLabel}</a>`
      : `<span class="muted">${roleLabel}</span>`;
    nav.innerHTML = `<a href="#/">Главная</a><a href="#/weeks">Недели</a><a href="#/catalog">Полка</a>${roleLink}<button id="logout">Выйти</button>`;
    const b = document.getElementById('logout');
    if (b) {
      b.onclick = () => {
        clearSession();
        location.hash = '#/';
        route();
      };
    }
  }

  function renderLogin(msg) {
    app.classList.remove('is-wide');
    app.innerHTML = `<div class="login"><h1>Вход</h1><p class="muted">Введите код, выданный организатором. Код группы открывает полку учащегося. Код ментора — кабинет учителя. Расшифровка в браузере.</p>
      <input id="code" type="password" autocomplete="off" placeholder="Код доступа"><button id="go" class="primary">Открыть курс</button><div id="err" class="err"></div></div>`;
    if (msg) document.getElementById('err').textContent = msg;
    const go = document.getElementById('go');
    const input = document.getElementById('code');
    const submit = async () => {
      go.disabled = true;
      document.getElementById('err').textContent = 'Проверяю…';
      try {
        const m = await loadManifest();
        const Lab = window.MvtLab;
        const code = (input.value || '').trim();
        const studentDerived = await deriveKey(code, m.kdf.salt, m.kdf.iterations);
        if (await verifyBlob(studentDerived, 'data/verifier.bin', 'verifier', 'multiagentvision-training-ok')) {
          contentKey = await unwrapContentKey(studentDerived, m.contentKey.student);
          teacherKey = null;
          Lab.setCapability('student');
          Lab.setTeacherUnlocked(false);
          location.hash = '#/';
          route();
          return;
        }
        if (m.teacherKdf && m.contentKey && m.contentKey.teacher) {
          const teacherDerived = await deriveKey(code, m.teacherKdf.salt, m.teacherKdf.iterations);
          if (await verifyBlob(teacherDerived, 'data/teacher-verifier.bin', 'teacher-verifier', 'multiagentvision-training-teacher-ok')) {
            contentKey = await unwrapContentKey(teacherDerived, m.contentKey.teacher);
            teacherKey = teacherDerived;
            Lab.setCapability('teacher');
            Lab.setTeacherUnlocked(true);
            location.hash = '#/';
            route();
            return;
          }
        }
        clearSession();
        go.disabled = false;
        document.getElementById('err').textContent = 'Код не подошёл. Если класс только что обновили — жёсткое обновление страницы (Cmd+Shift+R), затем тот же код из .env.';
      } catch (err) {
        clearSession();
        go.disabled = false;
        document.getElementById('err').textContent = 'Код не подошёл. Сделайте жёсткое обновление страницы (Cmd+Shift+R) и введите код ещё раз.';
      }
    };
    go.onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    input.focus();
  }

  function renderHome() {
    app.innerHTML = `<h1>Две двери</h1>
      <p class="muted">Неделя — расписание. Полка — курсы с учебником с нуля до hero и уникальным квизом. Экзамена курса нет.</p>
      <div class="lab-doors">
        <a class="lab-door" href="#/weeks"><strong>Недели</strong><span>Скелет 1–24. Рекомендованные курсы полки и тикеты LRN.</span></a>
        <a class="lab-door" href="#/catalog"><strong>Полка курсов</strong><span>Технологии, языки, интервью. Один курс — одна тема.</span></a>
      </div>`;
  }

  async function renderWeeks() {
    const m = await loadManifest();
    const done = JSON.parse(localStorage.getItem('mvt.done') || '[]');
    const n = (m.lessons || []).length;
    const recMap = (m.weeks || {});
    const courses = Object.fromEntries((m.courses || []).map((c) => [c.slug, c]));
    app.innerHTML = `<h1>Недели — скелет</h1>
      <p class="muted">${n} недель. Квиз недели короткий. Учебник и банк карточек темы — на полке.</p>
      <div class="progress"><i style="width:${n ? Math.round(100 * done.length / n) : 0}%"></i></div>
      <ul class="list">` +
      (m.lessons || []).map((l) => {
        const recs = recMap[String(l.week)] || [];
        const labels = recs.map((s) => (courses[s] ? courses[s].title : s)).join(' · ');
        return `<li><a href="#/w/${l.week}">${escapeHtml(l.title)}</a><span class="badge">${done.includes(l.week) ? 'пройдено' : escapeHtml(labels || 'без полки')}</span></li>`;
      }).join('') + '</ul>';
  }

  async function renderCatalog(kind) {
    const m = await loadManifest();
    const all = m.courses || [];
    const kinds = [...new Set(all.map((c) => c.kind))];
    const shown = kind ? all.filter((c) => c.kind === kind) : all;
    const chips = [`<a class="lab-chip${kind ? '' : ' is-on'}" href="#/catalog">Все</a>`]
      .concat(kinds.map((k) => {
        const label = (all.find((c) => c.kind === k) || {}).kindLabel || k;
        return `<a class="lab-chip${kind === k ? ' is-on' : ''}" href="#/catalog?k=${encodeURIComponent(k)}">${escapeHtml(label)}</a>`;
      }))
      .join('');
    app.innerHTML = `<h1>Полка курсов</h1>
      <p class="muted">Не привязано к неделе. Квиз — click/fill/choice. Экзамена нет.</p>
      <div class="lab-filters">${chips}</div>
      <ul class="list">${shown.map((c) => `<li><a href="#/t/${escapeHtml(c.slug)}">${escapeHtml(c.title)}</a><span class="badge">${escapeHtml(c.kindLabel || c.kind)} · ${c.quizCount || 0} карточек</span></li>`).join('')}</ul>`;
  }

  function recForWeek(m, week) {
    const slugs = (m.weeks || {})[String(week)] || [];
    const map = Object.fromEntries((m.courses || []).map((c) => [c.slug, c]));
    return slugs.map((s) => map[s]).filter(Boolean);
  }

  async function renderLabMaterial(week, entry, lab, o) {
    const [mdBuf, narr, poster, audio, video, vtt] = await Promise.all([
      file(entry, 'lesson.md'),
      file(entry, 'narration.md'),
      url(entry, 'poster.jpg'),
      url(entry, 'audio.mp3'),
      url(entry, 'video.mp4'),
      url(entry, 'video.vtt'),
    ]);
    const crumb = o.kind === 'topic' ? `#/t/${week}` : `#/w/${week}`;
    const media = (video || audio || narr)
      ? `<div id="media" class="media media-bottom">
          <h2>Озвучка и видеоразбор</h2>
          ${video ? `<video controls playsinline preload="metadata" ${poster ? `poster="${poster}"` : ''}><source src="${video}" type="video/mp4">${vtt ? `<track kind="captions" srclang="ru" label="Русские субтитры" src="${vtt}" default>` : ''}</video>` : ''}
          ${audio ? `<audio controls preload="none" src="${audio}"></audio>` : ''}
          ${narr ? `<details class="narr"><summary>Текст озвучки</summary>${safeMarkdown(dec.decode(narr), week)}</details>` : ''}
        </div>`
      : '';
    app.innerHTML = `<p class="lab-crumb"><a href="${crumb}">← Хаб</a></p>
      <article>${safeMarkdown(mdBuf ? dec.decode(mdBuf) : '', week)}</article>${media}`;
    window.MvtLab.prepareMaterial(app.querySelector('article'), lab, week, o);
  }

  async function renderWeek(week, screen, extra) {
    const m = await loadManifest();
    const entry = (m.lessons || []).find((l) => l.week === week);
    if (!entry) {
      app.innerHTML = '<p>Урок не найден.</p>';
      return;
    }
    const lab = await decodeLab(entry);
    const Lab = window.MvtLab;
    const o = weekOpts(week, Object.assign({ recommended: recForWeek(m, week) }, extra || {}));
    if (!lab || !Lab) {
      app.innerHTML = '<p>Нет lab.json недели.</p>';
      return;
    }
    app.classList.toggle('is-wide', screen === 'quiz' || screen === 'stand');
    if (screen === 'quiz') Lab.renderQuiz(app, lab, week, o);
    else if (screen === 'stand') Lab.renderStand(app, lab, week, o);
    else if (screen === 'tasks') Lab.renderTasks(app, lab, week, o);
    else if (screen === 'material') await renderLabMaterial(week, entry, lab, o);
    else Lab.renderHub(app, lab, week, o);
  }

  async function renderTopic(slug, screen, extra) {
    const m = await loadManifest();
    const entry = (m.courses || []).find((c) => c.slug === slug);
    if (!entry) {
      app.innerHTML = '<p>Курс не найден на полке.</p>';
      return;
    }
    app.innerHTML = '<p class="muted">Загружаю квиз курса…</p>';
    const lab = await decodeLab(entry);
    const Lab = window.MvtLab;
    if (!lab || !Lab) {
      app.innerHTML = '<p>Нет lab.json курса.</p>';
      return;
    }
    const o = topicOpts(slug, Object.assign({ heading: entry.title || lab.title }, extra || {}));
    app.classList.toggle('is-wide', screen === 'quiz' || screen === 'stand');
    if (screen === 'quiz') Lab.renderQuiz(app, lab, slug, o);
    else if (screen === 'stand') Lab.renderStand(app, lab, slug, o);
    else if (screen === 'tasks') Lab.renderTasks(app, lab, slug, o);
    else if (screen === 'material') await renderLabMaterial(slug, entry, lab, o);
    else Lab.renderHub(app, lab, slug, o);
  }

  async function route() {
    renderNav();
    if (!unlocked()) { renderLogin(); return; }
    renderNav();
    const r = parseHash();
    const Lab = window.MvtLab;
    if (r.screen === 'role' && Lab && !teacherKey) {
      location.hash = '#/';
      return;
    }
    if (r.screen !== 'role' && Lab && !Lab.getRole()) {
      if (teacherKey) Lab.setTeacherUnlocked(true);
      else Lab.setCapability('student');
    }
    app.classList.remove('is-wide');
    if (r.screen === 'role') {
      Lab.renderRole(app, {
        href: () => '#/',
        onPick: () => { location.hash = '#/'; },
      });
      return;
    }
    if (r.screen === 'home') {
      renderHome();
      return;
    }
    if (r.screen === 'weeks') {
      await renderWeeks();
      return;
    }
    if (r.screen === 'catalog') {
      await renderCatalog(r.kind);
      return;
    }
    if (r.area === 'topic') {
      await renderTopic(r.slug, r.screen, { qIndex: r.q, filter: r.topic, sample: r.rand ? Number(r.rand) : 0 });
      return;
    }
    await renderWeek(r.week, r.screen, { qIndex: r.q, filter: r.topic, sample: r.rand ? Number(r.rand) : 0 });
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
