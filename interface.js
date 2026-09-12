export function initInterface() {
  const $ = id => document.getElementById(id), aside = document.querySelector('aside');
  const tour = aside.querySelector('.tour-panel'), family = aside.querySelector('.family');
  const intro = document.createElement('section');intro.className = 'room-summary';
  while (aside.firstElementChild && aside.firstElementChild !== tour) intro.append(aside.firstElementChild);
  const panes = [document.createElement('div'), document.createElement('div'), document.createElement('div')];
  panes[0].append(tour, intro);panes[1].append(family);
  while (aside.firstElementChild) panes[2].append(aside.firstElementChild);
  const tabs = document.createElement('div');tabs.className = 'control-tabs';tabs.setAttribute('role', 'tablist');tabs.setAttribute('aria-label', '浏览与互动');
  const buttons = ['看房带看', '家人生活', '门灯设置'].map((name, i) => {
    const b = document.createElement('button');b.id = 'control-tab-' + i;b.textContent = name;b.setAttribute('role', 'tab');b.setAttribute('aria-controls', 'control-pane-' + i);
    panes[i].id = 'control-pane-' + i;panes[i].className = 'control-pane';panes[i].setAttribute('role', 'tabpanel');panes[i].setAttribute('aria-labelledby', b.id);
    b.onclick = () => selectPanel(i);b.onkeydown = e => { const next = { ArrowRight: (i + 1) % 3, ArrowLeft: (i + 2) % 3, Home: 0, End: 2 }[e.key];if (next !== undefined) { e.preventDefault();selectPanel(next);buttons[next].focus(); } };
    tabs.append(b);return b;
  });
  aside.append(tabs, ...panes);
  function selectPanel(index) { panes.forEach((p, i) => { p.hidden = i !== index;buttons[i].setAttribute('aria-selected', String(i === index));buttons[i].tabIndex = i === index ? 0 : -1; });aside.scrollTop = 0; }
  selectPanel(0);
  tour.querySelector('.device-help').textContent = '跟随小林和三位访客参观三层空间，听介绍、看演示。约 12 分钟，也可加快或选择站点。';
  family.querySelector('.section-heading span').id = 'family-state';
  const hud = document.createElement('section');hud.id = 'tour-hud';hud.className = 'tour-hud';hud.hidden = true;hud.setAttribute('aria-label', '当前带看');
  hud.innerHTML = '<div class="tour-hud-heading"><strong id="tour-hud-title"></strong><span id="tour-hud-state"></span></div><div class="tour-hud-actions"><button id="tour-hud-pause">暂停</button><button id="tour-hud-next">下一站</button><button id="tour-hud-follow" hidden>恢复跟随</button><button id="tour-hud-details">查看讲解</button></div>';
  $('room-strip').before(hud);
  $('tour-hud-pause').onclick = () => $('tour-pause').click();$('tour-hud-next').onclick = () => $('tour-next').click();
  $('tour-hud-follow').onclick = () => { $('tour-follow').checked = true; };
  $('tour-hud-details').onclick = () => { selectPanel(0);$('tour-title').setAttribute('tabindex', '-1');$('tour-title').focus({ preventScroll: true }); };
  document.addEventListener('click', e => {
    if (document.body.classList.contains('tour-active') && e.target.closest('[data-floor],[data-mode],[data-room],.room-target,#inside,#reset,#zoom-in,#zoom-out,#exterior-view')) $('tour-follow').checked = false;
  }, true);
  return {
    selectPanel,
    tourState(t) {
      document.body.classList.toggle('tour-active', t.active);hud.hidden = !t.active || $('stage').hidden;
      if (!t.active) return;
      const status = t.paused ? '已暂停' : $('stage').hidden ? '效果图中暂停' : t.phase === 'presenting' ? '介绍中' : t.blockedNotice ? '等待通道' : '前往中';
      $('tour-hud-title').textContent = `${t.index + 1} / ${t.definition.stops.length} · ${t.stop.title}`;
      $('tour-hud-state').textContent = status;$('tour-hud-pause').textContent = t.paused ? '继续' : '暂停';$('tour-hud-pause').setAttribute('aria-pressed', String(t.paused));
      $('tour-hud-next').textContent = t.index === t.definition.stops.length - 1 ? '完成带看' : '下一站';
      $('tour-hud-follow').hidden = $('tour-follow').checked;
      $('tour-prev').disabled = t.index === 0;
      $('tour-status').textContent = `${status} · ${t.index + 1} / ${t.definition.stops.length} 站${!$('tour-follow').checked ? ' · 自由视角，可恢复跟随' : ''}`;
    }
  };
}
