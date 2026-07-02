// 배포 시 정적 자산에 콘텐츠 해시 쿼리스트링을 붙여
// 파일 내용이 바뀔 때마다 URL도 바뀌게 해서 CDN·브라우저 캐시를 무력화한다.
// cards.json/keywords.json은 <script> 태그가 아니라 app.js/keywords-app.js 안의
// fetch() 호출로 불러오므로, 그 fetch 경로에 먼저 해시를 심은 뒤 app.js 자체의
// 해시를 계산한다(데이터가 바뀌면 app.js URL도 함께 바뀌어 캐시가 갱신된다).
// 커밋된 원본은 건드리지 않고, 빌드 산출물(public/)에서만 치환한다.
// 사용: node scripts/cache-bust.mjs (deploy.yml에서 아티팩트 업로드 전에 실행)

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");

async function hashOf(file) {
  const data = await readFile(join(PUBLIC, file));
  return createHash("sha256").update(data).digest("hex").slice(0, 8);
}

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`캐시 버스팅 실패: "${label}"에서 "${from}"을 찾지 못했습니다.`);
  return text.replace(from, to);
}

const [cardsHash, keywordsHash] = await Promise.all([hashOf("cards.json"), hashOf("keywords.json")]);

// fetch() 호출에 데이터 해시를 심는다 (app.js, keywords-app.js 안에서만)
const appJsPath = join(PUBLIC, "app.js");
let appJs = await readFile(appJsPath, "utf8");
appJs = replaceOnce(appJs, 'fetch("./cards.json")', `fetch("./cards.json?v=${cardsHash}")`, "app.js");
appJs = replaceOnce(appJs, 'fetch("./keywords.json")', `fetch("./keywords.json?v=${keywordsHash}")`, "app.js");
await writeFile(appJsPath, appJs);

const keywordsAppJsPath = join(PUBLIC, "keywords-app.js");
let keywordsAppJs = await readFile(keywordsAppJsPath, "utf8");
keywordsAppJs = replaceOnce(
  keywordsAppJs,
  'fetch("./keywords.json")',
  `fetch("./keywords.json?v=${keywordsHash}")`,
  "keywords-app.js"
);
await writeFile(keywordsAppJsPath, keywordsAppJs);

// 이제 app.js/keywords-app.js 자체 콘텐츠 해시를 계산해 HTML의 <script>/<link>에 심는다
const [appJsHash, keywordsAppJsHash, styleCssHash] = await Promise.all([
  hashOf("app.js"),
  hashOf("keywords-app.js"),
  hashOf("style.css"),
]);

const indexPath = join(PUBLIC, "index.html");
let index = await readFile(indexPath, "utf8");
index = replaceOnce(index, 'href="./style.css"', `href="./style.css?v=${styleCssHash}"`, "index.html");
index = replaceOnce(index, 'src="./app.js"', `src="./app.js?v=${appJsHash}"`, "index.html");
await writeFile(indexPath, index);

const keywordsHtmlPath = join(PUBLIC, "keywords.html");
let keywordsHtml = await readFile(keywordsHtmlPath, "utf8");
keywordsHtml = replaceOnce(keywordsHtml, 'href="./style.css"', `href="./style.css?v=${styleCssHash}"`, "keywords.html");
keywordsHtml = replaceOnce(
  keywordsHtml,
  'src="./keywords-app.js"',
  `src="./keywords-app.js?v=${keywordsAppJsHash}"`,
  "keywords.html"
);
await writeFile(keywordsHtmlPath, keywordsHtml);

console.log(
  `캐시 버스팅 완료: cards.json→${cardsHash}, keywords.json→${keywordsHash}, app.js→${appJsHash}, keywords-app.js→${keywordsAppJsHash}, style.css→${styleCssHash}`
);
