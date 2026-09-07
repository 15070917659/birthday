/* =========================================================
 * 生日时光纪念册 · 主逻辑（流式加载版）
 * - 数据加载后立即渲染所有页面（无图占位）
 * - 图片按顺序逐张探测+加载，加载完更新对应卡片
 * - 用户可立即看到封面并开始翻页，无需等待全部图片
 * ========================================================= */

const CONFIG = {
  imagesDir: '图片',
  imageExt: '.jpg',
  bgFallback: '图片/背景图.jpg',
  dataUrl: 'data/pages.json',
  maxProbe: 99,
  loadConcurrency: 2,        // 同时加载的图片数
  probeTimeoutMs: 8000       // 单张图探测超时
};

/* ---------- 工具：图片预加载（带超时） ---------- */
function preloadImage(src, timeoutMs = CONFIG.probeTimeoutMs){
  return new Promise(resolve => {
    const img = new Image();
    let done = false;
    const timer = setTimeout(() => {
      if(done) return;
      done = true;
      resolve({ ok: false, w: 0, h: 0, timeout: true });
    }, timeoutMs);
    img.onload = () => {
      if(done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      if(done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, w: 0, h: 0 });
    };
    img.src = src;
  });
}

/* 简化比例 */
function simplifyRatio(w, h){
  if(!w || !h) return '4/3';
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const g = gcd(w, h);
  return `${w/g}/${h/g}`;
}

