// Global Configuration
const CONFIG = {
    schoolName: "TRUE STAR ACADEMY",
    termFee: 1000,
    academicYear: "2023/2024",
    term: "TERM 1"
};

const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? `http://${window.location.hostname}:8080/api/data` 
    : 'https://JarzyWav.pythonanywhere.com/api/data';

async function backendSave(collection, data) {
    try {
        await fetch(`${BACKEND_URL}/${collection}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error(`Backend save failed for ${collection}:`, e);
    }
}

// Proxy localStorage to automatically sync with backend
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments);
    try {
        if (key === 'erp_students') backendSave('students', JSON.parse(value));
        else if (key === 'erp_payments') backendSave('payments', JSON.parse(value));
        else if (key === 'erp_reports') backendSave('reports', JSON.parse(value));
        else if (key === 'erp_deleted') backendSave('deleted', JSON.parse(value));
        else if (key === 'erp_users') backendSave('users', JSON.parse(value));
    } catch (e) {}
};

// State Management
const STATE = {
    user: null,
    theme: 'light',
    students: [],
    payments: [],
    deleted: [],
    reports: [],
    classes: [
        'CRECHE',
        'NURSERY 1 A', 'NURSERY 1 B', 'NURSERY 2 A', 'NURSERY 2 B',
        'KINDERGARTEN 1 A', 'KINDERGARTEN 1 B', 'KINDERGARTEN 2 A', 'KINDERGARTEN 2 B',
        ...Array.from({ length: 6 }, (_, i) => [`BASIC ${i + 1} A`, `BASIC ${i + 1} B`]).flat(),
        'BASIC 7', 'BASIC 8', 'BASIC 9'
    ],
    currency: 'GH₵'
};

// --- AUTHENTICATION ---
let USERS = [];


document.addEventListener('DOMContentLoaded', async () => {
    // 1. Fetch initial state from backend
    try {
        const res = await fetch(BACKEND_URL);
        const data = await res.json();
        
        if (Array.isArray(data.students)) STATE.students = data.students; else STATE.students = JSON.parse(localStorage.getItem('erp_students')) || [];
        if (Array.isArray(data.payments)) STATE.payments = data.payments; else STATE.payments = JSON.parse(localStorage.getItem('erp_payments')) || [];
        if (Array.isArray(data.deleted)) STATE.deleted = data.deleted; else STATE.deleted = JSON.parse(localStorage.getItem('erp_deleted')) || [];
        if (Array.isArray(data.reports)) STATE.reports = data.reports; else STATE.reports = JSON.parse(localStorage.getItem('erp_reports')) || [];
        if (Array.isArray(data.users)) USERS = data.users; else USERS = JSON.parse(localStorage.getItem('erp_users')) || [{ email: 'admin@school.com', password: 'password123', name: 'Admin User' }];
        if (data.currency) STATE.currency = data.currency; else STATE.currency = localStorage.getItem('erp_currency') || 'GH₵';
        
        // Populate local storage
        originalSetItem.call(localStorage, 'erp_students', JSON.stringify(STATE.students));
        originalSetItem.call(localStorage, 'erp_payments', JSON.stringify(STATE.payments));
        originalSetItem.call(localStorage, 'erp_deleted', JSON.stringify(STATE.deleted));
        originalSetItem.call(localStorage, 'erp_reports', JSON.stringify(STATE.reports));
        originalSetItem.call(localStorage, 'erp_users', JSON.stringify(USERS));
        originalSetItem.call(localStorage, 'erp_currency', STATE.currency);
    } catch (e) {
        console.error("Failed to load initial data from backend. Using local storage fallback.", e);
        STATE.students = JSON.parse(localStorage.getItem('erp_students')) || [];
        STATE.payments = JSON.parse(localStorage.getItem('erp_payments')) || [];
        STATE.deleted = JSON.parse(localStorage.getItem('erp_deleted')) || [];
        STATE.reports = JSON.parse(localStorage.getItem('erp_reports')) || [];
        USERS = JSON.parse(localStorage.getItem('erp_users')) || [{ email: 'admin@school.com', password: 'password123', name: 'Admin User' }];
        STATE.currency = localStorage.getItem('erp_currency') || 'GH₵';
    }

    // 2. Sanitize and Safeguard
    const safeData = (arr) => (Array.isArray(arr) ? arr : []).filter(item => item && typeof item === 'object');

    STATE.students = safeData(STATE.students).map(s => ({
        ...s,
        name: (s.name || '').toUpperCase(),
        class: (s.class || '').toUpperCase(),
        sid: (s.sid || '').toUpperCase()
    }));

    STATE.payments = safeData(STATE.payments).map(p => ({
        ...p,
        studentName: (p.studentName || '').toUpperCase(),
        studentClass: (p.studentClass || '').toUpperCase()
    }));

    STATE.reports = safeData(STATE.reports).map(r => ({
        ...r,
        studentName: (r.studentName || '').toUpperCase(),
        studentClass: (r.studentClass || '').toUpperCase()
    }));

    // Re-save sanitized data
    originalSetItem.call(localStorage, 'erp_students', JSON.stringify(STATE.students));
    originalSetItem.call(localStorage, 'erp_payments', JSON.stringify(STATE.payments));
    originalSetItem.call(localStorage, 'erp_reports', JSON.stringify(STATE.reports));

    initAuth();
    initTheme();
    initNavigation();
    initExcelImport();
    initExcelExport();
    initClassDropdown();
    initUppercaseListeners();
    updateStats();
});

function initUppercaseListeners() {
    const fields = ['stud-name', 'stud-sid', 'pay-name-input', 'rep-stud'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', (e) => {
                const start = e.target.selectionStart;
                const end = e.target.selectionEnd;
                e.target.value = e.target.value.toUpperCase();
                e.target.setSelectionRange(start, end);
            });
        }
    });

    // Auto-ID fill based on class
    const classSelect = document.getElementById('stud-class');
    const sidInput = document.getElementById('stud-sid');
    if (classSelect && sidInput) {
        classSelect.addEventListener('change', () => {
            const isEditing = document.getElementById('stud-id').value;
            if (!isEditing && classSelect.value) {
                sidInput.value = generateStudentID(classSelect.value);
            }
        });
    }
}

function generateStudentID(className) {
    const now = new Date();
    const currentYear = now.getFullYear(); // 2026 based on user context

    // Ranks based on years until Basic 9 completion
    const gradeRanks = {
        'BASIC 9': 0, 'BASIC 8': 1, 'BASIC 7': 2,
        'BASIC 6': 3, 'BASIC 5': 4, 'BASIC 4': 5,
        'BASIC 3': 6, 'BASIC 2': 7, 'BASIC 1': 8,
        'KINDERGARTEN 2': 9, 'KINDERGARTEN 1': 10,
        'NURSERY 2': 11, 'NURSERY 1': 12,
        'CRECHE': 13
    };

    // Extract the base grade name for ranking (ignoring A/B divisions)
    const baseGrade = Object.keys(gradeRanks).find(g => className.toUpperCase().includes(g));
    const yearsRemaining = baseGrade ? gradeRanks[baseGrade] : 14;

    // If it's April 2026, Basic 9 completes in 2026.
    const completionYear = 2026 + yearsRemaining;

    const studentsInYear = STATE.students.filter(s => s.sid && s.sid.startsWith(completionYear.toString())).length;
    const nextNum = (studentsInYear + 1).toString().padStart(3, '0');

    return `${completionYear}-STU${nextNum}`;
}

function initClassDropdown() {
    const selects = [
        document.getElementById('stud-class'),
        document.getElementById('import-class-select'),
        document.getElementById('view-class-filter'),
        document.getElementById('bulk-class-select'),
        document.getElementById('view-payment-filter'),
        document.getElementById('view-report-filter'),
        document.getElementById('pay-class-select')
    ];
    const optionsHTML = STATE.classes.map(c => `<option value="${c}">${c}</option>`).join('');

    selects.forEach(select => {
        if (!select) return;
        let placeholder = 'Select Class';
        if (select.id === 'import-class-select') placeholder = 'Target Class (Import)';
        if (select.id === 'view-class-filter') placeholder = 'All Classes';
        if (select.id === 'view-payment-filter') placeholder = 'All Classes';
        if (select.id === 'view-report-filter') placeholder = 'All Classes';
        if (select.id === 'bulk-class-select') placeholder = 'Select Target Class';
        if (select.id === 'pay-class-select') placeholder = 'Select Student Class';

        select.innerHTML = `<option value="">${placeholder}</option>` + optionsHTML;
    });

    // Add filter listeners
    const viewFilter = document.getElementById('view-class-filter');
    const payFilter = document.getElementById('view-payment-filter');
    const repFilter = document.getElementById('view-report-filter');
    if (viewFilter) viewFilter.addEventListener('change', () => renderStudents());
    if (payFilter) payFilter.addEventListener('change', () => renderPayments());
    if (repFilter) repFilter.addEventListener('change', () => renderReports());

    // Sorting listeners
    const studentSort = document.getElementById('sort-students');
    if (studentSort) studentSort.addEventListener('change', () => renderStudents());

    const paymentSort = document.getElementById('sort-payments');
    if (paymentSort) paymentSort.addEventListener('change', () => renderPayments());

    const reportSort = document.getElementById('sort-reports');
    if (reportSort) reportSort.addEventListener('change', () => renderReports());

    // Search Listener
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
        const triggerSearch = () => {
            const query = searchInput.value.trim().toLowerCase();
            const activeView = document.querySelector('.view:not(.hidden)');
            if (!activeView) return;
            let activeViewId = activeView.id;

            // If searching from dashboard, switch to students view
            if (activeViewId === 'view-dashboard' && query.length > 0) {
                const studentLink = document.querySelector('[data-target="view-students"]');
                if (studentLink) studentLink.click();
                return; // Navigation click will trigger its own render
            }

            if (activeViewId === 'view-students') renderStudents();
            if (activeViewId === 'view-payments') renderPayments();
            if (activeViewId === 'view-reports') renderReports();
        };

        searchInput.addEventListener('input', triggerSearch);

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                console.log("Search confirmation: Enter pressed.");
                triggerSearch();
                searchInput.blur();
            }
        });
    }

    const sortStud = document.getElementById('sort-students');
    const sortPay = document.getElementById('sort-payments');
    const sortRep = document.getElementById('sort-reports');
    if (sortStud) sortStud.addEventListener('change', () => renderStudents());
    if (sortPay) sortPay.addEventListener('change', () => renderPayments());
    if (sortRep) sortRep.addEventListener('change', () => renderReports());
    const bulkForm = document.getElementById('form-bulk-add');
    if (bulkForm) {
        bulkForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const namesText = document.getElementById('bulk-names').value;
            const targetClass = document.getElementById('bulk-class-select').value;

            if (!targetClass) {
                alert("Please select a target class!");
                return;
            }

            const lines = namesText.split('\n').map(l => l.trim()).filter(l => l !== '');

            const newStudents = lines.map((line, index) => {
                // Support Comma or Tab delimiter
                const parts = line.split(/[,\t]+/).map(p => p.trim());
                const name = parts[0] || 'UNKNOWN';
                const arrears = parseFloat(parts[1]) || 0;
                const genderInput = parts[2] ? parts[2].toUpperCase().charAt(0) : 'M';
                const gender = (genderInput === 'F') ? 'F' : 'M'; // Ensure only M or F

                return {
                    id: Date.now().toString() + index,
                    sid: generateStudentID ? generateStudentID(targetClass) : `STU${Date.now()}`,
                    name: name.toUpperCase(),
                    class: targetClass.toUpperCase(),
                    gender: gender,
                    contact: 'N/A',
                    prevArrears: arrears
                };
            });

            STATE.students = [...STATE.students, ...newStudents];
            localStorage.setItem('erp_students', JSON.stringify(STATE.students));

            hideModal('mod-bulk-add');
            e.target.reset();
            renderStudents();
            updateStats();
            alert(`Successfully added ${newStudents.length} students to ${targetClass}!`);
        });
    }

    // Add filter listener
    document.getElementById('view-class-filter').addEventListener('change', () => renderStudents());
}

function initExcelExport() {
    const exportBtn = document.getElementById('btn-export-students');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
        if (STATE.students.length === 0) {
            alert("No data to export.");
            return;
        }

        // Clean data for export
        const exportData = STATE.students.map(s => ({
            'Student ID': s.sid,
            'Full Name': s.name,
            'Class': s.class,
            'Parent Contact': s.contact,
            'Date of Birth': s.dob || '',
            'Residence': s.residence || '',
            'Medical Condition': s.medical || ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Students");

        // Generate and download
        XLSX.writeFile(workbook, "School_Students_List.xlsx");
    });
}


function initExcelImport() {
    const importInput = document.getElementById('excel-import');
    const classSelect = document.getElementById('import-class-select');
    if (!importInput) return;

    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const selectedClass = classSelect ? classSelect.value : '';
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = evt.target.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                // Process data
                const newStudents = json.map((row, index) => ({
                    id: Date.now().toString() + index,
                    sid: String(row.ID || row.StudentID || `STU${Math.floor(Math.random() * 1000)}`).toUpperCase(),
                    name: String(row.Name || row.FullName || 'Unknown Student').toUpperCase(),
                    class: String(selectedClass || row.Class || row.Grade || 'Unassigned').toUpperCase(),
                    contact: row.Contact || row.ParentContact || 'N/A',
                    dob: row.DOB || row['Date of Birth'] || '',
                    residence: row.Residence || '',
                    medical: row.Medical || row['Medical Condition'] || ''
                }));

                if (newStudents.length > 0) {
                    STATE.students = [...STATE.students, ...newStudents];
                    localStorage.setItem('erp_students', JSON.stringify(STATE.students));
                    renderStudents();
                    updateStats();
                    alert(`Successfully imported ${newStudents.length} students!`);
                } else {
                    alert("No valid data found in the file.");
                }
            } catch (err) {
                console.error("Excel Parsing Error:", err);
                alert("Error parsing file. Please ensure it's a valid Excel or CSV file.");
            }
        };
        reader.readAsBinaryString(file);
    });
}


function initAuth() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const showSignup = document.getElementById('show-signup');
    const showLogin = document.getElementById('show-login');
    const forgotPw = document.getElementById('forgot-pw-link');
    const loginError = document.getElementById('login-error');
    const formTitle = document.getElementById('form-title');

    // Toggle Forms
    showSignup.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        formTitle.textContent = "Create Account";
    });

    showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        formTitle.textContent = "School ERP Login";
    });

    forgotPw.addEventListener('click', (e) => {
        e.preventDefault();
        alert("Password reset link sent to your email (Demo: Check console)");
        console.log("Password Reset Triggered for standard admin@school.com");
    });

    // Login Logic
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;

        const user = USERS.find(u => u.email === email && u.password === pass);

        if (user) {
            loginSuccess(user);
        } else {
            loginError.textContent = "Invalid email or password.";
            setTimeout(() => loginError.textContent = "", 3000);
        }
    });

    // Signup Logic
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const pass = document.getElementById('signup-password').value;

        if (USERS.some(u => u.email === email)) {
            alert("Email already exists!");
            return;
        }

        const newUser = { name, email, password: pass };
        USERS.push(newUser);
        localStorage.setItem('erp_users', JSON.stringify(USERS));

        alert("Account created! Please login.");
        showLogin.click();
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('erp_active_user');
        window.location.reload();
    });

    // Auto-login check
    const activeUser = JSON.parse(localStorage.getItem('erp_active_user'));
    if (activeUser) loginSuccess(activeUser);
}

function loginSuccess(user) {
    STATE.user = user;
    localStorage.setItem('erp_active_user', JSON.stringify(user));
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-layout').classList.remove('hidden');
    document.getElementById('current-user-info').textContent = `Role: Principal | User: ${user.name}`;
    renderDashboard();
}

// --- NAVIGATION & UI ---
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.view');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target');

            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            views.forEach(v => {
                v.classList.add('hidden');
                v.classList.remove('active');
            });

            const activeView = document.getElementById(`view-${target}`);
            activeView.classList.remove('hidden');
            activeView.classList.add('active');

            if (target === 'dashboard') renderDashboard();
            if (target === 'students') renderStudents();
            if (target === 'payments') renderPayments();
            if (target === 'reports') renderReports();
            if (target === 'trash') renderTrash();
        });
    });

    // Mobile Sidebar
    const sidebar = document.getElementById('sidebar');
    document.getElementById('open-sidebar').addEventListener('click', () => sidebar.classList.add('open'));
    document.getElementById('close-sidebar').addEventListener('click', () => sidebar.classList.remove('open'));
}

function initTheme() {
    const toggle = document.getElementById('dark-mode-toggle');
    const currencySelector = document.getElementById('currency-selector');
    const body = document.body;

    const savedTheme = localStorage.getItem('erp_theme') || 'light';
    if (savedTheme === 'dark') {
        body.setAttribute('data-theme', 'dark');
        toggle.textContent = "☀️";
    }

    toggle.addEventListener('click', () => {
        const isDark = body.getAttribute('data-theme') === 'dark';
        if (isDark) {
            body.removeAttribute('data-theme');
            toggle.textContent = "🌙";
            localStorage.setItem('erp_theme', 'light');
        } else {
            body.setAttribute('data-theme', 'dark');
            toggle.textContent = "☀️";
            localStorage.setItem('erp_theme', 'dark');
        }
    });

    if (currencySelector) {
        currencySelector.value = STATE.currency;
        currencySelector.addEventListener('change', (e) => {
            STATE.currency = e.target.value;
            localStorage.setItem('erp_currency', STATE.currency);
            // Refresh financial views
            renderDashboard();
            const activeView = document.querySelector('.view:not(.hidden)');
            if (activeView && activeView.id === 'view-payments') renderPayments();
            if (activeView && activeView.id === 'view-reports') renderReports();
        });
    }
}

// --- DATA RENDERING ---
function getTermFee(className) {
    let fee = 1000;
    const cls = (className || '').toUpperCase();
    if (cls.includes('CRECHE') || cls.includes('NURSERY') || cls.includes('KINDERGARTEN')) {
        fee = 680;
    } else if (cls.includes('BASIC 1') || cls.includes('BASIC 2') || cls.includes('BASIC 3')) {
        fee = 700;
    } else if (cls.includes('BASIC 4') || cls.includes('BASIC 5') || cls.includes('BASIC 6')) {
        fee = 720;
    } else if (cls.includes('BASIC 7') || cls.includes('BASIC 8') || cls.includes('BASIC 9')) {
        fee = 900;
    }
    return fee;
}

function updateStats() {
    const students = Array.isArray(STATE.students) ? STATE.students.filter(s => s) : [];
    const payments = Array.isArray(STATE.payments) ? STATE.payments.filter(p => p) : [];
    const deleted = Array.isArray(STATE.deleted) ? STATE.deleted.filter(d => d) : [];

    const total = students.length;
    const males = students.filter(s => s.gender === 'M').length;
    const females = students.filter(s => s.gender === 'F').length;

    const sTotal = document.getElementById('stat-students');
    const sMales = document.getElementById('stat-males');
    const sFemales = document.getElementById('stat-females');
    if (sTotal) sTotal.textContent = total;
    if (sMales) sMales.textContent = males;
    if (sFemales) sFemales.textContent = females;

    const revenue = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const sRev = document.getElementById('stat-revenue');
    if (sRev) sRev.textContent = `${STATE.currency}${revenue.toLocaleString()}`;

    // Precise Arrears Calculation
    const expected = students.reduce((sum, s) => sum + (parseFloat(s.prevArrears) || 0) + getTermFee(s.class), 0);
    const sArr = document.getElementById('stat-arrears');
    if (sArr) sArr.textContent = `${STATE.currency}${Math.max(0, expected).toLocaleString()}`;

    // Today's Stats
    const todayStr = new Date().toLocaleDateString();
    const todayPayments = payments.filter(p => p.date === todayStr);
    const todayCount = todayPayments.length;
    const todayRev = todayPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    const sTodayCount = document.getElementById('stat-today-count');
    const sTodayRev = document.getElementById('stat-today-revenue');
    if (sTodayCount) sTodayCount.textContent = todayCount;
    if (sTodayRev) sTodayRev.textContent = `${STATE.currency}${todayRev.toLocaleString()}`;

    // Trash Count
    const trashStat = document.getElementById('stat-trash');
    if (trashStat) trashStat.textContent = deleted.length;
}

function renderDashboard() {
    updateStats();
    initChart();
}

function renderClassSummary(targetFilter = '') {
    const container = document.getElementById('class-summary');
    if (!container) return;

    const classCounts = {};
    STATE.students.forEach(s => {
        classCounts[s.class] = (classCounts[s.class] || 0) + 1;
    });

    let activeClasses = Object.keys(classCounts).sort();
    if (targetFilter) {
        activeClasses = activeClasses.filter(c => c === targetFilter);
    }

    if (activeClasses.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = activeClasses.map(cls => `
        <div class="class-pill" style="padding: 8px 15px; background: var(--glass-bg); border: 1px solid var(--accent); border-radius: 12px; display:flex; flex-direction:column; align-items:center; min-width:60px;">
            <span style="font-size: 1.1rem; font-weight: 800; color: var(--accent);">${classCounts[cls]}</span>
            <small style="font-size: 0.65rem; opacity: 0.7; font-weight: 600;">${cls}</small>
        </div>
    `).join('');
}

// --- STUDENT MANAGEMENT ---
function renderStudents() {
    const filter = document.getElementById('view-class-filter').value;
    renderClassSummary(filter);
    const tbody = document.getElementById('students-table-body');
    const sortBy = document.getElementById('sort-students').value;
    const query = (document.getElementById('global-search').value || '').toLowerCase();
    if (!tbody) return;

    let list = Array.isArray(STATE.students) ? [...STATE.students] : [];
    
    if (filter) {
        list = list.filter(s => s && s.class === filter);
    }
    if (query) {
        list = list.filter(s =>
            s && (
                (s.name || '').toLowerCase().includes(query) ||
                (s.class || '').toLowerCase().includes(query) ||
                (s.sid || '').toLowerCase().includes(query)
            )
        );
    }

    // Sort
    list.sort((a, b) => {
        try {
            if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
            if (sortBy === 'sid') return (a.sid || '').localeCompare(b.sid || '');
            if (sortBy === 'class') return (a.class || '').localeCompare(b.class || '');
        } catch(e) {}
        return 0;
    });

    tbody.innerHTML = list.length ? list.map(s => `
        <tr>
            <td>${s.sid || 'N/A'}</td>
            <td><a href="#" class="name-link" onclick="openStudentPayment('${s.id}')">${s.name || 'UNKNOWN'}</a></td>
            <td>${s.class || 'N/A'}</td>
            <td>${s.contact || 'N/A'}</td>
            <td class="flex-gap">
                <button class="btn btn-icon btn-secondary" onclick="editStudent('${s.id}')">✏️</button>
                <button class="btn btn-icon btn-secondary" style="color:var(--danger)" onclick="deleteStudent('${s.id}')">🗑️</button>
            </td>
        </tr>
    `).join('') : `<tr><td colspan="5" style="text-align:center">No students found.</td></tr>`;
}

window.openBlankPayment = () => {
    document.getElementById('form-payment').reset();
    const sumPage = document.getElementById('pay-student-summary');
    if (sumPage) sumPage.classList.add('hidden');
    showModal('mod-payment');
};

window.openStudentPayment = (id) => {
    const s = STATE.students.find(stud => stud.id === id);
    if (!s) return;

    const termFee = getTermFee(s.class);
    const arrears = parseFloat(s.prevArrears || 0);
    const totalExpected = termFee + arrears;

    let totalPaid = 0;
    STATE.payments.forEach(p => {
        if (p.studentName.toUpperCase() === s.name.toUpperCase() && p.studentClass.toUpperCase() === s.class.toUpperCase()) {
            totalPaid += parseFloat(p.amount || 0);
        }
    });

    const currentBalance = totalExpected - totalPaid;

    document.getElementById('pay-name-input').value = s.name;
    document.getElementById('pay-class-select').value = s.class;
    document.getElementById('pay-total').value = totalExpected;
    document.getElementById('pay-amount').value = Math.max(0, currentBalance);

    const sumPage = document.getElementById('pay-student-summary');
    if (sumPage) {
        sumPage.classList.remove('hidden');
        document.getElementById('pay-sum-paid').textContent = `${STATE.currency}${totalPaid.toLocaleString()}`;
        document.getElementById('pay-sum-bal').textContent = `${STATE.currency}${Math.max(0, currentBalance).toLocaleString()}`;
    }

    showModal('mod-payment');
};

window.viewStudentDetails = (id) => {
    const s = STATE.students.find(stud => stud.id === id);
    if (!s) return;

    document.getElementById('v-name').textContent = s.name;
    document.getElementById('v-sid').textContent = s.sid;
    document.getElementById('v-class').textContent = s.class;
    document.getElementById('v-contact').textContent = s.contact || 'N/A';
    document.getElementById('v-dob').textContent = s.dob || 'None Provided';
    document.getElementById('v-residence').textContent = s.residence || 'N/A';
    document.getElementById('v-medical').textContent = s.medical || 'None';

    // Financials
    const termFees = getTermFee(s.class);
    document.getElementById('v-fees').textContent = `${STATE.currency}${termFees.toLocaleString()}`;
    document.getElementById('v-arrears').textContent = `${STATE.currency}${(s.prevArrears || 0).toLocaleString()}`;

    const editBtn = document.getElementById('v-edit-btn');
    editBtn.onclick = () => {
        hideModal('mod-student-view');
        editStudent(id);
    };

    showModal('mod-student-view');
};

window.manageDuplicates = () => {
    const nameMap = {};
    STATE.students.forEach(s => {
        const name = s.name.toUpperCase().trim();
        if (!nameMap[name]) nameMap[name] = [];
        nameMap[name].push(s);
    });

    const duplicates = Object.keys(nameMap).filter(name => nameMap[name].length > 1);

    if (duplicates.length === 0) {
        alert("Success! No duplicate student names were found in your records.");
        return;
    }

    let resolvedCount = 0;
    duplicates.forEach(name => {
        const set = nameMap[name];
        const msg = `DUPLICATE DETECTED: "${name}"\n` +
            `Found ${set.length} students with this name across different classes.\n` +
            `Would you like to keep the first entry and move the others to the Recycle Bin?`;

        if (confirm(msg)) {
            for (let i = 1; i < set.length; i++) {
                const target = set[i];
                STATE.deleted.push({ ...target, deletedAt: new Date().toISOString() });
                STATE.students = STATE.students.filter(s => s.id !== target.id);
                resolvedCount++;
            }
        }
    });

    if (resolvedCount > 0) {
        localStorage.setItem('erp_students', JSON.stringify(STATE.students));
        localStorage.setItem('erp_deleted', JSON.stringify(STATE.deleted));
        renderStudents();
        updateStats();
        alert(`Cleanup Complete: ${resolvedCount} duplicate(s) moved to the Recycle Bin.`);
    }
};

window.viewTodayPayments = () => {
    const today = new Date().toLocaleDateString();
    document.getElementById('global-search').value = today;

    // Switch to payments view
    const link = document.querySelector('.nav-link[data-target="payments"]');
    if (link) {
        link.click();
    } else {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById('view-payments').classList.remove('hidden');
        renderPayments();
    }
};


document.getElementById('form-student').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('stud-id').value;
    const name = document.getElementById('stud-name').value;
    const sid = document.getElementById('stud-sid').value;
    const className = document.getElementById('stud-class').value;
    const contact = document.getElementById('stud-contact').value;
    const dob = document.getElementById('stud-dob').value;
    const residence = document.getElementById('stud-residence').value;
    const medical = document.getElementById('stud-medical').value;
    const prevArrears = parseFloat(document.getElementById('stud-prev-arrears').value) || 0;
    const gender = document.getElementById('stud-gender').value;

    const studentData = {
        name,
        sid,
        class: className,
        gender,
        contact,
        dob,
        residence,
        medical,
        prevArrears
    };

    if (id) {
        // Edit
        const idx = STATE.students.findIndex(s => s.id === id);
        STATE.students[idx] = { ...STATE.students[idx], ...studentData };
    } else {
        // Add
        const newStudent = {
            id: Date.now().toString(),
            ...studentData
        };
        STATE.students.push(newStudent);
    }

    localStorage.setItem('erp_students', JSON.stringify(STATE.students));
    hideModal('mod-student');
    e.target.reset();
    renderStudents();
    updateStats();
});

window.editStudent = (id) => {
    const s = STATE.students.find(stud => stud.id === id);
    if (!s) return;

    document.getElementById('stud-id').value = s.id || '';
    document.getElementById('stud-name').value = s.name || '';
    document.getElementById('stud-sid').value = s.sid || '';
    document.getElementById('stud-class').value = s.class || '';
    document.getElementById('stud-contact').value = s.contact || '';
    document.getElementById('stud-dob').value = s.dob || '';
    document.getElementById('stud-residence').value = s.residence || '';
    document.getElementById('stud-medical').value = s.medical || '';
    document.getElementById('stud-prev-arrears').value = s.prevArrears || 0;
    document.getElementById('stud-gender').value = s.gender || '';

    showModal('mod-student');
};

window.deleteStudent = (id) => {
    if (!confirm("Are you sure you want to move this student to the Recycle Bin?")) return;

    const student = STATE.students.find(s => s.id === id);
    if (student) {
        STATE.deleted.push({ ...student, deletedAt: new Date().toISOString() });
        STATE.students = STATE.students.filter(s => s.id !== id);

        localStorage.setItem('erp_students', JSON.stringify(STATE.students));
        localStorage.setItem('erp_deleted', JSON.stringify(STATE.deleted));

        renderStudents();
        updateStats();
    }
};

function renderTrash() {
    const tbody = document.getElementById('trash-table-body');
    const category = document.getElementById('trash-category')?.value || 'STUDENT';
    if (!tbody) return;

    const query = document.getElementById('global-search').value.toLowerCase();

    // Filter by type
    let list = STATE.deleted.filter(item => {
        if (category === 'STUDENT') return !item.type || item.type === 'STUDENT';
        if (category === 'PAYMENT') return item.type === 'PAYMENT';
        return false;
    });

    if (query) {
        list = list.filter(item => {
            const searchStr = (item.name || item.studentName || '').toLowerCase();
            return searchStr.includes(query);
        });
    }

    const headerRow = document.querySelector('#view-trash thead tr');
    if (category === 'STUDENT') {
        if (headerRow) headerRow.innerHTML = '<th>ID</th><th>Name</th><th>Last Class</th><th>Deleted Date</th><th>Actions</th>';
        tbody.innerHTML = list.length ? list.map(s => `
            <tr>
                <td>${s.sid || 'N/A'}</td>
                <td>${s.name}</td>
                <td>${s.class}</td>
                <td>${new Date(s.deletedAt).toLocaleDateString()}</td>
                <td class="flex-gap">
                    <button class="btn btn-secondary btn-sm" onclick="restoreRecord('${s.id}', 'STUDENT')">🔄 Restore</button>
                    <button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="permDelete('${s.id}')">🗑️</button>
                </td>
            </tr>
        `).join('') : '<tr><td colspan="5" style="text-align:center">No deleted students found.</td></tr>';
    } else if (category === 'PAYMENT') {
        if (headerRow) headerRow.innerHTML = '<th>Receipt</th><th>Student</th><th>Amount</th><th>Deleted Date</th><th>Actions</th>';
        tbody.innerHTML = list.length ? list.map(p => `
            <tr>
                <td>#REC${p.id}</td>
                <td>${p.studentName}</td>
                <td>${STATE.currency}${p.amount}</td>
                <td>${new Date(p.deletedAt).toLocaleDateString()}</td>
                <td class="flex-gap">
                    <button class="btn btn-secondary btn-sm" onclick="restoreRecord('${p.id}', 'PAYMENT')">🔄 Restore</button>
                    <button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="permDelete('${p.id}')">🗑️</button>
                </td>
            </tr>
        `).join('') : '<tr><td colspan="5" style="text-align:center">No deleted payments found.</td></tr>';
    } else {
        if (headerRow) headerRow.innerHTML = '<th>Student</th><th>Class</th><th>Term</th><th>Deleted Date</th><th>Actions</th>';
        tbody.innerHTML = list.length ? list.map(r => `
            <tr>
                <td>${r.studentName}</td>
                <td>${r.studentClass}</td>
                <td>Term ${r.term}</td>
                <td>${new Date(r.deletedAt).toLocaleDateString()}</td>
                <td class="flex-gap">
                    <button class="btn btn-secondary btn-sm" onclick="restoreRecord('${r.id}', 'REPORT')">🔄 Restore</button>
                    <button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="permDelete('${r.id}')">🗑️</button>
                </td>
            </tr>
        `).join('') : '<tr><td colspan="5" style="text-align:center">No deleted reports found.</td></tr>';
    }
}

window.restoreRecord = (id, type) => {
    const item = STATE.deleted.find(i => i.id == id);
    if (!item) return;

    if (type === 'STUDENT') {
        const { deletedAt, type: _, ...student } = item;
        STATE.students.push(student);
        localStorage.setItem('erp_students', JSON.stringify(STATE.students));
    } else if (type === 'PAYMENT') {
        const { deletedAt, type: _, ...payment } = item;
        STATE.payments.push(payment);
        localStorage.setItem('erp_payments', JSON.stringify(STATE.payments));
    } else {
        const { deletedAt, type: _, ...report } = item;
        STATE.reports.push(report);
        localStorage.setItem('erp_reports', JSON.stringify(STATE.reports));
    }

    STATE.deleted = STATE.deleted.filter(i => i.id != id);
    localStorage.setItem('erp_deleted', JSON.stringify(STATE.deleted));

    renderTrash();
    renderStudents();
    renderPayments();
    updateStats();
    alert(`${type} restored successfully!`);
};

window.permDelete = (id) => {
    if (!confirm("Are you sure? This is permanent!")) return;
    STATE.deleted = STATE.deleted.filter(i => i.id != id);
    localStorage.setItem('erp_deleted', JSON.stringify(STATE.deleted));
    renderTrash();
    updateStats();
};

window.restoreAllStudents = () => {
    const category = document.getElementById('trash-category')?.value || 'STUDENT';
    const toRestore = STATE.deleted.filter(item => {
        if (category === 'STUDENT') return !item.type || item.type === 'STUDENT';
        return item.type === category;
    });

    if (toRestore.length === 0) return;
    if (!confirm(`Restore all ${toRestore.length} items in this category?`)) return;

    toRestore.forEach(item => {
        const { deletedAt, type, ...rest } = item;
        if (category === 'STUDENT') STATE.students.push(rest);
        else if (category === 'PAYMENT') STATE.payments.push(rest);
        else STATE.reports.push(rest);
    });

    STATE.deleted = STATE.deleted.filter(item => {
        if (category === 'STUDENT') return item.type && item.type !== 'STUDENT';
        return item.type !== category;
    });

    localStorage.setItem('erp_students', JSON.stringify(STATE.students));
    localStorage.setItem('erp_payments', JSON.stringify(STATE.payments));
    localStorage.setItem('erp_reports', JSON.stringify(STATE.reports));
    localStorage.setItem('erp_deleted', JSON.stringify(STATE.deleted));

    renderTrash();
    renderStudents();
    renderPayments();
    if (typeof renderReports === 'function') renderReports();
    updateStats();
};

window.emptyTrash = () => {
    const category = document.getElementById('trash-category')?.value || 'STUDENT';
    if (!confirm(`Permanently empty all deleted ${category} records? This cannot be undone!`)) return;

    STATE.deleted = STATE.deleted.filter(item => {
        if (category === 'STUDENT') return item.type && item.type !== 'STUDENT';
        return item.type !== category;
    });

    localStorage.setItem('erp_deleted', JSON.stringify(STATE.deleted));
    renderTrash();
    updateStats();
};

// --- PAYMENTS ---
function renderPayments() {
    const tbody = document.getElementById('payments-table-body');
    const sumContainer = document.getElementById('payment-summary');
    const filter = document.getElementById('view-payment-filter').value;
    const sortBy = document.getElementById('sort-payments').value;
    const query = (document.getElementById('global-search').value || '').toLowerCase();
    if (!tbody) return;

    let list = Array.isArray(STATE.payments) ? [...STATE.payments] : [];
    
    if (filter) {
        list = list.filter(p => p && p.studentClass === filter);
    }
    if (query) {
        list = list.filter(p =>
            p && (
                (p.studentName || '').toLowerCase().includes(query) ||
                (p.studentClass || '').toLowerCase().includes(query) ||
                (p.date || '').includes(query)
            )
        );
    }

    // Populate Summary
    if (sumContainer) {
        const totalPaid = list.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const totalBal = list.reduce((sum, p) => sum + (parseFloat(p.balance) || 0), 0);
        sumContainer.innerHTML = `
            <div class="class-pill" style="padding: 8px 15px; background: var(--glass-bg); border: 1px solid var(--success); border-radius: 12px; display:flex; flex-direction:column; align-items:center;">
                <span style="font-size: 1.1rem; font-weight: 800; color: var(--success);">${STATE.currency}${totalPaid.toLocaleString()}</span>
                <small style="font-size: 0.65rem; opacity: 0.7; font-weight: 600;">TOTAL PAID (VIEW)</small>
            </div>
            <div class="class-pill" style="padding: 8px 15px; background: var(--glass-bg); border: 1px solid var(--danger); border-radius: 12px; display:flex; flex-direction:column; align-items:center;">
                <span style="font-size: 1.1rem; font-weight: 800; color: var(--danger);">${STATE.currency}${totalBal.toLocaleString()}</span>
                <small style="font-size: 0.65rem; opacity: 0.7; font-weight: 600;">REMAINING BALANCE (VIEW)</small>
            </div>
            <div class="class-pill" style="padding: 8px 15px; background: var(--glass-bg); border: 1px solid var(--accent); border-radius: 12px; display:flex; flex-direction:column; align-items:center;">
                <span style="font-size: 1.1rem; font-weight: 800; color: var(--accent);">${list.length}</span>
                <small style="font-size: 0.65rem; opacity: 0.7; font-weight: 600;">PAYMENTS COUNT</small>
            </div>
        `;
    }

    // Sort
    list.sort((a, b) => {
        try {
            if (sortBy === 'date') return new Date(b.date) - new Date(a.date);
            if (sortBy === 'amount') return (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0);
            if (sortBy === 'balance') return (parseFloat(b.balance) || 0) - (parseFloat(a.balance) || 0);
            if (sortBy === 'name') return (a.studentName || '').localeCompare(b.studentName || '');
        } catch(e) {}
        return (b.id || 0) - (a.id || 0);
    });

    tbody.innerHTML = list.length ? list.map(p => `
        <tr>
            <td>#REC${p.id || 'N/A'}</td>
            <td>${p.studentName || 'UNKNOWN'}</td>
            <td>${p.studentClass || 'N/A'}</td>
            <td style="color:var(--success); font-weight:700;">${STATE.currency}${(parseFloat(p.amount) || 0).toLocaleString()}</td>
            <td style="color:var(--danger); font-weight:700;">${STATE.currency}${(parseFloat(p.balance) || 0).toLocaleString()}</td>
            <td>${p.date || 'N/A'}</td>
            <td class="flex-gap">
                <button class="btn btn-secondary btn-sm" onclick="generatePaymentReceiptPDF('${p.id}')">📄 Receipt</button>
                <button class="btn btn-outline btn-sm" style="color:var(--danger); border-color:var(--danger)" onclick="deletePayment('${p.id}')">🗑️ Delete</button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="7" style="text-align:center">No payments found.</td></tr>';
}

window.deletePayment = (id) => {
    if (!confirm("Are you sure you want to delete this payment record? It will be moved to the Recycle Bin?")) return;

    const payment = STATE.payments.find(p => p.id == id);
    if (payment) {
        STATE.deleted.push({
            ...payment,
            type: 'PAYMENT',
            deletedAt: new Date().toISOString()
        });

        STATE.payments = STATE.payments.filter(p => p.id != id);
        localStorage.setItem('erp_payments', JSON.stringify(STATE.payments));
        localStorage.setItem('erp_deleted', JSON.stringify(STATE.deleted));

        renderPayments();
        updateStats();
    }
};
window.generatePaymentReceiptPDF = (id) => {
    const p = STATE.payments.find(pay => pay.id == id);
    if (!p) return;

    const paperSize = document.getElementById('receipt-paper-size') ? document.getElementById('receipt-paper-size').value : 'A5';
    const isDouble = paperSize === 'A4-DOUBLE';
    const isQuad = paperSize === 'A4-QUAD';

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: (isDouble || isQuad) ? 'a4' : [148, 210]
    });

    if (!isDouble && !isQuad) {
        doc.deletePage(1);
        doc.addPage([148, 210], 'landscape');
    }

    const drawReceipt = (x, y, w, h) => {
        const centerX = x + (w / 2);
        
        doc.setFontSize(14);
        doc.setTextColor(99, 102, 241);
        doc.text("TRUE STAR - PAYMENT RECEIPT", centerX, y + 20, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Receipt ID: #REC${p.id}`, x + 15, y + 35);
        doc.text(`Date: ${p.date}`, x + w - 15, y + 35, { align: 'right' });

        doc.autoTable({
            startY: y + 45,
            margin: { left: x + 15, right: (isQuad || isDouble) ? (210 - (x + w) + 15) : 15 },
            tableWidth: w - 30,
            head: [['Description', 'Amount']],
            body: [
                [`Fees for ${p.studentName}`, `${STATE.currency}${p.amount}`],
                ['TOTAL PAID', `${STATE.currency}${p.amount}`],
                ['OUTSTANDING BALANCE', `${STATE.currency}${p.balance}`]
            ],
            theme: 'grid',
            headStyles: { fillColor: [99, 102, 241] }
        });

        const finalY = doc.lastAutoTable.finalY;
        doc.setFontSize(9);
        doc.text("Thank you for your payment!", centerX, finalY + 15, { align: 'center' });
        
        if (isQuad || isDouble) {
            doc.setDrawColor(200);
            doc.rect(x, y, w, h);
        }
    };

    if (isQuad) {
        drawReceipt(0, 0, 105, 148.5);
        drawReceipt(105, 0, 105, 148.5);
        drawReceipt(0, 148.5, 105, 148.5);
        drawReceipt(105, 148.5, 105, 148.5);
    } else if (isDouble) {
        drawReceipt(0, 0, 210, 148.5);
        drawReceipt(0, 148.5, 210, 148.5);
    } else {
        drawReceipt(0, 0, 210, 148);
    }

    doc.save(`Receipt_${p.id}.pdf`);
};

// --- CLASS RECORDS ---
window.generateClassRecordPDF = () => {
    const selectedClass = document.getElementById('import-class-select').value;
    if (!selectedClass) {
        alert("Please select a class from the dropdown first to generate its record.");
        return;
    }

    const classStudents = STATE.students.filter(s => s.class === selectedClass);
    if (classStudents.length === 0) {
        alert(`No students found in ${selectedClass}`);
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(22);
    doc.setTextColor(99, 102, 241);
    doc.text(`CLASS RECORD: ${selectedClass.toUpperCase()}`, 105, 20, { align: 'center' });

    doc.autoTable({
        startY: 35,
        head: [['Student ID', 'Full Name', 'Parent Contact']],
        body: classStudents.map(s => [s.sid, s.name, s.contact]),
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241] }
    });

    doc.save(`Class_Record_${selectedClass}.pdf`);
};

