/* =====================================================================
   frontend/js/app.js
   The JavaScript for EVERY page. Each HTML page has
   <body data-page="..."> and the code at the bottom of this file reads
   that value to decide which page-specific function to run.

   Sections:
     1. Settings
     2. Login session (token saved in localStorage)
     3. Talking to the backend: api()
     4. Small helper functions (dates, badges, messages ...)
     5. Page: index.html
     6. Page: login.html
     7. Page: register.html
     8. Page: dashboard.html
     9. Page: complaint.html (new complaint form + tracking page)
    10. Start-up

   Rules this file follows:
     - It only talks to the backend through fetch('/api/...').
     - Complaint IDs are NEVER created here. The backend creates them.
     - Everything that came from a user (names, subjects, remarks ...)
       goes through esc() before it is placed in the page, so nobody can
       inject HTML or scripts.
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. Settings
   --------------------------------------------------------------------- */
const TOKEN_KEY = 'bcs_token';   // localStorage key for the login token
const USER_KEY  = 'bcs_user';    // localStorage key for { id, name, email, role }

// Must be spelled exactly like the database and backend.
const STATUSES = ['Pending', 'In Progress', 'Resolved', 'Closed'];

// Suggestions shown for the Subject field when the category is UPI.
const UPI_SUBJECTS = [
  'Payment Failed',
  'Amount Debited but Payment Failed',
  'Transaction Pending',
  'Wrong UPI Transfer',
  'Refund Not Received',
  'Unauthorized UPI Transaction'
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];


/* ---------------------------------------------------------------------
   2. Login session
   After a successful login the backend returns { token, user }.
   We keep both in localStorage so the user stays logged in when moving
   between pages. The token is never shown on screen.
   --------------------------------------------------------------------- */
function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function logout() {
  clearSession();
  goTo('login.html');
}

// All page changes go through this one function.
function goTo(url) {
  window.location.href = url;
}


/* ---------------------------------------------------------------------
   3. Talking to the backend
   api('/api/complaints')                              -> GET
   api('/api/complaints', { method: 'POST', body: {...} })
   It adds the login token, converts JSON, and turns every failure into
   an Error whose message is safe to show to the user.
   Options: method, body, noAuth (true = do not send the token)
   --------------------------------------------------------------------- */
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = options.noAuth ? null : getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  let response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (networkError) {
    throw new Error('Cannot reach the server. Check your internet connection and try again.');
  }

  // The backend always answers with JSON, but be safe if it does not.
  let data = null;
  try { data = await response.json(); } catch (parseError) { data = null; }

  if (!response.ok) {
    // 401 on a protected request = token missing, expired or invalid.
    if (response.status === 401 && token) {
      clearSession();
      goTo('login.html?expired=1');
    }
    const error = new Error((data && data.error) || 'Something went wrong (error ' + response.status + ')');
    error.status = response.status;
    throw error;
  }
  return data;
}


/* ---------------------------------------------------------------------
   4. Small helper functions
   --------------------------------------------------------------------- */
function $(id) {
  return document.getElementById(id);
}