/* ---------- 加载数据 ---------- */
async function loadData(){
  if(typeof window.PAGES_DATA === 'object' && window.PAGES_DATA){
    return window.PAGES_DATA;
  }
  try{
    const res = await fetch(CONFIG.dataUrl, { cache: 'no-cache' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }catch(err){
    console.error('[数据加载失败]', err);
    return null;
  }
}

/* ---------- 渲染：封面 ---------- */
function renderCover(data){
  const c = data.cover || {};
  return `
    <div class="cover">
      <div class="badge">${c.badge || 'HAPPY BIRTHDAY'}</div>
      <h1>${c.title || '生日快乐'}</h1>
      <div class="name">致 · <span>${c.name || ''}</span></div>
      <div class="subtitle">${c.subtitle || ''}</div>
      <p class="wish">${c.wish || ''}</p>
    </div>`;
}

/* ---------- 渲染：时间线卡片（占位状态） ---------- */
function renderTimelinePagePlaceholder(item, index){
  const time = item.time || '';
  const title = item.title || '';
  const desc  = item.desc || '';
  return `
    <span class="time-tag">${time}</span>
    <div class="card-3d" role="button" tabindex="0" aria-label="点击翻开 ${title}" data-card-index="${index}">
      <div class="card-inner">
        <div class="card-face card-front card-loading" style="background: linear-gradient(135deg,#5b2a4f,#2a0f24); display:flex; align-items:center; justify-content:center;">
          <div class="loader">
            <div class="loader-dot"></div>
            <div class="loader-dot"></div>
            <div class="loader-dot"></div>
          </div>
          <span class="loader-text">图片加载中…</span>
        </div>
        <div class="card-face card-back">
          <h3>${title}</h3>
          <p>${desc}</p>
          <div class="heart">♥ ♥ ♥</div>
        </div>
      </div>
    </div>`;
}

/* ---------- 渲染：无图卡片 ---------- */
function renderNoImageCard(item){
  const time = item.time || '';
  const title = item.title || '';
  const desc  = item.desc || '';
  return `
    <span class="time-tag">${time}</span>
    <div class="card-3d" role="button" tabindex="0" aria-label="点击翻开 ${title}">
      <div class="card-inner">
        <div class="card-face card-front" style="background: linear-gradient(135deg,#5b2a4f,#2a0f24); display:flex; align-items:center; justify-content:center;">
          <div style="color:rgba(255,231,241,.7); font-size:13px; letter-spacing:2px;">未配置图片</div>
        </div>
        <div class="card-face card-back">
          <h3>${title}</h3>
          <p>${desc}</p>
          <div class="heart">♥ ♥ ♥</div>
        </div>
      </div>
    </div>`;
}

/* ---------- 渲染：结尾 ---------- */
function renderEnding(data){
  const e = data.ending || {};
  return `
    <div class="ending">
      <div class="end-title">${e.title || ''}</div>
      <div class="end-name">${e.name || ''}</div>
      <p class="end-text">${e.text || ''}</p>
      <div class="cake">${e.emoji || '🎂'}</div>
    </div>`;
}

/* ---------- 翻页器类 ---------- */
class Paginator{
  constructor(){
    this.current = 0;
    this.pageEls = [...document.querySelectorAll('.page')];
    this.dots    = [...document.querySelectorAll('.pager .dot')];
    this.total   = this.pageEls.length;
    this.btnPrev = document.getElementById('btnPrev');
    this.btnNext = document.getElementById('btnNext');
    this.swipeHint = document.getElementById('swipeHint');
    this.progress  = document.getElementById('progress');
    this.bind();
    this.render();
  }
  goTo(i){
    if(i < 0 || i >= this.total || i === this.current) return;
    this.current = i;
    this.render();
  }
  next(){ this.goTo(this.current + 1); }
  prev(){ this.goTo(this.current - 1); }
  render(){
    this.pageEls.forEach((el, i) => {
      el.classList.remove('active', 'prev', 'next');
      if(i === this.current)        el.classList.add('active');
      else if(i < this.current)     el.classList.add('prev');
      else                          el.classList.add('next');
    });
    this.dots.forEach((d, i) => d.classList.toggle('active', i === this.current));
    this.btnPrev.classList.toggle('hidden', this.current === 0);
    this.btnNext.classList.toggle('hidden', this.current === this.total - 1);
    this.swipeHint.style.opacity = (this.current === 0 || this.current === this.total - 1) ? '.85' : '0';
    this.progress.style.width = ((this.current + 1) / this.total * 100) + '%';
  }
  bind(){
    this.btnNext.addEventListener('click', () => this.next());
    this.btnPrev.addEventListener('click', () => this.prev());
    document.addEventListener('keydown', e => {
      if(e.key === 'ArrowRight' || e.key === ' ') this.next();
      else if(e.key === 'ArrowLeft') this.prev();
    });
    const container = document.getElementById('pages');
    let startX = 0, startY = 0, swiping = false;
    container.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      swiping = true;
    }, { passive: true });
    container.addEventListener('touchend', e => {
      if(!swiping) return;
      swiping = false;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if(Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)){
        if(dx < 0) this.next(); else this.prev();
      }
    }, { passive: true });
    let down = false, mx = 0;
    container.addEventListener('mousedown', e => { down = true; mx = e.clientX; });
    container.addEventListener('mouseup', e => {
      if(!down) return;
      down = false;
      const dx = e.clientX - mx;
      if(Math.abs(dx) > 80){ if(dx < 0) this.next(); else this.prev(); }
    });
  }
  // 动态更新页码（流式加载后会增加页面）
  refresh(){
    this.pageEls = [...document.querySelectorAll('.page')];
    this.dots    = [...document.querySelectorAll('.pager .dot')];
    this.total   = this.pageEls.length;
    this.render();
  }
}

/* ---------- 卡片翻转绑定 ---------- */
function bindCardFlip(){
  document.querySelectorAll('.card-3d').forEach(card => {
    if(card.dataset.bound) return;
    card.dataset.bound = '1';
    const toggle = e => {
      e.stopPropagation();
      card.classList.toggle('flipped');
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle(e); }
    });
  });
}

