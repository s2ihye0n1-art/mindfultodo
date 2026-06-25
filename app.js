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
  const [yyyy, mm, dd] = dateStr.split('-');
  const date = new Date(yyyy, mm - 1, dd);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${yyyy}년 ${parseInt(mm)}월 ${parseInt(dd)}일 (${weekdays[date.getDay()]})`;
}

// Load State from LocalStorage (User specific)
function loadState() {
  currentUser = localStorage.getItem('mindful_todo_current_user');
  
  if (!currentUser) {
    document.getElementById('auth-overlay').classList.remove('hidden');
    return;
  }
  
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('user-profile-header').classList.remove('hidden');
  
  const users = JSON.parse(localStorage.getItem('mindful_todo_users') || '[]');
  const user = users.find(u => u.username === currentUser);
  document.getElementById('lbl-username').textContent = `${user ? user.name : currentUser}님`;

  const savedState = localStorage.getItem(`mindful_todo_state_${currentUser}`);
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
    localStorage.setItem(`mindful_todo_state_${currentUser}`, JSON.stringify(state));
  }
}

// User Authentication Functions
function signup(username, name, password) {
  const users = JSON.parse(localStorage.getItem('mindful_todo_users') || '[]');
  
  if (users.some(u => u.username === username)) {
    showToast('이미 존재하는 아이디입니다.');
    return false;
  }
  
  users.push({ username, name, password });
  localStorage.setItem('mindful_todo_users', JSON.stringify(users));
  showToast('회원가입이 완료되었습니다! 로그인해주세요.');
  return true;
}

function login(username, password) {
  const users = JSON.parse(localStorage.getItem('mindful_todo_users') || '[]');
  const user = users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    showToast('아이디 또는 비밀번호가 올바르지 않습니다.');
    return false;
  }
  
  currentUser = username;
  localStorage.setItem('mindful_todo_current_user', username);
  showToast(`${user.name}님, 반갑습니다!`);
  
  loadState();
  renderApp();
  
  if (!state.totalAvailableTime || state.totalAvailableTime <= 0) {
    document.getElementById('onboarding-overlay').classList.remove('hidden');
  }
  
  return true;
}

function logout() {
  currentUser = null;
  localStorage.removeItem('mindful_todo_current_user');
  
  document.getElementById('user-profile-header').classList.add('hidden');
  document.getElementById('auth-overlay').classList.remove('hidden');
  
  if (budgetChart) { budgetChart.destroy(); budgetChart = null; }
  if (todayTimeChart) { todayTimeChart.destroy(); todayTimeChart = null; }
  if (trendChart) { trendChart.destroy(); trendChart = null; }
  
  showToast('로그아웃 되었습니다.');
}

// Calculate Planning Buffer Factor
// Formula: Sum of actual times / Sum of estimated times for recently completed tasks
function calculateBufferFactor() {
  // Gather completed tasks from current day and history
  let totalEst = 0;
  let totalAct = 0;
  let count = 0;

  // 1. Check current completed tasks
  state.todos.forEach(todo => {
    if (todo.isCompleted && todo.actualTime !== null) {
      totalEst += todo.estimatedTime;
      totalAct += todo.actualTime;
      count++;
    }
  });

  // 2. Check history
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
  // Cap the buffer between 1.0 and 2.0 to prevent extreme anomalies
  return Math.max(1.0, Math.min(2.0, parseFloat(factor.toFixed(2))));
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initUI();
  setupEventListeners();
  renderApp();
});

// Setup Initial UI layout Elements
function initUI() {
  // Create center text overlay for donut chart
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

  // Populate today's date
  document.getElementById('current-date').textContent = getKoreanDateString(getFormattedDate(new Date()));

  // Prefill buffer checkbox
  document.getElementById('toggle-buffer').checked = state.bufferEnabled;

  // Onboarding overlay display (Only if logged in but no available time)
  if (currentUser && (!state.totalAvailableTime || state.totalAvailableTime <= 0)) {
    document.getElementById('onboarding-overlay').classList.remove('hidden');
  }
}

// Set up Event Listeners
function setupEventListeners() {
  // Auth tab buttons switching
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');

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

  // Login form submit
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('login-username').value.trim();
    const pw = document.getElementById('login-password').value;
    if (login(id, pw)) {
      document.getElementById('login-username').value = '';
      document.getElementById('login-password').value = '';
    }
  });

  // Signup form submit
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('signup-username').value.trim();
    const name = document.getElementById('signup-name').value.trim();
    const pw = document.getElementById('signup-password').value;
    if (signup(id, name, pw)) {
      document.getElementById('signup-username').value = '';
      document.getElementById('signup-name').value = '';
      document.getElementById('signup-password').value = '';
      tabLogin.click(); // switch back to login
    }
  });

  // Logout button
  document.getElementById('btn-logout').addEventListener('click', () => {
    logout();
  });

  // Onboarding Start
  document.getElementById('btn-start').addEventListener('click', () => {
    const hoursInput = document.getElementById('initial-hours');
    const hours = parseInt(hoursInput.value) || 6;
    state.totalAvailableTime = hours * 60;
    document.getElementById('onboarding-overlay').classList.add('hidden');
    saveState();
    renderApp();
  });

  // Inline time budget update
  document.getElementById('btn-save-budget').addEventListener('click', () => {
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

  // Tabs toggle
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tab = btn.getAttribute('data-tab');
      document.getElementById('today-tab-content').classList.add('hidden');
      document.getElementById('braindump-tab-content').classList.add('hidden');
      document.getElementById('dashboard-tab-content').classList.add('hidden');
      
      if (tab === 'today') {
        document.getElementById('today-tab-content').classList.remove('hidden');
      } else if (tab === 'braindump') {
        document.getElementById('braindump-tab-content').classList.remove('hidden');
      } else if (tab === 'dashboard') {
        document.getElementById('dashboard-tab-content').classList.remove('hidden');
      }
      
      // Update charts on tab transition
      if (tab === 'dashboard') {
        renderDashboardCharts();
      }
    });
  });

  // Toggle Buffer factor
  document.getElementById('toggle-buffer').addEventListener('change', (e) => {
    state.bufferEnabled = e.target.checked;
    saveState();
    renderApp();
  });

  // Add Task form submit
  document.getElementById('add-task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('task-title');
    const estInput = document.getElementById('task-est');
    
    const title = titleInput.value.trim();
    const est = parseInt(estInput.value) || 0;
    
    if (!title || est <= 0) return;

    // Validate available time
    const bufferFactor = calculateBufferFactor();
    const bufferedTime = state.bufferEnabled ? Math.round(est * bufferFactor) : est;
    
    const currentPlannedSum = getPlannedMinutesSum();
    const totalWithNewTask = currentPlannedSum + bufferedTime;

    if (totalWithNewTask > state.totalAvailableTime) {
      // OVERRUN: Show warning modal
      pendingTask = {
        title,
        estimatedTime: est,
        bufferedTime
      };
      
      const diff = totalWithNewTask - state.totalAvailableTime;
      const hoursBudget = (state.totalAvailableTime / 60).toFixed(1);
      
      document.getElementById('overrun-modal-text').innerHTML = `
        이 할 일을 등록하면 오늘 하루 집중 가능한 가용 시간 <strong>${state.totalAvailableTime}분 (${hoursBudget}시간)</strong>을 <strong>${diff}분</strong> 초과하게 됩니다.<br><br>
        계획 오류 버퍼가 반영된 예상 시간은 <strong>${bufferedTime}분</strong>입니다.<br>
        무리한 계획은 스트레스와 실패 요인이 됩니다. 아래 대안을 선택하세요.
      `;
      
      document.getElementById('overrun-modal').classList.remove('hidden');
    } else {
      // SAFE: Add directly
      addTask(title, est, bufferedTime);
      titleInput.value = '';
      estInput.value = '';
    }
  });

  // Add Brain Dump item form
  document.getElementById('add-dump-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('dump-title');
    const title = titleInput.value.trim();
    if (!title) return;

    addBrainDumpItem(title);
    titleInput.value = '';
  });

  // Overrun Modal actions
  document.getElementById('btn-overrun-braindump').addEventListener('click', () => {
    if (pendingTask) {
      addBrainDumpItem(pendingTask.title);
      closeOverrunModal();
    }
  });

  document.getElementById('btn-overrun-tomorrow').addEventListener('click', () => {
    if (pendingTask) {
      // Defer to tomorrow: calculate tomorrow date
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
        isRollover: true // Marked as deferred
      };
      
      state.todos.push(newTask);
      saveState();
      
      // Notify user
      showToast(`'${pendingTask.title}'이(가) 내일 계획으로 안전하게 예약되었습니다.`);
      closeOverrunModal();
      renderApp();
    }
  });

  document.getElementById('btn-overrun-cancel').addEventListener('click', () => {
    closeOverrunModal();
  });

  // Actual Time Modal actions
  document.getElementById('btn-actual-save').addEventListener('click', () => {
    const minInput = document.getElementById('actual-minutes');
    const actualTime = parseInt(minInput.value) || 0;
    
    if (actualTime <= 0) {
      showToast('올바른 시간을 입력해주세요.');
      return;
    }

    completeTaskWithTime(activeTaskIdForCompletion, actualTime);
    closeActualTimeModal();
  });

  document.getElementById('btn-actual-skip').addEventListener('click', () => {
    // Skip uses estimated time as actual time
    const todo = state.todos.find(t => t.id === activeTaskIdForCompletion);
    if (todo) {
      completeTaskWithTime(activeTaskIdForCompletion, todo.estimatedTime);
    }
    closeActualTimeModal();
  });

  // Simulate Rollover button
  document.getElementById('btn-simulate-rollover').addEventListener('click', () => {
    if (confirm("새벽 2시 도달로 시뮬레이션하여 오늘 미완료된 항목들을 내일로 안전하게 이월하시겠습니까?")) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getFormattedDate(tomorrow);
      
      performRollover(tomorrowStr);
      
      // Update system date to simulate progression
      state.date = tomorrowStr;
      saveState();
      
      document.getElementById('current-date').textContent = getKoreanDateString(state.date);
      showToast("새벽 2시 이월이 완료되었습니다! 날짜가 하루 증가했습니다.");
      renderApp();
    }
  });
}

// Close overrun modal helper
function closeOverrunModal() {
  document.getElementById('overrun-modal').classList.add('hidden');
  pendingTask = null;
  document.getElementById('task-title').value = '';
  document.getElementById('task-est').value = '';
}

// Close actual time input modal helper
function closeActualTimeModal() {
  document.getElementById('actual-time-modal').classList.add('hidden');
  activeTaskIdForCompletion = null;
}

// Add task logic
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

// Add Brain Dump item logic
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

// Complete task with exact actual time
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

// Remove task
function deleteTask(id) {
  state.todos = state.todos.filter(t => t.id !== id);
  saveState();
  renderApp();
  showToast("할 일이 삭제되었습니다.");
}

// Remove brain dump item
function deleteBrainDumpItem(id) {
  state.brainDump = state.brainDump.filter(t => t.id !== id);
  saveState();
  renderApp();
  showToast("보관함 항목이 삭제되었습니다.");
}

// Move Brain Dump item to Today's planner
function moveBrainDumpToToday(id) {
  const dumpItem = state.brainDump.find(t => t.id === id);
  if (!dumpItem) return;

  // Prompt estimated time
  const title = dumpItem.title;
  const est = prompt(`'${title}'의 예상 소요 시간은 몇 분인가요?`, "30");
  if (est === null) return; // User cancelled
  
  const estimatedTime = parseInt(est) || 0;
  if (estimatedTime <= 0) {
    alert("시간을 올바르게 입력해주세요.");
    return;
  }

  // Validate time budget
  const bufferFactor = calculateBufferFactor();
  const bufferedTime = state.bufferEnabled ? Math.round(estimatedTime * bufferFactor) : estimatedTime;
  
  const currentPlannedSum = getPlannedMinutesSum();
  const totalWithNewTask = currentPlannedSum + bufferedTime;

  if (totalWithNewTask > state.totalAvailableTime) {
    // Show warning
    pendingTask = {
      title,
      estimatedTime,
      bufferedTime
    };
    
    // Setup overrun modal
    const diff = totalWithNewTask - state.totalAvailableTime;
    const hoursBudget = (state.totalAvailableTime / 60).toFixed(1);
    
    document.getElementById('overrun-modal-text').innerHTML = `
      이 보관함 일감을 등록하면 오늘 하루 집중 가능한 가용 시간 <strong>${state.totalAvailableTime}분 (${hoursBudget}시간)</strong>을 <strong>${diff}분</strong> 초과하게 됩니다.<br><br>
      버퍼를 반영한 예상 시간은 <strong>${bufferedTime}분</strong>입니다.<br>
      무리한 계획은 스트레스와 실패 요인이 됩니다. 아래 대안을 선택하세요.
    `;
    
    document.getElementById('overrun-modal').classList.remove('hidden');
    
    // Delete item from brain dump only if moved, so keep it for now
  } else {
    // Add to today
    addTask(title, estimatedTime, bufferedTime);
    // Delete from brain dump
    state.brainDump = state.brainDump.filter(t => t.id !== id);
    saveState();
    renderApp();
  }
}

// Move today task back to Brain Dump
function moveTaskToBrainDump(id) {
  const todo = state.todos.find(t => t.id === id);
  if (!todo) return;

  addBrainDumpItem(todo.title);
  state.todos = state.todos.filter(t => t.id !== id);
  saveState();
  renderApp();
  showToast("할 일이 임시 보관함으로 복귀되었습니다.");
}

// Calculate sum of planned minutes for TODAY (only active todos on state.date)
function getPlannedMinutesSum() {
  return state.todos
    .filter(todo => todo.date === state.date)
    .reduce((sum, todo) => sum + todo.bufferedTime, 0);
}

// Handle Checkbox Change (Triggers actual time popup)
function handleCheckboxChange(id, checked) {
  if (checked) {
    const todo = state.todos.find(t => t.id === id);
    if (todo) {
      activeTaskIdForCompletion = id;
      
      // Update Modal UI
      document.getElementById('actual-time-desc').innerHTML = `
        수고하셨습니다! <strong>"${todo.title}"</strong> 작업을 완료하는 데 실제로 얼마나 걸렸나요?<br>
        (예상 계획 시간: ${todo.estimatedTime}분 ${state.bufferEnabled ? ` / 보정 버퍼 시간: ${todo.bufferedTime}분` : ''})
      `;
      
      // Prefill actual input with estimated time
      document.getElementById('actual-minutes').value = todo.estimatedTime;
      
      // Show modal
      document.getElementById('actual-time-modal').classList.remove('hidden');
    }
  } else {
    // Unchecked: Revert completion status
    const todo = state.todos.find(t => t.id === id);
    if (todo) {
      todo.isCompleted = false;
      todo.actualTime = null;
      saveState();
      renderApp();
      showToast(`'${todo.title}'의 완료 상태가 해제되었습니다.`);
    }
  }
}

// Perform Rollover (Safe Migration of incomplete tasks to next day)
function performRollover(newDateStr) {
  const currentTodayDate = state.date;
  
  // 1. Gather all tasks for the "previous today"
  const previousTodayTasks = state.todos.filter(t => t.date === currentTodayDate);
  const completedTasks = previousTodayTasks.filter(t => t.isCompleted);
  const incompleteTasks = previousTodayTasks.filter(t => !t.isCompleted);

  // 2. Archive stats of the previous today to history
  if (previousTodayTasks.length > 0) {
    const totalPlanned = completedTasks.reduce((sum, t) => sum + t.estimatedTime, 0);
    const totalActual = completedTasks.reduce((sum, t) => sum + (t.actualTime || t.estimatedTime), 0);
    
    // Add to history
    state.history.push({
      date: currentTodayDate,
      totalPlanned,
      totalActual,
      completedCount: completedTasks.length,
      totalCount: previousTodayTasks.length
    });
    
    // Cap history length at last 30 days
    if (state.history.length > 30) {
      state.history.shift();
    }
  }

  // 3. Migrate incomplete tasks to the new date
  let rolloverTasksCount = 0;
  incompleteTasks.forEach(task => {
    task.date = newDateStr;
    task.isRollover = true; // Mark as rollover to show visual label
    rolloverTasksCount++;
  });

  if (rolloverTasksCount > 0) {
    state.rolloverCount += rolloverTasksCount;
  }

  // 4. Update current date
  state.date = newDateStr;
  saveState();
}

// Render the application views
function renderApp() {
  const currentTodayTodos = state.todos.filter(t => t.date === state.date);
  
  // Update Header Date
  document.getElementById('current-date').textContent = getKoreanDateString(state.date);

  // Update Buffer Info banner
  const currentFactor = calculateBufferFactor();
  const lblBuffer = document.getElementById('lbl-buffer-factor');
  lblBuffer.textContent = `${currentFactor.toFixed(2)}x (${currentFactor > 1.05 ? '주의 요망' : '안정'})`;
  if (currentFactor > 1.2) {
    lblBuffer.style.background = 'rgba(239, 68, 68, 0.15)';
    lblBuffer.style.color = 'var(--accent-danger)';
  } else {
    lblBuffer.style.background = 'var(--accent-primary-glow)';
    lblBuffer.style.color = 'var(--accent-primary)';
  }

  // Render Today's Tasks
  const tasksContainer = document.getElementById('today-tasks-container');
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

  // Render Brain Dump side list
  const brainDumpContainer = document.getElementById('brain-dump-container');
  brainDumpContainer.innerHTML = '';

  const fullBrainDumpContainer = document.getElementById('full-braindump-container');
  if (fullBrainDumpContainer) fullBrainDumpContainer.innerHTML = '';

  if (state.brainDump.length === 0) {
    const emptyHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <i data-lucide="check-circle-2"></i>
        <p>보관함이 비어 있습니다.<br>당장 하지 못하는 부담스러운 일은 여기에 던져두세요.</p>
      </div>
    `;
    brainDumpContainer.innerHTML = emptyHTML;
    if (fullBrainDumpContainer) fullBrainDumpContainer.innerHTML = emptyHTML;
  } else {
    state.brainDump.forEach(item => {
      // Side list item
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

      // Full list item (for the full Brain Dump tab content)
      if (fullBrainDumpContainer) {
        const fullItemDiv = itemDiv.cloneNode(true);
        // Need to wire onclick manually because cloneNode clones the HTML attributes (which works)
        fullBrainDumpContainer.appendChild(fullItemDiv);
      }
    });
  }

  // Update counts
  document.getElementById('brain-dump-count').textContent = state.brainDump.length;
  document.getElementById('lbl-task-count').textContent = `등록됨: ${currentTodayTodos.length}개`;

  // Update Budget values
  const plannedSum = getPlannedMinutesSum();
  const remaining = Math.max(0, state.totalAvailableTime - plannedSum);
  
  const inputEditBudget = document.getElementById('input-edit-budget');
  if (inputEditBudget && document.activeElement !== inputEditBudget) {
    inputEditBudget.value = Math.round(state.totalAvailableTime / 60) || 6;
  }
  
  document.getElementById('lbl-planned-budget').textContent = `${plannedSum}분`;
  
  const lblRemaining = document.getElementById('lbl-remaining-budget');
  lblRemaining.textContent = `${remaining}분`;
  if (remaining < 30) {
    lblRemaining.className = 'highlight-budget';
    lblRemaining.style.color = 'var(--accent-warning)';
  } else if (remaining === 0) {
    lblRemaining.style.color = 'var(--accent-danger)';
  } else {
    lblRemaining.style.color = 'var(--accent-primary)';
  }

  // Render Chart Budget Donut Ring
  renderBudgetRingChart(plannedSum, remaining);

  // Re-parse lucide icons
  lucide.createIcons();
}