// Makes text safe to place inside HTML.
function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// "2026-10-08 17:11:18" or "2026-10-08"  ->  "8 Oct 2026"
function formatDate(text) {
  const match = String(text || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(text || '');
  return Number(match[3]) + ' ' + MONTHS[Number(match[2]) - 1] + ' ' + match[1];
}

// "2026-10-08 17:11:18"  ->  "8 Oct 2026, 17:11"
function formatDateTime(text) {
  const time = String(text || '').match(/(\d{2}):(\d{2})/);
  return formatDate(text) + (time ? ', ' + time[0] : '');
}

// 1500.5 -> "₹1,500.50"
function formatAmount(value) {
  return '₹' + Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Coloured badge for a status.
function statusBadge(status) {
  const classes = {
    'Pending': 'badge-pending',
    'In Progress': 'badge-progress',
    'Resolved': 'badge-resolved',
    'Closed': 'badge-closed'
  };
  return '<span class="badge ' + (classes[status] || 'badge-closed') + '">' + esc(status) + '</span>';
}

function loadingHtml(text) {
  return '<div class="loading"><span class="spinner" aria-hidden="true"></span><span>' + esc(text) + '</span></div>';
}

// Shows a message in the <div id="alertBox"> of the current page.
// type: 'error' | 'success' | 'warning' | 'info'
function showAlert(type, message) {
  const box = $('alertBox');
  if (!box) return;
  const role = type === 'error' ? 'alert' : 'status';
  box.innerHTML = '<div class="alert alert-' + type + '" role="' + role + '">' + esc(message) + '</div>';
  box.scrollIntoView({ block: 'nearest' });
}

function clearAlert() {
  const box = $('alertBox');
  if (box) box.innerHTML = '';
}

// Disables a button and changes its text while a request is running.
function setBusy(button, busy, busyText) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Today as YYYY-MM-DD in the user's local time.
function todayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + month + '-' + day;
}

// Used by dashboard.html and complaint.html.
// 1. No token saved?  -> go to the login page.
// 2. Otherwise ask the backend (GET /api/auth/me) whether the token is
//    still valid and who the user is. Returns the user, or null.
async function requireLogin() {
  if (!getToken()) {
    goTo('login.html');
    return null;
  }
  try {
    const data = await api('/api/auth/me');
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  } catch (error) {
    // A 401 has already sent the user to the login page (see api()).
    if (error.status !== 401) {
      $('appMain').hidden = false;
      showAlert('error', error.message);
    }
    return null;
  }
}

// Fills the name / role in the top bar and activates the Log out button.
function setupHeader(user) {
  $('navUserName').textContent = user.name;
  $('navUserRole').textContent = user.role === 'employee' ? 'Bank employee' : 'Customer';
  $('logoutBtn').addEventListener('click', logout);
}


/* ---------------------------------------------------------------------
   5. Page: index.html
   --------------------------------------------------------------------- */
function initIndex() {
  // Already logged in? Replace the sign-up buttons with a dashboard link.
  if (getToken()) {
    $('navLogin').textContent = 'Go to dashboard';
    $('navLogin').href = 'dashboard.html';
    $('navRegister').hidden = true;
    $('heroPrimary').textContent = 'Go to my dashboard';
    $('heroPrimary').href = 'dashboard.html';
    $('heroSecondary').hidden = true;
  }
}


/* ---------------------------------------------------------------------
   6. Page: login.html
   POST /api/auth/login  { email, password }  ->  { token, user }
   Both roles log in here. The dashboard page shows the customer view or
   the employee view depending on user.role.
   --------------------------------------------------------------------- */
function initLogin() {
  if (getToken()) {            // already logged in
    goTo('dashboard.html');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('expired')) showAlert('warning', 'Your session has ended. Please log in again.');
  if (params.get('registered')) showAlert('success', 'Account created. Log in to continue.');

  $('loginForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    clearAlert();

    const email = $('email').value.trim();
    const password = $('password').value;
    const button = $('submitBtn');

    if (!email || !password) {
      showAlert('error', 'Enter your email and password.');
      return;
    }

    setBusy(button, true, 'Logging in...');
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { email, password }, noAuth: true });
      saveSession(data.token, data.user);
      goTo('dashboard.html');
    } catch (error) {
      showAlert('error', error.message);
      setBusy(button, false);
    }
  });
}


/* ---------------------------------------------------------------------
   7. Page: register.html
   POST /api/auth/register  { name, email, password }
   --------------------------------------------------------------------- */
function initRegister() {
  if (getToken()) {
    goTo('dashboard.html');
    return;
  }

  $('registerForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    clearAlert();

    const name = $('name').value.trim();
    const email = $('email').value.trim();
    const password = $('password').value;
    const confirmPassword = $('confirmPassword').value;
    const button = $('submitBtn');

    if (name.length < 2) return showAlert('error', 'Enter your full name (at least 2 characters).');
    if (!isValidEmail(email)) return showAlert('error', 'Enter a valid email address, for example name@example.com.');
    if (password.length < 6) return showAlert('error', 'Your password must be at least 6 characters long.');
    if (password !== confirmPassword) return showAlert('error', 'The two passwords do not match.');

    setBusy(button, true, 'Creating account...');
    try {
      await api('/api/auth/register', { method: 'POST', body: { name, email, password }, noAuth: true });
      goTo('login.html?registered=1');
    } catch (error) {
      showAlert('error', error.message);
      setBusy(button, false);
    }
  });
}


/* ---------------------------------------------------------------------
   8. Page: dashboard.html
   GET /api/complaints/stats            -> { total, pending, in_progress, resolved, closed }
   GET /api/complaints[?status=Pending] -> array of complaints
   The backend decides what each user may see: a customer gets only their
   own complaints, an employee gets all of them.
   --------------------------------------------------------------------- */
let dashboardRequestNumber = 0;   // lets us ignore out-of-date responses