/* ---------- 音乐控制器 ---------- */
class MusicController{
  constructor(src){
    this.audio   = document.getElementById('bgMusic');
    this.btn     = document.getElementById('musicBtn');
    this.src     = src;
    this.playing = false;
    this.tipEl   = null;
    this._initTip();
    if(src) this._setup(); else this._noSource();
  }
  _setup(){
    this.audio.src = this.src;
    this.audio.load();
    this.btn.addEventListener('click', () => this.toggle());
    const tryAutoplay = () => {
      this.play().catch(() => this._showTip('点击右上角图标开启背景音乐'));
      document.removeEventListener('click', tryAutoplay);
      document.removeEventListener('touchstart', tryAutoplay);
      document.removeEventListener('keydown', tryAutoplay);
    };
    document.addEventListener('click', tryAutoplay, { once: true });
    document.addEventListener('touchstart', tryAutoplay, { once: true });
    document.addEventListener('keydown', tryAutoplay, { once: true });
  }
  _noSource(){
    this.btn.style.opacity = '.55';
    this.btn.addEventListener('click', () => {
      this._showTip('未配置音乐文件<br>请将音乐放入「音乐/」文件夹<br>并在 pages.js 设置 music 路径');
    });
  }
  _initTip(){
    const tip = document.createElement('div');
    tip.className = 'music-tip';
    document.body.appendChild(tip);
    this.tipEl = tip;
  }
  _showTip(html, ms = 3500){
    if(!this.tipEl) return;
    this.tipEl.innerHTML = html;
    this.tipEl.classList.add('show');
    clearTimeout(this._tipTimer);
    this._tipTimer = setTimeout(() => this.tipEl.classList.remove('show'), ms);
  }
  play(){
    const p = this.audio.play();
    if(p && p.then){
      return p.then(() => {
        this.playing = true;
        this.btn.classList.add('playing');
      }).catch(err => { throw err; });
    }
    this.playing = true;
    this.btn.classList.add('playing');
    return Promise.resolve();
  }
  pause(){
    this.audio.pause();
    this.playing = false;
    this.btn.classList.remove('playing');
  }
  toggle(){
    if(!this.src){ this._showTip('未配置音乐文件'); return; }
    if(this.playing){
      this.pause();
      this._showTip('音乐已暂停', 1500);
    } else {
      this.play().catch(() => this._showTip('播放失败，请检查音乐文件是否存在'));
    }
  }
}

/* ---------- 飘落花瓣 ---------- */
function startPetals(){
  function spawn(){
    const p = document.createElement('div');
    p.className = 'petal';
    p.style.left = Math.random() * 100 + 'vw';
    const dur = 8 + Math.random() * 8;
    p.style.animationDuration = dur + 's';
    p.style.width = (8 + Math.random() * 10) + 'px';
    p.style.height = p.style.width;
    p.style.opacity = 0.5 + Math.random() * 0.4;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), dur * 1000);
  }
  setInterval(spawn, 700);
  for(let i = 0; i < 6; i++) setTimeout(spawn, i * 300);
}

/* ---------- 鼠标视差背景（桌面端） ---------- */
function bindParallax(){
  document.addEventListener('mousemove', e => {
    if(window.innerWidth < 768) return;
    const x = (e.clientX / window.innerWidth - 0.5) * 12;
    const y = (e.clientY / window.innerHeight - 0.5) * 12;
    document.getElementById('bgLayer').style.transform =
      `scale(1.1) translate(${x}px, ${y}px)`;
  });
}

