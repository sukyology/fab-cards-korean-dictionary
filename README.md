# FAB 한글 카드 사전

플레시 앤 블러드(Flesh and Blood) 카드를 **한글로 빠르게 찾아보는** 정적 웹사이트입니다.
영어를 잘 몰라도 카드 이름이나 효과로 검색해 한글 번역과 키워드 설명을 볼 수 있습니다.

- **카드 데이터**: [the-fab-cube/flesh-and-blood-cards](https://github.com/the-fab-cube/flesh-and-blood-cards) (영어 원본, 4,000장 이상)에서 자동 수집
- **한글 번역**: 이 저장소의 `data/translations.json` 에서 커뮤니티가 직접 관리
- **호스팅**: GitHub Pages (정적 사이트, 서버 불필요)

## 구조

```
data/
  translations.json   # 카드 한글 번역 (커뮤니티가 편집하는 핵심 파일)
  keywords.json       # FAB 키워드 한글 용어집
scripts/
  build-data.mjs      # 원본 다운로드 → 슬림화 → 번역 머지 → public/cards.json 생성
  serve.mjs           # 로컬 미리보기 서버
public/
  index.html, style.css, app.js   # 사이트 본체
  cards.json, keywords.json        # 빌드 산출물(자동 생성, git 미추적)
.github/workflows/deploy.yml       # 푸시 시 자동 빌드+배포
```

## 로컬에서 실행하기

필요: Node.js 18 이상.

```bash
node scripts/build-data.mjs   # 카드 데이터 생성 (최초 1회 원본 ~20MB 다운로드, 이후 .cache 재사용)
node scripts/serve.mjs        # http://localhost:8080 미리보기
```

원본 데이터를 최신으로 다시 받으려면 `.cache/` 폴더를 지우고 다시 빌드하세요.

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

저장 후 `node scripts/build-data.mjs` 를 다시 실행하면 반영됩니다. GitHub에 푸시하면 자동 배포됩니다.

키워드 용어집은 `data/keywords.json` 에서 같은 방식으로 추가합니다.

## 배포 (GitHub Pages)

1. 이 저장소를 GitHub에 올립니다.
2. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 설정합니다.
3. `main` 브랜치에 푸시하면 `.github/workflows/deploy.yml` 이 자동으로 빌드·배포합니다.
4. 원본 카드 데이터가 갱신되었을 때는 Actions 탭에서 워크플로를 수동 실행(workflow_dispatch)하면 최신 카드가 반영됩니다.

## 라이선스 / 저작권

비공식 팬 사이트입니다. Flesh and Blood™ 및 카드 이미지의 저작권은 Legend Story Studios에 있습니다.
코드는 MIT 라이선스입니다.
