// 1. КОНФІГУРАЦІЯ FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDZWcQ7INpnZj1Hbf0fICcsPs2Wndus8AM",
  authDomain: "liceum-eit-manager.firebaseapp.com",
  databaseURL: "https://liceum-eit-manager-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "liceum-eit-manager",
  storageBucket: "liceum-eit-manager.firebasestorage.app",
  messagingSenderId: "854455059262",
  appId: "1:854455059262:web:e6282bed63182559c5a26f"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let USERS = {}; // Буде завантажено з бази
let currentUser = null;
let calendar = null;
let selectedSlot = null;
let currentTeachersList = [];
let activeFilter = null;

// ==========================================
// 2. БЕЗПЕКА ТА ВХІД
// ==========================================
function loadSettings() {
    db.ref('settings').on('value', snap => {
        const data = snap.val() || {};
        USERS = data.accessCodes || {
            "777": { role: "Технік", level: "tech", color: "#6B7280" },
            "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
            "999": { role: "Викладач", level: "teacher", color: "#10B981" }
        };
        document.getElementById('tgToken').value = data.tgToken || "";
        document.getElementById('tgChatId').value = data.tgChatId || "";
        
        // Перевірка сесії після оновлення кодів
        const saved = sessionStorage.getItem('st_token');
        if (saved && USERS[saved]) {
            currentUser = USERS[saved];
            if (!calendar) startApp();
        }
    });
}
loadSettings();

window.tryLogin = () => {
    const pass = document.getElementById('passInput').value;
    if (USERS[pass]) {
        currentUser = USERS[pass];
        sessionStorage.setItem('st_token', pass);
        startApp();
    } else alert("Невірний код");
};

function logout() { sessionStorage.clear(); location.reload(); }

function startApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('statusBar').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'grid';
    document.getElementById('roleBadge').textContent = currentUser.role;
    document.getElementById('roleBadge').style.background = currentUser.color;

    if (currentUser.level === 'admin' || currentUser.level === 'tech') {
        document.getElementById('adminPanel').style.display = 'block';
    }
    initCalendar();
    loadData();
    setInterval(updateStatusBar, 60000);
}

// ==========================================
// 3. ТЕЛЕГРАМ ТА НАЛАШТУВАННЯ
// ==========================================
async function sendTelegram(msg) {
    const token = document.getElementById('tgToken').value;
    const chat = document.getElementById('tgChatId').value;
    if (token && chat) {
        fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}`);
    }
}

window.saveSettings = () => {
    db.ref('settings/tgToken').set(document.getElementById('tgToken').value);
    db.ref('settings/tgChatId').set(document.getElementById('tgChatId').value);
    alert("Налаштування збережено");
    document.getElementById('settingsModal').style.display = 'none';
};

window.updatePassInDB = () => {
    const role = document.getElementById('passRoleSelector').value;
    const newCode = document.getElementById('newPassCode').value.trim();
    if (newCode.length < 3) return alert("Код занадто короткий");

    // Видаляємо старий код цього рівня і ставимо новий
    const updatedUsers = { ...USERS };
    for (let k in updatedUsers) {
        if (updatedUsers[k].level === role) delete updatedUsers[k];
    }
    const meta = {
        teacher: { role: "Викладач", level: "teacher", color: "#10B981" },
        admin: { role: "Адмін", level: "admin", color: "#4F46E5" },
        tech: { role: "Технік", level: "tech", color: "#6B7280" }
    };
    updatedUsers[newCode] = meta[role];
    db.ref('settings/accessCodes').set(updatedUsers);
    alert("Код доступу оновлено!");
};

// ==========================================
// 4. КАЛЕНДАР ТА УРОКИ
// ==========================================
function initCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk', slotMinTime: '08:00:00', slotMaxTime: '21:00:00',
        selectable: true,
        select: (info) => {
            selectedSlot = info;
            document.getElementById('modalOverlay').style.display = 'flex';
        },
        eventClick: (info) => { /* Логіка видалення/статусу залишається ідентичною попередній */ }
    });
    calendar.render();
}

window.confirmBooking = () => {
    const subj = document.getElementById('eventSubject').value;
    const cls = document.getElementById('eventName').value;
    const teacher = document.getElementById('eventTeacher').value;
    const color = document.getElementById('eventColor').value;
    
    if (!subj || !cls) return alert("Заповніть поля!");

    const id = Date.now().toString();
    const eventData = {
        id, title: `${subj} (${cls})`, start: selectedSlot.startStr, end: selectedSlot.endStr, color,
        extendedProps: { subject: subj, className: cls, teacher, status: "", createdAt: Date.now() }
    };

    db.ref('events/' + id).set(eventData);
    sendTelegram(`🆕 Новий урок!\nПредмет: ${subj}\nКлас: ${cls}\nВикладач: ${teacher}\nЧас: ${new Date(selectedSlot.start).toLocaleString('uk-UA')}`);
    closeModal();
};

// ==========================================
// 5. ЗВІТНІСТЬ (ТАБЛИЦЯ)
// ==========================================
window.openReport = () => {
    const events = calendar.getEvents()
        .filter(e => e.extendedProps.subject) // тільки уроки
        .sort((a, b) => new Date(a.start) - new Date(b.start));

    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';

    events.forEach(e => {
        const row = document.createElement('tr');
        const dateStr = new Date(e.start).toLocaleDateString('uk-UA');
        row.innerHTML = `
            <td>${e.extendedProps.teacher}</td>
            <td>${dateStr}</td>
            <td>${e.extendedProps.subject}</td>
            <td>${e.extendedProps.className}</td>
            <td style="text-align:center">1</td>
            <td style="border-bottom: 1px solid #000; width: 100px;"></td>
        `;
        tbody.appendChild(row);
    });
    document.getElementById('reportOverlay').style.display = 'flex';
};

window.printReport = () => {
    const content = document.getElementById('reportPrintArea').innerHTML;
    const win = window.open('', '', 'height=700,width=900');
    win.document.write(`<html><head><title>Звіт</title><style>
        table { width: 100%; border-collapse: collapse; font-family: sans-serif; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background: #f2f2f2; }
    </style></head><body>`);
    win.document.write('<h2>Звіт по проведених уроках</h2>');
    win.document.write(content);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
};

// Додаткові UI функції (closeModal, selectColor і т.д. як раніше)
window.closeModal = () => document.getElementById('modalOverlay').style.display = 'none';
window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';
window.selectColor = (el, color) => {
    document.querySelectorAll('.color-picker').forEach(c => c.style.border='none');
    el.style.border = '2px solid #000';
    document.getElementById('eventColor').value = color;
};

function loadData() {
    db.ref('teachers').on('value', snap => {
        currentTeachersList = snap.val() || ["Шевченко"];
        const sel = document.getElementById('eventTeacher');
        sel.innerHTML = currentTeachersList.map(t => `<option value="${t}">${t}</option>`).join('');
        const fl = document.getElementById('filterList');
        fl.innerHTML = currentTeachersList.map(t => `<div class="filter-item" onclick="toggleFilter('${t}')">${t}</div>`).join('');
    });
    db.ref('events').on('value', snap => {
        calendar.removeAllEvents();
        const data = snap.val();
        if (data) Object.values(data).forEach(ev => calendar.addEvent(ev));
    });
}
function updateStatusBar() { /* ... код як у попередній версії ... */ }