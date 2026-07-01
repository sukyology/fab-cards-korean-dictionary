"use strict";

// 번역 제안 설정
const CONTRIBUTE_ENDPOINT = "/api/translate"; // 번역 제안 PR을 만드는 Worker(같은 도메인 경로)
const TURNSTILE_SITEKEY = ""; // Cloudflare Turnstile 사이트 키(설정하면 스팸 방지 위젯 표시)

// 상태
let CARDS = [];
let KEYWORDS = {};
let fuse = null;
let activeColor = ""; // "", "Red", "Yellow", "Blue", "__translated"
const PAGE_SIZE = 60;

// 이미지 로딩 토글(느린 환경에서 번역만 빠르게 보고 싶은 사용자를 위한 설정)
const IMG_TOGGLE_KEY = "fab-images-enabled";
let imagesEnabled = localStorage.getItem(IMG_TOGGLE_KEY) !== "0";

const $ = (sel) => document.querySelector(sel);
const statusEl = $("#status");
const resultsEl = $("#results");
const moreEl = $("#more");

// FAB 카드 텍스트의 토큰을 한글 라벨로 치환
const TOKENS = {
  "{p}": ['tok-p', '공격력'],
  "{d}": ['tok-d', '방어력'],
  "{h}": ['tok-h', '생명력'],
  "{r}": ['tok-r', '자원'],
  "{i}": ['tok-i', '지력'],
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// 카드 텍스트를 HTML로 렌더(토큰 치환 + 줄바꿈 유지). 입력은 escape 처리됨.
function renderText(text) {
  if (!text) return "";
  let html = escapeHtml(text);
  for (const [token, [cls, label]] of Object.entries(TOKENS)) {
    html = html.split(token).join(`<span class="tok ${cls}">${label}</span>`);
  }
  return html;
}

const COLOR_LABEL = { Red: ["pip-red", "빨강·피치1"], Yellow: ["pip-yellow", "노랑·피치2"], Blue: ["pip-blue", "파랑·피치3"] };

function colorPip(color) {
  const c = COLOR_LABEL[color];
  return c ? `<span class="pip ${c[0]}" title="${c[1]}"></span>` : "";
}

// 카드의 표시용 이름(한글 우선)
function displayName(card) {
  return card.name_ko || card.name;
}

// 결과 카드 1장 DOM
function cardEl(card) {
  const el = document.createElement("article");
  el.className = "card";
  el.tabIndex = 0;

  const img = imagesEnabled && card.image
    ? `<img class="card-img" loading="lazy" src="${card.image}" alt="${escapeHtml(card.name)}" />`
    : `<div class="card-img placeholder">${card.image ? "이미지 숨김" : "이미지 없음"}</div>`;

  const koBadge = card.name_ko || card.text_ko ? `<span class="badge-ko">한글</span>` : "";
  const enSub = card.name_ko ? `<div class="card-name-en">${escapeHtml(card.name)}</div>` : "";

  el.innerHTML = `
    ${img}
    <div class="card-info">
      <div class="card-name">${escapeHtml(displayName(card))}</div>
      ${enSub}
      <div class="card-meta">
        ${colorPip(card.color)}
        <span>${escapeHtml(card.type_text || card.types.join(" "))}</span>
        ${koBadge}
      </div>
    </div>`;

  el.addEventListener("click", () => openModal(card));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openModal(card);
  });
  return el;
}

// 현재 쿼리/필터로 카드 목록 계산
function computeList(query) {
  let list;
  if (query) {
    list = fuse.search(query).map((r) => r.item);
  } else {
    list = CARDS;
  }
  if (activeColor === "__translated") {
    list = list.filter((c) => c.name_ko || c.text_ko);
  } else if (activeColor) {
    list = list.filter((c) => c.color === activeColor);
  }
  return list;
}

let currentList = [];
let shown = 0;
let currentQuery = ""; // Enter로 확정된 검색어

function render(query) {
  currentQuery = query;
  shown = 0;
  resultsEl.innerHTML = "";

  // 검색어도 없고 필터도 없으면 카드 목록을 보여주지 않는다(검색 중심 UI)
  const showResults = query !== "" || activeColor !== "";
  if (!showResults) {
    currentList = [];
    moreEl.hidden = true;
    statusEl.textContent = `카드 이름(한글·영어)이나 효과를 입력하고 Enter를 누르세요 · 전체 ${CARDS.length.toLocaleString()}장`;
    return;
  }

  currentList = computeList(query);
  renderMore();

  const total = currentList.length;
  if (total === 0) {
    statusEl.textContent = "검색 결과가 없습니다. 다른 검색어를 시도해 보세요.";
  } else {
    statusEl.textContent = `${total.toLocaleString()}장 검색됨`;
  }
}

function renderMore() {
  const slice = currentList.slice(shown, shown + PAGE_SIZE);
  const frag = document.createDocumentFragment();
  for (const card of slice) frag.appendChild(cardEl(card));
  resultsEl.appendChild(frag);
  shown += slice.length;

  if (shown < currentList.length) {
    moreEl.hidden = false;
    moreEl.textContent = `아래로 스크롤하면 더 표시됩니다 (${shown} / ${currentList.length})`;
  } else {
    moreEl.hidden = true;
  }
}

