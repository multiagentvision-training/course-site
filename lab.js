/* SPEEDBOAT-style lab: role doors, week hub, full-screen quiz (sidebar + one card), stand gate. */
(function (root) {
  const ROLE_KEY = 'mvt.role';
  let hintCount = 0;
  let keyHandler = null;

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

  function getRole() {
    const r = localStorage.getItem(ROLE_KEY);
    return r === 'teacher' || r === 'student' ? r : '';
  }

  function setRole(role) {
    if (role === 'teacher' || role === 'student') localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
  }

  function isTeacher(role) {
    return (role || getRole()) === 'teacher';
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

  function href(opts, screen, extra) {
    if (opts && typeof opts.href === 'function') return opts.href(screen, extra || {});
    const week = opts && opts.week;
    if (screen === 'hub') return `#/w/${week}`;
    if (screen === 'role') return '#/role';
    if (screen === 'quiz') {
      const q = extra && extra.q;
      const topic = extra && extra.topic;
      let u = q ? `#/w/${week}/quiz/${q}` : `#/w/${week}/quiz`;
      if (topic) u += `?t=${encodeURIComponent(topic)}`;
      return u;
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
    root.innerHTML = `<div class="lab-role">
      <h1>Кто вы</h1>
      <p class="muted">Один формат, разное содержимое. Учащийся решает карточки. Учитель видит ответы, путь кликов и как объяснять.</p>
      <div class="lab-doors">
        <a class="lab-door" href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)} data-role="student">
          <strong>Учащийся</strong>
          <span>Квиз, стенд и задания. Стенд закрыт, пока квиз не 100 %.</span>
        </a>
        <a class="lab-door" href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)} data-role="teacher">
          <strong>Учитель</strong>
          <span>Те же экраны плюс ответы, «куда нажать» и типичные ошибки.</span>
        </a>
      </div>
    </div>`;
    root.querySelectorAll('[data-role]').forEach((a) => {
      a.addEventListener('click', (e) => {
        setRole(a.getAttribute('data-role'));
        if (opts.onPick) {
          e.preventDefault();
          opts.onPick(a.getAttribute('data-role'));
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
    const teacher = isTeacher(opts.role);
    const score = quizScore(week, lab);
    const quizOk = isQuizComplete(week, lab);
    const standOk = isStandComplete(week, lab);
    const standLocked = !teacher && !quizOk;
    const tasksLocked = !teacher && !quizOk;
    const title = (lab && lab.title) || `Неделя ${week}`;
    const keys = ((lab && lab.tasks) || []).map((t) => t.key).filter(Boolean);
    const taskRange = keys.length > 1 ? `${keys[0]}…${keys[keys.length - 1].replace(/^LRN-/, '')}` : (keys[0] || 'Задания LRN');
    root.innerHTML = `<div class="lab-hub">
      <p class="lab-crumb"><a href="${escapeHtml(opts.homeHref || '#/')}"${linkAttr(opts)}>← Уроки</a>
        ${opts.roleHref ? ` · <a href="${escapeHtml(opts.roleHref)}"${linkAttr(opts)}>Сменить роль</a>` : ''}
        <span class="muted"> · ${teacher ? 'вид учителя' : 'вид учащегося'}</span></p>
      <h1>Неделя ${week}. ${escapeHtml(title)}</h1>
      <p class="muted">Четыре экрана. Квиз — отдельная комната со списком всех задач, не блок внутри текста.</p>
      <p class="lab-progress-line">Квиз: <b>${score.n}/${score.total}</b>${quizOk ? ' · сдан' : ''}
        ${standOk ? ' · стенд сдан' : ''}</p>
      <div class="lab-doors">
        ${doorCard(opts, 'material', 'Материал', 'Словарь, источники, порядок настройки. Без квиза внутри текста.')}
        ${doorCard(opts, 'quiz', 'Квиз', `Все ${score.total} карточек. Порог 100 %.`, false)}
        ${doorCard(opts, 'stand', 'Стенд', 'Учебный терминал: подставить куски команд, увидеть вывод.', standLocked)}
        ${doorCard(opts, 'tasks', 'Задания', `${taskRange} — после квиза, не вместо него.`, tasksLocked)}
      </div>
    </div>`;
  }

  function setSolved(week, lab, id) {
    const st = loadState(week);
    const solved = solvedMap(st);
    solved[id] = true;
    saveState(week, {
      ...st,
      solved,
      quizDone: (lab.quiz || []).every((q) => solved[q.id]),
    });
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
    const teacher = isTeacher(opts.role);
    const items = lab.quiz || [];
    const topics = lab.topics || [];
    const filter = opts.filter || '';
    const visible = filter ? items.filter((q) => q.topic === filter) : items;
    let idx = Number(opts.qIndex);
    if (!Number.isFinite(idx) || idx < 1) idx = 1;
    if (idx > items.length) idx = items.length || 1;
    const q = items[idx - 1];
    const score = quizScore(week, lab);
    const solved = solvedMap(loadState(week));
    const doneHere = q ? Boolean(solved[q.id]) : false;

    const filters = [`<button type="button" class="lab-chip${filter ? '' : ' is-on'}" data-topic="">Все</button>`]
      .concat(topics.map((t) => `<button type="button" class="lab-chip${filter === t.id ? ' is-on' : ''}" data-topic="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>`))
      .join('');

    const list = visible.map((item) => {
      const n = items.indexOf(item) + 1;
      const ok = solved[item.id];
      const on = n === idx ? ' is-on' : '';
      const mark = ok ? ' is-ok' : '';
      return `<a class="lab-q${on}${mark}" href="${escapeHtml(href(opts, 'quiz', { q: n, topic: filter }))}"${linkAttr(opts)}>
        <span class="lab-q-n">${n}</span>
        <span class="lab-q-t">${escapeHtml(item.title || item.id)}</span>
      </a>`;
    }).join('');

    root.innerHTML = `<div class="lab-app">
      <div class="lab-topbar">
        <div>
          <a href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)}>← Хаб недели ${week}</a>
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
        const first = topic ? items.find((it) => it.topic === topic) : items[0];
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

    function paintCard(justSolved) {
      const known = doneHere || justSolved || teacher;
      const stem = q.type === 'fill'
        ? `<pre class="lab-stem">${escapeHtml(q.before || '')}<span class="lab-blank${known ? ' is-filled' : ''}">${known ? escapeHtml(q.answer) : '?'}</span>${escapeHtml(q.after || '')}</pre>`
        : '';
      const path = q.clickPath && (known || teacher)
        ? `<p class="lab-clickpath"><b>Куда нажать:</b> ${escapeHtml(q.clickPath)}</p>`
        : (q.clickPath && !known ? '<p class="muted">Путь кликов откроется после верного ответа.</p>' : '');
      const teacherBlock = teacher
        ? `<div class="lab-teacher">
            <p class="lab-ok"><b>Ответ:</b> ${escapeHtml(q.answer)}</p>
            ${q.why ? `<p>${escapeHtml(q.why)}</p>` : ''}
            ${(q.patternSteps || []).map((s, i) => `<p><b>Как объяснять ${i + 1}.</b> ${escapeHtml(s)}</p>`).join('')}
          </div>`
        : '';
      card.innerHTML = `
        <p class="muted">${topicLabel(lab, q.topic)} · карточка ${idx} из ${items.length}${q.type === 'click' ? ' · куда нажать' : ''}</p>
        <p class="lab-prompt">${escapeHtml(q.prompt)}</p>
        ${stem}
        ${path}
        <div class="lab-why" id="lab-why"></div>
        <div class="lab-nav">
          ${prev ? `<a class="lab-arrow" href="${escapeHtml(href(opts, 'quiz', { q: prev, topic: filter }))}"${linkAttr(opts)}>← Предыдущая</a>` : '<span></span>'}
          ${next ? `<a class="lab-arrow" href="${escapeHtml(href(opts, 'quiz', { q: next, topic: filter }))}"${linkAttr(opts)}" id="lab-next">Следующая задача →</a>` : `<a class="lab-arrow" href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)}>К хабу →</a>`}
        </div>`;
      const why = card.querySelector('#lab-why');
      if (teacher) {
        why.innerHTML = teacherBlock;
        return;
      }
      if (known) {
        why.innerHTML = `<p class="lab-ok">Верно.</p>
          ${q.type === 'fill' ? `<pre class="lab-stem is-done">${escapeHtml((q.before || '') + q.answer + (q.after || ''))}</pre>` : `<p><b>${escapeHtml(q.answer)}</b></p>`}
          <p>${escapeHtml(q.why || '')}</p>`;
        return;
      }
      const optsBox = optionButtons(q.options, (opt, btn) => {
        if (opt !== q.answer) {
          btn.classList.add('is-bad');
          return;
        }
        [...card.querySelectorAll('.lab-opt')].forEach((b) => { b.disabled = true; });
        btn.classList.add('is-ok');
        setSolved(week, lab, q.id);
        const scoreEl = root.querySelector('.lab-score');
        const sc = quizScore(week, lab);
        if (scoreEl) scoreEl.textContent = `${sc.n}/${sc.total}`;
        const sideItem = root.querySelector(`.lab-q[href="${href(opts, 'quiz', { q: idx, topic: filter })}"]`)
          || [...root.querySelectorAll('.lab-q')].find((a) => a.classList.contains('is-on'));
        if (sideItem) sideItem.classList.add('is-ok');
        paintCard(true);
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
        go(opts, href(opts, 'quiz', { q: prev, topic: filter }));
      } else if (e.key === 'ArrowRight' && next) {
        e.preventDefault();
        go(opts, href(opts, 'quiz', { q: next, topic: filter }));
      }
    });
  }

  function renderStand(root, lab, week, opts) {
    unbindKeys();
    opts = Object.assign({ week }, opts || {});
    const teacher = isTeacher(opts.role);
    const quizOk = isQuizComplete(week, lab);
    if (!teacher && !quizOk) {
      const sc = quizScore(week, lab);
      root.innerHTML = `<div class="lab-locked-screen">
        <p><a href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)}>← Хаб</a></p>
        <h1>Стенд закрыт</h1>
        <p>Сначала квиз 100 %. Сейчас ${sc.n} из ${sc.total}.</p>
        <p><a class="lab-door" href="${escapeHtml(href(opts, 'quiz'))}"${linkAttr(opts)}><strong>Открыть квиз</strong></a></p>
      </div>`;
      return;
    }
    const items = lab.stand || [];
    const st = loadState(week);
    let i = Math.min(st.standIndex || 0, items.length);
    const box = document.createElement('div');
    box.className = 'lab-app';
    root.innerHTML = '';
    root.appendChild(box);

    function paint() {
      const state = loadState(week);
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
        if (!step.lines.every((line, idx) => picked[idx] === line.answer)) return;
        const out = box.querySelector('.lab-out');
        out.hidden = false;
        out.textContent = step.output || '';
        box.querySelector('#lab-next-s').parentElement.hidden = false;
      };
      step.lines.forEach((line, idx) => {
        const row = document.createElement('div');
        row.className = 'lab-line';
        const show = teacher;
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
          if (opt !== line.answer) {
            btn.classList.add('is-bad');
            return;
          }
          [...row.querySelectorAll('.lab-opt')].forEach((b) => { b.disabled = true; });
          btn.classList.add('is-ok');
          blank.textContent = line.answer;
          blank.classList.add('is-filled');
          picked[idx] = opt;
          check();
        });
        row.appendChild(optsBtns);
        linesBox.appendChild(row);
      });
      if (teacher) check();
      box.querySelector('#lab-next-s').onclick = () => {
        const next = i + 1;
        const done = next >= items.length;
        saveState(week, { ...loadState(week), standIndex: next, standDone: done });
        paint();
      };
    }
    paint();
  }

  function renderTasks(root, lab, week, opts) {
    unbindKeys();
    opts = Object.assign({ week }, opts || {});
    const teacher = isTeacher(opts.role);
    const quizOk = isQuizComplete(week, lab);
    if (!teacher && !quizOk) {
      const sc = quizScore(week, lab);
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
      <p class="lab-crumb"><a href="${escapeHtml(href(opts, 'hub'))}"${linkAttr(opts)}>← Хаб недели ${week}</a></p>
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
    gatePractice(article, teacher || isComplete(week, lab));
    const links = document.createElement('p');
    links.className = 'lab-jump';
    links.innerHTML = `<a href="${escapeHtml(href(Object.assign({ week }, opts), 'quiz'))}"${linkAttr(opts || {})}>Открыть квиз</a>
      · <a href="${escapeHtml(href(Object.assign({ week }, opts), 'stand'))}"${linkAttr(opts || {})}>Стенд</a>
      · <a href="${escapeHtml(href(Object.assign({ week }, opts), 'tasks'))}"${linkAttr(opts || {})}>Задания</a>
      · <a href="${escapeHtml(href(Object.assign({ week }, opts), 'hub'))}"${linkAttr(opts || {})}>Хаб недели</a>`;
    article.insertBefore(links, article.firstChild);
  }

  root.MvtLab = {
    ROLE_KEY,
    getRole,
    setRole,
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
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
