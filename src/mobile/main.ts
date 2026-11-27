import './mobile.css';
import { CARD_MAP } from '../game/cards';
import {
  attack, attackBlockReason, blinkPlayer, canAttack, canMoveTo, canUsePower,
  discardCard, drawCardAction, endTurn, finishContract, finishFreeHunt,
  giveUp, interactCabinet, interactTotem, isPersonVisible, isRoomVisible,
  knownPeople, moveBlockReason, movePlayer, playCard, powerBlockReason,
  searchRoom, throwHuntressHatchet, usePower, waitAction, wipeBlade,
  lookAround, lookAtRoom, cancelLookSelection, cancelAuraSelection, selectAuraRoom, executeDownedPerson,
} from '../game/engine';
import { createGame } from '../game/setup';
import { generateFreeHunt, generateMission } from '../game/missions';
import { loadSave, writeSave } from '../game/save';
import { KILLER_MAP, STARTER_KILLERS } from '../game/killers';
import { ROOM_MAP, ROOMS, layoutAspectNum } from '../game/rooms';
import { getHuntingGround } from '../game/maps';
import type { GameState, RoomId } from '../game/types';

const root = document.querySelector<HTMLDivElement>('#mobile-app')!;
let save = loadSave();
let game: GameState | null = null;
let mode: 'contract' | 'free' = 'contract';
let selectedPerson: string | null = null;
let selectedCard: string | null = null;
let message = '选择一间相邻房间移动，或选择幸存者查看行动。';
let finishedSave = false;

const esc = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

function start(free: boolean): void {
  mode = free ? 'free' : 'contract';
  const killer = save.killer ?? STARTER_KILLERS[0];
  const mission = free ? generateFreeHunt() : generateMission(killer);
  const map = getHuntingGround('lampkin');
  game = createGame(save.deck, mission, killer, map.id, []);
  selectedPerson = null;
  selectedCard = null;
  message = '猎场已生成。点击相邻房间移动，点击幸存者可选中目标。';
  finishedSave = false;
  render();
}

function roomPeople(roomId: RoomId): string {
  if (!game) return '';
  return knownPeople(game).filter((person) => person.room === roomId && isPersonVisible(game!, person))
    .map((person) => {
      const state = person.hp <= 0 ? '倒地' : person.hp <= 2 ? '受伤' : '健康';
      return `<button class="person-chip ${selectedPerson === person.id ? 'selected' : ''}" data-action="person" data-id="${esc(person.id)}"><span>${person.role === 'police' ? '警' : '人'}</span><b>${esc(person.name)}</b><small>${state}</small></button>`;
    }).join('');
}

function roomButtons(): string {
  if (!game) return '';
  const aspect = layoutAspectNum();
  const visible = ROOMS.filter((room) => isRoomVisible(game!, room.id));
  const current = game.playerRoom;
  return `<div class="map-board" style="aspect-ratio:${aspect};">${visible.map((room) => {
    const here = room.id === current;
    const adjacent = ROOM_MAP[current].neighbors.includes(room.id);
    const blocked = adjacent ? moveBlockReason(game!, room.id) : null;
    const people = roomPeople(room.id);
    return `<div class="room-tile ${here ? 'here' : ''} ${adjacent ? 'adjacent' : ''} ${blocked ? 'blocked' : ''}" style="left:${room.rect.left}%;top:${room.rect.top}%;width:${room.rect.width}%;height:${room.rect.height}%;">
      <button class="room-select" data-action="room" data-room="${room.id}" ${!here && !adjacent && !game!.nurseBlinkTargeting && !game!.lookingAround ? 'disabled' : ''}>
        <b>${esc(room.name)}</b>${here ? '<em>你在这里</em>' : ''}${adjacent ? '<small>'+(blocked ? esc(blocked) : '可移动')+'</small>' : ''}
      </button><div class="room-people">${people}</div>
    </div>`;
  }).join('')}</div>`;
}