// 이미지 표시 설정이 바뀌었을 때 이미 그려진 카드들을 다시 그림(스크롤 위치 유지)
function rerenderVisible() {
  resultsEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const card of currentList.slice(0, shown)) frag.appendChild(cardEl(card));
  resultsEl.appendChild(frag);
}

// 무한 스크롤
window.addEventListener("scroll", () => {
  if (moreEl.hidden) return;
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) {
    renderMore();
  }
});

// 카드 텍스트에 등장하는 키워드 용어집 항목 추출
function matchedKeywords(card) {
  const hay = `${card.text} ${card.type_text} ${(card.keywords || []).join(" ")}`.toLowerCase();
  const out = [];
  for (const [kw, info] of Object.entries(KEYWORDS)) {
    if (hay.includes(kw.toLowerCase())) out.push([kw, info]);
  }
  return out;
}

// 상세 모달
const modal = $("#modal");
const modalBody = $("#modal-body");

function statRow(card) {
  const parts = [];
  if (card.cost !== "") parts.push(["비용", card.cost]);
  if (card.power !== "") parts.push(["공격력", card.power]);
  if (card.defense !== "") parts.push(["방어력", card.defense]);
  if (card.health !== "") parts.push(["생명력", card.health]);
  if (card.intelligence) parts.push(["지력", card.intelligence]);
  if (card.pitch !== "") parts.push(["피치", card.pitch]);
  return parts.map(([k, v]) => `<span class="stat"><b>${k}</b>${escapeHtml(v)}</span>`).join("");
}

