/* =========================================================
 * 生日时光纪念册 · 主逻辑
 * 高内聚：渲染/翻页/检测 分模块；低耦合：数据通过 JSON 注入
 * ========================================================= */

const CONFIG = {
  imagesDir: '图片',          // 图片目录
  imageExt: '.jpg',           // 图片扩展名
  bgFallback: '图片/背景图.jpg',
  dataUrl: 'data/pages.json',
  maxProbe: 99                // 最多探测的图片数量
};

/* ---------- 工具：图片预加载（同时探测存在性 + 获取宽高） ---------- */
function preloadImage(src){
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve({ ok: true,  w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ ok: false, w: 0, h: 0 });
    img.src = src;
  });
}

/* 简化比例（如 1920x1080 -> "16/9"） */
function simplifyRatio(w, h){
  if(!w || !h) return '4/3';
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const g = gcd(w, h);
  return `${w/g}/${h/g}`;
}

/* ---------- 自动探测时间线图片（1.jpg, 2.jpg, ...），同时记录宽高 ---------- */
async function detectTimelineImages(){
  const found = [];
  for(let i = 1; i <= CONFIG.maxProbe; i++){
    const src = `${CONFIG.imagesDir}/${i}${CONFIG.imageExt}`;
    const r = await preloadImage(src);
    if(r.ok){
      found.push({ n: i, src, w: r.w, h: r.h, ratio: simplifyRatio(r.w, r.h) });
    } else {
      break; // 遇到第一个缺失即停止，保证连续编号
    }
  }
  return found;
}

