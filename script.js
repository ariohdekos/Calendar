// 1. CONFIG
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

// Глобальні змінні
let USERS = {
    "777": { role: "Технік", level: "tech", color: "#6B7280" },
    "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
    "999": { role: "Викладач", level: "teacher", color: "#10B981" }
};

let currentUser = null;
let calendar = null;
let selectedSlot = null;
let clickedEvent = null;
let tgConfig = null; // Налаштування TG з бази

// ==========================================
// 2. АВТОРИЗАЦІЯ & АВТО-ВХІД
// ==========================================

// Слухаємо оновлення юзерів
db.ref('users').on('value', snap => {
    if (snap.val()) USERS = snap.val();
    checkAutoLogin(); // Перевіряємо вхід після завантаження бази
});

window.tryLogin = () => {
    const pass = document.getElementById('passInput').value.trim();
    if (USERS[pass]) {
        currentUser = USERS[pass];
        sessionStorage.setItem('st_token', pass);
        startApp();
    } else {
        alert("Невірний код!");
    }
};

function checkAutoLogin() {
    if (currentUser) return; // Вже ввійшли
    const token = sessionStorage.getItem('st_token');
    if (token && USERS[token]) {
        currentUser = USERS[token];
        startApp();
    }
}

window.logout = () => {
    sessionStorage.clear();
    location.reload();
};

function startApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'grid';
    
    document.getElementById('roleBadge').textContent = currentUser.role;
    document.getElementById('roleBadge').style.background = currentUser.color;

    // Права доступу
    if (currentUser.level === 'admin' || currentUser.level === 'tech') {
        document.getElementById('reportBtn').style.display = 'block';
    }
    if (currentUser.level === 'tech') {
        document.getElementById('settingsBtn').style.display = 'block';
        document.getElementById('techBlockOption').style.display = 'block';
    }

    if (!calendar) initCalendar();
    loadData();
}

// ==========================================
// 3. КАЛЕНДАР
// ==========================================
function initCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk', slotMinTime: '08:00:00', slotMaxTime: '21:00:00',
        selectable: true,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' },
        
        select: (info) => {
            selectedSlot = info;
            document.getElementById('startTime').value = info.startStr.split('T')[1].substring(0,5);
            document.getElementById('endTime').value = info.endStr.split('T')[1].substring(0,5);
            document.getElementById('modalOverlay').style.display = 'flex';
        },
        
        eventClick: (info) => {
            clickedEvent = info.event;
            const props = info.event.extendedProps;
            document.getElementById('statusModalOverlay').style.display = 'flex';
            document.getElementById('statusEventTitle').textContent = info.event.title;
            
            // Логіка видалення (15 хв)
            const isAuthor = props.creator === sessionStorage.getItem('st_token');
            const diffMin = (Date.now() - props.createdAt) / 60000;
            const canDelete = (currentUser.level === 'tech') || (isAuthor && diffMin < 15);
            document.getElementById('btnDeleteEvent').style.display = canDelete ? 'block' : 'none';
        }
    });
    calendar.render();
}

// ==========================================
// 4. ОПЕРАЦІЇ З ДАНИМИ
// ==========================================
window.confirmBooking = () => {
    const isBreak = document.getElementById('isTechBreak').checked;
    const id = Date.now().toString();
    const datePart = selectedSlot.startStr.split('T')[0];
    const start = datePart + 'T' + document.getElementById('startTime').value + ':00';
    const end = datePart + 'T' + document.getElementById('endTime').value + ':00';

    let data = {
        id, start, end,
        extendedProps: { createdAt: Date.now(), creator: sessionStorage.getItem('st_token') }
    };

    if (isBreak) {
        data.title = "⛔ ТЕХНІЧНА ПЕРЕРВА";
        data.backgroundColor = "#6B7280";
        data.extendedProps.type = "tech";
    } else {
        const subj = document.getElementById('eventSubject').value;
        const cls = document.getElementById('eventClass').value;
        if (!subj || !cls) return alert("Заповніть предмет та клас!");
        
        data.title = `${subj} (${cls})`;
        data.backgroundColor = document.getElementById('eventColor').value;
        data.extendedProps = {
            ...data.extendedProps,
            teacher: document.getElementById('eventTeacher').value,
            subject: subj, className: cls,
            count: document.getElementById('eventCount').value,
            type: "lesson"
        };
    }

    db.ref('events/' + id).set(data).then(() => {
        sendTG(`🆕 Запис: ${data.title}\n📅 ${start.replace('T',' ')}`);
        closeModal();
    });
};

window.applyStatus = () => {
    const s = document.getElementById('eventStatus').value;
    db.ref('events/' + clickedEvent.id + '/extendedProps/status').set(s);
    closeStatusModal();
};

window.handleDelete = () => {
    if (confirm("Видалити?")) {
        db.ref('events/' + clickedEvent.id).remove();
        closeStatusModal();
    }
};

// ==========================================
// 5. НАЛАШТУВАННЯ (Збереження в Хмару)
// ==========================================
window.openSettings = () => {
    if (tgConfig) {
        document.getElementById('tgToken').value = tgConfig.token || '';
        document.getElementById('tgChatId').value = tgConfig.chatId || '';
    }
    document.getElementById('settingsModal').style.display = 'flex';
};

