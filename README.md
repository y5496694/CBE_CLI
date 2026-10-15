# CBE CLI — 충북소통메신저 CLI

충북소통메신저를 터미널에서 사용하는 Windows용 비공식 도구입니다. 현재 로그인된 메신저에 연결해 조직 사용자 검색, 쪽지·대화 조회, 기존 1:1 대화 전송을 수행합니다. 일반 조회와 대화 전송은 메신저 창을 띄우거나 앞으로 가져오지 않고 **백그라운드에서 처리**합니다.

**소통메신저 자동화를 원하시면 [cbe-messenger 스킬](skills/cbe-messenger/SKILL.md)을 참조하시면 됩니다.** AI 에이전트가 자연어 요청을 CLI 명령으로 처리할 수 있도록 실행 코드와 사용 지침을 함께 제공합니다. [스킬 설치 방법](#ai로-소통메신저-자동화하기)도 아래에 있습니다.

## 시작하기

필요한 환경:

- Windows와 [Node.js](https://nodejs.org/) **22.19 이상**
- 실행 중이며 본인 계정으로 로그인된 충북소통메신저
- 메신저 앱이 제공하는 로컬 디버깅 연결. 기본 주소는 `127.0.0.1:9000`입니다.

> 현재 연결·조회·전송은 제작 환경의 PC에서 확인했습니다. 다른 PC나 메신저 버전에서도 같은 디버깅 포트를 제공하는지는 먼저 `status`로 확인해야 합니다. 앱이 포트를 제공하지 않는 환경에서의 연결 방법은 아직 검증하지 않았습니다.

### 1. 내려받기

[Code → Download ZIP](https://github.com/y5496694/CBE_CLI/archive/refs/heads/main.zip)으로 내려받아 압축을 풀거나 Git으로 복제합니다.

```powershell
git clone https://github.com/y5496694/CBE_CLI.git
cd CBE_CLI
```

### 2. 연결 확인

충북소통메신저를 실행하고 로그인한 뒤, 이 저장소 폴더에서 실행합니다.

```powershell
node --version
.\cbe.cmd status
.\cbe.cmd --help
```

`node .\cli.mjs status`로 실행해도 됩니다. **추가 npm 패키지 설치나 빌드는 필요 없습니다.** `cli.mjs`, `messenger.mjs`, `cbe.cmd`는 같은 폴더에 유지하세요. 메신저의 설치 경로나 Windows 사용자 이름을 코드에 입력할 필요는 없습니다.

### 3. 선택: 어디서나 `cbe`로 실행

저장소 폴더에서 한 번 설치합니다.

```powershell
npm install --global .
cbe status
```

설치 후 명령이 보이지 않으면 새 터미널을 열어 확인하세요. 아래 예제는 전역 설치한 `cbe`를 사용합니다. 전역 설치하지 않았다면 저장소 폴더에서 `cbe` 대신 `.\cbe.cmd` 또는 `node .\cli.mjs`를 사용하면 됩니다. 로컬 폴더를 전역 설치한 뒤 원본 폴더를 옮기면 다시 설치해야 합니다.

## 주요 명령어

| 작업 | 명령 |
| --- | --- |
| 연결 및 현재 계정 확인 | `cbe status` |
| 이름 검색: 내 조직 우선 | `cbe users search "홍길동"` |
| 전체 조직에서 이름 검색 | `cbe users search "홍길동" --scope all` |
| 내 조직에서만 이름 검색 | `cbe users search "홍길동" --scope my` |
| 사용자 프로필 확인 | `cbe users show "사용자ID" --json` |
| 받은 쪽지 목록 | `cbe notes list --box received` |
| 읽지 않은 쪽지 목록 | `cbe notes list --box unread` |
| 쪽지 본문 검색 | `cbe notes list --search "회의" --search-type content` |
| 쪽지 본문 조회 | `cbe notes read "쪽지ID" --type R` |
| 대화방 목록 | `cbe chats list` |
| 대화방 검색 | `cbe chats list --search "홍길동"` |
| 대화 내용 조회 | `cbe chats read "대화방ID"` |
| 기존 1:1 대화로 전송 | `cbe chats send --to "사용자ID" --text "전송할 내용" --json` |
| 메모 목록 | `cbe memos list --json` |
| 전체 도움말 | `cbe --help` |

예제의 `사용자ID`, `쪽지ID`, `대화방ID`는 조회 결과에 표시된 실제 `id` 값으로 바꿔 입력하세요. 이름은 검색에 사용하고, 전송 시에는 동명이인을 구분한 **사용자 ID**를 사용합니다.

### 사용자 검색: 내 조직 → 전체 조직

```powershell
cbe users search "홍길동" --json
cbe users search "홍길동" --scope all --limit 100 --json
cbe users search "홍길동" --scope my --json
```

- 기본 `--scope auto`: 로그인 계정의 **내 조직(소속 학교·기관)**에서 먼저 찾습니다. 일치하는 사람이 없으면 전체 조직으로 검색을 넓혀 후보를 반환합니다.
- `--scope all`: 내 조직 검색을 건너뛰고 처음부터 전체 조직에서 찾습니다.
- `--scope my`: 내 조직에서만 찾습니다. 없더라도 전체 조직으로 전환하지 않습니다.

내 조직은 현재 계정의 조직 목록에서 확인하므로 특정 학교나 계정을 코드에 고정하지 않습니다. 조회 실패를 “이름 없음”으로 취급하지 않습니다. JSON 결과의 `scope`는 실제 검색 범위, `fallback:true`는 내 조직에 없어 전체 조직으로 전환했음을 뜻합니다. 동명이인이 여러 명이면 `department` 등으로 소속을 확인하세요. 내 조직 목록에서 직책·업무가 비어 있으면 `users show`로 추가 정보를 조회할 수 있습니다.

### 쪽지 조회·검색

```powershell
cbe notes list --box received --limit 20 --json
cbe notes list --box sent --page 2 --limit 20 --json
cbe notes list --search "자료" --search-type title --json
cbe notes read "받은쪽지ID" --type R --json
cbe notes read "보낸쪽지ID" --type S --json
cbe notes read "예약쪽지ID" --type S --reserved --json
```

`--box`는 `all`, `received`, `sent`, `unread`, `important`, `self`, `reserved`를 지원합니다. `--search-type`은 `send`(보낸 사람, 기본값), `receive`(받는 사람), `title`, `content`입니다.

본문은 `text`, 첨부파일 이름·크기는 `files`로 반환합니다. 첨부파일 다운로드와 보안 쪽지 해제는 구현하지 않았습니다. 보안·회수 쪽지의 본문은 앱에서 확인하도록 표시합니다.

쪽지 후속 페이지의 기준값은 **첫 페이지 첫 행의 날짜**입니다. `--page 2`부터 CLI가 이 기준값을 자동으로 구합니다. 같은 시점의 기록을 이어서 조회하려면 첫 페이지의 `offset`을 명시하고 `--limit`과 검색 조건을 유지하세요.

```powershell
$first = cbe notes list --limit 20 --json | ConvertFrom-Json
cbe notes list --page 2 --limit 20 --offset $first.offset --json
```

### 대화 조회·전송

```powershell
cbe chats list --box unread --json
cbe chats read "대화방ID" --limit 30 --json
cbe chats read "대화방ID" --page 2 --limit 30 --json
cbe chats send --to "사용자ID" --text "회의 자료 확인 부탁드립니다." --json
```

대화방 목록의 `id`가 대화방 ID입니다. `lastMessageId`는 마지막 메시지 ID이므로 구분하세요. 대화는 최신 메시지부터 반환하며, 서버 요청의 내용 길이가 500자로 설정되어 있어 긴 메시지는 잘릴 수 있습니다.

전송은 **이미 존재하는 1:1 대화방**만 지원합니다. CLI는 참여자가 현재 계정과 지정한 수신자인지 확인하고 앱의 기존 전송 함수를 한 번 호출합니다. 서버에서 같은 메시지 ID·발신자·본문을 확인하면 `sent:true`, `verified:true`를 반환합니다. 상대방의 읽음 확인을 뜻하지는 않습니다.

전송 후 확인이 실패하거나 연결이 끊겼다면 같은 명령을 바로 반복하지 마세요. 오류에 표시된 메시지 ID를 대화 기록과 대조해야 합니다. CLI는 확인 실패 시 자동 재전송하지 않습니다. 새 대화방 생성, 백그라운드 쪽지 전송, 삭제·회수는 지원하지 않습니다.

## AI로 소통메신저 자동화하기

**소통메신저 자동화를 원할 경우 [cbe-messenger 스킬](skills/cbe-messenger/SKILL.md)을 참조하시면 됩니다.** CLI만 사용해도 되지만, 스킬을 설치하면 Codex에 자연어로 조회·전송을 요청할 수 있습니다.

예를 들어 다음처럼 요청할 수 있습니다.

- “충북소통메신저에서 읽지 않은 쪽지를 보여줘.”
- “홍길동 선생님 찾아줘.” → 내 조직을 먼저 찾고, 없으면 전체 조직 후보를 나열합니다.
- “전체 조직에서 홍길동 선생님 찾아줘.”
- “OO초등학교 홍길동 선생님께 ‘회의 자료 확인 부탁드립니다.’라고 대화로 보내줘.”

스킬은 조회와 대화 전송을 기본 백그라운드 방식으로 처리합니다. 동명이인을 구분하고, 사용자가 지정한 수신자·본문으로만 전송하며, 결과가 불확실하면 재전송하지 않습니다.

### Codex 스킬 설치

저장소 루트에서 PowerShell로 실행합니다. `CODEX_HOME`을 지정해 사용 중인 경우 해당 경로를 따르고, 기본값은 사용자 폴더의 `.codex\skills`입니다.

```powershell
$cbeSkillsRoot = if ($env:CODEX_HOME) { Join-Path $env:CODEX_HOME 'skills' } else { Join-Path $env:USERPROFILE '.codex\skills' }
$cbeSkillTarget = Join-Path $cbeSkillsRoot 'cbe-messenger'
New-Item -ItemType Directory -Force $cbeSkillTarget | Out-Null
Copy-Item -Path '.\skills\cbe-messenger\*' -Destination $cbeSkillTarget -Recurse -Force
```

설치 후 새 대화에서 `$cbe-messenger`로 호출하세요. 스킬에는 실행용 CLI도 포함되어 있어 원본 저장소 폴더의 고정 경로나 `cbe` 전역 설치에 의존하지 않습니다.

자세한 동작과 옵션은 [SKILL.md](skills/cbe-messenger/SKILL.md)와 [명령어 참고 문서](skills/cbe-messenger/references/commands.md)를 확인하세요.

## GUI를 열고 싶을 때

아래 명령만 명시적으로 앱 창을 엽니다. 일반 조회·대화 전송에서는 사용하지 않아도 됩니다.

```powershell
cbe open main
cbe open note "쪽지ID" --type R
cbe open chat "대화방ID"
cbe open profile "사용자ID"
cbe compose --to "사용자ID"
```

`compose`는 수신자를 지정한 쪽지 작성창만 엽니다. 쪽지 본문 입력과 전송은 앱에서 진행합니다. `open`으로 앱의 내용을 열면 평소 앱 동작처럼 읽음 처리될 수 있습니다. 일반 CLI 조회는 별도 읽음 확인 함수를 호출하지 않지만, 서버 내부까지 확인한 것은 아니므로 읽음 상태가 절대 바뀌지 않는다고 보장하지 않습니다.

## 공통 옵션

| 옵션 | 설명 |
| --- | --- |
| `--json` | 정규화된 JSON을 stdout으로 출력 |
| `--page N` | 페이지 번호. 기본 1 |
| `--limit N` | 페이지당 개수. 기본 30, 최대 100 |
| `--scope auto\|my\|all` | 사용자 이름 검색 범위. 기본 `auto` |
| `--offset N` | 서버 조회 기준값. 기본 0 |
| `--port N` | 로컬 디버깅 포트. 기본 9000 |
| `--help` | 도움말 |

목록 한 페이지가 전체 기록을 뜻하지 않습니다. `total:null`은 전체 건수를 알 수 없다는 의미이며 0건과 다릅니다. 오류는 stderr에 표시하고 종료코드 1을 반환합니다.

## 연결이 안 될 때

| 증상 | 확인할 내용 |
| --- | --- |
| `node` 명령을 찾지 못함 | Node.js 설치 후 새 터미널에서 `node --version` 확인 |
| `cbe` 명령을 찾지 못함 | 저장소 폴더에서 `.\cbe.cmd status` 사용 또는 전역 설치 |
| `127.0.0.1:9000` 연결 실패 | 메신저 실행·로그인 상태와 앱이 제공하는 디버깅 연결 확인 |
| 메인 화면이 0개이거나 여러 개라는 오류 | 해당 메신저의 로그인 완료 여부와 실행 인스턴스 확인 |
| 기존 1:1 대화방이 없다는 오류 | 새 대화방 생성은 아직 지원하지 않음 |
| 앱 업데이트 후 내부 함수 오류 | 현재 앱 버전과 오류 내용으로 [이슈](https://github.com/y5496694/CBE_CLI/issues) 등록 |

앱이 실제로 다른 포트를 제공하는 것으로 확인된 경우에만 다음처럼 지정합니다.

```powershell
cbe status --port 9001
```

포트가 열리지 않은 환경에서 메신저 실행 파일의 설치 경로를 바꾸는 것은 해결 방법이 아닙니다. 이 도구가 임의로 앱을 재시작하거나 디버깅 포트를 여는 설정을 변경하지는 않습니다.

## 검증 범위와 개발

2026-10-15 제작 환경에서 상태 확인, 내 조직 우선 검색과 전체 조직 전환, 쪽지 목록·검색·본문, 대화방·대화 조회, 사용자 프로필, 페이지 처리, 사용자 요청에 따른 백그라운드 대화 한 건 전송과 서버 기록 일치를 확인했습니다. 다른 PC·앱 버전은 아직 검증하지 않았습니다. 메모는 빈 목록 응답만 실사용 확인했습니다. GUI 명령 중 `open main`과 `compose`는 실제 창 열기를 확인했으며 나머지 `open` 명령은 앱 함수를 연결했지만 명령별 창 열기는 실사용 검증하지 않았습니다.

테스트는 실제 메시지를 전송하지 않고 모의 응답을 사용합니다.

```powershell
npm test
node --test .\skills\cbe-messenger\scripts\test.mjs
```

현재 17개 테스트는 연결 대상 선택, CLI 진입점, 페이지 기준값, 보호된 쪽지 표시, 수신자 일치 확인, 전송 후 ID 검증, 내 조직 검색과 전체 조직 전환 조건을 검사합니다. 런타임에는 외부 npm 의존성이 없습니다.

```text
CBE_CLI/
├─ cli.mjs                 CLI 진입점
├─ messenger.mjs           메신저 연결·조회·전송
├─ cbe.cmd                 Windows 실행 파일
├─ test.mjs                모의 테스트
└─ skills/cbe-messenger/   자동화 스킬과 실행 코드
```

앱 구조 조사에는 [REA](https://github.com/morluto/rea)를 사용했습니다. 일반 사용을 위해 REA나 별도 네이티브 분석 도구를 설치할 필요는 없습니다. 앱의 인증·암호화 함수를 재사용하며 비밀번호·쿠키·세션 키를 별도 파일에 저장하지 않습니다. 이 저장소에는 CLI와 스킬 소스만 포함하며 메신저 실행 파일이나 실제 사용자 대화·조직 데이터는 포함하지 않습니다.

## 라이선스

이 저장소의 자체 작성 코드는 [MIT License](LICENSE)로 배포합니다. 충북소통메신저 본체의 라이선스나 이용 권한을 대신 부여하는 것은 아닙니다.