// Render Budget Ring Chart
function renderBudgetRingChart(planned, remaining) {
  const ctx = document.getElementById('budgetRingChart').getContext('2d');
  
  const percentUsed = Math.min(100, Math.round((planned / state.totalAvailableTime) * 100)) || 0;
  document.getElementById('budget-percent').textContent = `${percentUsed}%`;
  
  // Set center text color based on percentage
  if (percentUsed >= 100) {
    document.getElementById('budget-percent').style.color = 'var(--accent-danger)';
  } else if (percentUsed > 85) {
    document.getElementById('budget-percent').style.color = 'var(--accent-warning)';
  } else {
    document.getElementById('budget-percent').style.color = 'var(--accent-primary)';
  }

  const isOverrun = planned > state.totalAvailableTime;
  const usedColor = isOverrun ? '#ef4444' : '#6366f1';

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
}

// Render Statistics Dashboard Charts & Numbers
function renderDashboardCharts() {
  const currentTodayTodos = state.todos.filter(t => t.date === state.date);
  const completedToday = currentTodayTodos.filter(t => t.isCompleted);
  
  // Update numerical stats
  document.getElementById('stats-completed').textContent = `${completedToday.length} / ${currentTodayTodos.length}`;
  document.getElementById('stats-rollover-count').textContent = `${state.rolloverCount}회`;

  // Calculate today's deviation and accuracy rate
  let totalEst = 0;
  let totalAct = 0;
  completedToday.forEach(t => {
    totalEst += t.estimatedTime;
    totalAct += (t.actualTime !== null ? t.actualTime : t.estimatedTime);
  });

  const deviation = totalAct - totalEst;
  document.getElementById('stats-total-deviation').textContent = `${deviation >= 0 ? '+' : ''}${deviation}분`;
  
  const accuracy = totalEst > 0 ? Math.round((totalAct / totalEst) * 100) : 100;
  document.getElementById('stats-accuracy-rate').textContent = `${accuracy}%`;

  // Apply colors to metrics based on values
  const accuracyEl = document.getElementById('stats-accuracy-rate');
  if (accuracy > 115) {
    accuracyEl.style.color = 'var(--accent-warning)';
  } else if (accuracy > 130) {
    accuracyEl.style.color = 'var(--accent-danger)';
  } else {
    accuracyEl.style.color = 'var(--accent-success)';
  }

  // 1. Render Today Time comparison bar chart
  const todayCtx = document.getElementById('todayTimeChart').getContext('2d');
  const labels = completedToday.map(t => t.title.substring(0, 10) + (t.title.length > 10 ? '..' : ''));
  const estData = completedToday.map(t => t.estimatedTime);
  const actData = completedToday.map(t => t.actualTime || 0);

  if (todayTimeChart) {
    todayTimeChart.destroy();
  }

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

  // 2. Render 7-day trend chart
  const trendCtx = document.getElementById('deviationTrendChart').getContext('2d');
  
  // Build last 7 days chart from history
  const trendLabels = [];
  const trendData = [];

  // Add previous days from history
  const lastHistory = state.history.slice(-7);
  lastHistory.forEach(day => {
    trendLabels.push(day.date.substring(5)); // MM-DD
    const rate = day.totalPlanned > 0 ? (day.totalActual / day.totalPlanned) * 100 : 100;
    trendData.push(rate);
  });

  // Add today to the trend
  if (totalEst > 0) {
    trendLabels.push(state.date.substring(5));
    trendData.push(Math.round((totalAct / totalEst) * 100));
  }

  // Fallback if no history yet
  if (trendLabels.length === 0) {
    trendLabels.push('기록 없음');
    trendData.push(100);
  }

  if (trendChart) {
    trendChart.destroy();
  }

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
}

// Utility: Toast Messages
function showToast(message) {
  // Simple toast element creation
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
