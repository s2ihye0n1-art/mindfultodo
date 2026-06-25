// Safe Storage Wrapper (localStorage 차단 환경 대비)
const memoryStorage = {};
const storage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("localStorage를 사용할 수 없어 메모리 저장을 사용합니다:", e);
      return memoryStorage[key] || null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("localStorage를 사용할 수 없어 메모리에 저장합니다:", e);
      memoryStorage[key] = String(value);
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("localStorage를 사용할 수 없어 메모리에서 삭제합니다:", e);
      delete memoryStorage[key];
    }
  }
};

// State Management
let currentUser = null;
let state = {
  date: '', // YYYY-MM-DD
  totalAvailableTime: 0, // in minutes
  todos: [], // array of { id, title, estimatedTime, bufferedTime, actualTime, isCompleted, date, isRollover }
  brainDump: [], // array of { id, title, createdDate }
  bufferEnabled: true,
  rolloverCount: 0,
  history: [] // array of { date, totalPlanned, totalActual, completedCount, totalCount }
};

// Global variables for Charts
let budgetChart = null;
let todayTimeChart = null;
let trendChart = null;

// Temporary variable for modal callback
let pendingTask = null;
let activeTaskIdForCompletion = null;

// Helper to get formatted date string (YYYY-MM-DD)
function getFormattedDate(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Helper to get Korean Date string for UI
function getKoreanDateString(dateStr) {
  if (!dateStr) return '날짜 설정 안 됨';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '올바르지 않은 날짜';
  const [yyyy, mm, dd] = parts;
  const date = new Date(yyyy, mm - 1, dd);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${yyyy}년 ${parseInt(mm)}월 ${parseInt(dd)}일 (${weekdays[date.getDay()] || '?'})`;
}

// Load State from LocalStorage (User specific)
function loadState() {
  currentUser = storage.getItem('mindful_todo_current_user');
  
  if (!currentUser) {
    const authOverlay = document.getElementById('auth-overlay');
    if (authOverlay) authOverlay.classList.remove('hidden');
    return;
  }
  
  const authOverlay = document.getElementById('auth-overlay');
  if (authOverlay) authOverlay.classList.add('hidden');
  
  const userProfileHeader = document.getElementById('user-profile-header');
  if (userProfileHeader) userProfileHeader.classList.remove('hidden');
  
  const users = JSON.parse(storage.getItem('mindful_todo_users') || '[]');
  const user = users.find(u => u.username === currentUser);
  const lblUsername = document.getElementById('lbl-username');
  if (lblUsername) lblUsername.textContent = `${user ? user.name : currentUser}님`;

  const savedState = storage.getItem(`mindful_todo_state_${currentUser}`);
  const todayStr = getFormattedDate(new Date());

  if (savedState) {
    try {
      state = JSON.parse(savedState);
      
      // Auto Roll-over detection (If date changed)
      if (state.date && state.date !== todayStr) {
        performRollover(todayStr);
      } else if (!state.date) {
        state.date = todayStr;
      }
    } catch (e) {
      console.error("Error parsing state, resetting:", e);
      resetStateToDefault(todayStr);
    }
  } else {
    resetStateToDefault(todayStr);
  }

  saveState();
}

function resetStateToDefault(todayStr) {
  state = {
    date: todayStr,
    totalAvailableTime: 0,
    todos: [],
    brainDump: [],
    bufferEnabled: true,
    rolloverCount: 0,
    history: []
  };
}

// Save State to LocalStorage (User specific)
function saveState() {
  if (currentUser) {
    storage.setItem(`mindful_todo_state_${currentUser}`, JSON.stringify(state));
  }
}

// User Authentication Functions
function signup(username, name, password) {
  const users = JSON.parse(storage.getItem('mindful_todo_users') || '[]');
  
  if (users.some(u => u.username === username)) {
    showToast('이미 존재하는 아이디입니다.');
    return false;
  }
  
  users.push({ username, name, password });
  storage.setItem('mindful_todo_users', JSON.stringify(users));
  showToast('회원가입이 완료되었습니다! 로그인해주세요.');
  return true;
}

// Global scope login registration to avoid reference errors
window.login = function(username, password) {
  const users = JSON.parse(storage.getItem('mindful_todo_users') || '[]');
  const user = users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    showToast('아이디 또는 비밀번호가 올바르지 않습니다.');
    return false;
  }
  
  currentUser = username;
  storage.setItem('mindful_todo_current_user', username);
  showToast(`${user.name}님, 반갑습니다!`);
  
  loadState();
  renderApp();
  
  if (!state.totalAvailableTime || state.totalAvailableTime <= 0) {
    const onboardingOverlay = document.getElementById('onboarding-overlay');
    if (onboardingOverlay) onboardingOverlay.classList.remove('hidden');
  }
  
  return true;
};

function logout() {
  currentUser = null;
  storage.removeItem('mindful_todo_current_user');
  
  const userProfileHeader = document.getElementById('user-profile-header');
  if (userProfileHeader) userProfileHeader.classList.add('hidden');
  
  const authOverlay = document.getElementById('auth-overlay');
  if (authOverlay) authOverlay.classList.remove('hidden');
  
  if (budgetChart) { budgetChart.destroy(); budgetChart = null; }
  if (todayTimeChart) { todayTimeChart.destroy(); todayTimeChart = null; }
  if (trendChart) { trendChart.destroy(); trendChart = null; }
  
  showToast('로그아웃 되었습니다.');
}

// Calculate Planning Buffer Factor
function calculateBufferFactor() {
  let totalEst = 0;
  let totalAct = 0;
  let count = 0;

  state.todos.forEach(todo => {
    if (todo.isCompleted && todo.actualTime !== null) {
      totalEst += todo.estimatedTime;
      totalAct += todo.actualTime;
      count++;
    }
  });

  state.history.forEach(day => {
    if (day.totalPlanned && day.totalActual) {
      totalEst += day.totalPlanned;
      totalAct += day.totalActual;
      count++;
    }
  });

  if (count === 0 || totalEst === 0) {
    return 1.0;
  }

  const factor = totalAct / totalEst;
  return Math.max(1.0, Math.min(2.0, parseFloat(factor.toFixed(2))));
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  try {
    loadState();
    initUI();
    setupEventListeners();
    renderApp();
  } catch (e) {
    console.error("애플리케이션 초기화 에러:", e);
  }
});

// Setup Initial UI layout Elements
function initUI() {
  const chartContainer = document.querySelector('.budget-chart-container');
  if (chartContainer && !document.getElementById('budget-center-text')) {
    const centerText = document.createElement('div');
    centerText.id = 'budget-center-text';
    centerText.style.position = 'absolute';
    centerText.style.top = '50%';
    centerText.style.left = '50%';
    centerText.style.transform = 'translate(-50%, -50%)';
    centerText.style.textAlign = 'center';
    centerText.style.pointerEvents = 'none';
    centerText.style.zIndex = '5';
    centerText.innerHTML = `
      <div id="budget-percent" style="font-size: 1.5rem; font-weight: 800; font-family: var(--font-title);">0%</div>
      <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600;">사용됨</div>
    `;
    chartContainer.appendChild(centerText);
  }

  const currentDate = document.getElementById('current-date');
  if (currentDate) {
    currentDate.textContent = getKoreanDateString(getFormattedDate(new Date()));
  }

  const toggleBuffer = document.getElementById('toggle-buffer');
  if (toggleBuffer) {
    toggleBuffer.checked = state.bufferEnabled;
  }

  if (currentUser && (!state.totalAvailableTime || state.totalAvailableTime <= 0)) {
    const onboardingOverlay = document.getElementById('onboarding-overlay');
    if (onboardingOverlay) onboardingOverlay.classList.remove('hidden');
  }
}

// Set up Event Listeners
function setupEventListeners() {
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');

  if (tabLogin && tabSignup && loginForm && signupForm) {
    tabLogin.addEventListener('click', () => {
      tabLogin.style.background = 'var(--bg-secondary)';
      tabLogin.style.color = 'var(--text-primary)';
      tabSignup.style.background = 'transparent';
      tabSignup.style.color = 'var(--text-secondary)';
      loginForm.classList.remove('hidden');
      signupForm.classList.add('hidden');
    });

    tabSignup.addEventListener('click', () => {
      tabSignup.style.background = 'var(--bg-secondary)';
      tabSignup.style.color = 'var(--text-primary)';
      tabLogin.style.background = 'transparent';
      tabLogin.style.color = 'var(--text-secondary)';
      signupForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('login-username').value.trim();
      const pw = document.getElementById('login-password').value;
      if (window.login(id, pw)) {
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('signup-username').value.trim();
      const name = document.getElementById('signup-name').value.trim();
      const pw = document.getElementById('signup-password').value;
      if (signup(id, name, pw)) {
        document.getElementById('signup-username').value = '';
        document.getElementById('signup-name').value = '';
        document.getElementById('signup-password').value = '';
        if (tabLogin) tabLogin.click();
      }
    });
  }

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      logout();
    });
  }

  const btnStart = document.getElementById('btn-start');
  if (btnStart) {
    btnStart.addEventListener('click', () => {
      const hoursInput = document.getElementById('initial-hours');
      const hours = parseInt(hoursInput.value) || 6;
      state.totalAvailableTime = hours * 60;
      const onboardingOverlay = document.getElementById('onboarding-overlay');
      if (onboardingOverlay) onboardingOverlay.classList.add('hidden');
      saveState();
      renderApp();
    });
  }

  const btnSaveBudget = document.getElementById('btn-save-budget');
  if (btnSaveBudget) {
    btnSaveBudget.addEventListener('click', () => {
      const input = document.getElementById('input-edit-budget');
      const hours = parseInt(input.value) || 0;
      if (hours <= 0 || hours > 24) {
        showToast('1시간에서 24시간 사이로 입력해주세요.');
        return;
      }
      
      state.totalAvailableTime = hours * 60;
      saveState();
      renderApp();
      showToast(`가용 시간 예산이 ${hours}시간으로 조정되었습니다.`);
    });
  }

  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tab = btn.getAttribute('data-tab');
      const todayContent = document.getElementById('today-tab-content');
      const braindumpContent = document.getElementById('braindump-tab-content');
      const dashboardContent = document.getElementById('dashboard-tab-content');
      
      if (todayContent) todayContent.classList.add('hidden');
      if (braindumpContent) braindumpContent.classList.add('hidden');
      if (dashboardContent) dashboardContent.classList.add('hidden');
      
      if (tab === 'today' && todayContent) {
        todayContent.classList.remove('hidden');
      } else if (tab === 'braindump' && braindumpContent) {
        braindumpContent.classList.remove('hidden');
      } else if (tab === 'dashboard' && dashboardContent) {
        dashboardContent.classList.remove('hidden');
      }
      
      if (tab === 'dashboard') {
        renderDashboardCharts();
      }
    });
  });

  const toggleBuffer = document.getElementById('toggle-buffer');
  if (toggleBuffer) {
    toggleBuffer.addEventListener('change', (e) => {
      state.bufferEnabled = e.target.checked;
      saveState();
      renderApp();
    });
  }

  const addTaskForm = document.getElementById('add-task-form');
  if (addTaskForm) {
    addTaskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const titleInput = document.getElementById('task-title');
      const estInput = document.getElementById('task-est');
      
      const title = titleInput.value.trim();
      const est = parseInt(estInput.value) || 0;
      
      if (!title || est <= 0) return;

      const bufferFactor = calculateBufferFactor();
      const bufferedTime = state.bufferEnabled ? Math.round(est * bufferFactor) : est;
      
      const currentPlannedSum = getPlannedMinutesSum();
      const totalWithNewTask = currentPlannedSum + bufferedTime;

      if (totalWithNewTask > state.totalAvailableTime) {
        pendingTask = {
          title,
          estimatedTime: est,
          bufferedTime
        };
        
        const diff = totalWithNewTask - state.totalAvailableTime;
        const hoursBudget = (state.totalAvailableTime / 60).toFixed(1);
        
        const overrunModalText = document.getElementById('overrun-modal-text');
        if (overrunModalText) {
          overrunModalText.innerHTML = `
            이 할 일을 등록하면 오늘 하루 집중 가능한 가용 시간 <strong>${state.totalAvailableTime}분 (${hoursBudget}시간)</strong>을 <strong>${diff}분</strong> 초과하게 됩니다.<br><br>
            계획 오류 버퍼가 반영된 예상 시간은 <strong>${bufferedTime}분</strong>입니다.<br>
            무리한 계획은 스트레스와 실패 요인이 됩니다. 아래 대안을 선택하세요.
          `;
        }
        
        const overrunModal = document.getElementById('overrun-modal');
        if (overrunModal) overrunModal.classList.remove('hidden');
      } else {
        addTask(title, est, bufferedTime);
        titleInput.value = '';
        estInput.value = '';
      }
    });
  }

  const addDumpForm = document.getElementById('add-dump-form');
  if (addDumpForm) {
    addDumpForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const titleInput = document.getElementById('dump-title');
      const title = titleInput.value.trim();
      if (!title) return;

      addBrainDumpItem(title);
      titleInput.value = '';
    });
  }

  const btnOverrunBraindump = document.getElementById('btn-overrun-braindump');
  if (btnOverrunBraindump) {
    btnOverrunBraindump.addEventListener('click', () => {
      if (pendingTask) {
        addBrainDumpItem(pendingTask.title);
        closeOverrunModal();
      }
    });
  }

  const btnOverrunTomorrow = document.getElementById('btn-overrun-tomorrow');
  if (btnOverrunTomorrow) {
    btnOverrunTomorrow.addEventListener('click', () => {
      if (pendingTask) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = getFormattedDate(tomorrow);
        
        const newTask = {
          id: Date.now(),
          title: pendingTask.title,
          estimatedTime: pendingTask.estimatedTime,
          bufferedTime: pendingTask.bufferedTime,
          actualTime: null,
          isCompleted: false,
          date: tomorrowStr,
          isRollover: true
        };
        
        state.todos.push(newTask);
        saveState();
        
        showToast(`'${pendingTask.title}'이(가) 내일 계획으로 안전하게 예약되었습니다.`);
        closeOverrunModal();
        renderApp();
      }
    });
  }

  const btnOverrunCancel = document.getElementById('btn-overrun-cancel');
  if (btnOverrunCancel) {
    btnOverrunCancel.addEventListener('click', () => {
      closeOverrunModal();
    });
  }

  const btnActualSave = document.getElementById('btn-actual-save');
  if (btnActualSave) {
    btnActualSave.addEventListener('click', () => {
      const minInput = document.getElementById('actual-minutes');
      const actualTime = parseInt(minInput.value) || 0;
      
      if (actualTime <= 0) {
        showToast('올바른 시간을 입력해주세요.');
        return;
      }

      completeTaskWithTime(activeTaskIdForCompletion, actualTime);
      closeActualTimeModal();
    });
  }

  const btnActualSkip = document.getElementById('btn-actual-skip');
  if (btnActualSkip) {
    btnActualSkip.addEventListener('click', () => {
      const todo = state.todos.find(t => t.id === activeTaskIdForCompletion);
      if (todo) {
        completeTaskWithTime(activeTaskIdForCompletion, todo.estimatedTime);
      }
      closeActualTimeModal();
    });
  }

  const btnSimulateRollover = document.getElementById('btn-simulate-rollover');
  if (btnSimulateRollover) {
    btnSimulateRollover.addEventListener('click', () => {
      if (confirm("새벽 2시 도달로 시뮬레이션하여 오늘 미완료된 항목들을 내일로 안전하게 이월하시겠습니까?")) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = getFormattedDate(tomorrow);
        
        performRollover(tomorrowStr);
        
        state.date = tomorrowStr;
        saveState();
        
        const currentDate = document.getElementById('current-date');
        if (currentDate) currentDate.textContent = getKoreanDateString(state.date);
        showToast("새벽 2시 이월이 완료되었습니다! 날짜가 하루 증가했습니다.");
        renderApp();
      }
    });
  }
}

function closeOverrunModal() {
  const overrunModal = document.getElementById('overrun-modal');
  if (overrunModal) overrunModal.classList.add('hidden');
  pendingTask = null;
  const taskTitle = document.getElementById('task-title');
  const taskEst = document.getElementById('task-est');
  if (taskTitle) taskTitle.value = '';
  if (taskEst) taskEst.value = '';
}

function closeActualTimeModal() {
  const actualTimeModal = document.getElementById('actual-time-modal');
  if (actualTimeModal) actualTimeModal.classList.add('hidden');
  activeTaskIdForCompletion = null;
}

function addTask(title, estimatedTime, bufferedTime) {
  const newTask = {
    id: Date.now(),
    title,
    estimatedTime,
    bufferedTime,
    actualTime: null,
    isCompleted: false,
    date: state.date,
    isRollover: false
  };

  state.todos.push(newTask);
  saveState();
  renderApp();
  showToast("할 일이 성공적으로 등록되었습니다.");
}

function addBrainDumpItem(title) {
  const newItem = {
    id: Date.now(),
    title,
    createdDate: state.date
  };

  state.brainDump.push(newItem);
  saveState();
  renderApp();
  showToast("임시 보관함(Brain Dump)에 보관되었습니다.");
}

function completeTaskWithTime(id, actualTime) {
  const todo = state.todos.find(t => t.id === id);
  if (todo) {
    todo.isCompleted = true;
    todo.actualTime = actualTime;
    saveState();
    renderApp();
    showToast(`'${todo.title}'을 완료로 기록했습니다.`);
  }
}

// Global scope bindings for inline HTML handlers
window.deleteTask = function(id) {
  state.todos = state.todos.filter(t => t.id !== id);
  saveState();
  renderApp();
  showToast("할 일이 삭제되었습니다.");
};

window.deleteBrainDumpItem = function(id) {
  state.brainDump = state.brainDump.filter(t => t.id !== id);
  saveState();
  renderApp();
  showToast("보관함 항목이 삭제되었습니다.");
};

window.moveBrainDumpToToday = function(id) {
  const dumpItem = state.brainDump.find(t => t.id === id);
  if (!dumpItem) return;

  const title = dumpItem.title;
  const est = prompt(`'${title}'의 예상 소요 시간은 몇 분인가요?`, "30");
  if (est === null) return;
  
  const estimatedTime = parseInt(est) || 0;
  if (estimatedTime <= 0) {
    alert("시간을 올바르게 입력해주세요.");
    return;
  }

  const bufferFactor = calculateBufferFactor();
  const bufferedTime = state.bufferEnabled ? Math.round(estimatedTime * bufferFactor) : estimatedTime;
  
  const currentPlannedSum = getPlannedMinutesSum();
  const totalWithNewTask = currentPlannedSum + bufferedTime;

  if (totalWithNewTask > state.totalAvailableTime) {
    pendingTask = {
      title,
      estimatedTime,
      bufferedTime
    };
    
    const diff = totalWithNewTask - state.totalAvailableTime;
    const hoursBudget = (state.totalAvailableTime / 60).toFixed(1);
    
    const overrunModalText = document.getElementById('overrun-modal-text');
    if (overrunModalText) {
      overrunModalText.innerHTML = `
        이 보관함 일감을 등록하면 오늘 하루 집중 가능한 가용 시간 <strong>${state.totalAvailableTime}분 (${hoursBudget}시간)</strong>을 <strong>${diff}분</strong> 초과하게 됩니다.<br><br>
        버퍼를 반영한 예상 시간은 <strong>${bufferedTime}분</strong>입니다.<br>
        무리한 계획은 스트레스와 실패 요인이 됩니다. 아래 대안을 선택하세요.
      `;
    }
    
    const overrunModal = document.getElementById('overrun-modal');
    if (overrunModal) overrunModal.classList.remove('hidden');
  } else {
    addTask(title, estimatedTime, bufferedTime);
    state.brainDump = state.brainDump.filter(t => t.id !== id);
    saveState();
    renderApp();
  }
};

window.moveTaskToBrainDump = function(id) {
  const todo = state.todos.find(t => t.id === id);
  if (!todo) return;

  addBrainDumpItem(todo.title);
  state.todos = state.todos.filter(t => t.id !== id);
  saveState();
  renderApp();
  showToast("할 일이 임시 보관함으로 복귀되었습니다.");
};

function getPlannedMinutesSum() {
  return state.todos
    .filter(todo => todo.date === state.date)
    .reduce((sum, todo) => sum + todo.bufferedTime, 0);
}

window.handleCheckboxChange = function(id, checked) {
  if (checked) {
    const todo = state.todos.find(t => t.id === id);
    if (todo) {
      activeTaskIdForCompletion = id;
      
      const actualTimeDesc = document.getElementById('actual-time-desc');
      if (actualTimeDesc) {
        actualTimeDesc.innerHTML = `
          수고하셨습니다! <strong>"${todo.title}"</strong> 작업을 완료하는 데 실제로 얼마나 걸렸나요?<br>
          (예상 계획 시간: ${todo.estimatedTime}분 ${state.bufferEnabled ? ` / 보정 버퍼 시간: ${todo.bufferedTime}분` : ''})
        `;
      }
      
      const actualMinutes = document.getElementById('actual-minutes');
      if (actualMinutes) actualMinutes.value = todo.estimatedTime;
      
      const actualTimeModal = document.getElementById('actual-time-modal');
      if (actualTimeModal) actualTimeModal.classList.remove('hidden');
    }
  } else {
    const todo = state.todos.find(t => t.id === id);
    if (todo) {
      todo.isCompleted = false;
      todo.actualTime = null;
      saveState();
      renderApp();
      showToast(`'${todo.title}'의 완료 상태가 해제되었습니다.`);
    }
  }
};

function performRollover(newDateStr) {
  const currentTodayDate = state.date;
  const previousTodayTasks = state.todos.filter(t => t.date === currentTodayDate);
  const completedTasks = previousTodayTasks.filter(t => t.isCompleted);
  const incompleteTasks = previousTodayTasks.filter(t => !t.isCompleted);

  if (previousTodayTasks.length > 0) {
    const totalPlanned = completedTasks.reduce((sum, t) => sum + t.estimatedTime, 0);
    const totalActual = completedTasks.reduce((sum, t) => sum + (t.actualTime || t.estimatedTime), 0);
    
    state.history.push({
      date: currentTodayDate,
      totalPlanned,
      totalActual,
      completedCount: completedTasks.length,
      totalCount: previousTodayTasks.length
    });
    
    if (state.history.length > 30) {
      state.history.shift();
    }
  }

  let rolloverTasksCount = 0;
  incompleteTasks.forEach(task => {
    task.date = newDateStr;
    task.isRollover = true;
    rolloverTasksCount++;
  });

  if (rolloverTasksCount > 0) {
    state.rolloverCount += rolloverTasksCount;
  }

  state.date = newDateStr;
  saveState();
}

function renderApp() {
  const currentTodayTodos = state.todos.filter(t => t.date === state.date);
  
  const currentDate = document.getElementById('current-date');
  if (currentDate) currentDate.textContent = getKoreanDateString(state.date);

  const currentFactor = calculateBufferFactor();
  const lblBuffer = document.getElementById('lbl-buffer-factor');
  if (lblBuffer) {
    lblBuffer.textContent = `${currentFactor.toFixed(2)}x (${currentFactor > 1.05 ? '주의 요망' : '안정'})`;
    if (currentFactor > 1.2) {
      lblBuffer.style.background = 'rgba(239, 68, 68, 0.15)';
      lblBuffer.style.color = 'var(--accent-danger)';
    } else {
      lblBuffer.style.background = 'var(--accent-primary-glow)';
      lblBuffer.style.color = 'var(--accent-primary)';
    }
  }

  const tasksContainer = document.getElementById('today-tasks-container');
  if (tasksContainer) {
    tasksContainer.innerHTML = '';

    if (currentTodayTodos.length === 0) {
      tasksContainer.innerHTML = `
        <div class="empty-state">
          <i data-lucide="sparkles"></i>
          <p>오늘 할 일이 비어 있습니다.<br>시간 예산 범위 내에서 무리하지 않게 채워보세요!</p>
        </div>
      `;
    } else {
      currentTodayTodos.forEach(todo => {
        const isCompleted = todo.isCompleted;
        const isRollover = todo.isRollover;
        
        const taskDiv = document.createElement('div');
        taskDiv.className = `task-item ${isCompleted ? 'completed' : ''} ${state.bufferEnabled ? 'buffered' : ''}`;
        
        taskDiv.innerHTML = `
          <div class="task-left">
            <label class="checkbox-container">
              <input type="checkbox" ${isCompleted ? 'checked' : ''} onchange="handleCheckboxChange(${todo.id}, this.checked)">
              <span class="checkmark"></span>
            </label>
            <div>
              <span class="task-title">${escapeHTML(todo.title)}</span>
              <div style="display: flex; gap: 0.4rem; align-items: center;">
                <span class="task-time-badge">
                  <i data-lucide="clock" style="width:11px; height:11px;"></i>
                  계획: ${todo.estimatedTime}분
                  ${state.bufferEnabled && todo.bufferedTime !== todo.estimatedTime ? ` (보정: ${todo.bufferedTime}분)` : ''}
                </span>
                ${todo.actualTime !== null ? `
                  <span class="task-time-badge" style="background: rgba(16, 185, 129, 0.12); color: var(--accent-success);">
                    <i data-lucide="check" style="width:11px; height:11px;"></i>
                    실제: ${todo.actualTime}분
                  </span>
                ` : ''}
                ${isRollover ? `
                  <span class="task-time-badge rollover-badge">
                    <i data-lucide="corner-down-right" style="width:11px; height:11px;"></i>
                    안전 이월됨
                  </span>
                ` : ''}
              </div>
            </div>
          </div>
          <div class="task-right">
            <button onclick="moveTaskToBrainDump(${todo.id})" class="action-btn" title="임시 보관함으로 이동">
              <i data-lucide="archive" style="width: 16px; height: 16px;"></i>
            </button>
            <button onclick="deleteTask(${todo.id})" class="action-btn delete" title="삭제">
              <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
            </button>
          </div>
        `;
        
        tasksContainer.appendChild(taskDiv);
      });
    }
  }

  const brainDumpContainer = document.getElementById('brain-dump-container');
  const fullBrainDumpContainer = document.getElementById('full-braindump-container');
  
  if (brainDumpContainer) {
    brainDumpContainer.innerHTML = '';

    const emptyHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <i data-lucide="check-circle-2"></i>
        <p>보관함이 비어 있습니다.<br>당장 하지 못하는 부담스러운 일은 여기에 던져두세요.</p>
      </div>
    `;

    if (state.brainDump.length === 0) {
      brainDumpContainer.innerHTML = emptyHTML;
      if (fullBrainDumpContainer) fullBrainDumpContainer.innerHTML = emptyHTML;
    } else {
      if (fullBrainDumpContainer) fullBrainDumpContainer.innerHTML = '';
      
      state.brainDump.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'brain-dump-item';
        itemDiv.innerHTML = `
          <div>
            <span class="brain-dump-title">${escapeHTML(item.title)}</span>
            <div class="brain-dump-meta">보관일: ${item.createdDate}</div>
          </div>
          <div class="brain-dump-actions">
            <button onclick="moveBrainDumpToToday(${item.id})" class="action-btn" style="color: var(--accent-primary);" title="오늘 계획으로">
              <i data-lucide="arrow-left-to-line" style="width: 15px; height: 15px;"></i>
            </button>
            <button onclick="deleteBrainDumpItem(${item.id})" class="action-btn delete" title="삭제">
              <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
            </button>
          </div>
        `;
        brainDumpContainer.appendChild(itemDiv);

        if (fullBrainDumpContainer) {
          const fullItemDiv = itemDiv.cloneNode(true);
          fullBrainDumpContainer.appendChild(fullItemDiv);
        }
      });
    }
  }

  const brainDumpCount = document.getElementById('brain-dump-count');
  if (brainDumpCount) brainDumpCount.textContent = state.brainDump.length;
  
  const lblTaskCount = document.getElementById('lbl-task-count');
  if (lblTaskCount) lblTaskCount.textContent = `등록됨: ${currentTodayTodos.length}개`;

  const plannedSum = getPlannedMinutesSum();
  const remaining = Math.max(0, state.totalAvailableTime - plannedSum);
  
  const inputEditBudget = document.getElementById('input-edit-budget');
  if (inputEditBudget && document.activeElement !== inputEditBudget) {
    inputEditBudget.value = Math.round(state.totalAvailableTime / 60) || 6;
  }
  
  const lblPlannedBudget = document.getElementById('lbl-planned-budget');
  if (lblPlannedBudget) lblPlannedBudget.textContent = `${plannedSum}분`;
  
  const lblRemaining = document.getElementById('lbl-remaining-budget');
  if (lblRemaining) {
    lblRemaining.textContent = `${remaining}분`;
    if (remaining < 30) {
      lblRemaining.className = 'highlight-budget';
      lblRemaining.style.color = 'var(--accent-warning)';
    } else if (remaining === 0) {
      lblRemaining.style.color = 'var(--accent-danger)';
    } else {
      lblRemaining.style.color = 'var(--accent-primary)';
    }
  }

  renderBudgetRingChart(plannedSum, remaining);

  try {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  } catch (e) {
    console.warn("Lucide 아이콘 로드 에러:", e);
  }
}

