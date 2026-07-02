"use strict";

// 키워드 제안 설정
const CONTRIBUTE_ENDPOINT = "/api/keyword"; // 키워드 추가·수정 제안 PR을 만드는 Worker(같은 도메인 경로)
const TURNSTILE_SITEKEY = ""; // Cloudflare Turnstile 사이트 키(설정하면 스팸 방지 위젯 표시)

let KEYWORDS = {};

const $ = (sel) => document.querySelector(sel);
const statusEl = $("#kw-status");
const listEl = $("#kw-list");
const searchEl = $("#kw-search");

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// 검색어와 일치하는 키워드 key 목록(영어 key 기준 정렬)
function filteredKeys(query) {
  const keys = Object.keys(KEYWORDS).sort((a, b) => a.localeCompare(b));
  if (!query) return keys;
  const q = query.toLowerCase();
  return keys.filter((key) => {
    const info = KEYWORDS[key] || {};
    return (
      key.toLowerCase().includes(q) ||
      (info.ko || "").toLowerCase().includes(q) ||
      (info.desc || "").toLowerCase().includes(q)
    );
  });
}

const STATUS_LABEL = { ok: "번역 완료", partial: "일부 미완성", missing: "번역 필요" };

function keywordStatus(info) {
  const hasKo = !!(info.ko || "").trim();
  const hasDesc = !!(info.desc || "").trim();
  if (hasKo && hasDesc) return "ok";
  if (hasKo || hasDesc) return "partial";
  return "missing";
}

function kwRowEl(key) {
  const info = KEYWORDS[key] || {};
  const status = keywordStatus(info);
  const el = document.createElement("article");
  el.className = `kw-row status-${status}`;
  el.innerHTML = `
    <div class="kw-row-main">
      <div class="kw-row-head">
        <b class="kw-row-key">${escapeHtml(key)}</b>
        ${info.ko ? `<span class="kw-row-ko">${escapeHtml(info.ko)}</span>` : ""}
        <span class="kw-status-badge ${status}">${STATUS_LABEL[status]}</span>
      </div>
      <p class="kw-row-desc">${info.desc ? escapeHtml(info.desc) : `<span class="untranslated">설명이 아직 없습니다.</span>`}</p>
    </div>
    <button type="button" class="btn-secondary kw-edit-btn">수정</button>`;
  el.querySelector(".kw-edit-btn").addEventListener("click", () => openForm(key));
  return el;
}

function render() {
  const query = searchEl.value.trim();
  const keys = filteredKeys(query);
  listEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const key of keys) frag.appendChild(kwRowEl(key));
  listEl.appendChild(frag);

  const total = Object.keys(KEYWORDS).length;
  statusEl.textContent = query
    ? `${keys.length.toLocaleString()}개 검색됨 (전체 ${total.toLocaleString()}개)`
    : `전체 ${total.toLocaleString()}개`;
}

searchEl.addEventListener("input", render);

// 추가/수정 모달
const modal = $("#modal");
const modalBody = $("#modal-body");

function openForm(key) {
  const isNew = key === undefined;
  const info = isNew ? {} : KEYWORDS[key] || {};

  modalBody.innerHTML = `
    <h2 id="modal-title" style="margin:0 0 2px">${isNew ? "✏️ 새 키워드 추가" : "✏️ 키워드 수정"}</h2>
    <p class="en">${isNew ? "카드에 등장하는 영어 키워드를 추가합니다" : escapeHtml(key)}</p>
    <form id="kw-form" class="contribute">
      <label>영어 키워드
        <input type="text" name="key" maxlength="60" value="${escapeHtml(key || "")}" placeholder="예: Go again" ${isNew ? "" : "readonly"} />
      </label>
      <label>한글 표기
        <input type="text" name="ko" maxlength="100" value="${escapeHtml(info.ko || "")}" placeholder="예: 고 어게인" />
      </label>
      <label>설명
        <textarea name="desc" maxlength="1000" rows="5" placeholder="키워드의 뜻을 한글로 설명해 주세요">${escapeHtml(info.desc || "")}</textarea>
      </label>
      <label>닉네임 <span class="opt">(선택)</span>
        <input type="text" name="contributor" maxlength="40" placeholder="PR에 표시할 이름" />
      </label>
      <div id="turnstile-box"></div>
      <div class="contribute-actions">
        <button type="button" class="btn-secondary" id="kw-form-cancel">취소</button>
        <button type="submit" class="btn-primary" id="kw-form-submit">제안 보내기</button>
      </div>
      <p class="contribute-msg" id="kw-form-msg" aria-live="polite"></p>
    </form>
    <p class="contribute-note">제출하면 GitHub에 검토용 PR이 자동으로 생성됩니다. 관리자가 확인 후 반영합니다.</p>`;

  modalBody.querySelector("#kw-form-cancel").addEventListener("click", closeModal);

  let turnstileId = null;
  if (TURNSTILE_SITEKEY && window.turnstile) {
    turnstileId = window.turnstile.render("#turnstile-box", { sitekey: TURNSTILE_SITEKEY });
  }

  modalBody.querySelector("#kw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const msg = f.querySelector("#kw-form-msg");
    const submitBtn = f.querySelector("#kw-form-submit");
    const keyVal = f.key.value.trim();
    const ko = f.ko.value.trim();
    const desc = f.desc.value.trim();

    if (!keyVal) {
      msg.className = "contribute-msg err";
      msg.textContent = "영어 키워드를 입력해 주세요.";
      return;
    }
    if (!ko && !desc) {
      msg.className = "contribute-msg err";
      msg.textContent = "한글 표기나 설명 중 하나는 입력해 주세요.";
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
          key: keyVal,
          ko,
          desc,
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

  modal.hidden = false;
  document.body.style.overflow = "hidden";
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

$("#kw-add-btn").addEventListener("click", () => openForm(undefined));

// 초기 로드
async function init() {
  try {
    const res = await fetch("./keywords.json");
    KEYWORDS = res.ok ? await res.json() : {};
  } catch (err) {
    statusEl.textContent = "데이터를 불러오지 못했습니다.";
    console.error(err);
    return;
  }
  render();
}

init();