async function initDashboard() {
  const user = await requireLogin();
  if (!user) return;

  setupHeader(user);
  $('appMain').hidden = false;

  const isEmployee = user.role === 'employee';
  $('welcomeTitle').textContent = 'Welcome, ' + user.name;
  $('welcomeSub').textContent = isEmployee
    ? 'Review customer complaints and update their progress.'
    : 'Register a complaint or check on one you already sent.';
  $('listTitle').textContent = isEmployee ? 'All complaints' : 'My complaints';
  $('newComplaintBtn').hidden = isEmployee;

  // Filter buttons: All / Pending / In Progress / Resolved / Closed
  const tabs = document.querySelectorAll('#filterTabs .tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-pressed', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-pressed', 'true');
      loadComplaintList(tab.dataset.status, isEmployee);
    });
  });

  loadStats();
  loadComplaintList('', isEmployee);
}

async function loadStats() {
  try {
    const stats = await api('/api/complaints/stats');
    $('statTotal').textContent = stats.total;
    $('statPending').textContent = stats.pending;
    $('statInProgress').textContent = stats.in_progress;
    $('statResolved').textContent = stats.resolved;
    $('statClosed').textContent = stats.closed;
  } catch (error) {
    showAlert('error', error.message);
  }
}

async function loadComplaintList(status, isEmployee) {
  const thisRequest = ++dashboardRequestNumber;
  const area = $('listArea');
  area.innerHTML = loadingHtml('Loading complaints...');

  try {
    const url = '/api/complaints' + (status ? '?status=' + encodeURIComponent(status) : '');
    const rows = await api(url);
    if (thisRequest !== dashboardRequestNumber) return;   // user clicked another tab meanwhile
    area.innerHTML = renderComplaintTable(rows, isEmployee, status);
  } catch (error) {
    if (thisRequest !== dashboardRequestNumber) return;
    area.innerHTML = '';
    showAlert('error', error.message);
  }
}

function renderComplaintTable(rows, isEmployee, status) {
  if (rows.length === 0) {
    if (status) {
      return '<div class="empty"><h3>Nothing here</h3><p>There are no complaints with the status "' + esc(status) + '".</p></div>';
    }
    if (isEmployee) {
      return '<div class="empty"><h3>No complaints yet</h3><p>Complaints will appear here when customers register them.</p></div>';
    }
    return '<div class="empty"><h3>You have not registered a complaint yet</h3>' +
           '<p>If something went wrong with a payment, card or account, tell the bank here.</p>' +
           '<a class="btn btn-primary" href="complaint.html?new=1">Register new complaint</a></div>';
  }

  let html = '<div class="table-wrap"><table class="table"><thead><tr>' +
    '<th>Complaint ID</th><th>Category</th><th>Subject</th>' +
    (isEmployee ? '<th>Customer</th>' : '') +
    '<th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>';

  rows.forEach(function (c) {
    html += '<tr>' +
      '<td data-label="Complaint ID"><span class="id-text">' + esc(c.complaint_id) + '</span></td>' +
      '<td data-label="Category">' + esc(c.category) + '</td>' +
      '<td data-label="Subject" class="subject-cell">' + esc(c.subject) + '</td>' +
      (isEmployee ? '<td data-label="Customer">' + esc(c.customer_name) + '</td>' : '') +
      '<td data-label="Status">' + statusBadge(c.status) + '</td>' +
      '<td data-label="Date">' + esc(formatDate(c.created_at)) + '</td>' +
      '<td data-label="Action"><a class="btn btn-outline btn-sm" href="complaint.html?id=' + encodeURIComponent(c.complaint_id) + '">View</a></td>' +
      '</tr>';
  });

  return html + '</tbody></table></div>';
}


/* ---------------------------------------------------------------------
   9. Page: complaint.html
   One page, two modes (chosen by the address):
     complaint.html?new=1                 -> form to register a complaint (customers)
     complaint.html?id=CMP-2026-0001      -> tracking page (customer or employee)
   --------------------------------------------------------------------- */
let currentComplaint = null;   // the complaint shown on the tracking page

async function initComplaintPage() {
  const user = await requireLogin();
  if (!user) return;

  setupHeader(user);
  $('appMain').hidden = false;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (id) {
    showTracking(user, id);
  } else if (params.get('new')) {
    if (user.role !== 'customer') {       // only customers register complaints
      goTo('dashboard.html');
      return;
    }
    showNewComplaintForm();
  } else {
    goTo('dashboard.html');
  }
}