// Render Budget Ring Chart
function renderBudgetRingChart(planned, remaining) {
  const chartEl = document.getElementById('budgetRingChart');
  if (!chartEl) return;
  const ctx = chartEl.getContext('2d');
  
  const percentUsed = Math.min(100, Math.round((planned / (state.totalAvailableTime || 360)) * 100)) || 0;
  const budgetPercent = document.getElementById('budget-percent');
  if (budgetPercent) {
    budgetPercent.textContent = `${percentUsed}%`;
    if (percentUsed >= 100) {
      budgetPercent.style.color = 'var(--accent-danger)';
    } else if (percentUsed > 85) {
      budgetPercent.style.color = 'var(--accent-warning)';
    } else {
      budgetPercent.style.color = 'var(--accent-primary)';
    }
  }

  const isOverrun = planned > state.totalAvailableTime;
  const usedColor = isOverrun ? '#ef4444' : '#6366f1';

  if (typeof Chart === 'undefined') {
    console.warn("Chart.js 라이브러리가 아직 로드되지 않았습니다.");
    return;
  }

  try {
    if (budgetChart) {
      budgetChart.data.datasets[0].data = [planned, remaining];
      budgetChart.data.datasets[0].backgroundColor = [usedColor, 'rgba(255,255,255,0.05)'];
      budgetChart.update();
    } else {
      budgetChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [planned, remaining],
            backgroundColor: [usedColor, 'rgba(255,255,255,0.05)'],
            borderWidth: 0,
            hoverOffset: 0
          }]
        },
        options: {
          cutout: '78%',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          }
        }
      });
    }
  } catch (e) {
    console.error("도넛 차트 그리기 에러:", e);
  }
}

