// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, money, kill
// feed, bomb status, buy menu and the overlay panels. It never touches the
// simulation; main.js pushes numbers in and reads callbacks out.
import { SHOP } from './economy.js';

const COPY = {
  start: {
    title: 'Tidebreak Harbor',
    copy: 'Rain on steel. Four against four, one bomb, two sites. Plant it at A or B — or stop the crew that tries.',
    action: 'Click to play',
  },
  paused: {
    title: 'Tidebreak Harbor',
    copy: 'Paused. The rain keeps falling.',
    action: 'Click to resume',
  },
};

function el(id) {
  return document.getElementById(id);
}

export function createHud(callbacks) {
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const ammoName = el('ammo-name');
  const healthValue = el('health-value');
  const healthBar = el('health-bar');
  const armorValue = el('armor-value');
  const moneyValue = el('money-value');
  const timerValue = el('timer-value');
  const timerLabel = el('timer-label');
  const scoreValue = el('score-value');
  const aliveA = el('alive-a');
  const aliveD = el('alive-d');
  const hitmarker = el('hitmarker');
  const killfeed = el('killfeed');
  const banner = el('banner');
  const bannerText = el('banner-text');
  const bannerSub = el('banner-sub');
  const hint = el('hint');
  const channel = el('channel');
  const channelFill = el('channel-fill');
  const channelLabel = el('channel-label');
  const flashWhite = el('flash-white');
  const damageVignette = el('damage-vignette');
  const crosshair = el('crosshair');
  const buyPanel = el('buy-panel');
  const buyList = el('buy-list');
  const buyMoney = el('buy-money');
  const buyClose = el('buy-close');
  const bombStatus = el('bomb-status');

  let hitTimer = 0;
  let bannerTimer = 0;
  let last = { mag: -1, reserve: -1, name: '', hp: -1, armor: -1, money: -1, timer: '', score: '', alive: '' };

  // Build the buy menu once from the shop list.
  for (const item of SHOP) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-row';
    row.dataset.item = item.id;
    row.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => callbacks.onBuy(item));
    buyList.appendChild(row);
  }
  buyClose.addEventListener('click', () => callbacks.onBuyClose());

  function markAffordable(money, owned, grenades) {
    for (const row of buyList.children) {
      const item = SHOP.find((s) => s.id === row.dataset.item);
      const ownedAlready = item.kind === 'weapon' && owned[item.id];
      const maxed = item.kind === 'grenade' && grenades[item.id] >= 2;
      row.classList.toggle('cant', money < item.price || ownedAlready || maxed);
      row.classList.toggle('owned', !!ownedAlready);
    }
    buyMoney.textContent = `$${money}`;
  }

  return {
    setAmmo(mag, reserve, name) {
      if (mag === last.mag && reserve === last.reserve && name === last.name) return;
      last.mag = mag;
      last.reserve = reserve;
      last.name = name;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve === 999 ? '∞' : reserve}`;
      ammoName.textContent = name;
    },
    setHealth(hp, armor) {
      if (hp === last.hp && armor === last.armor) return;
      last.hp = hp;
      last.armor = armor;
      healthValue.textContent = String(Math.max(0, Math.ceil(hp)));
      healthBar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      healthBar.classList.toggle('low', hp <= 30);
      armorValue.textContent = armor > 0 ? `Kevlar ${Math.ceil(armor)}` : '';
    },
    setMoney(money) {
      if (money === last.money) return;
      last.money = money;
      moneyValue.textContent = `$${money}`;
    },
    setTimer(seconds, phase) {
      const text = `${Math.max(0, Math.ceil(seconds))}`;
      const label = phase === 'buy' ? 'BUY' : phase === 'live' ? 'ROUND' : phase === 'over' ? 'NEXT' : '';
      if (text === last.timer && label === last.score) return;
      last.timer = text;
      last.score = label;
      timerValue.textContent = text;
      timerLabel.textContent = label;
      timerValue.classList.toggle('urgent', phase === 'live' && seconds <= 10);
    },
    setScore(a, d, round) {
      const text = `${a} : ${d}`;
      if (text === last.alive) return;
      last.alive = text;
      scoreValue.textContent = `${text}  ·  Round ${round}`;
    },
    setAlive(aCount, dCount) {
      aliveA.textContent = '●'.repeat(aCount) + '○'.repeat(Math.max(0, 4 - aCount));
      aliveD.textContent = '●'.repeat(dCount) + '○'.repeat(Math.max(0, 4 - dCount));
    },
    setBombStatus(text, tone) {
      bombStatus.textContent = text;
      bombStatus.className = tone ? `bomb-${tone}` : '';
    },
    setCrosshair(gapPx) {
      crosshair.style.setProperty('--gap', `${gapPx}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damageVignette.classList.add('on');
      setTimeout(() => damageVignette.classList.remove('on'), 180);
    },
    flashBlind(strength) {
      flashWhite.style.opacity = String(strength);
      if (strength <= 0) return;
      setTimeout(() => {
        flashWhite.style.opacity = '0';
      }, 60);
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.classList.add('fade'), 4200);
    },
    clearKillfeed() {
      killfeed.innerHTML = '';
    },
    showBanner(text, sub, ms = 2600) {
      bannerText.textContent = text;
      bannerSub.textContent = sub ?? '';
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), ms);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      banner.classList.remove('on');
    },
    setHint(text) {
      hint.textContent = text ?? '';
    },
    setChannel(kind, progress) {
      if (!kind) {
        channel.hidden = true;
        return;
      }
      channel.hidden = false;
      channelLabel.textContent = kind === 'plant' ? 'PLANTING' : 'DEFUSING';
      channelFill.style.width = `${Math.round(progress * 100)}%`;
    },
    showBuy(money, owned, grenades) {
      markAffordable(money, owned, grenades);
      buyPanel.hidden = false;
    },
    hideBuy() {
      buyPanel.hidden = true;
    },
    refreshBuy(money, owned, grenades) {
      if (!buyPanel.hidden) markAffordable(money, owned, grenades);
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      if (!text) return;
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    showEndOverlay(titleText, copyText, actionText) {
      title.textContent = titleText;
      copy.textContent = copyText;
      play.textContent = actionText;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
