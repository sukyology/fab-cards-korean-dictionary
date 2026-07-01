// 원본 영어 카드 데이터(the-fab-cube/flesh-and-blood-cards)를 내려받아
// 사이트에서 쓰기 좋은 형태로 슬림화하고, data/translations.json 의 한글 번역을 머지하여
// public/cards.json 을 생성한다.
//
// 사용: node scripts/build-data.mjs
// 환경변수 FAB_SOURCE_URL 로 원본 위치를 바꿀 수 있다.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SOURCE_URL =
  process.env.FAB_SOURCE_URL ||
  "https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/main/json/english/card.json";

const CACHE_PATH = join(ROOT, ".cache", "card.json");
const TRANSLATIONS_PATH = join(ROOT, "data", "translations.json");
const TYPE_TEXTS_PATH = join(ROOT, "data", "type_texts.json");
const KEYWORDS_PATH = join(ROOT, "data", "keywords.json");
const OUT_PATH = join(ROOT, "public", "cards.json");
const KEYWORDS_OUT_PATH = join(ROOT, "public", "keywords.json");

async function loadSource() {
  // 캐시가 있으면 재사용(반복 빌드 시 20MB 재다운로드 방지). 새로 받으려면 .cache 삭제.
  if (existsSync(CACHE_PATH)) {
    console.log("원본 캐시 사용:", CACHE_PATH);
    return JSON.parse(await readFile(CACHE_PATH, "utf8"));
  }
  console.log("원본 다운로드:", SOURCE_URL);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`다운로드 실패 ${res.status}: ${SOURCE_URL}`);
  const text = await res.text();
  await mkdir(dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, text);
  return JSON.parse(text);
}

// 카드 1장에서 대표 이미지 URL을 고른다(이미지가 있는 첫 인쇄본).
function pickImage(printings) {
  if (!Array.isArray(printings)) return "";
  const withImg = printings.find((p) => p.image_url);
  return withImg ? withImg.image_url : "";
}

// 카드가 속한 세트 id 목록(중복 제거).
function collectSets(printings) {
  if (!Array.isArray(printings)) return [];
  return [...new Set(printings.map((p) => p.set_id).filter(Boolean))];
}

function slim(card) {
  return {
    id: card.unique_id,
    name: card.name,
    color: card.color || "",
    pitch: card.pitch || "",
    cost: card.cost || "",
    power: card.power || "",
    defense: card.defense || "",
    health: card.health || "",
    types: card.types || [],
    traits: card.traits || [],
    keywords: card.card_keywords || [],
    type_text: card.type_text || "",
    text: card.functional_text_plain || "",
    image: pickImage(card.printings),
    sets: collectSets(card.printings),
  };
}

async function main() {
  const source = await loadSource();
  console.log(`원본 카드 수: ${source.length}`);

  let translations = {};
  if (existsSync(TRANSLATIONS_PATH)) {
    translations = JSON.parse(await readFile(TRANSLATIONS_PATH, "utf8"));
  }

  // 타입 번역은 영어 type_text 기준으로 한 곳에서 관리 → 같은 영어 타입은 항상 같은 한글
  let typeTexts = {};
  if (existsSync(TYPE_TEXTS_PATH)) {
    typeTexts = JSON.parse(await readFile(TYPE_TEXTS_PATH, "utf8"));
  }

  let translatedCount = 0;
  const cards = source.map((card) => {
    const c = slim(card);
    const t = translations[c.id];
    if (t) {
      if (t.name_ko) c.name_ko = t.name_ko;
      if (t.text_ko) c.text_ko = t.text_ko;
      if (t.name_ko || t.text_ko) translatedCount++;
    }
    // type_text_ko 는 카드별 번역이 아니라 type_texts.json 매핑에서만 채운다
    const typeKo = typeTexts[c.type_text];
    if (typeKo) c.type_text_ko = typeKo;
    return c;
  });

  // 번역 파일에 원본에 없는 id가 있으면 경고(오타/구버전 데이터 감지)
  const validIds = new Set(cards.map((c) => c.id));
  for (const id of Object.keys(translations)) {
    if (id.startsWith("_")) continue; // 메타 키(_comment 등)는 무시
    if (!validIds.has(id)) {
      console.warn(`경고: 번역에 있으나 원본에 없는 카드 id: ${id}`);
    }
  }

  // type_texts.json 에 원본에 없는 type_text가 있으면 경고(오타 감지)
  const validTypeTexts = new Set(cards.map((c) => c.type_text));
  for (const tt of Object.keys(typeTexts)) {
    if (tt.startsWith("_")) continue;
    if (!validTypeTexts.has(tt)) {
      console.warn(`경고: type_texts에 있으나 원본에 없는 type_text: "${tt}"`);
    }
  }

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(cards));

  // 키워드 용어집을 사이트로 복사(_comment 메타 키 제거)
  if (existsSync(KEYWORDS_PATH)) {
    const kw = JSON.parse(await readFile(KEYWORDS_PATH, "utf8"));
    delete kw._comment;
    await writeFile(KEYWORDS_OUT_PATH, JSON.stringify(kw));
    console.log(`키워드 용어집 ${Object.keys(kw).length}개 복사`);
  }

  const typeTranslatedCount = cards.filter((c) => c.type_text_ko).length;
  const sizeMb = (JSON.stringify(cards).length / 1024 / 1024).toFixed(2);
  console.log(`생성 완료: ${OUT_PATH}`);
  console.log(
    `총 ${cards.length}장, 한글 번역 ${translatedCount}장, 타입 번역 적용 ${typeTranslatedCount}장(타입 ${Object.keys(typeTexts).filter((k) => !k.startsWith("_")).length}종), 크기 ${sizeMb}MB`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