/* ---------- 加载数据：优先使用内联变量（file:// 协议可用），否则回退到 fetch（服务器模式） ---------- */
async function loadData(){
  // 优先用 pages.js 内联数据（双击 HTML 即可工作，无需服务器）
  if(typeof window.PAGES_DATA === 'object' && window.PAGES_DATA){
    return window.PAGES_DATA;
  }
  // 回退到 fetch（HTTP 服务器模式下兼容旧用法）
  try{
    const res = await fetch(CONFIG.dataUrl, { cache: 'no-cache' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }catch(err){
    console.error('[数据加载失败] 请确保 data/pages.js 存在并通过 <script> 引入，或通过本地服务器访问。', err);
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

/* ---------- 渲染：时间线卡片 ---------- */
function renderTimelinePage(item, hasImage, imgSrc){
  const time = item.time || '';
  const title = item.title || '';
  const desc = item.desc || '';

  if(!hasImage){
    // 无图但 JSON 有该条目：显示纯文字卡片（仍可点击翻转）
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

  return `
    <span class="time-tag">${time}</span>
    <div class="card-3d" role="button" tabindex="0" aria-label="点击翻开 ${title}" style="--ar:${item.ratio || '4/3'}; --pw:${item.w || 0}; --ph:${item.h || 0};">
      <div class="card-inner">
        <div class="card-face card-front">
          <img src="${imgSrc}" alt="${title}" loading="lazy">
          <span class="hint"><span class="dot"></span>点击翻开</span>
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

    // 触摸滑动
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

    // 桌面端鼠标拖拽
    let down = false, mx = 0;
    container.addEventListener('mousedown', e => { down = true; mx = e.clientX; });
    container.addEventListener('mouseup', e => {
      if(!down) return;
      down = false;
      const dx = e.clientX - mx;
      if(Math.abs(dx) > 80){ if(dx < 0) this.next(); else this.prev(); }
    });
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
    // 自动播放：浏览器通常禁止自动播放，需用户首次交互后触发
    const tryAutoplay = () => {
      this.play().catch(() => {
        // 自动播放被拦截：显示提示
        this._showTip('点击右上角图标开启背景音乐');
      });
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
      this._showTip('未配置音乐文件<br>请将音乐放入「音乐/」文件夹<br>并在 pages.json 设置 music 路径');
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
      this.play().catch(() => {
        this._showTip('播放失败，请检查音乐文件是否存在');
      });
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
  // 横图：宽度上限 560 / 86vw；竖图：宽度上限 320 / 70vw；高度统一上限 65vh
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

  // 同步根据卡片尺寸 + 文字字数 计算正文字号
  const pEl = el.querySelector('.card-back p');
  const textLen = pEl ? pEl.textContent.length : 30;
  // 基准：按卡片对角线长度比例
  const diag = Math.sqrt(cw * cw + ch * ch);
  let base = diag / 26;            // 对角线越大字越大
  // 字数越多字越小：分段折减
  if(textLen > 40)  base *= 0.92;
  if(textLen > 80)  base *= 0.90;
  if(textLen > 120) base *= 0.88;
  if(textLen > 160) base *= 0.85;
  const textSize  = Math.max(10, Math.min(18, base));
  const titleSize = Math.max(16, Math.min(28, base * 1.35));
  el.style.setProperty('--text-size',  textSize.toFixed(1) + 'px');
  el.style.setProperty('--title-size', titleSize.toFixed(1) + 'px');
}

/* 遍历所有 .card-3d，根据其 --pw / --ph CSS 变量重新计算尺寸 */
function refitAllCards(){
  document.querySelectorAll('.card-3d').forEach(el => {
    const w = parseFloat(el.style.getPropertyValue('--pw')) || 0;
    const h = parseFloat(el.style.getPropertyValue('--ph')) || 0;
    fitCardSize(el, w, h);
  });
}

/* ---------- 主入口 ---------- */
async function main(){
  const data = await loadData();
  if(!data){
    document.getElementById('pages').innerHTML =
      '<div style="color:#fff;text-align:center;padding:40px;">数据加载失败，请检查 data/pages.js 是否存在并已被 index.html 引入</div>';
    return;
  }

  // 设置背景
  const bg = data.background || CONFIG.bgFallback;
  document.getElementById('bgLayer').style.backgroundImage = `url('${bg}')`;

  // 自动探测时间线图片
  const images = await detectTimelineImages();
  const pages = data.pages || [];

  // 合并：以图片为准，对应 JSON 文本；若图片多于文本，多出部分用默认文本
  const renderList = [];
  const maxLen = Math.max(images.length, pages.length);
  for(let i = 0; i < maxLen; i++){
    const img = images[i];
    const txt = pages[i];
    const imgMeta = img ? { w: img.w, h: img.h, ratio: img.ratio } : {};
    if(img && txt){
      renderList.push({ hasImage: true, src: img.src, ...imgMeta, ...txt });
    } else if(img && !txt){
      // 图片存在但 JSON 没对应条目：使用默认文本
      renderList.push({
        hasImage: true, src: img.src, ...imgMeta,
        time: '',
        title: '回忆',
        desc: '这一刻，无需言语，已是珍贵。'
      });
    } else if(!img && txt){
      // JSON 有条目但图片缺失：仍显示（无图卡片）
      renderList.push({ hasImage: false, src: '', ...txt });
    }
  }

  // 组装页面：封面 + 时间线页 + 结尾
  const pagesEl = document.getElementById('pages');
  const pagerEl = document.getElementById('pager');
  pagesEl.innerHTML = '';
  pagerEl.innerHTML = '';

  const allPages = [
    { type: 'cover', html: renderCover(data) },
    ...renderList.map(item => ({
      type: 'tl',
      html: renderTimelinePage(item, item.hasImage, item.src)
    })),
    { type: 'ending', html: renderEnding(data) }
  ];

  allPages.forEach((p, i) => {
    const el = document.createElement('section');
    el.className = `page ${p.type === 'cover' ? 'cover' : p.type === 'ending' ? 'ending' : 'tl-page'}`;
    el.dataset.index = i;
    el.innerHTML = p.html;
    pagesEl.appendChild(el);

    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.dataset.index = i;
    dot.addEventListener('click', () => paginator && paginator.goTo(i));
    pagerEl.appendChild(dot);
  });

  // 初始化交互
  bindCardFlip();
  startPetals();
  bindParallax();
  refitAllCards();                         // 首次按图片长宽比适配卡片尺寸
  window.addEventListener('resize', () => {
    clearTimeout(window.__fitTimer);
    window.__fitTimer = setTimeout(refitAllCards, 150);
  });
  window.paginator = new Paginator();
  window.music     = new MusicController(data.music || '');

  console.log(`[加载完成] 共 ${images.length} 张图片，${pages.length} 条文本记录，渲染 ${renderList.length} 个时间线页。`);
}

main();