/* ---------- 按图片长宽比 + 视口尺寸计算卡片尺寸 ---------- */
function fitCardSize(el, w, h){
  const ratio = (w && h) ? w / h : 4 / 3;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isPortrait = ratio < 1;
  const maxW = isPortrait ? Math.min(vw * 0.70, 320) : Math.min(vw * 0.86, 560);
  const maxH = vh * 0.62;
  let cw, ch;
  if(isPortrait){
    ch = maxH;
    cw = ch * ratio;
    if(cw > maxW){ cw = maxW; ch = cw / ratio; }
  } else {
    cw = maxW;
    ch = cw / ratio;
    if(ch > maxH){ ch = maxH; cw = ch * ratio; }
  }
  el.style.width  = cw.toFixed(1) + 'px';
  el.style.height = ch.toFixed(1) + 'px';
  const pEl = el.querySelector('.card-back p');
  const textLen = pEl ? pEl.textContent.length : 30;
  const diag = Math.sqrt(cw * cw + ch * ch);
  let base = diag / 26;
  if(textLen > 40)  base *= 0.92;
  if(textLen > 80)  base *= 0.90;
  if(textLen > 120) base *= 0.88;
  if(textLen > 160) base *= 0.85;
  const textSize  = Math.max(10, Math.min(18, base));
  const titleSize = Math.max(16, Math.min(28, base * 1.35));
  el.style.setProperty('--text-size',  textSize.toFixed(1) + 'px');
  el.style.setProperty('--title-size', titleSize.toFixed(1) + 'px');
}

function refitAllCards(){
  document.querySelectorAll('.card-3d').forEach(el => {
    const w = parseFloat(el.style.getPropertyValue('--pw')) || 0;
    const h = parseFloat(el.style.getPropertyValue('--ph')) || 0;
    if(w && h) fitCardSize(el, w, h);
  });
}