document.getElementById('form-payment').addEventListener('submit', (e) => {
    e.preventDefault();
    const typedName = document.getElementById('pay-name-input').value.trim();
    const selectedClass = document.getElementById('pay-class-select').value;
    const total = parseFloat(document.getElementById('pay-total').value);
    const amount = parseFloat(document.getElementById('pay-amount').value);

    const student = STATE.students.find(s =>
        s.name.toLowerCase() === typedName.toLowerCase() &&
        s.class === selectedClass
    );

    if (!student) {
        alert("Student matching that Name and Class not found! Please check spelling.");
        return;
    }

    const newPayment = {
        id: Date.now(),
        studentName: student.name,
        studentClass: student.class, // Linking class to payment
        amount: amount,
        balance: total - amount,
        date: new Date().toLocaleDateString()
    };

    STATE.payments.push(newPayment);
    localStorage.setItem('erp_payments', JSON.stringify(STATE.payments));
    hideModal('mod-payment');
    e.target.reset();
    renderPayments();
    updateStats();
});

window.sendArrearsReminder = () => {
    const note = document.getElementById('arrears-note').value.trim();
    if (!note) {
        alert("Please enter a note/reminder text first.");
        return;
    }

    const studentsWithArrears = STATE.students.map(s => {
        const totalPaid = STATE.payments
            .filter(p => p.studentName === s.name)
            .reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const totalExpected = getTermFee(s.class) + (parseFloat(s.prevArrears) || 0);
        const balance = totalExpected - totalPaid;
        return { ...s, balance };
    }).filter(s => s.balance > 0);

    if (studentsWithArrears.length === 0) {
        alert("No students found with outstanding balances.");
        return;
    }

    const recipientDiv = document.getElementById('reminder-recipients');
    const countP = document.getElementById('reminder-count');

    if (countP) countP.textContent = `Alerts prepared for ${studentsWithArrears.length} students.`;
    if (recipientDiv) {
        recipientDiv.innerHTML = studentsWithArrears.map(s => `
            <div style="padding: 8px 0; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between;">
                <span><strong>${s.name}</strong> (${s.class})</span>
                <span style="color: var(--danger); font-weight: 700;">Arrears: ${STATE.currency}${s.balance}</span>
            </div>
        `).join('');
    }

    showModal('mod-reminder-status');
    document.getElementById('arrears-note').value = '';
};