// Render Statistics Dashboard Charts & Numbers
function renderDashboardCharts() {
  const currentTodayTodos = state.todos.filter(t => t.date === state.date);
  const completedToday = currentTodayTodos.filter(t => t.isCompleted);
  
  const statsCompleted = document.getElementById('stats-completed');
  if (statsCompleted) statsCompleted.textContent = `${completedToday.length} / ${currentTodayTodos.length}`;
  
  const statsRolloverCount = document.getElementById('stats-rollover-count');
  if (statsRolloverCount) statsRolloverCount.textContent = `${state.rolloverCount}회`;

  let totalEst = 0;
  let totalAct = 0;
  completedToday.forEach(t => {
    totalEst += t.estimatedTime;
    totalAct += (t.actualTime !== null ? t.actualTime : t.estimatedTime);
  });

  const deviation = totalAct - totalEst;
  const statsTotalDeviation = document.getElementById('stats-total-deviation');
  if (statsTotalDeviation) statsTotalDeviation.textContent = `${deviation >= 0 ? '+' : ''}${deviation}분`;
  
  const accuracy = totalEst > 0 ? Math.round((totalAct / totalEst) * 100) : 100;
  const accuracyEl = document.getElementById('stats-accuracy-rate');
  if (accuracyEl) {
    accuracyEl.textContent = `${accuracy}%`;
    if (accuracy > 115) {
      accuracyEl.style.color = 'var(--accent-warning)';
    } else if (accuracy > 130) {
      accuracyEl.style.color = 'var(--accent-danger)';
    } else {
      accuracyEl.style.color = 'var(--accent-success)';
    }
  }

  if (typeof Chart === 'undefined') {
    console.warn("Chart.js 라이브러리가 로드되지 않아 대시보드 차트를 그릴 수 없습니다.");
    return;
  }

  // 1. Render Today Time comparison bar chart
  const todayChartEl = document.getElementById('todayTimeChart');
  if (todayChartEl) {
    const todayCtx = todayChartEl.getContext('2d');
    const labels = completedToday.map(t => t.title.substring(0, 10) + (t.title.length > 10 ? '..' : ''));
    const estData = completedToday.map(t => t.estimatedTime);
    const actData = completedToday.map(t => t.actualTime || 0);

    if (todayTimeChart) {
      todayTimeChart.destroy();
    }

    try {
      todayTimeChart = new Chart(todayCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: '예상 시간 (분)',
              data: estData,
              backgroundColor: 'rgba(99, 102, 241, 0.6)',
              borderColor: 'var(--accent-primary)',
              borderWidth: 1
            },
            {
              label: '실제 시간 (분)',
              data: actData,
              backgroundColor: 'rgba(16, 185, 129, 0.6)',
              borderColor: 'var(--accent-success)',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: 'var(--text-secondary)' }
            },
            x: {
              grid: { display: false },
              ticks: { color: 'var(--text-secondary)' }
            }
          },
          plugins: {
            legend: {
              labels: { color: 'var(--text-primary)' }
            }
          }
        }
      });
    } catch (e) {
      console.error("바 차트 생성 에러:", e);
    }
  }

  // 2. Render 7-day trend chart
  const trendChartEl = document.getElementById('deviationTrendChart');
  if (trendChartEl) {
    const trendCtx = trendChartEl.getContext('2d');
    const trendLabels = [];
    const trendData = [];

    const lastHistory = state.history.slice(-7);
    lastHistory.forEach(day => {
      trendLabels.push(day.date.substring(5));
      const rate = day.totalPlanned > 0 ? (day.totalActual / day.totalPlanned) * 100 : 100;
      trendData.push(rate);
    });

    if (totalEst > 0) {
      trendLabels.push(state.date.substring(5));
      trendData.push(Math.round((totalAct / totalEst) * 100));
    }

    if (trendLabels.length === 0) {
      trendLabels.push('기록 없음');
      trendData.push(100);
    }

    if (trendChart) {
      trendChart.destroy();
    }

    try {
      trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
          labels: trendLabels,
          datasets: [{
            label: '계획 오차율 트렌드 (%)',
            data: trendData,
            borderColor: 'var(--accent-secondary)',
            backgroundColor: 'rgba(168, 85, 247, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointBackgroundColor: 'var(--accent-secondary)'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: 'var(--text-secondary)' },
              suggestedMin: 50,
              suggestedMax: 150
            },
            x: {
              grid: { display: false },
              ticks: { color: 'var(--text-secondary)' }
            }
          },
          plugins: {
            legend: {
              labels: { color: 'var(--text-primary)' }
            }
          }
        }
      });
    } catch (e) {
      console.error("라인 차트 생성 에러:", e);
    }
  }
}

// Utility: Toast Messages
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'glass-panel';
  toast.style.position = 'fixed';
  toast.style.bottom = '2rem';
  toast.style.right = '2rem';
  toast.style.padding = '0.8rem 1.5rem';
  toast.style.zIndex = '999';
  toast.style.borderLeft = '4px solid var(--accent-primary)';
  toast.style.fontSize = '0.9rem';
  toast.style.fontWeight = '500';
  toast.style.animation = 'itemSlideIn 0.25s forwards';
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.5s';
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// HTML Escaping Utility
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Attach event listeners to window for onclick handlers in dynamically generated HTML
window.handleCheckboxChange = handleCheckboxChange;
window.deleteTask = deleteTask;
window.deleteBrainDumpItem = deleteBrainDumpItem;
window.moveBrainDumpToToday = moveBrainDumpToToday;
window.moveTaskToBrainDump = moveTaskToBrainDump;
