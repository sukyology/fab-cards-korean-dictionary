// 배포 시 app.js / style.css 에 콘텐츠 해시 쿼리스트링을 붙여
// 파일 내용이 바뀔 때마다 URL도 바뀌게 해서 CDN·브라우저 캐시를 무력화한다.
// public/index.html 자체는 커밋된 원본을 건드리지 않고, 빌드 산출물에서만 치환한다.
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

const [appJsHash, styleCssHash] = await Promise.all([hashOf("app.js"), hashOf("style.css")]);

const indexPath = join(PUBLIC, "index.html");
let html = await readFile(indexPath, "utf8");
html = html.replace('href="./style.css"', `href="./style.css?v=${styleCssHash}"`);
html = html.replace('src="./app.js"', `src="./app.js?v=${appJsHash}"`);
await writeFile(indexPath, html);

console.log(`캐시 버스팅 완료: style.css?v=${styleCssHash}, app.js?v=${appJsHash}`);