// --- REPORTS ---
function renderReports() {
    const tbody = document.getElementById('reports-table-body');
    const sortBy = document.getElementById('sort-reports').value;
    const filter = document.getElementById('view-report-filter').value;
    const query = (document.getElementById('global-search').value || '').toLowerCase();
    if (!tbody) return;

    let list = Array.isArray(STATE.reports) ? [...STATE.reports] : [];
    if (filter) {
        list = list.filter(r => r && r.studentClass === filter);
    }
    if (query) {
        list = list.filter(r =>
            r && (
                (r.studentName || '').toLowerCase().includes(query) ||
                (r.studentClass || '').toLowerCase().includes(query) ||
                (r.grade || '').toLowerCase().includes(query)
            )
        );
    }

    // Sort
    list.sort((a, b) => {
        try {
            if (sortBy === 'name') return (a.studentName || '').localeCompare(b.studentName || '');
            if (sortBy === 'total') return (parseFloat(b.total) || 0) - (parseFloat(a.total) || 0); // Highest first
            if (sortBy === 'grade') return (a.grade || '').localeCompare(b.grade || '');
        } catch(e) {}
        return 0;
    });

    tbody.innerHTML = list.length ? list.map(r => `
        <tr>
            <td>${r.studentName || 'UNKNOWN'}</td>
            <td>${r.studentClass || 'N/A'}</td>
            <td>Term ${r.term || '1'}</td>
            <td>${r.total || 0}/100</td>
            <td><strong>${r.grade || 'N/A'}</strong></td>
            <td class="flex-gap">
                <button class="btn btn-secondary btn-sm" onclick="generateReportPDF('${r.id}')">Export PDF</button>
                <button class="btn btn-icon btn-secondary" style="color:var(--danger)" onclick="deleteReport('${r.id}')">🗑️</button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center">No reports generated yet.</td></tr>';
}

window.deleteReport = (id) => {
    if (!confirm("Move this academic report to the Recycle Bin?")) return;
    const report = STATE.reports.find(r => r.id === id);
    if (report) {
        STATE.deleted.push({ ...report, type: 'REPORT', deletedAt: new Date().toISOString() });
        STATE.reports = STATE.reports.filter(r => r.id !== id);
        localStorage.setItem('erp_reports', JSON.stringify(STATE.reports));
        localStorage.setItem('erp_deleted', JSON.stringify(STATE.deleted));
        renderReports();
        updateStats();
    }
};

document.getElementById('form-report').addEventListener('submit', (e) => {
    e.preventDefault();
    const sid = document.getElementById('rep-stud').value;
    const term = document.getElementById('rep-term').value;
    const assign = parseFloat(document.getElementById('rep-assign').value);
    const exam = parseFloat(document.getElementById('rep-exam').value);

    const student = STATE.students.find(s => s.sid === sid);
    if (!student) {
        alert("Student ID not found!");
        return;
    }

    const total = assign + exam;
    let grade = 'F';
    if (total >= 90) grade = 'A+';
    else if (total >= 80) grade = 'A';
    else if (total >= 70) grade = 'B';
    else if (total >= 60) grade = 'C';
    else if (total >= 50) grade = 'D';

    const newReport = {
        id: Date.now().toString(),
        studentName: student.name,
        studentClass: student.class,
        sid: student.sid,
        term,
        score: { assign, exam },
        total,
        grade,
        attendance: document.getElementById('rep-att').value,
        participation: document.getElementById('rep-part').value,
        conduct: document.getElementById('rep-conduct').value,
        interests: document.getElementById('rep-interests').value,
        remarks: document.getElementById('rep-remarks').value
    };

    STATE.reports.push(newReport);
    localStorage.setItem('erp_reports', JSON.stringify(STATE.reports));
    hideModal('mod-report');
    renderReports();
});

// ── Image Helpers ──────────────────────────────────────────────────────────
async function loadImgBase64(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            resolve(c.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Image load failed: ' + url));
        img.src = url + '?v=' + Date.now(); // cache-bust
    });
}

async function buildKidsWithLogoBase64() {
    const [kidsB64, logoB64] = await Promise.all([
        loadImgBase64('./school-kids.png'),
        loadImgBase64('./logo.png')
    ]);

    // Draw kids-circle, then overlay logo in centre
    const kidsImg = new Image(); kidsImg.src = kidsB64;
    await new Promise(res => { kidsImg.onload = res; });
    const logoImg = new Image(); logoImg.src = logoB64;
    await new Promise(res => { logoImg.onload = res; });

    const c = document.createElement('canvas');
    c.width = kidsImg.width; c.height = kidsImg.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(kidsImg, 0, 0);
    const ls = Math.floor(c.width * 0.32);
    const lx = (c.width - ls) / 2;
    const ly = (c.height - ls) / 2;
    ctx.drawImage(logoImg, lx, ly, ls, ls);
    return c.toDataURL('image/png');
}

// ── Programmatic purple-circles footer ─────────────────────────────────────
function drawPurpleCirclesFooter(doc, pageW, pageH) {
    const circles = 5;
    const r = 11;
    const overlap = r * 1.55;
    const totalW = overlap * (circles - 1) + r * 2;
    const startX = (pageW - totalW) / 2 + r;
    const cy = pageH - 18;

    for (let i = 0; i < circles; i++) {
        const cx = startX + i * overlap;
        // Alternate slight shade for depth
        if (i % 2 === 1) {
            doc.setFillColor(150, 50, 220);
            doc.circle(cx, cy, r, 'F');
            doc.setDrawColor(255, 255, 255);
            doc.setLineWidth(0.9);
            doc.circle(cx, cy, r, 'S');
        } else {
            doc.setFillColor(126, 34, 206);
            doc.circle(cx, cy, r, 'F');
        }
    }

    // Footer label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(126, 34, 206);
    doc.text(
        'TRUE STAR MONTESSORI SCHOOL  ·  ACADEMIC EXCELLENCE, OUR ULTIMATE GOAL',
        pageW / 2, pageH - 4, { align: 'center' }
    );
}

// ── Main Report Card Generator ──────────────────────────────────────────────
window.generateReportPDF = async (id) => {
    const r = STATE.reports.find(rep => rep.id === id);
    if (!r) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297, cx = pageW / 2;
    const purple = [126, 34, 206];
    const darkPurple = [88, 28, 135];

    // ── HEADER BAND ────────────────────────────────────────────────────────
    doc.setFillColor(...purple);
    doc.rect(0, 0, pageW, 48, 'F');

    // School Logo (picture 1)
    try {
        const logoB64 = await loadImgBase64('./logo.png');
        doc.addImage(logoB64, 'PNG', cx - 15, 3, 30, 30);
    } catch (e) {
        doc.setFontSize(18); doc.setTextColor(255,255,255);
        doc.text('★', cx, 20, { align: 'center' });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('TRUE STAR MONTESSORI SCHOOL', cx, 38, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.text('ACADEMIC EXCELLENCE, OUR ULTIMATE GOAL', cx, 44, { align: 'center' });

    // ── TITLE STRIP ────────────────────────────────────────────────────────
    doc.setFillColor(245, 240, 255);
    doc.rect(0, 48, pageW, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...darkPurple);
    doc.text('STUDENT ACADEMIC REPORT CARD', cx, 56, { align: 'center' });

    // ── KIDS-CIRCLE IMAGE with logo in centre (picture 3) ─────────────────
    try {
        const kidsLogoB64 = await buildKidsWithLogoBase64();
        doc.addImage(kidsLogoB64, 'PNG', 143, 63, 58, 58);
    } catch (e) { /* skip image if unavailable */ }

    // ── STUDENT INFO BOX ───────────────────────────────────────────────────
    doc.setFillColor(249, 246, 255);
    doc.roundedRect(10, 63, 128, 55, 3, 3, 'F');
    doc.setDrawColor(196, 167, 231);
    doc.setLineWidth(0.4);
    doc.roundedRect(10, 63, 128, 55, 3, 3, 'S');

    const infoRows = [
        ['Student Name:', r.studentName || '—'],
        ['Student ID:',   r.sid        || '—'],
        ['Class:',        r.studentClass || '—'],
        ['Term:',         `Term ${r.term}`],
        ['Academic Year:', '2025 / 2026'],
    ];
    let iy = 72;
    infoRows.forEach(([label, val]) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.setTextColor(...darkPurple);
        doc.text(label, 15, iy);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        doc.text(String(val), 58, iy);
        iy += 7;
    });

    // ── SCORES TABLE ───────────────────────────────────────────────────────
    const assign = r.score?.assign ?? '--';
    const exam   = r.score?.exam   ?? '--';
    doc.autoTable({
        startY: 125,
        margin: { left: 10, right: 10 },
        head: [['Assessment / Subject', 'Score', 'Max', 'Remarks']],
        body: [
            ['Class Assignment',          assign, '40',   assign >= 35 ? 'Excellent' : assign >= 28 ? 'Very Good' : 'Good Effort'],
            ['End of Term Examination',   exam,   '60',   exam   >= 50 ? 'Excellent' : exam   >= 40 ? 'Very Good' : 'Good Effort'],
            ['TOTAL SCORE',               r.total ?? '--', '100', ''],
            ['FINAL GRADE',               r.grade ?? '--', '—',   ''],
            ['Attendance',                (r.attendance ?? '--') + '%', '100%', ''],
            ['Participation',             r.participation ?? '--', '—', ''],
            ['Conduct',                   r.conduct       ?? '--', '—', ''],
            ['Interests',                 r.interests     ?? '--', '—', ''],
        ],
        theme: 'striped',
        headStyles: { fillColor: purple, textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'center' } },
        didParseCell(data) {
            if (data.row.index === 2 && data.column.index === 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fontSize  = 12;
                data.cell.styles.textColor = purple;
            }
            if (data.row.index === 3 && data.column.index === 1) {
                const g = r.grade || '';
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fontSize  = 14;
                data.cell.styles.textColor =
                    g === 'A+' || g === 'A' ? [22, 163, 74] :
                    g === 'F'               ? [239, 68, 68] : purple;
            }
        }
    });

    const tEnd = doc.lastAutoTable.finalY;

    // ── REMARKS BOX ────────────────────────────────────────────────────────
    doc.setFillColor(249, 246, 255);
    doc.roundedRect(10, tEnd + 5, pageW - 20, 22, 3, 3, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setTextColor(...darkPurple);
    doc.text("Class Teacher's Remarks:", 15, tEnd + 13);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text(r.remarks || 'Keep up the good work!', 15, tEnd + 20, { maxWidth: pageW - 30 });

    // ── SIGNATURE LINES ────────────────────────────────────────────────────
    const sigY = tEnd + 38;
    doc.setDrawColor(...purple);
    doc.setLineWidth(0.5);
    doc.line(15, sigY, 80, sigY);
    doc.line(pageW - 80, sigY, pageW - 15, sigY);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("Class Teacher's Signature", 15, sigY + 5);
    doc.text("Head Teacher's Signature", pageW - 80, sigY + 5);

    // ── BOTTOM PURPLE CIRCLES (picture 2) ──────────────────────────────────
    drawPurpleCirclesFooter(doc, pageW, pageH);

    doc.save(`Report_Card_${r.studentName}_Term${r.term}.pdf`);
};

// --- CHART ---
function initChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    // Last 14 days daily trend
    const labels = [];
    const dailyData = [];
    const now = new Date();

    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dayStr = d.toLocaleDateString();
        labels.push(d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));

        const dayTotal = STATE.payments
            .filter(p => p.date === dayStr)
            .reduce((sum, p) => sum + parseFloat(p.amount), 0);
        dailyData.push(dayTotal);
    }

    if (window.myChart) window.myChart.destroy();

    window.myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `Daily Revenue (${STATE.currency})`,
                data: dailyData,
                borderColor: '#6366f1',
                borderWidth: 4,
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                pointBackgroundColor: '#6366f1',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { callback: value => STATE.currency + value.toLocaleString() }
                },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { display: true, position: 'top', labels: { font: { weight: 'bold' } } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` Revenue: ${STATE.currency}${ctx.raw.toLocaleString()}`
                    }
                }
            }
        }
    });
}


// --- MODALS ---
window.showModal = (id) => document.getElementById(id).classList.remove('hidden');
window.hideModal = (id) => document.getElementById(id).classList.add('hidden');

// --- DROPDOWNS ---
window.toggleDropdown = (id) => {
    const el = document.getElementById(id);
    const isHidden = el.classList.contains('hidden');
    // Close all other dropdowns
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
    if (isHidden) el.classList.remove('hidden');
};

// Close dropdowns on outside click
window.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
    }
});