/* ---------- 加载状态指示器 ---------- */
function setGlobalLoading(visible){
  let el = document.getElementById('globalLoader');
  if(!el){
    el = document.createElement('div');
    el.id = 'globalLoader';
    el.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      z-index:200; color:var(--gold,#ffd56b); font-size:14px; letter-spacing:2px;
      background:rgba(42,15,36,.6); padding:14px 24px; border-radius:10px;
      border:1px solid rgba(255,213,107,.3); transition:opacity .4s;
    `;
    el.textContent = '正在加载…';
    document.body.appendChild(el);
  }
  el.style.opacity = visible ? '1' : '0';
  el.style.pointerEvents = 'none';
}

/* ---------- 流式加载图片并更新对应卡片 ---------- */
async function loadCardImage(index, src, txt, onUpdate){
  const r = await preloadImage(src);
  if(!r.ok){
    // 加载失败：替换为"无图"卡片
    return { ok: false };
  }
  const ratio = simplifyRatio(r.w, r.h);
  return { ok: true, src, w: r.w, h: r.h, ratio, txt };
}

/* 把已加载好的图片应用到对应 DOM 卡片 */
function applyImageToCard(cardEl, info){
  const imgSrc = info.src;
  const title = info.txt.title || '';
  // 替换正面
  const front = cardEl.querySelector('.card-front');
  front.classList.remove('card-loading');
  front.innerHTML = `
    <img src="${imgSrc}" alt="${title}" loading="lazy">
    <span class="hint"><span class="dot"></span>点击翻开</span>
  `;
  // 注入尺寸变量并适配
  cardEl.style.setProperty('--ar', info.ratio);
  cardEl.style.setProperty('--pw', info.w);
  cardEl.style.setProperty('--ph', info.h);
  fitCardSize(cardEl, info.w, info.h);
}

/* ---------- 主入口（流式加载） ---------- */
async function main(){
  const data = await loadData();
  if(!data){
    document.getElementById('pages').innerHTML =
      '<div style="color:#fff;text-align:center;padding:40px;">数据加载失败，请检查 data/pages.js 是否存在并已被 index.html 引入</div>';
    return;
  }

  // 1. 立即设置背景（异步加载，不阻塞）
  const bg = data.background || CONFIG.bgFallback;
  const bgEl = document.getElementById('bgLayer');
  // 先用低分辨率占位色，背景图加载完会自动显示
  const bgImg = new Image();
  bgImg.onload = () => { bgEl.style.backgroundImage = `url('${bg}')`; };
  bgImg.src = bg;

  // 2. 立即渲染封面 + 已知文本的时间线页（占位） + 结尾
  const pagesEl = document.getElementById('pages');
  const pagerEl = document.getElementById('pager');
  pagesEl.innerHTML = '';
  pagerEl.innerHTML = '';

  const txtPages = data.pages || [];

  // 先渲染封面
  const coverEl = document.createElement('section');
  coverEl.className = 'page cover';
  coverEl.dataset.index = '0';
  coverEl.innerHTML = renderCover(data);
  pagesEl.appendChild(coverEl);

  // 渲染每个时间线页（有文本就先放占位卡，无文本先留空位）
  const tlPageEls = [];
  for(let i = 0; i < txtPages.length; i++){
    const el = document.createElement('section');
    el.className = 'page tl-page';
    el.dataset.index = String(i + 1);
    el.innerHTML = renderTimelinePagePlaceholder(txtPages[i], i);
    pagesEl.appendChild(el);
    tlPageEls.push(el);
  }

  // 渲染结尾
  const endingEl = document.createElement('section');
  endingEl.className = 'page ending';
  endingEl.dataset.index = String(txtPages.length + 1);
  endingEl.innerHTML = renderEnding(data);
  pagesEl.appendChild(endingEl);

  // 渲染页码指示器
  const totalDots = txtPages.length + 2;
  for(let i = 0; i < totalDots; i++){
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.dataset.index = String(i);
    dot.addEventListener('click', () => window.paginator && window.paginator.goTo(i));
    pagerEl.appendChild(dot);
  }

  // 3. 立即初始化交互（用户可立即看到封面并开始翻页）
  bindCardFlip();
  startPetals();
  bindParallax();
  window.paginator = new Paginator();
  window.music     = new MusicController(data.music || '');
  window.addEventListener('resize', () => {
    clearTimeout(window.__fitTimer);
    window.__fitTimer = setTimeout(refitAllCards, 150);
  });

  // 4. 流式探测+加载图片：从第 1 张开始，遇到缺失即停止
  //    使用低并发队列，按顺序加载，加载完一张就更新一张
  const queue = [];
  for(let i = 0; i < txtPages.length; i++){
    queue.push({ index: i, src: `${CONFIG.imagesDir}/${i+1}${CONFIG.imageExt}`, txt: txtPages[i] });
  }

  let probeStop = false;     // 连续缺失后停止
  const concurrency = CONFIG.loadConcurrency;
  let cursor = 0;

  async function worker(){
    while(cursor < queue.length && !probeStop){
      const myIndex = cursor++;
      const job = queue[myIndex];
      const r = await preloadImage(job.src);
      if(!r.ok){
        // 加载失败：当作图片不存在，把占位卡换成无图卡片
        probeStop = true;  // 遇到第一个缺失即停止（保持连续编号策略）
        const cardEl = tlPageEls[job.index].querySelector('.card-3d');
        if(cardEl){
          // 保留原卡片结构，仅把正面改为"未配置图片"
          const front = cardEl.querySelector('.card-front');
          front.classList.remove('card-loading');
          front.style.background = 'linear-gradient(135deg,#5b2a4f,#2a0f24)';
          front.style.display = 'flex';
          front.style.alignItems = 'center';
          front.style.justifyContent = 'center';
          front.innerHTML = '<div style="color:rgba(255,231,241,.7); font-size:13px; letter-spacing:2px;">未配置图片</div>';
        }
        continue;
      }
      const ratio = simplifyRatio(r.w, r.h);
      const info = { ok: true, src: job.src, w: r.w, h: r.h, ratio, txt: job.txt };
      // 更新对应 DOM
      const cardEl = tlPageEls[job.index].querySelector('.card-3d');
      if(cardEl) applyImageToCard(cardEl, info);
      console.log(`[流式加载] ${job.src} ✓ (${r.w}×${r.h})`);
    }
  }

  // 启动 N 个 worker 并发加载
  const workers = [];
  for(let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  console.log('[流式加载完成]');
}

main();