function openModal(card) {
  const img = imagesEnabled && card.image
    ? `<img class="detail-img" src="${card.image}" alt="${escapeHtml(card.name)}" />`
    : card.image
      ? `<button type="button" class="detail-img card-img placeholder placeholder-btn" id="modal-img-reveal">이미지 숨김<br /><span class="reveal-hint">눌러서 보기</span></button>`
      : `<div class="detail-img card-img placeholder">이미지 없음</div>`;

  const koText = card.text_ko
    ? `<div class="text-block text-ko"><h4>한글 효과</h4><div class="body">${renderText(card.text_ko)}</div></div>`
    : `<div class="text-block text-ko"><h4>한글 효과</h4><div class="body untranslated">아직 번역되지 않았습니다. 아래 키워드 설명을 참고하세요.</div></div>`;

  const enText = card.text
    ? `<div class="text-block text-en"><h4>원문 (영어)</h4><div class="body">${renderText(card.text)}</div></div>`
    : "";

  const kws = matchedKeywords(card);
  const kwHtml = kws.length
    ? `<div class="keywords"><h4 style="color:var(--text-dim);font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px">키워드 설명</h4>${kws
        .map(([kw, info]) => `<div class="kw"><b>${escapeHtml(kw)}</b> (${escapeHtml(info.ko)}) — ${escapeHtml(info.desc)}</div>`)
        .join("")}</div>`
    : "";

  // 한글 타입 번역이 있고 영어와 다를 때만 "한글 · 영어"로 표시(미번역이면 영어만)
  const typeKo =
    card.type_text_ko && card.type_text_ko !== card.type_text
      ? `${escapeHtml(card.type_text_ko)} · `
      : "";

  modalBody.innerHTML = `
    <div class="detail">
      <div>${img}</div>
      <div>
        <h2 id="modal-name">${escapeHtml(displayName(card))}</h2>
        <p class="en">${escapeHtml(card.name)}</p>
        <p class="type">${typeKo}${escapeHtml(card.type_text)}</p>
        <div class="stats">${statRow(card)}</div>
        ${koText}
        ${enText}
        ${kwHtml}
        <button class="contribute-btn" id="contribute-open">✏️ 이 카드 번역 제안하기</button>
        <div class="id-line">id: ${escapeHtml(card.id)}</div>
      </div>
    </div>`;
  modalBody.querySelector("#contribute-open").addEventListener("click", () => openContributeForm(card));

  // 이미지 전체 로딩이 꺼져 있어도 이 카드만 눌러서 개별적으로 볼 수 있게 함(전역 설정은 바꾸지 않음)
  const revealBtn = modalBody.querySelector("#modal-img-reveal");
  if (revealBtn) {
    revealBtn.addEventListener("click", () => {
      const realImg = document.createElement("img");
      realImg.className = "detail-img";
      realImg.src = card.image;
      realImg.alt = card.name;
      revealBtn.replaceWith(realImg);
    });
  }

  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

// 번역 제안 폼(카드 상세 → 이 폼으로 전환)
function openContributeForm(card) {
  modalBody.innerHTML = `
    <h2 style="margin:0 0 2px">✏️ 번역 제안</h2>
    <p class="en">${escapeHtml(card.name)} <span style="color:var(--text-dim)">· ${escapeHtml(card.type_text)}</span></p>
    <form id="contribute-form" class="contribute">
      <label>한글 카드 이름
        <input type="text" name="nameKo" maxlength="100" value="${escapeHtml(card.name_ko || "")}" placeholder="예: 스내치" />
      </label>
      <label>한글 효과
        <textarea name="textKo" maxlength="2000" rows="5" placeholder="카드 효과를 한글로 입력하세요">${escapeHtml(card.text_ko || "")}</textarea>
      </label>
      <label>닉네임 <span class="opt">(선택)</span>
        <input type="text" name="contributor" maxlength="40" placeholder="PR에 표시할 이름" />
      </label>
      <div id="turnstile-box"></div>
      <div class="contribute-actions">
        <button type="button" class="btn-secondary" id="contribute-cancel">취소</button>
        <button type="submit" class="btn-primary" id="contribute-submit">제안 보내기</button>
      </div>
      <p class="contribute-msg" id="contribute-msg" aria-live="polite"></p>
    </form>
    <p class="contribute-note">제출하면 GitHub에 검토용 PR이 자동으로 생성됩니다. 관리자가 확인 후 반영합니다.</p>`;

  modalBody.querySelector("#contribute-cancel").addEventListener("click", () => openModal(card));

  let turnstileId = null;
  if (TURNSTILE_SITEKEY && window.turnstile) {
    turnstileId = window.turnstile.render("#turnstile-box", { sitekey: TURNSTILE_SITEKEY });
  }

  modalBody.querySelector("#contribute-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const msg = f.querySelector("#contribute-msg");
    const submitBtn = f.querySelector("#contribute-submit");
    const nameKo = f.nameKo.value.trim();
    const textKo = f.textKo.value.trim();

    if (!nameKo && !textKo) {
      msg.className = "contribute-msg err";
      msg.textContent = "한글 이름이나 효과 중 하나는 입력해 주세요.";
      return;
    }
    let turnstileToken = "";
    if (TURNSTILE_SITEKEY) {
      turnstileToken = window.turnstile ? window.turnstile.getResponse(turnstileId) : "";
      if (!turnstileToken) {
        msg.className = "contribute-msg err";
        msg.textContent = "스팸 방지 확인을 완료해 주세요.";
        return;
      }
    }

    submitBtn.disabled = true;
    msg.className = "contribute-msg";
    msg.textContent = "보내는 중…";
    try {
      const res = await fetch(CONTRIBUTE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.id,
          nameEn: card.name,
          nameKo,
          textKo,
          contributor: f.contributor.value.trim(),
          turnstileToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        msg.className = "contribute-msg ok";
        msg.innerHTML = `제안이 접수되었습니다! 감사합니다. <a href="${data.prUrl}" target="_blank" rel="noopener">제안 확인(PR)</a>`;
        submitBtn.textContent = "완료";
      } else {
        msg.className = "contribute-msg err";
        msg.textContent = data.error || "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.";
        submitBtn.disabled = false;
      }
    } catch {
      msg.className = "contribute-msg err";
      msg.textContent = "네트워크 오류로 전송하지 못했습니다.";
      submitBtn.disabled = false;
    }
  });
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = "";
}
modal.addEventListener("click", (e) => {
  if (e.target.hasAttribute("data-close")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeModal();
});

// 검색: Enter를 눌렀을 때만 실행
$("#search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") render(e.target.value.trim());
});

// 이미지 로딩 토글
const imgToggle = $("#img-toggle");
imgToggle.checked = imagesEnabled;
imgToggle.addEventListener("change", () => {
  imagesEnabled = imgToggle.checked;
  localStorage.setItem(IMG_TOGGLE_KEY, imagesEnabled ? "1" : "0");
  rerenderVisible();
});

// 색상 필터
$("#color-filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  activeColor = btn.dataset.color;
  document.querySelectorAll("#color-filters .chip").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  render(currentQuery);
});

// 초기 로드
async function init() {
  try {
    const [cardsRes, kwRes] = await Promise.all([fetch("./cards.json"), fetch("./keywords.json")]);
    CARDS = await cardsRes.json();
    KEYWORDS = kwRes.ok ? await kwRes.json() : {};
  } catch (err) {
    statusEl.textContent = "데이터를 불러오지 못했습니다. 빌드(npm run build)를 먼저 실행했는지 확인하세요.";
    console.error(err);
    return;
  }

  fuse = new Fuse(CARDS, {
    keys: [
      { name: "name_ko", weight: 0.4 },
      { name: "name", weight: 0.3 },
      { name: "text_ko", weight: 0.15 },
      { name: "text", weight: 0.1 },
      { name: "type_text", weight: 0.05 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  // URL의 ?q= 로 들어오면 해당 검색어로 바로 검색(공유·검색엔진 딥링크 지원)
  const q = new URLSearchParams(location.search).get("q");
  if (q) {
    $("#search").value = q;
    render(q.trim());
  } else {
    render("");
  }
}

init();