window.closeSettings = () => document.getElementById('settingsModal').style.display = 'none';

window.saveSettings = () => {
    const token = document.getElementById('tgToken').value.trim();
    const chat = document.getElementById('tgChatId').value.trim();
    if(!token || !chat) return alert("Введіть токен і чат ID!");

    // Зберігаємо в загальну базу
    db.ref('settings_tg').set({ token, chatId }).then(() => {
        alert("✅ Налаштування TG збережено в хмару!");
    });
};

window.updatePassInDB = () => {
    const newCode = document.getElementById('newPassCode').value.trim();
    const roleKey = document.getElementById('passRoleSelector').value;
    if (newCode.length < 3) return alert("Мінімум 3 цифри!");

    let tempUsers = { ...USERS };
    for (let c in tempUsers) { if (tempUsers[c].level === roleKey) delete tempUsers[c]; }
    
    const roles = {
        "tech": { role: "Технік", level: "tech", color: "#6B7280" },
        "admin": { role: "Адмін", level: "admin", color: "#4F46E5" },
        "teacher": { role: "Викладач", level: "teacher", color: "#10B981" }
    };
    tempUsers[newCode] = roles[roleKey];
    db.ref('users').set(tempUsers).then(() => {
        alert("Пароль оновлено!");
        document.getElementById('newPassCode').value = '';
    });
};

// ==========================================
// 6. ЗВІТНІСТЬ (З ПІДРАХУНКОМ ПО МІСЯЦЯХ)
// ==========================================
window.openReport = () => {
    const events = calendar.getEvents()
        .filter(e => e.extendedProps.type === 'lesson')
        .sort((a, b) => a.start - b.start);

    // Підрахунок статистики
    const stats = {};
    const rows = events.map(e => {
        const count = parseInt(e.extendedProps.count) || 1;
        let mKey = e.start.toLocaleString('uk-UA', { month: 'long', year: 'numeric' });
        mKey = mKey.charAt(0).toUpperCase() + mKey.slice(1);
        
        if (!stats[mKey]) stats[mKey] = 0;
        stats[mKey] += count;

        return `<tr><td>${e.extendedProps.teacher}</td><td>${e.start.toLocaleDateString()}</td><td>${e.extendedProps.subject}</td><td>${e.extendedProps.className}</td><td>${count}</td><td style="border-bottom:1px solid #000;"></td></tr>`;
    }).join('');

    // HTML Підсумку
    let summaryHtml = '<h4 style="margin:0 0 10px 0;">📅 Підсумок:</h4><ul style="padding-left:20px; margin:0;">';
    for (const [m, val] of Object.entries(stats)) {
        summaryHtml += `<li style="margin-bottom:4px;"><b>${m}:</b> ${val} уроків</li>`;
    }
    summaryHtml += '</ul>';

    document.getElementById('reportSummary').innerHTML = summaryHtml;
    document.getElementById('reportTableBody').innerHTML = rows;
    document.getElementById('reportOverlay').style.display = 'flex';
};

window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';

// ==========================================
// 7. ДОПОМІЖНІ
// ==========================================
function loadData() {
    db.ref('settings_tg').on('value', snap => { tgConfig = snap.val(); });

    db.ref('teachers').on('value', snap => {
        const list = snap.val() || ["Вчитель 1"];
        document.getElementById('eventTeacher').innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
        document.getElementById('filterList').innerHTML = list.map(t => `<div class="filter-item" onclick="toggleFilter('${t}')">${t}</div>`).join('');
    });

    db.ref('events').on('value', snap => {
        calendar.removeAllEvents();
        const data = snap.val();
        if (data) Object.values(data).forEach(ev => {
            if(ev.extendedProps.status) ev.title = `${ev.extendedProps.status} | ${ev.title}`;
            calendar.addEvent(ev);
        });
    });
}

function sendTG(msg) {
    if (tgConfig && tgConfig.token && tgConfig.chatId) {
        fetch(`https://api.telegram.org/bot${tgConfig.token}/sendMessage?chat_id=${tgConfig.chatId}&text=${encodeURIComponent(msg)}`);
    }
}

window.toggleFilter = (t) => {
    calendar.getEvents().forEach(e => {
        if(e.extendedProps.type === 'tech') return;
        e.setProp('display', (e.extendedProps.teacher === t) ? 'auto' : 'none');
    });
};
window.resetFilters = () => calendar.getEvents().forEach(e => e.setProp('display', 'auto'));

window.closeModal = () => document.getElementById('modalOverlay').style.display = 'none';
window.closeStatusModal = () => document.getElementById('statusModalOverlay').style.display = 'none';
window.toggleTechBreak = (v) => document.getElementById('bookingFields').style.opacity = v ? '0.2' : '1';
window.toggleSidebar = () => {
    const s = document.querySelector('.sidebar');
    s.style.display = (getComputedStyle(s).display === 'none') ? 'block' : 'none';
};