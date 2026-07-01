// Cloudflare Worker: 사이트의 번역 제안 폼을 받아 GitHub에 검토용 PR을 자동 생성한다.
//
// 엔드포인트: POST /api/translate
//   body: { cardId, nameEn, nameKo, textKo, contributor?, turnstileToken? }
//   응답: { ok: true, prUrl } 또는 { error }
//
// 필요한 시크릿(wrangler secret put):
//   GITHUB_TOKEN     - 이 저장소에 Contents/Pull requests 쓰기 권한이 있는 fine-grained PAT
//   TURNSTILE_SECRET - (선택) Cloudflare Turnstile 시크릿. 설정하면 스팸 방지 검증을 강제한다.
// 변수(wrangler.toml [vars]): GITHUB_OWNER, GITHUB_REPO, BASE_BRANCH, TRANSLATIONS_PATH, ALLOWED_ORIGIN

const GH_API = "https://api.github.com";

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "POST만 허용됩니다." }, 405, cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "요청 형식이 올바르지 않습니다." }, 400, cors);
    }

    const cardId = String(body.cardId || "").trim();
    const nameEn = String(body.nameEn || "").trim().slice(0, 120);
    const nameKo = String(body.nameKo || "").trim().slice(0, 100);
    const textKo = String(body.textKo || "").trim().slice(0, 2000);
    const contributor = String(body.contributor || "").trim().slice(0, 40);

    if (!/^[A-Za-z0-9_-]{3,40}$/.test(cardId)) return json({ error: "카드 id가 올바르지 않습니다." }, 400, cors);
    if (!nameKo && !textKo) return json({ error: "한글 이름이나 효과 중 하나는 입력해야 합니다." }, 400, cors);

    // Turnstile 스팸 방지(시크릿이 설정된 경우에만 강제)
    if (env.TURNSTILE_SECRET) {
      const ok = await verifyTurnstile(
        env.TURNSTILE_SECRET,
        body.turnstileToken,
        request.headers.get("CF-Connecting-IP")
      );
      if (!ok) return json({ error: "스팸 방지 확인에 실패했습니다. 다시 시도해 주세요." }, 403, cors);
    }

    if (!env.GITHUB_TOKEN) return json({ error: "서버 설정 오류입니다(GITHUB_TOKEN 미설정)." }, 500, cors);

    try {
      const result = await createTranslationPR(env, { cardId, nameEn, nameKo, textKo, contributor });
      if (result.noChange) return json({ error: "기존과 동일해 변경된 내용이 없습니다." }, 400, cors);
      return json({ ok: true, prUrl: result.prUrl }, 200, cors);
    } catch (e) {
      return json({ error: "PR 생성 중 오류가 발생했습니다: " + e.message }, 502, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });
}

async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const d = await r.json();
  return !!d.success;
}

// GitHub API 호출 헬퍼
async function ghJson(env, path, init = {}) {
  const r = await fetch(GH_API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "fab-translate-worker",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${init.method || "GET"} ${path} → ${r.status} ${d.message || ""}`);
  return d;
}

async function createTranslationPR(env, { cardId, nameEn, nameKo, textKo, contributor }) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const base = env.BASE_BRANCH || "main";
  const path = env.TRANSLATIONS_PATH || "data/translations.json";

  // 1) base 브랜치의 HEAD 커밋 sha
  const ref = await ghJson(env, `/repos/${owner}/${repo}/git/ref/heads/${base}`);
  const baseSha = ref.object.sha;

  // 2) 현재 translations.json 내용 + 파일 sha
  const fileMeta = await ghJson(env, `/repos/${owner}/${repo}/contents/${path}?ref=${base}`);
  const current = JSON.parse(b64DecodeUtf8(fileMeta.content));

  // 3) 항목 병합(빈 값은 덮어쓰지 않음)
  const beforeJson = JSON.stringify(current[cardId] ?? null);
  const entry = current[cardId] && typeof current[cardId] === "object" ? { ...current[cardId] } : {};
  if (nameEn) entry._name_en = nameEn;
  if (nameKo) entry.name_ko = nameKo;
  if (textKo) entry.text_ko = textKo;
  current[cardId] = entry;

  if (JSON.stringify(entry) === beforeJson) return { noChange: true };

  const newContent = JSON.stringify(current, null, 2) + "\n";

  // 4) 새 브랜치 생성
  const branch = `translate/${cardId}-${crypto.randomUUID().slice(0, 8)}`;
  await ghJson(env, `/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });

  // 5) 파일 커밋
  const who = contributor ? ` (제안: ${contributor})` : "";
  await ghJson(env, `/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `번역 제안: ${nameEn || cardId}${who}`,
      content: b64EncodeUtf8(newContent),
      sha: fileMeta.sha,
      branch,
    }),
  });

  // 6) PR 생성
  const pr = await ghJson(env, `/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: `번역 제안: ${nameEn || cardId}`,
      head: branch,
      base,
      body: prBody({ cardId, nameEn, nameKo, textKo, contributor }),
    }),
  });

  return { prUrl: pr.html_url };
}

function prBody({ cardId, nameEn, nameKo, textKo, contributor }) {
  return [
    `사이트 번역 제안 폼으로 접수된 PR입니다.`,
    ``,
    `- 카드: **${nameEn || "(이름 없음)"}**`,
    `- id: \`${cardId}\``,
    contributor ? `- 제안자: ${contributor}` : `- 제안자: (익명)`,
    ``,
    `**한글 이름**: ${nameKo || "(변경 없음)"}`,
    ``,
    `**한글 효과**:`,
    ``,
    "```",
    textKo || "(변경 없음)",
    "```",
    ``,
    `관리자 검토 후 병합해 주세요.`,
  ].join("\n");
}

// UTF-8 안전 base64 인코딩/디코딩(한글 포함)
function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64DecodeUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