/* ----- Mode 1: register a new complaint ----- */
async function showNewComplaintForm() {
  document.title = 'Register complaint | Banking & UPI Complaint Portal';
  $('newView').hidden = false;
  $('transactionDate').max = todayString();   // no future dates

  // Fill the category dropdown from GET /api/categories
  try {
    const categories = await api('/api/categories');
    const select = $('category');
    categories.forEach(function (c) {
      const option = document.createElement('option');
      option.value = c.category_name;
      option.textContent = c.category_name;
      select.appendChild(option);
    });
  } catch (error) {
    showAlert('error', 'Could not load the categories. ' + error.message);
  }

  // For the UPI category, suggest the common UPI problems in the Subject box.
  $('category').addEventListener('change', function () {
    const list = $('subjectSuggestions');
    list.innerHTML = '';
    if ($('category').value === 'UPI') {
      UPI_SUBJECTS.forEach(function (text) {
        const option = document.createElement('option');
        option.value = text;
        list.appendChild(option);
      });
    }
  });

  $('complaintForm').addEventListener('submit', submitNewComplaint);
}

async function submitNewComplaint(event) {
  event.preventDefault();
  clearAlert();

  const category = $('category').value;
  const subject = $('subject').value.trim();
  const description = $('description').value.trim();
  const transactionId = $('transactionId').value.trim();
  const amount = $('transactionAmount').value.trim();
  const date = $('transactionDate').value;
  const button = $('submitBtn');

  // Quick checks for the user's benefit. The backend checks everything again.
  if (!category) return showAlert('error', 'Select a category.');
  if (subject.length < 3) return showAlert('error', 'The subject must be at least 3 characters.');
  if (description.length < 10) return showAlert('error', 'Describe the problem in at least 10 characters.');
  if (amount !== '' && (isNaN(Number(amount)) || Number(amount) < 0)) {
    return showAlert('error', 'The transaction amount must be a number such as 1500.50.');
  }
  if (date && date > todayString()) return showAlert('error', 'The transaction date cannot be in the future.');

  setBusy(button, true, 'Submitting...');
  try {
    const data = await api('/api/complaints', {
      method: 'POST',
      body: {
        category: category,
        subject: subject,
        description: description,
        transaction_id: transactionId || null,
        transaction_amount: amount || null,
        transaction_date: date || null
      }
    });

    // Show the complaint ID the BACKEND created.
    $('newComplaintId').textContent = data.complaint_id;
    $('trackLink').href = 'complaint.html?id=' + encodeURIComponent(data.complaint_id);
    $('newFormCard').hidden = true;
    $('successPanel').hidden = false;
    $('successPanel').scrollIntoView({ block: 'start' });
  } catch (error) {
    showAlert('error', error.message);
    setBusy(button, false);
  }
}

/* ----- Mode 2: track one complaint ----- */
async function showTracking(user, id) {
  $('loadingBox').hidden = false;
  try {
    const data = await api('/api/complaints/' + encodeURIComponent(id));
    currentComplaint = data.complaint;

    $('loadingBox').hidden = true;
    $('trackView').hidden = false;
    document.title = data.complaint.complaint_id + ' | Banking & UPI Complaint Portal';
    renderTracking(data.complaint, data.updates, user);

    if (user.role === 'employee') {
      $('employeePanel').hidden = false;
      $('updateForm').addEventListener('submit', submitEmployeeUpdate);
    }
  } catch (error) {
    $('loadingBox').hidden = true;
    if (error.status === 404) {
      showAlert('error', 'This complaint was not found. Check the complaint ID, or go back to your dashboard.');
    } else {
      showAlert('error', error.message);
    }
  }
}

// Writes the data we got from GET /api/complaints/:id into the page.
function renderTracking(complaint, updates, user) {
  $('trackId').textContent = complaint.complaint_id;
  $('trackStatus').innerHTML = statusBadge(complaint.status);
  $('trackSubject').textContent = complaint.subject;
  $('trackCategory').textContent = 'Category: ' + complaint.category;

  // Details
  const none = '<span class="muted">Not provided</span>';
  let details = '';
  details += detailItem('Description', esc(complaint.description), true);
  details += detailItem('Transaction ID', complaint.transaction_id ? esc(complaint.transaction_id) : none);
  details += detailItem('Transaction amount',
    complaint.transaction_amount !== null && complaint.transaction_amount !== undefined ? esc(formatAmount(complaint.transaction_amount)) : none);
  details += detailItem('Transaction date', complaint.transaction_date ? esc(formatDate(complaint.transaction_date)) : none);
  details += detailItem('Registered on', esc(formatDateTime(complaint.created_at)));
  if (user.role === 'employee') {
    details += detailItem('Customer', esc(complaint.customer_name));
    details += detailItem('Customer email', esc(complaint.customer_email));
  }
  details += detailItem('Last updated', esc(formatDateTime(complaint.updated_at)));
  $('detailList').innerHTML = details;

  $('timeline').innerHTML = buildTimeline(complaint.status);
  $('historyList').innerHTML = buildHistory(updates);

  // Keep the employee's dropdown in step with the real status.
  $('statusSelect').value = complaint.status;
}

