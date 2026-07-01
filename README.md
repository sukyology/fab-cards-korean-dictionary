# FAB 한글 카드 사전

플레시 앤 블러드(Flesh and Blood) 카드를 **한글로 빠르게 찾아보는** 정적 웹사이트입니다.
영어를 잘 몰라도 카드 이름이나 효과로 검색해 한글 번역과 키워드 설명을 볼 수 있습니다.

- **카드 데이터**: [the-fab-cube/flesh-and-blood-cards](https://github.com/the-fab-cube/flesh-and-blood-cards) (영어 원본, 4,000장 이상)를 **이 저장소로 동기화**해 `public/cards.json` 에 커밋. 페이지는 이 파일만 읽습니다(배포 시 외부 다운로드 없음).
- **한글 번역**: 이 저장소의 `data/translations.json` 에서 커뮤니티가 직접 관리
- **호스팅**: GitHub Pages (정적 사이트, 서버 불필요)

## 구조

```
data/
  translations.json   # 카드 한글 번역 (커뮤니티가 편집하는 핵심 파일)
  keywords.json       # FAB 키워드 한글 용어집
scripts/
  build-data.mjs      # 원본 다운로드 → 슬림화 → 번역 머지 → public/cards.json 동기화
  serve.mjs           # 로컬 미리보기 서버
public/
  index.html, style.css, app.js   # 사이트 본체
  cards.json          # 동기화된 카드 데이터 (저장소에 커밋, 페이지가 읽는 파일)
  keywords.json       # 키워드 용어집 (저장소에 커밋)
.github/workflows/
  deploy.yml          # main 푸시 시 커밋된 public/ 을 Pages에 게시
  sync-cards.yml      # 원본 데이터를 받아 public/cards.json 갱신·커밋 (수동/주간)
```

## 데이터 동기화 모델

카드 데이터는 **저장소에 커밋된 `public/cards.json`** 하나로 관리됩니다. 페이지는 이 파일만 읽고,
배포 시 외부에서 원본을 내려받지 않습니다. 원본이 갱신되면 아래 방법으로 이 파일을 다시 동기화합니다.

- **GitHub에서 (권장)**: 저장소 **Actions 탭 → "Sync card data" → Run workflow**. 최신 원본을 받아
  `public/cards.json` 을 갱신·커밋하고, 이어서 자동 재배포됩니다. (매주 월요일 자동 실행도 설정되어 있습니다.)
- **로컬에서**: `.cache/` 를 지우고 `node scripts/build-data.mjs` 실행 후 `public/cards.json` 을 커밋.

## 로컬에서 실행하기

필요: Node.js 18 이상.

```bash
node scripts/build-data.mjs   # cards.json 동기화 (최초 1회 원본 ~20MB 다운로드, 이후 .cache 재사용)
node scripts/serve.mjs        # http://localhost:8080 미리보기
```

## 한글 번역 추가/수정하기 (가장 중요)

번역은 **`data/translations.json`** 한 파일에 모읍니다. 키는 카드의 고유 id(`unique_id`)입니다.

1. 사이트에서 번역하려는 카드를 검색하고 클릭합니다.
2. 상세 화면 맨 아래 `id: ...` 값을 복사합니다.
3. `data/translations.json` 에 항목을 추가합니다:

```json
"여기에_복사한_id": {
  "_name_en": "영어 이름 (참고용, 빌드에 미사용)",
  "name_ko": "한글 카드 이름",
  "type_text_ko": "공용 액션 - 공격",
  "text_ko": "카드 효과 한글 번역"
}
```

- `name_ko` 만 채워도 됩니다. `text_ko`, `type_text_ko` 는 선택입니다.
- 효과 텍스트의 `{p}`(공격력) `{d}`(방어력) `{h}`(생명력) `{r}`(자원) 토큰은 그대로 두면 사이트가 자동으로 한글 라벨로 표시합니다.
- 같은 이름이라도 피치(빨강/노랑/파랑)별로 id가 다릅니다. 각각 추가해야 모두 번역됩니다.

번역은 `public/cards.json` 에 머지되어 저장되므로, 편집 후 **cards.json 을 다시 만들어야** 사이트에 반영됩니다.

- **로컬**: `node scripts/build-data.mjs` 실행 → `data/translations.json` 과 `public/cards.json` 을 함께 커밋·푸시.
- **GitHub만으로**: `data/translations.json` 을 웹에서 편집·커밋한 뒤, **Actions 탭 → "Sync card data" → Run workflow** 실행. `public/cards.json` 이 갱신·커밋되고 자동 재배포됩니다.

키워드 용어집은 `data/keywords.json` 에서 같은 방식으로 추가합니다.

## 배포 (GitHub Pages)

1. 이 저장소를 GitHub에 올립니다.
2. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 설정합니다.
3. `main` 브랜치에 푸시하면 `.github/workflows/deploy.yml` 이 커밋된 `public/` 을 그대로 게시합니다.
4. 카드 데이터를 최신 원본으로 갱신하려면 **Actions 탭 → "Sync card data" → Run workflow** 를 실행합니다.

## 라이선스 / 저작권

비공식 팬 사이트입니다. Flesh and Blood™ 및 카드 이미지의 저작권은 Legend Story Studios에 있습니다.
코드는 MIT 라이선스입니다.
