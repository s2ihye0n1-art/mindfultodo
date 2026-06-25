# Mindful Todo (마인드풀 투두) - 과부하 방지 플래너

계획 오류와 자이가르닉 효과(Zeigarnik Effect)로 인한 인지적 스트레스를 방지하도록 돕는 똑똑하고 미려한 투두리스트 웹 서비스입니다.

---

## 🌟 주요 기능

1. **오늘의 집중력 예산 (Time Budget)**
   - 하루 동안 온전히 집중할 수 있는 가용 시간을 설정하여 무리한 계획을 사전에 방지합니다.
   - 직관적인 도넛 차트를 통해 오늘 계획한 시간의 비중을 실시간으로 확인합니다.
   - 예산을 초과하여 계획을 세우려고 할 때 경고 모달을 통해 **임시 보관함(Brain Dump)에 저장**하거나 **내일로 이월**할 수 있는 대안을 제시합니다.

2. **계획 오차율 버퍼 (Planning Buffer Factor)**
   - 완료한 할 일의 예상 소요 시간과 실제 소요 시간을 분석하여 개인 맞춤형 오차 보정 버퍼(1.00x ~ 2.00x)를 계산합니다.
   - 버퍼를 활성화하면 새로운 할 일을 추가할 때 과거 오차 데이터를 기반으로 예상 시간을 자동 보정해 줍니다.

3. **임시 보관함 (Brain Dump)**
   - 당장 실행하지 않거나 구체적인 일정이 정해지지 않은 막연한 아이디어 및 할 일들을 이곳에 적어두어 인지적 과부하를 줄입니다.
   - 보관함에 둔 일감은 필요할 때 언제든 오늘 계획으로 가져올 수 있습니다.

4. **새벽 2시 안전한 이월 (Safe Roll-over)**
   - 완료하지 못한 일을 보며 느끼는 실패감과 스트레스를 방지하기 위해, 새벽 2시가 되면 미완료된 항목들을 '실패/X' 표시 없이 다음 날로 조용하고 안전하게 이월합니다.
   - **이월 시뮬레이션 버튼**을 통해 이월 과정을 직접 확인해볼 수 있습니다.

5. **피드백 대시보드**
   - 오늘 완료한 할 일의 개수 및 계획 대비 실제 소요 시간 비율(정확도)을 보여줍니다.
   - Chart.js를 이용해 개별 작업별 예상 시간 vs 실제 소요 시간 비교 바 차트, 그리고 최근 7일간의 계획 오차율 트렌드 라인 차트를 시각화하여 제공합니다.

---

## 💻 로컬에서 실행하기

이 프로젝트는 빌드 과정이 필요 없는 순수 HTML, CSS, JavaScript 프로젝트입니다.
다운로드 후 `index.html` 파일을 더블 클릭하여 웹 브라우저에서 바로 실행할 수 있습니다.

---

## 🚀 깃허브(GitHub)에 업로드 및 배포(GitHub Pages)하는 방법

이 프로젝트를 GitHub에 올리고, **GitHub Pages**를 통해 인터넷에 실제 웹사이트로 무료 배포하는 방법은 다음과 같습니다.

### 1단계: GitHub 저장소(Repository) 만들기
1. [GitHub 홈페이지](https://github.com/)에 로그인합니다.
2. 우측 상단의 **`+`** 버튼을 누르고 **`New repository`**를 선택합니다.
3. **Repository name**에 `mindful-todo`와 같은 이름을 입력합니다.
4. **Public**을 선택합니다 (GitHub Pages 무료 배포를 위해 필수).
5. 다른 옵션(Add a README file 등)은 건드리지 않고 아래의 **`Create repository`** 버튼을 클릭합니다.

### 2단계: 로컬 프로젝트에 Git 설정하고 업로드하기
컴퓨터에 Git이 설치되어 있는 경우, 터미널(또는 명령 프롬프트, Git Bash)을 열고 프로젝트 폴더(`C:\Users\LG\.gemini\antigravity\scratch\mindful-todo`)로 이동한 후 아래 명령어를 순서대로 입력합니다.
*(GitHub 저장소 생성 후 화면에 나타나는 안내 명령어를 복사해서 사용하셔도 됩니다.)*

```bash
# 1. git 저장소 초기화
git init

# 2. 모든 파일 스테이징 영역에 추가
git add .

# 3. 첫 번째 커밋 생성
git commit -m "Initialize Mindful Todo Project"

# 4. 기본 브랜치 이름을 main으로 설정
git branch -M main

# 5. 로컬 저장소를 GitHub 원격 저장소와 연결 (주소 부분은 본인의 GitHub 주소로 변경하세요)
git remote add origin https://github.com/사용자이름/mindful-todo.git

# 6. GitHub으로 코드 푸시
git push -u origin main
```

> **Git 명령어 사용이 어렵다면? (대안)**
> GitHub 저장소 페이지의 중앙에 있는 **`uploading an existing file`** 링크를 클릭하여 `index.html`, `style.css`, `app.js`, `.gitignore` 파일을 웹 브라우저 창으로 직접 드래그 앤 드롭하여 업로드한 후 커밋하셔도 됩니다.

### 3단계: GitHub Pages로 사이트 무료 배포하기
코드가 GitHub에 정상적으로 올라갔다면 다음과 같이 클릭 몇 번으로 배포할 수 있습니다.

1. GitHub 저장소 페이지의 상단 탭에서 **`Settings`** (설정) 기어 아이콘을 클릭합니다.
2. 왼쪽 사이드바 메뉴에서 **`Pages`** 메뉴를 선택합니다.
3. **Build and deployment** 섹션의 **Branch** 설정을 `None`에서 **`main`** (혹은 `master`)으로 변경합니다.
4. 폴더 설정은 **`/ (root)`**로 둔 채 우측의 **`Save`** 버튼을 클릭합니다.
5. 약 1~2분 정도 기다린 후 새로고침을 하면, Pages 설정 화면 상단에 **"Your site is live at..."** 문구와 함께 웹사이트 주소가 나타납니다.
6. 해당 주소를 클릭하면 실제 작동하는 나만의 **Mindful Todo** 플래너를 인터넷에서 확인하고 사용할 수 있습니다!

---

## 🛠️ 기술 스택
- **Structure**: Semantic HTML5
- **Style**: Vanilla CSS (자체 다크 모드, 네온 글래스모피즘 테마, 모던 타이포그래피)
- **Logic**: Vanilla JavaScript
- **Libraries**:
  - [Chart.js](https://www.chartjs.org/) (데이터 시각화 차트)
  - [Lucide Icons](https://lucide.dev/) (미려한 모던 아이콘 팩)
