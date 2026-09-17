/* SPEEDBOAT-style lab: role doors, week hub, full-screen quiz (sidebar + one card), stand gate. */
(function (root) {
  const ROLE_KEY = 'mvt.role';
  const CAP_KEY = 'mvt.cap';
  let hintCount = 0;
  let keyHandler = null;
  let teacherUnlocked = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function storageKey(week) {
    return 'mvt.lab.' + week;
  }

  function loadState(week) {
    try {
      return JSON.parse(localStorage.getItem(storageKey(week)) || '{}');
    } catch {
      return {};
    }
  }

  function saveState(week, state) {
    localStorage.setItem(storageKey(week), JSON.stringify(state));
  }

  function getCapability() {
    try {
      const c = sessionStorage.getItem(CAP_KEY);
      return c === 'teacher' || c === 'student' ? c : '';
    } catch {
      return '';
    }
  }

  function setCapability(cap) {
    try {
      if (cap === 'teacher' || cap === 'student') sessionStorage.setItem(CAP_KEY, cap);
      else sessionStorage.removeItem(CAP_KEY);
    } catch { /* ignore */ }
    if (cap === 'student') {
      teacherUnlocked = false;
      localStorage.setItem(ROLE_KEY, 'student');
    } else if (cap === 'teacher') {
      localStorage.setItem(ROLE_KEY, 'teacher');
    }
  }

  function setTeacherUnlocked(on) {
    teacherUnlocked = Boolean(on);
    if (teacherUnlocked) setCapability('teacher');
  }

  function getRole() {
    const cap = getCapability();
    if (cap === 'student') return 'student';
    if (cap === 'teacher' && teacherUnlocked) return 'teacher';
    if (cap === 'teacher') return 'student';
    const r = localStorage.getItem(ROLE_KEY);
    return r === 'teacher' || r === 'student' ? r : '';
  }

  function setRole(role) {
    if (getCapability() === 'student' && role === 'teacher') {
      localStorage.setItem(ROLE_KEY, 'student');
      return;
    }
    if (role === 'teacher' || role === 'student') localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
  }

  function isTeacher(role) {
    if (getCapability() === 'student') return false;
    if (teacherUnlocked) return true;
    if (getCapability() === 'teacher') return false;
    return (role || getRole()) === 'teacher';
  }

  function hexOf(buf) {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function sha256hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return hexOf(buf);
  }

  async function matchesAnswer(item, opt) {
    if (!item) return false;
    if (item.answer != null && String(item.answer) === String(opt)) return true;
    if (item.answerHash) return (await sha256hex(opt)) === item.answerHash;
    return false;
  }

  function chosenMap(state) {
    const c = state && state.chosen;
    return c && typeof c === 'object' ? c : {};
  }

  function solvedMap(state) {
    const s = state && state.solved;
    return s && typeof s === 'object' ? s : {};
  }

  function isQuizComplete(week, lab) {
    if (!lab || !lab.quiz || !lab.quiz.length) return true;
    const solved = solvedMap(loadState(week));
    return lab.quiz.every((q) => solved[q.id]);
  }

  function isStandComplete(week, lab) {
    if (!lab || !lab.stand || !lab.stand.length) return true;
    return Boolean(loadState(week).standDone);
  }

  function isComplete(week, lab) {
    if (!lab) return true;
    return isQuizComplete(week, lab) && isStandComplete(week, lab);
  }

  function quizScore(week, lab) {
    const items = (lab && lab.quiz) || [];
    const solved = solvedMap(loadState(week));
    const n = items.filter((q) => solved[q.id]).length;
    return { n, total: items.length };
  }

  function linkAttr(opts) {
    return opts && opts.linkAttr ? ` ${opts.linkAttr}` : '';
  }

  function labSid(opts, week) {
    if (opts && opts.storageId != null && opts.storageId !== '') return String(opts.storageId);
    return String(week);
  }

  function quizIsGated(opts, lab) {
    if (opts && opts.quizRequired === false) return false;
    if (lab && lab.quizRequired === false) return false;
    return true;
  }

  function querySuffix(extra) {
    extra = extra || {};
    const p = [];
    if (extra.topic) p.push('t=' + encodeURIComponent(extra.topic));
    if (extra.rand) p.push('rand=' + encodeURIComponent(String(extra.rand)));
    return p.length ? '?' + p.join('&') : '';
  }

  function catalogHref(opts) {
    return (opts && opts.catalogHref) || '#/catalog';
  }

  function topicCourseHref(opts, slug) {
    if (opts && typeof opts.topicHref === 'function') return opts.topicHref(slug);
    return '#/t/' + slug;
  }

  function href(opts, screen, extra) {
    if (opts && typeof opts.href === 'function') return opts.href(screen, extra || {});
    const week = opts && opts.week;
    if (screen === 'hub') return `#/w/${week}`;
    if (screen === 'role') return '#/role';
    if (screen === 'quiz') {
      const q = extra && extra.q;
      let u = q ? `#/w/${week}/quiz/${q}` : `#/w/${week}/quiz`;
      return u + querySuffix(extra);
    }
    return `#/w/${week}/${screen}`;
  }

  function go(opts, url) {
    if (opts && typeof opts.navigate === 'function') opts.navigate(url);
    else if (url.startsWith('#')) location.hash = url;
    else location.assign(url);
  }

  function unbindKeys() {
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
  }

  function bindKeys(handler) {
    unbindKeys();
    keyHandler = handler;
    document.addEventListener('keydown', handler);
  }

  function optionButtons(options, onPick) {
    const box = document.createElement('div');
    box.className = 'lab-opts';
    options.forEach((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lab-opt';
      b.textContent = opt;
      b.addEventListener('click', () => onPick(opt, b));
      box.appendChild(b);
    });
    return box;
  }

  function topicLabel(lab, id) {
    const t = (lab.topics || []).find((x) => x.id === id);
    return t ? t.label : id;
  }

  function renderRole(root, opts) {
    unbindKeys();
    opts = opts || {};
    const teacherDoor = teacherUnlocked || !getCapability()
      ? `<a class="lab-door" href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)} data-role="teacher">
          <strong>Учитель</strong>
          <span>Те же экраны плюс ответы, «куда нажать» и типичные ошибки.</span>
        </a>`
      : '';
    root.innerHTML = `<div class="lab-role">
      <h1>Кто вы</h1>
      <p class="muted">${teacherDoor
        ? 'Один формат, разное содержимое. Учащийся решает карточки. Учитель видит ответы, путь кликов и как объяснять.'
        : 'Код группы открывает только вид учащегося. Кабинет учителя — отдельный код ментора.'}</p>
      <div class="lab-doors">
        <a class="lab-door" href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)} data-role="student">
          <strong>Учащийся</strong>
          <span>Квиз, стенд и задания. Стенд закрыт, пока квиз не 100 %.</span>
        </a>
        ${teacherDoor}
      </div>
    </div>`;
    root.querySelectorAll('[data-role]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const next = a.getAttribute('data-role');
        if (next === 'teacher' && getCapability() === 'student' && !teacherUnlocked) return;
        setRole(next);
        if (opts.onPick) {
          e.preventDefault();
          opts.onPick(next);
        }
      });
    });
  }

  function doorCard(opts, screen, title, text, locked, lockText) {
    const url = href(opts, screen);
    if (locked) {
      return `<div class="lab-door is-locked" aria-disabled="true">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(lockText || 'Закрыто, пока квиз не 100 %.')}</span>
      </div>`;
    }
    return `<a class="lab-door" href="${escapeHtml(url)}"${linkAttr(opts)}>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </a>`;
  }

  function renderHub(root, lab, week, opts) {
    unbindKeys();
    opts = Object.assign({ week }, opts || {});
    const sid = labSid(opts, week);
    const teacher = isTeacher(opts.role);
    const score = quizScore(sid, lab);
    const quizOk = isQuizComplete(sid, lab);
    const standOk = isStandComplete(sid, lab);
    const gated = quizIsGated(opts, lab);
    const standLocked = gated && !teacher && !quizOk;
    const tasksLocked = gated && !teacher && !quizOk;
    const title = (lab && lab.title) || (opts.kind === 'topic' ? String(week) : `Неделя ${week}`);
    const heading = opts.heading || (opts.kind === 'topic' ? title : `Неделя ${week}. ${title}`);
    const keys = ((lab && lab.tasks) || []).map((t) => t.key).filter(Boolean);
    const taskRange = keys.length > 1 ? `${keys[0]}…${keys[keys.length - 1].replace(/^LRN-/, '')}` : (keys[0] || 'Задания LRN');
    const hasStand = ((lab && lab.stand) || []).length > 0;
    const hasTasks = keys.length > 0;
    const quizText = gated
      ? `Все ${score.total} карточек. Порог 100 %.`
      : `Все ${score.total} карточек. Экзамена нет, проходить банк не обязательно.`;
    const rec = opts.recommended || [];
    const recHtml = rec.length
      ? `<h2>Курсы полки на эту неделю</h2>
        <p class="muted">Скелет рекомендует. Можно взять другой курс с <a href="${escapeHtml(catalogHref(opts))}"${linkAttr(opts)}>полки</a>.</p>
        <ul class="list">${rec.map((c) => `<li><a href="${escapeHtml(topicCourseHref(opts, c.slug))}"${linkAttr(opts)}>${escapeHtml(c.title)}</a><span class="badge">${escapeHtml(c.kindLabel || '')}</span></li>`).join('')}</ul>`
      : '';
    const home = opts.homeHref || '#/';
    const homeLabel = opts.homeLabel || '← Уроки';
    root.innerHTML = `<div class="lab-hub">
      <p class="lab-crumb"><a href="${escapeHtml(home)}"${linkAttr(opts)}>${escapeHtml(homeLabel)}</a>
        ${opts.roleHref && (teacherUnlocked || !getCapability()) ? ` · <a href="${escapeHtml(opts.roleHref)}"${linkAttr(opts)}>Сменить роль</a>` : ''}
        <span class="muted"> · ${teacher ? 'вид учителя' : 'вид учащегося'}</span></p>
      <h1>${escapeHtml(heading)}</h1>
      <p class="muted">${opts.kind === 'topic'
        ? 'Курс на полке. Тот же квиз, что у недели: слева карточки, справа одна. Учебный стенд недели этот банк не запирает.'
        : 'Неделя: материал, короткий квиз, стенд, задания. Большие курсы тем — на полке.'}</p>
      <p class="lab-progress-line">Квиз: <b>${score.n}/${score.total}</b>${quizOk && gated ? ' · сдан' : ''}
        ${hasStand && standOk ? ' · стенд сдан' : ''}</p>
      <div class="lab-doors">
        ${doorCard(opts, 'material', 'Материал', 'Учебник с нуля до hero и ссылки на официальные docs.')}
        ${doorCard(opts, 'quiz', 'Квиз', quizText, false)}
        ${hasStand ? doorCard(opts, 'stand', 'Стенд', 'Учебный терминал: подставить куски команд, увидеть вывод.', standLocked) : ''}
        ${hasTasks ? doorCard(opts, 'tasks', 'Задания', `${taskRange} — после квиза, не вместо него.`, tasksLocked) : ''}
      </div>
      ${recHtml}
    </div>`;
  }

  function setSolved(week, lab, id, chosen) {
    const st = loadState(week);
    const solved = solvedMap(st);
    const picked = chosenMap(st);
    solved[id] = true;
    if (chosen != null) picked[id] = chosen;
    saveState(week, {
      ...st,
      solved,
      chosen: picked,
      quizDone: (lab.quiz || []).every((q) => solved[q.id]),
    });
  }

  function sampleQuiz(items, n, sid) {
    const key = 'mvt.sample.' + sid;
    let ids = null;
    try { ids = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { ids = null; }
    if (!ids || !Array.isArray(ids) || ids.length !== n) {
      const copy = items.map((q) => q.id);
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      ids = copy.slice(0, n);
      try { sessionStorage.setItem(key, JSON.stringify(ids)); } catch { /* ignore */ }
    }
    const want = new Set(ids);
    return items.filter((q) => want.has(q.id));
  }

  function renderHints(host, hints, startOpen) {
    hintCount = startOpen ? hints.length : 0;
    const box = document.createElement('div');
    box.className = 'lab-hints';
    hints.forEach((text, i) => {
      const row = document.createElement('div');
      row.className = 'lab-hint' + (i < hintCount ? ' is-open' : '');
      row.innerHTML = i < hintCount
        ? `<p><b>Подсказка ${i + 1}.</b> ${escapeHtml(text)}</p>`
        : `<button type="button" class="lab-hint-btn" data-i="${i}">Открыть подсказку ${i + 1}</button>`;
      box.appendChild(row);
    });
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('.lab-hint-btn');
      if (!btn) return;
      const i = Number(btn.getAttribute('data-i'));
      if (i !== hintCount) return;
      hintCount += 1;
      const row = btn.parentElement;
      row.classList.add('is-open');
      row.innerHTML = `<p><b>Подсказка ${i + 1}.</b> ${escapeHtml(hints[i])}</p>`;
    });
    host.appendChild(box);
  }

  function renderQuiz(root, lab, week, opts) {
    unbindKeys();
    opts = Object.assign({ week }, opts || {});
    const sid = labSid(opts, week);
    const teacher = isTeacher(opts.role);
    const items = lab.quiz || [];
    const topics = lab.topics || [];
    let filter = opts.filter || '';
    const rand = Number(opts.sample) || 0;
    if (filter === 'all') filter = '';
    const showAll = opts.filter === 'all' || opts.filter === '*';
    if (!showAll && !filter && !rand && topics[0]) {
      filter = topics[0].id;
    }
    let visible = rand ? sampleQuiz(items, Math.min(rand, items.length), sid) : items;
    if (filter && !rand && !showAll) visible = items.filter((q) => q.topic === filter);
    if (showAll) {
      filter = '';
      visible = items;
    }
    let idx = Number(opts.qIndex);
    if (!Number.isFinite(idx) || idx < 1) idx = 1;
    if (idx > items.length) idx = items.length || 1;
    let q = items[idx - 1];
    if (visible.length && q && visible.indexOf(q) < 0) {
      q = visible[0];
      idx = items.indexOf(q) + 1;
    }
    const score = quizScore(sid, lab);
    const solved = solvedMap(loadState(sid));
    const chosen = chosenMap(loadState(sid));
    const doneHere = q ? Boolean(solved[q.id]) : false;
    const hubLabel = opts.kind === 'topic' ? '← Хаб курса' : `← Хаб недели ${week}`;

    const filters = [`<button type="button" class="lab-chip${showAll && !rand ? ' is-on' : ''}" data-topic="all" data-rand="">Все</button>`]
      .concat(topics.map((t) => `<button type="button" class="lab-chip${filter === t.id && !rand && !showAll ? ' is-on' : ''}" data-topic="${escapeHtml(t.id)}" data-rand="">${escapeHtml(t.label)}</button>`))
      .concat([`<button type="button" class="lab-chip${rand === 20 ? ' is-on' : ''}" data-topic="" data-rand="20">20 случайных</button>`])
      .join('');

    const list = visible.map((item, vi) => {
      const n = items.indexOf(item) + 1;
      const ok = solved[item.id];
      const on = n === idx ? ' is-on' : '';
      const mark = ok ? ' is-ok' : '';
      return `<a class="lab-q${on}${mark}" href="${escapeHtml(href(opts, 'quiz', { q: n, topic: showAll ? 'all' : filter, rand: rand || undefined }))}"${linkAttr(opts)}>
        <span class="lab-q-n">${vi + 1}</span>
        <span class="lab-q-t">${escapeHtml(item.title || item.id)}</span>
      </a>`;
    }).join('');

    root.innerHTML = `<div class="lab-app">
      <div class="lab-topbar">
        <div>
          <a href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)}>${escapeHtml(hubLabel)}</a>
          <h1>${escapeHtml(lab.title || 'Квиз')}</h1>
        </div>
        <div class="lab-score" aria-live="polite">${score.n}/${score.total}</div>
      </div>
      <div class="lab-filters">${filters}</div>
      <div class="lab-shell">
        <aside class="lab-sidebar" id="lab-sidebar">${list || '<p class="muted">Нет задач в этом фильтре.</p>'}</aside>
        <section class="lab-card" id="lab-card"></section>
      </div>
    </div>`;

    root.querySelectorAll('[data-topic]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const topic = btn.getAttribute('data-topic') || '';
        const r = btn.getAttribute('data-rand') || '';
        if (r === '20') {
          try { sessionStorage.removeItem('mvt.sample.' + sid); } catch { /* ignore */ }
          go(opts, href(opts, 'quiz', { q: 1, rand: 20 }));
          return;
        }
        const first = (topic && topic !== 'all') ? items.find((it) => it.topic === topic) : items[0];
        const n = first ? items.indexOf(first) + 1 : 1;
        go(opts, href(opts, 'quiz', { q: n, topic }));
      });
    });

    const card = root.querySelector('#lab-card');
    if (!q) {
      card.innerHTML = '<p>Нет вопросов.</p>';
      return;
    }

    const visIdx = visible.indexOf(q);
    const prev = visIdx > 0 ? items.indexOf(visible[visIdx - 1]) + 1 : 0;
    const next = visIdx >= 0 && visIdx < visible.length - 1 ? items.indexOf(visible[visIdx + 1]) + 1 : 0;

    function shownAnswer() {
      return q.answer || chosen[q.id] || '';
    }

    function paintCard(justSolved) {
      const known = doneHere || justSolved || teacher;
      const reveal = shownAnswer();
      const stem = q.type === 'fill'
        ? `<pre class="lab-stem">${escapeHtml(q.before || '')}<span class="lab-blank${known && reveal ? ' is-filled' : ''}">${known && reveal ? escapeHtml(reveal) : '?'}</span>${escapeHtml(q.after || '')}</pre>`
        : '';
      const path = q.clickPath && (known || teacher)
        ? `<p class="lab-clickpath"><b>Куда нажать:</b> ${escapeHtml(q.clickPath)}</p>`
        : (q.clickPath && !known ? '<p class="muted">Путь кликов откроется после верного ответа.</p>' : '');
      const teacherBlock = teacher
        ? `<div class="lab-teacher">
            <p class="lab-ok"><b>Ответ:</b> ${escapeHtml(q.answer || reveal)}</p>
            ${q.why ? `<p>${escapeHtml(q.why)}</p>` : ''}
            ${(q.patternSteps || []).map((s, i) => `<p><b>Как объяснять ${i + 1}.</b> ${escapeHtml(s)}</p>`).join('')}
          </div>`
        : '';
      card.innerHTML = `
        <p class="muted">${escapeHtml(topicLabel(lab, q.topic))} · карточка ${visIdx + 1} из ${visible.length}${q.type === 'click' ? ' · куда нажать' : ''}</p>
        <p class="lab-prompt">${escapeHtml(q.prompt)}</p>
        ${stem}
        ${path}
        <div class="lab-why" id="lab-why"></div>
        <div class="lab-nav">
          ${prev ? `<a class="lab-arrow" href="${escapeHtml(href(opts, 'quiz', { q: prev, topic: showAll ? 'all' : filter, rand: rand || undefined }))}"${linkAttr(opts)}>← Предыдущая</a>` : '<span></span>'}
          ${next ? `<a class="lab-arrow" href="${escapeHtml(href(opts, 'quiz', { q: next, topic: showAll ? 'all' : filter, rand: rand || undefined }))}"${linkAttr(opts)} id="lab-next">Следующая задача →</a>` : `<a class="lab-arrow" href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)}>К хабу →</a>`}
        </div>`;
      const why = card.querySelector('#lab-why');
      if (teacher) {
        why.innerHTML = teacherBlock;
        return;
      }
      if (known) {
        why.innerHTML = `<p class="lab-ok">Верно.</p>
          ${q.type === 'fill' ? `<pre class="lab-stem is-done">${escapeHtml((q.before || '') + reveal + (q.after || ''))}</pre>` : `<p><b>${escapeHtml(reveal)}</b></p>`}
          <p>${escapeHtml(q.why || '')}</p>`;
        return;
      }
      const optsBox = optionButtons(q.options, (opt, btn) => {
        matchesAnswer(q, opt).then((ok) => {
          if (!ok) {
            btn.classList.add('is-bad');
            return;
          }
          [...card.querySelectorAll('.lab-opt')].forEach((b) => { b.disabled = true; });
          btn.classList.add('is-ok');
          chosen[q.id] = opt;
          setSolved(sid, lab, q.id, opt);
        const scoreEl = root.querySelector('.lab-score');
        const sc = quizScore(sid, lab);
        if (scoreEl) scoreEl.textContent = `${sc.n}/${sc.total}`;
        const expectedHref = href(opts, 'quiz', { q: idx, topic: showAll ? 'all' : filter, rand: rand || undefined });
        const sideItem = [...root.querySelectorAll('.lab-q')].find((a) => a.getAttribute('href') === expectedHref)
          || [...root.querySelectorAll('.lab-q')].find((a) => a.classList.contains('is-on'));
        if (sideItem) sideItem.classList.add('is-ok');
          paintCard(true);
        });
      });
      card.insertBefore(optsBox, why);
      renderHints(card, q.hints || [], false);
      card.appendChild(why);
      const nav = card.querySelector('.lab-nav');
      if (nav) card.appendChild(nav);
    }

    paintCard(false);

    bindKeys((e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft' && prev) {
        e.preventDefault();
        go(opts, href(opts, 'quiz', { q: prev, topic: showAll ? 'all' : filter, rand: rand || undefined }));
      } else if (e.key === 'ArrowRight' && next) {
        e.preventDefault();
        go(opts, href(opts, 'quiz', { q: next, topic: showAll ? 'all' : filter, rand: rand || undefined }));
      }
    });
  }

  function renderStand(root, lab, week, opts) {
    unbindKeys();
    opts = Object.assign({ week }, opts || {});
    const sid = labSid(opts, week);
    const teacher = isTeacher(opts.role);
    const gated = quizIsGated(opts, lab);
    const quizOk = isQuizComplete(sid, lab);
    if (gated && !teacher && !quizOk) {
      const sc = quizScore(sid, lab);
      root.innerHTML = `<div class="lab-locked-screen">
        <p><a href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)}>← Хаб</a></p>
        <h1>Стенд закрыт</h1>
        <p>Сначала квиз 100 %. Сейчас ${sc.n} из ${sc.total}.</p>
        <p><a class="lab-door" href="${escapeHtml(href(opts, 'quiz'))}"${linkAttr(opts)}><strong>Открыть квиз</strong></a></p>
      </div>`;
      return;
    }
    const items = lab.stand || [];
    const st = loadState(sid);
    let i = Math.min(st.standIndex || 0, items.length);
    const box = document.createElement('div');
    box.className = 'lab-app';
    root.innerHTML = '';
    root.appendChild(box);

    function paint() {
      const state = loadState(sid);
      i = Math.min(state.standIndex || 0, items.length);
      if (state.standDone || i >= items.length) {
        box.innerHTML = `<div class="lab-topbar"><div><a href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)}>← Хаб</a>
          <h1>Стенд</h1></div><div class="lab-score">${items.length}/${items.length}</div></div>
          <section class="lab-card">
            <p class="lab-ok">Стенд пройден. Команды на вашу машину отсюда не уходили.</p>
            <p>Дальше — практика у себя (раздел в материале) и задания LRN после квиза.</p>
            <p><a href="${escapeHtml(href(opts, 'material'))}"${linkAttr(opts)}>Материал: практика на машине</a>
              · <a href="${escapeHtml(href(opts, 'tasks'))}"${linkAttr(opts)}>Задания</a></p>
          </section>`;
        return;
      }
      const step = items[i];
      const side = items.map((s, n) => `<div class="lab-q${n === i ? ' is-on' : ''}${n < i ? ' is-ok' : ''}"><span class="lab-q-n">${n + 1}</span><span class="lab-q-t">${escapeHtml(s.title)}</span></div>`).join('');
      box.innerHTML = `<div class="lab-topbar"><div><a href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)}>← Хаб</a>
        <h1>Стенд на сайте</h1></div><div class="lab-score">${i}/${items.length}</div></div>
        <div class="lab-shell">
          <aside class="lab-sidebar">${side}</aside>
          <section class="lab-card">
            <p class="muted">Шаг ${i + 1} из ${items.length}. Учебный терминал, не ваш компьютер.${teacher ? ' Вид учителя: те же шаги.' : ''}</p>
            <h2>${escapeHtml(step.title)}</h2>
            <p class="lab-prompt">${escapeHtml(step.prompt)}</p>
            <div class="lab-lines"></div>
            <pre class="lab-out" hidden></pre>
            <p hidden><button type="button" class="primary" id="lab-next-s">Дальше</button></p>
          </section>
        </div>`;
      const linesBox = box.querySelector('.lab-lines');
      const picked = step.lines.map(() => null);
      const check = () => {
        Promise.all(step.lines.map((line, idx) => {
          if (picked[idx] == null) return Promise.resolve(false);
          return matchesAnswer(line, picked[idx]);
        })).then((oks) => {
          if (!oks.every(Boolean)) return;
          const out = box.querySelector('.lab-out');
          out.hidden = false;
          out.textContent = step.output || '';
          box.querySelector('#lab-next-s').parentElement.hidden = false;
        });
      };
      step.lines.forEach((line, idx) => {
        const row = document.createElement('div');
        row.className = 'lab-line';
        const show = teacher && line.answer;
        row.innerHTML = `<pre class="lab-stem"><span>${escapeHtml(line.prefix)}</span><span class="lab-blank${show ? ' is-filled' : ''}" data-i="${idx}">${show ? escapeHtml(line.answer) : '?'}</span></pre>`;
        const blank = row.querySelector('.lab-blank');
        if (teacher) {
          picked[idx] = line.answer;
          const note = document.createElement('p');
          note.className = 'muted';
          note.textContent = 'Ответ показан. Учащийся выбирает из трёх кнопок.';
          row.appendChild(note);
          linesBox.appendChild(row);
          return;
        }
        const optsBtns = optionButtons(line.options, (opt, btn) => {
          matchesAnswer(line, opt).then((ok) => {
            if (!ok) {
              btn.classList.add('is-bad');
              return;
            }
            [...row.querySelectorAll('.lab-opt')].forEach((b) => { b.disabled = true; });
            btn.classList.add('is-ok');
            blank.textContent = opt;
            blank.classList.add('is-filled');
            picked[idx] = opt;
            check();
          });
        });
        row.appendChild(optsBtns);
        linesBox.appendChild(row);
      });
      if (teacher) check();
      box.querySelector('#lab-next-s').onclick = () => {
        const next = i + 1;
        const done = next >= items.length;
        saveState(sid, { ...loadState(sid), standIndex: next, standDone: done });
        paint();
      };
    }
    paint();
  }

  function renderTasks(root, lab, week, opts) {
    unbindKeys();
    opts = Object.assign({ week }, opts || {});
    const sid = labSid(opts, week);
    const teacher = isTeacher(opts.role);
    const gated = quizIsGated(opts, lab);
    const quizOk = isQuizComplete(sid, lab);
    if (gated && !teacher && !quizOk) {
      const sc = quizScore(sid, lab);
      root.innerHTML = `<div class="lab-locked-screen">
        <p><a href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)}>← Хаб</a></p>
        <h1>Задания после квиза</h1>
        <p>LRN-101…106 открываются, когда квиз сдан (сейчас ${sc.n}/${sc.total}). Не начинайте тикеты вместо карточек.</p>
        <p><a class="lab-door" href="${escapeHtml(href(opts, 'quiz'))}"${linkAttr(opts)}><strong>Открыть квиз</strong></a></p>
      </div>`;
      return;
    }
    const tasks = lab.tasks || [];
    root.innerHTML = `<div class="lab-hub">
      <p class="lab-crumb"><a href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)}>← Хаб недели ${escapeHtml(week)}</a></p>
      <h1>Задания LRN</h1>
      <p class="muted">После квиза и стенда на сайте. Полные карточки — в docs/tasks/w01/.</p>
      <ul class="lab-tasks">${tasks.map((t) => `<li>
        <b>${escapeHtml(t.key)}</b> ${escapeHtml(t.title)}
        <span class="muted">${escapeHtml(t.note || 'после квиза')}</span>
      </li>`).join('')}</ul>
      ${teacher ? '<p class="lab-teacher">Учитель: оценка за Git/SSH/стенд — до husky и Jira. Не принимайте PR, если квиз не 100 %.</p>' : ''}
    </div>`;
  }

  function findH2(article, pattern) {
    return [...article.querySelectorAll('h2')].find((h) => pattern.test((h.textContent || '').trim()));
  }

  function gatePractice(article, unlocked) {
    const h = findH2(article, /^Практика на своей машине/);
    if (!h) return;
    let wrap = article.querySelector('.lab-practice');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'lab-practice';
      h.parentNode.insertBefore(wrap, h);
      wrap.appendChild(h);
      let n = wrap.nextSibling;
      while (n && !(n.nodeType === 1 && n.tagName === 'H2')) {
        const next = n.nextSibling;
        wrap.appendChild(n);
        n = next;
      }
    }
    wrap.classList.toggle('is-locked', !unlocked);
    let cover = wrap.querySelector('.lab-lock');
    if (!unlocked) {
      if (!cover) {
        cover = document.createElement('div');
        cover.className = 'lab-lock';
        cover.innerHTML = '<p><b>Практика на машине закрыта.</b> Сначала квиз 100 % и стенд на этом сайте.</p>';
        wrap.insertBefore(cover, wrap.firstChild);
      }
    } else if (cover) {
      cover.remove();
    }
  }

  function stripLegacySections(article) {
    ['/^Квиз/', '/^Стенд/'].forEach(() => {});
    [...article.querySelectorAll('h2')].forEach((h) => {
      const t = (h.textContent || '').trim();
      if (/^Квиз/.test(t) || /^Стенд/.test(t)) {
        let n = h.nextSibling;
        while (n && !(n.nodeType === 1 && n.tagName === 'H2')) {
          const next = n.nextSibling;
          n.parentNode.removeChild(n);
          n = next;
        }
        h.remove();
      }
    });
  }

  function prepareMaterial(article, lab, week, opts) {
    if (!article) return;
    stripLegacySections(article);
    const teacher = isTeacher(opts && opts.role);
    gatePractice(article, teacher || !quizIsGated(opts, lab) || isComplete(labSid(opts, week), lab));
    const links = document.createElement('p');
    links.className = 'lab-jump';
    links.innerHTML = `<a href="${escapeHtml(href(Object.assign({ week }, opts), 'quiz'))}"${linkAttr(opts || {})}>Открыть квиз</a>
      · <a href="${escapeHtml(href(Object.assign({ week }, opts), 'stand'))}"${linkAttr(opts || {})}>Стенд</a>
      · <a href="${escapeHtml(href(Object.assign({ week }, opts), 'tasks'))}"${linkAttr(opts || {})}>Задания</a>
      · <a href="${escapeHtml(href(Object.assign({ week }, opts), 'hub'))}"${linkAttr(opts || {})}>${opts && opts.kind === 'topic' ? 'Хаб курса' : 'Хаб недели'}</a>`;
    article.insertBefore(links, article.firstChild);
  }

  root.MvtLab = {
    ROLE_KEY,
    CAP_KEY,
    getRole,
    setRole,
    getCapability,
    setCapability,
    setTeacherUnlocked,
    isTeacher,
    isComplete,
    isQuizComplete,
    isStandComplete,
    quizScore,
    loadState,
    saveState,
    renderRole,
    renderHub,
    renderQuiz,
    renderStand,
    renderTasks,
    prepareMaterial,
    gatePractice,
    escapeHtml,
    labSid,
    quizIsGated,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