function detailItem(label, valueHtml, wide) {
  return '<div class="detail' + (wide ? ' detail-wide' : '') + '"><dt>' + esc(label) + '</dt><dd>' + valueHtml + '</dd></div>';
}

// Timeline: Registered -> Assigned -> In Progress -> Resolved -> Closed
// There is no "assigned" column in the database, so "Assigned" counts as
// done as soon as the status is anything other than Pending.
function buildTimeline(status) {
  const position = STATUSES.indexOf(status);   // Pending=0, In Progress=1, Resolved=2, Closed=3

  const steps = [
    { label: 'Complaint registered', state: 'done' },
    { label: 'Assigned',             state: position >= 1 ? 'done' : 'todo' },
    { label: 'In Progress',          state: position === 1 ? 'current' : (position > 1 ? 'done' : 'todo') },
    { label: 'Resolved',             state: position === 2 ? 'current' : (position > 2 ? 'done' : 'todo') },
    { label: 'Closed',               state: position === 3 ? 'done' : 'todo' }
  ];

  const symbols = { done: '✓', current: '●', todo: '○' };
  const words = { done: 'completed', current: 'current step', todo: 'not reached yet' };

  return steps.map(function (step) {
    return '<li class="' + step.state + '">' +
      '<span class="tl-marker" aria-hidden="true">' + symbols[step.state] + '</span>' +
      '<span class="tl-label">' + esc(step.label) + '<span class="sr-only"> (' + words[step.state] + ')</span></span>' +
      '</li>';
  }).join('');
}

// Update history, newest first.
function buildHistory(updates) {
  if (updates.length === 0) {
    return '<li class="muted">No updates yet.</li>';
  }
  return updates.slice().reverse().map(function (u) {
    return '<li>' +
      '<div class="history-top">' + statusBadge(u.status) +
      '<span class="history-time">' + esc(formatDateTime(u.created_at)) + '</span></div>' +
      '<p class="history-remark">' + esc(u.remark || 'No remark') + '</p>' +
      '<p class="history-by">Updated by ' + esc(u.updated_by_name) + '</p>' +
      '</li>';
  }).join('');
}

/* ----- Employee: change status and/or add a remark -----
   Status changed  -> PUT  /api/complaints/:id/status   { status, remark }
   Only a remark   -> POST /api/complaints/:id/updates  { remark }
   Either way the backend adds a row to complaint_updates. */
async function submitEmployeeUpdate(event) {
  event.preventDefault();
  clearAlert();

  const newStatus = $('statusSelect').value;
  const remark = $('remark').value.trim();
  const button = $('updateBtn');
  const statusChanged = newStatus !== currentComplaint.status;
  const base = '/api/complaints/' + encodeURIComponent(currentComplaint.complaint_id);

  if (!statusChanged && !remark) {
    return showAlert('warning', 'Choose a different status or write a remark before updating.');
  }

  setBusy(button, true, 'Updating...');
  try {
    if (statusChanged) {
      await api(base + '/status', { method: 'PUT', body: { status: newStatus, remark: remark } });
    } else {
      await api(base + '/updates', { method: 'POST', body: { remark: remark } });
    }

    // Load the complaint again so the page shows what is really saved.
    const data = await api(base);
    currentComplaint = data.complaint;
    const user = JSON.parse(localStorage.getItem(USER_KEY));
    renderTracking(data.complaint, data.updates, user);

    $('remark').value = '';
    showAlert('success', 'Complaint updated. The customer can now see this update.');
  } catch (error) {
    showAlert('error', error.message);
  }
  setBusy(button, false);
}


/* ---------------------------------------------------------------------
   10. Start-up: run the right function for the current page
   --------------------------------------------------------------------- */
function initPage() {
  const page = document.body.dataset.page;

  if (page === 'index') initIndex();
  else if (page === 'login') initLogin();
  else if (page === 'register') initRegister();
  else if (page === 'dashboard') initDashboard();
  else if (page === 'complaint') initComplaintPage();
}

document.addEventListener('DOMContentLoaded', initPage);
