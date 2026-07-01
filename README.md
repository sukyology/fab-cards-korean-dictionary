# FAB 한글 카드 사전

플레시 앤 블러드(Flesh and Blood) 카드를 **한글로 빠르게 찾아보는** 정적 웹사이트입니다.
영어를 잘 몰라도 카드 이름이나 효과로 검색해 한글 번역과 키워드 설명을 볼 수 있습니다.

- **카드 데이터**: [the-fab-cube/flesh-and-blood-cards](https://github.com/the-fab-cube/flesh-and-blood-cards) (영어 원본, 4,000장 이상)에서 자동 수집
- **한글 번역**: 이 저장소의 `data/translations.json` 에서 커뮤니티가 직접 관리
- **호스팅**: GitHub Pages (정적 사이트, 서버 불필요)

## 구조

```
data/
  translations.json   # 카드별 한글 번역: 이름·효과 (unique_id 키)
  type_texts.json     # 카드 타입(type_text) 한글 번역 (영어 타입 → 한글, 한 곳에서 관리)
  keywords.json       # FAB 키워드 한글 용어집
scripts/
  build-data.mjs      # 원본 다운로드 → 슬림화 → 번역·타입 머지 → public/cards.json 생성
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
  "text_ko": "카드 효과 한글 번역"
}
```

- `name_ko` 만 채워도 됩니다. `text_ko` 는 선택입니다.
- 효과 텍스트의 `{p}`(공격력) `{d}`(방어력) `{h}`(생명력) `{r}`(자원) 토큰은 그대로 두면 사이트가 자동으로 한글 라벨로 표시합니다.
- 같은 이름이라도 피치(빨강/노랑/파랑)별로 id가 다릅니다. 각각 추가해야 모두 번역됩니다.

저장 후 `node scripts/build-data.mjs` 를 다시 실행하면 반영됩니다. GitHub에 푸시하면 자동 배포됩니다.

### 카드 타입 번역 (`data/type_texts.json`)

카드 타입(`type_text`, 예: `Generic Action - Attack`)은 **카드별이 아니라 영어 타입 문자열 기준으로 한 곳에서** 번역합니다.
같은 영어 타입은 항상 같은 한글로 표시되어 카드마다 다르게 번역될 수 없습니다. 새 타입을 추가하려면 영어 타입 문자열을 키로 넣으세요:

```json
{
  "Generic Action - Attack": "공용 액션 - 공격",
  "Ninja Defense Reaction": "닌자 방어 반응"
}
```

이 매핑은 번역된 카드뿐 아니라 **모든 카드**의 타입 표시에 적용됩니다(카드 효과 번역 여부와 무관).

키워드 용어집은 `data/keywords.json` 에서 같은 방식으로 추가합니다.

## Claude로 대량 번역하기 (초벌 번역)

미번역 카드 전체를 Anthropic **Message Batches API**로 한 번에 초벌 번역합니다(비동기·50% 저렴). 결과는 `data/translations.json` 에 머지됩니다.

필요: Anthropic API 키(`ANTHROPIC_API_KEY` 환경변수) 또는 `ant auth login`.

```bash
node scripts/build-data.mjs            # public/cards.json 최신화(입력 데이터)
DRY=1 node scripts/translate-batch.mjs # 제출 없이 요청 수/견적만 확인
TRANSLATE_LIMIT=20 node scripts/translate-batch.mjs   # 20개만 테스트 제출
node scripts/translate-batch.mjs       # 전체 제출 → 완료까지 대기 → 머지
node scripts/build-data.mjs            # 번역 반영해 cards.json 재생성
# data/translations.json 커밋·푸시 → 자동 배포
```

- 중복(피치·재판) 카드는 `(이름, 효과)` 기준으로 묶어 한 번만 번역합니다(약 4,800장 → ~3,800건).
- 기본 모델은 `claude-opus-4-8`. 비용을 줄이려면 `TRANSLATE_MODEL=claude-haiku-4-5` 또는 `claude-sonnet-5` 로 바꿀 수 있습니다.
- 이미 번역된 카드는 건너뜁니다. 전부 다시 번역하려면 `TRANSLATE_OVERWRITE=1`.
- 제출 후 중단되어도 재실행하면 `.cache/translate-batch.json` 의 배치를 이어서 대기·머지합니다.
- **초벌 번역이므로 사람이 검수·수정하는 것을 권장합니다**(사이트 "번역 제안" 폼 또는 `data/translations.json` 직접 편집).

## 누구나 번역 제안하기 (사이트 폼 → 자동 PR)

방문자가 GitHub 계정 없이도 카드 상세의 **"번역 제안하기"** 버튼으로 한글 번역을 제안할 수 있습니다.
제출하면 Cloudflare Worker가 `data/translations.json` 을 수정한 검토용 PR을 자동으로 생성하고, 관리자가 확인 후 병합합니다.

- Worker 코드와 배포 방법: [`worker/README.md`](worker/README.md)
- 활성화하려면 Worker를 배포하고(`wrangler deploy`), 봇 토큰 시크릿을 등록해야 합니다. 배포 전에는 버튼이 보이지만 제출은 동작하지 않습니다.
- 스팸 방지(Turnstile)는 선택이지만 공개 엔드포인트이므로 권장합니다.

## 배포 (GitHub Pages)

1. 이 저장소를 GitHub에 올립니다.
2. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 설정합니다.
3. `main` 브랜치에 푸시하면 `.github/workflows/deploy.yml` 이 자동으로 빌드·배포합니다.
4. 원본 카드 데이터가 갱신되었을 때는 Actions 탭에서 워크플로를 수동 실행(workflow_dispatch)하면 최신 카드가 반영됩니다.

## 라이선스 / 저작권

비공식 팬 사이트입니다. Flesh and Blood™ 및 카드 이미지의 저작권은 Legend Story Studios에 있습니다.
코드는 MIT 라이선스입니다.