function renderMenu(): void {
  const killer = save.killer ?? STARTER_KILLERS[0];
  root.innerHTML = `<main class="mobile-menu">
    <header class="brand"><span>NIGHTFALL</span><h1>暗夜杀机</h1><p>独立手机端 · 触屏猎杀策略</p></header>
    <section class="menu-panel"><label for="killer">选择杀手</label><select id="killer">${STARTER_KILLERS.map((name) => `<option value="${esc(name)}" ${name === killer ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>
      <div class="save-stats"><span>胜场 <b>${save.wins}</b></span><span>血点 <b>${save.credits}</b></span><span>最高分 <b>${save.bestScore}</b></span></div>
      <button class="primary" data-action="start">开始契约</button><button data-action="free">自由猎杀</button>
    </section>
    <p class="menu-note">手机页面使用独立的页面结构与触屏控制。游戏规则、角色数据、卡牌和存档与电脑版共用。</p>
  </main>`;
}

function renderGame(): void {
  if (!game) return;
  const killer = KILLER_MAP[game.killer];
  const target = game.people.find((p) => p.id === selectedPerson);
  const currentRoom = ROOM_MAP[game.playerRoom];
  const powers = killer.powers.map((power) => {
    const available = canUsePower(game!, power.id);
    const reason = powerBlockReason(game!, power.id);
    return `<button data-action="power" data-id="${esc(power.id)}" ${available ? '' : 'disabled'}><b>${esc(power.name)}</b><small>${esc(available ? power.desc : reason)}</small></button>`;
  }).join('');
  const hand = game.hand.map((card) => {
    const def = CARD_MAP[card.defId];
    if (!def) return '';
    const cost = def ? def.cost : 0;
    return `<button class="hand-card ${selectedCard === card.uid ? 'chosen' : ''}" data-action="card" data-id="${esc(card.uid)}">
      <span>${esc(def.type)} · ${cost} AP</span><b>${esc(def.name)}</b><small>${esc(def.desc)}</small>
      <i>${selectedCard === card.uid ? '已选择' : '点选查看'}</i>
    </button>`;
  }).join('');
  const peopleList = knownPeople(game).filter(p => isPersonVisible(game!,p)).map(p =>
    `<button class="list-person ${selectedPerson===p.id?'selected':''}" data-action="person" data-id="${esc(p.id)}"><b>${esc(p.name)}</b><span>${esc(ROOM_MAP[p.room].name)} · ${p.hp<=0?'倒地':p.hp<=2?'受伤':'健康'}</span></button>`
  ).join('');
  root.innerHTML = `<main class="mobile-game">
    <header class="game-top"><div><span class="eyebrow">NIGHTFALL · ${esc(game.mission.title)}</span><h1>${esc(game.killer)}</h1></div><button data-action="menu">退出</button></header>
    <section class="status-strip"><span>第 <b>${game.turn}</b> 回合</span><span>行动点 <b>${game.energy}/${game.maxEnergy}</b></span><span>警报 <b>${game.alarm}</b></span><span>击杀 <b>${game.kills}</b></span></section>
    <section class="objective"><b>当前目标</b><p>${esc(game.mission.objective ?? game.mission.desc)}</p><small>${esc(currentRoom.name)} · ${esc(currentRoom.desc)}</small></section>
    <section class="map-section"><div class="section-heading"><h2>猎场地图</h2><span>点击相邻房间移动</span></div><div class="map-scroll">${roomButtons()}</div>
      <div class="map-legend"><span>红框：当前位置</span><span>金框：可移动</span><span>人物按钮：选中目标</span></div>
    </section>
    <section class="selected-panel"><div class="section-heading"><h2>目标情报</h2><span>${target ? esc(target.name) : '尚未选择'}</span></div>
      ${target ? `<p>${esc(target.activity)} · ${esc(ROOM_MAP[target.room].name)} · HP ${target.hp}/4</p><p>${esc(target.dialogue || target.intent)}</p>` : '<p>从地图或人物列表选择一名已发现的幸存者。</p>'}
      <div class="action-grid">
        <button data-action="attack" ${canAttack(game, selectedPerson ?? undefined) ? '' : 'disabled'}>挥刀攻击</button>
        <button data-action="execute" ${target && target.hp<=0 && target.room===game.playerRoom ? '' : 'disabled'}>处决</button>
        <button data-action="search">搜索当前房间</button>
        <button data-action="look">观察周围</button>
        <button data-action="look-cancel" ${game.lookingAround ? '' : 'disabled'}>取消观察</button>
        <button data-action="aura-cancel" ${game.auraTargeting ? '' : 'disabled'}>取消选点</button>
        <button data-action="cabinet">检查柜子</button>
        <button data-action="wipe">擦刀</button>
        <button data-action="draw">抽 1 张牌</button>
        <button data-action="wait">等待</button>
      </div>
    </section>
    <section class="power-panel"><div class="section-heading"><h2>杀手能力</h2><span>${killer.passive ? esc(killer.passive.name) : '主动技能'}</span></div><div class="power-list">${powers}</div></section>
    <section class="hand-panel"><div class="section-heading"><h2>手牌 · ${game.hand.length}/6</h2><span>点击卡牌后打出</span></div><div class="hand-list">${hand || '<p>手牌为空</p>'}</div>
      <button class="primary play-button" data-action="play" ${selectedCard ? '' : 'disabled'}>打出所选卡牌</button>
    </section>
    <details class="people-drawer"><summary>人物名单（${peopleList ? knownPeople(game).length : 0}）</summary><div>${peopleList || '<p>暂无已发现人物</p>'}</div></details>
    <section class="log-panel"><b>行动记录</b><p>${esc(message)}</p><ol>${game.log.slice(0,5).map(line=>`<li>${esc(line.replace(/^\[第 \d+ 回合\]\s*/,''))}</li>`).join('')}</ol></section>
    <footer class="turn-footer"><button data-action="end-turn">结束回合</button><button data-action="give-up">放弃本局</button></footer>
  </main>`;
}

function renderResult(): void {
  if (!game) return;
  root.innerHTML = `<main class="mobile-menu"><header class="brand"><span>HUNT COMPLETE</span><h1>${game.result === 'win' ? '猎杀成功' : '猎杀结束'}</h1><p>${esc(game.resultReason || game.mission.successText || '')}</p></header>
    <section class="menu-panel"><div class="save-stats"><span>得分 <b>${game.score}</b></span><span>击杀 <b>${game.kills}</b></span><span>战利品 <b>${game.loot}</b></span></div><button class="primary" data-action="again">再来一局</button><button data-action="menu">返回大厅</button></section></main>`;
}

function render(): void {
  if (!game) renderMenu();
  else if (game.phase === 'gameover') renderResult();
  else renderGame();
}

function afterAction(): void {
  if (!game) return;
  if (game.phase === 'gameover' && !finishedSave) {
    finishedSave = true;
    if (game.result === 'win') {
      save = { ...save, wins: save.wins + 1, bestScore: Math.max(save.bestScore, game.score), credits: save.credits + game.loot + game.huntStyleBonus };
    }
    writeSave(save);
  }
  render();
}

root.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'start' || action === 'again') { start(false); return; }
  if (action === 'free') { start(true); return; }
  if (action === 'menu') { game = null; selectedPerson = null; render(); return; }
  if (!game) return;
  if (action === 'person') {
    const id = button.dataset.id ?? null;
    if (game.huntressAiming && id) { const ok = throwHuntressHatchet(game, id); message = ok ? '飞斧已投出。' : '无法命中该目标。'; afterAction(); return; }
    selectedPerson = id; selectedCard = null; render(); return;
  }
  if (action === 'card') { selectedCard = selectedCard === button.dataset.id ? null : button.dataset.id ?? null; render(); return; }
  if (action === 'room') {
    const room = button.dataset.room as RoomId | undefined;
    if (!room) return;
    if (game.nurseBlinkTargeting) {
      const ok = blinkPlayer(game, room); message = ok ? '闪现完成。' : '无法闪现到该房间。';
    } else if (game.auraTargeting) {
      selectAuraRoom(game, room); message = '目标房间已选择。';
    } else if (game.lookingAround) {
      lookAtRoom(game, room); message = '观察完成。'
    } else if (ROOM_MAP[game.playerRoom].neighbors.includes(room)) {
      const reason = moveBlockReason(game, room);
      if (reason) message = reason;
      else { movePlayer(game, room); message = '已移动至 ' + ROOM_MAP[room].name + '。'; }
    }
    afterAction(); return;
  }
  if (action === 'power') {
    const id = button.dataset.id;
    if (id) { const ok = usePower(game, id); message = ok ? '能力已发动。' : powerBlockReason(game,id); }
    afterAction(); return;
  }
  if (action === 'attack') { const ok = attack(game, selectedPerson ?? undefined); message = ok ? '攻击已结算。' : attackBlockReason(game, selectedPerson ?? undefined); afterAction(); return; }
  if (action === 'execute') { executeDownedPerson(game, selectedPerson ?? undefined); afterAction(); return; }
  if (action === 'search') { searchRoom(game); afterAction(); return; }
  if (action === 'look') { lookAround(game); message = '选择一间相邻房间观察。'; render(); return; }
  if (action === 'look-cancel') { cancelLookSelection(game); message = '已取消观察。'; render(); return; }
  if (action === 'aura-cancel') { cancelAuraSelection(game); message = '已取消选点。'; render(); return; }
  if (action === 'cabinet') { interactCabinet(game); afterAction(); return; }
  if (action === 'wipe') { wipeBlade(game); afterAction(); return; }
  if (action === 'draw') { drawCardAction(game); afterAction(); return; }
  if (action === 'wait') { waitAction(game); afterAction(); return; }
  if (action === 'play') {
    if (selectedCard) playCard(game, selectedCard);
    selectedCard = null; afterAction(); return;
  }
  if (action === 'end-turn') { endTurn(game); message = '回合结束，幸存者已行动。'; afterAction(); return; }
  if (action === 'give-up') { giveUp(game); afterAction(); return; }
});

root.addEventListener('change', (event) => {
  const select = (event.target as HTMLElement).closest<HTMLSelectElement>('#killer');
  if (!select) return;
  if (STARTER_KILLERS.includes(select.value)) {
    save = { ...save, killer: select.value };
    writeSave(save);
  }
});

render();
