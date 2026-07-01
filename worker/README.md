# 번역 제안 → 자동 PR Worker

사이트의 "번역 제안" 폼(`POST /api/translate`)을 받아 GitHub에 검토용 PR을 자동으로 만드는 Cloudflare Worker입니다.
기여자는 GitHub 계정이 필요 없고, 모든 제안은 PR로 접수되어 관리자가 검토·병합합니다.

## 동작

폼 제출 → Worker가 봇 토큰으로 `data/translations.json` 을 수정한 새 브랜치를 만들고 PR을 생성 → 관리자 검토 후 merge → 자동 재배포.

## 배포 방법

필요: [Node.js], Cloudflare 계정, `dol-dari.com` 이 Cloudflare에 연결되어 있을 것.

```bash
npm install -g wrangler       # 최초 1회
cd worker
wrangler login                # Cloudflare 계정 인증
```

### 1) GitHub 토큰 준비 (fine-grained PAT)

github.com → Settings → Developer settings → **Fine-grained tokens** → Generate:

- **Repository access**: `sukyology/fab-cards-korean-dictionary` 만 선택
- **Permissions**:
  - Contents: **Read and write**
  - Pull requests: **Read and write**
  - (Metadata: Read — 자동)

생성된 토큰을 시크릿으로 등록:

```bash
wrangler secret put GITHUB_TOKEN
# 프롬프트에 토큰 붙여넣기
```

### 2) (선택, 권장) Turnstile 스팸 방지

Cloudflare 대시보드 → **Turnstile** → 위젯 추가(도메인 `fab.dol-dari.com`) → **사이트 키**와 **시크릿 키** 발급.

```bash
wrangler secret put TURNSTILE_SECRET   # 시크릿 키 등록
```

그리고 사이트 쪽 `public/app.js` 의 `TURNSTILE_SITEKEY` 에 **사이트 키**를 넣습니다.
(시크릿을 등록하지 않으면 Turnstile 없이 동작하지만, 공개 엔드포인트라 스팸 방지를 권장합니다.)

### 3) 배포

```bash
wrangler deploy
```

`wrangler.toml` 의 `routes` 덕분에 `fab.dol-dari.com/api/*` 요청이 이 Worker로 라우팅됩니다.
(라우트 자동 등록이 안 되면 Cloudflare 대시보드 → Workers & Pages → 해당 Worker → Settings → Domains & Routes 에서 `fab.dol-dari.com/api/*` 를 수동 추가하세요.)

## 확인

```bash
curl -X POST https://fab.dol-dari.com/api/translate \
  -H "Content-Type: application/json" \
  -d '{"cardId":"PHktCwKzLmBMwmCBwb7Cw","nameEn":"Snatch","nameKo":"스내치 테스트"}'
# → {"ok":true,"prUrl":"https://github.com/.../pull/N"}
```

## 설정값 (wrangler.toml [vars])

| 변수 | 설명 |
|---|---|
| `GITHUB_OWNER` / `GITHUB_REPO` | 대상 저장소 |
| `BASE_BRANCH` | PR 대상 브랜치(main) |
| `TRANSLATIONS_PATH` | 수정할 파일(data/translations.json) |
| `ALLOWED_ORIGIN` | CORS 허용 오리진(사이트 도메인) |
