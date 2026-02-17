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

// Ініціалізація
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

// ==========================================
// 2. АВТОРИЗАЦІЯ
// ==========================================

// Завантаження актуальних кодів доступу з бази
db.ref('users').on('value', snap => {
    if (snap.val()) USERS = snap.val();
});

window.tryLogin = () => {
    const pass = document.getElementById('passInput').value.trim();
    if (USERS[pass]) {
        currentUser = USERS[pass];
        sessionStorage.setItem('st_token', pass);
        startApp();
    } else {
        alert("Невірний код доступу!");
    }
};

window.logout = () => {
    sessionStorage.clear();
    location.reload();
};

function startApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'grid';
    
    const badge = document.getElementById('roleBadge');
    badge.textContent = currentUser.role;
    badge.style.background = currentUser.color;

    // Права доступу до кнопок
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
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk',
        firstDay: 1,
        slotMinTime: '08:00:00',
        slotMaxTime: '21:00:00',
        allDaySlot: false,
        height: 'auto',
        selectable: true,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridWeek,timeGridDay'
        },
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
            
            // Логіка видалення (15 хв для автора або безліміт для техніка)
            const isAuthor = props.creator === sessionStorage.getItem('st_token');
            const diffMin = (Date.now() - props.createdAt) / 60000;
            const canDelete = (currentUser.level === 'tech') || (isAuthor && diffMin < 15);
            
            document.getElementById('btnDeleteEvent').style.display = canDelete ? 'block' : 'none';
        }
    });
    calendar.render();
}

// ==========================================
// 4. ОПЕРАЦІЇ З УРОКАМИ
// ==========================================

window.confirmBooking = () => {
    const isBreak = document.getElementById('isTechBreak').checked;
    const id = Date.now().toString();
    const datePart = selectedSlot.startStr.split('T')[0];
    const start = datePart + 'T' + document.getElementById('startTime').value + ':00';
    const end = datePart + 'T' + document.getElementById('endTime').value + ':00';

    let eventData = {
        id: id,
        start: start,
        end: end,
        extendedProps: {
            createdAt: Date.now(),
            creator: sessionStorage.getItem('st_token')
        }
    };

    if (isBreak) {
        eventData.title = "⛔ ТЕХНІЧНА ПЕРЕРВА";
        eventData.backgroundColor = "#6B7280";
        eventData.borderColor = "#4B5563";
        eventData.extendedProps.type = "tech";
    } else {
        const subject = document.getElementById('eventSubject').value;
        const className = document.getElementById('eventClass').value;
        const teacher = document.getElementById('eventTeacher').value;
        
        if (!subject || !className) return alert("Заповніть предмет та клас!");

        eventData.title = `${subject} (${className})`;
        eventData.backgroundColor = document.getElementById('eventColor').value;
        eventData.extendedProps = {
            ...eventData.extendedProps,
            teacher: teacher,
            subject: subject,
            className: className,
            count: document.getElementById('eventCount').value,
            type: "lesson"
        };
    }

    db.ref('events/' + id).set(eventData).then(() => {
        sendTG(`🆕 Новий запис: ${eventData.title}\n⏰ ${start.replace('T',' ')}`);
        closeModal();
    });
};

window.applyStatus = () => {
    const status = document.getElementById('eventStatus').value;
    db.ref('events/' + clickedEvent.id + '/extendedProps/status').set(status);
    closeStatusModal();
};

window.handleDelete = () => {
    if (confirm("Видалити цей запис назавжди?")) {
        db.ref('events/' + clickedEvent.id).remove();
        closeStatusModal();
    }
};

// ==========================================
// 5. НАЛАШТУВАННЯ (ТЕХНІК)
// ==========================================

window.openSettings = () => {
    document.getElementById('tgToken').value = localStorage.getItem('st_tg_token') || '';
    document.getElementById('tgChatId').value = localStorage.getItem('st_tg_chat') || '';
    document.getElementById('settingsModal').style.display = 'flex';
};

window.closeSettings = () => {
    document.getElementById('settingsModal').style.display = 'none';
};

window.saveSettings = () => {
    localStorage.setItem('st_tg_token', document.getElementById('tgToken').value);
    localStorage.setItem('st_tg_chat', document.getElementById('tgChatId').value);
    alert("Налаштування Telegram збережено локально!");
};

window.updatePassInDB = () => {
    const newCode = document.getElementById('newPassCode').value.trim();
    const roleKey = document.getElementById('passRoleSelector').value;

    if (newCode.length < 3) return alert("Мінімум 3 цифри!");

    // Отримуємо поточну базу, змінюємо код і зберігаємо назад
    let tempUsers = { ...USERS };
    
    // Видаляємо старий код цієї ролі
    for (let code in tempUsers) {
        if (tempUsers[code].level === roleKey) delete tempUsers[code];
    }

    // Додаємо новий
    const roles = {
        "tech": { role: "Технік", level: "tech", color: "#6B7280" },
        "admin": { role: "Адмін", level: "admin", color: "#4F46E5" },
        "teacher": { role: "Викладач", level: "teacher", color: "#10B981" }
    };
    tempUsers[newCode] = roles[roleKey];

    db.ref('users').set(tempUsers).then(() => {
        alert("Пароль успішно оновлено в базі!");
        document.getElementById('newPassCode').value = '';
    });
};

// ==========================================
// 6. ДОПОМІЖНІ ФУНКЦІЇ
// ==========================================

function loadData() {
    // Вчителі
    db.ref('teachers').on('value', snap => {
        const list = snap.val() || ["Вчитель 1", "Вчитель 2"];
        document.getElementById('eventTeacher').innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
        document.getElementById('filterList').innerHTML = list.map(t => `<div class="filter-item" onclick="toggleFilter('${t}')">${t}</div>`).join('');
    });

    // Події
    db.ref('events').on('value', snap => {
        calendar.removeAllEvents();
        const data = snap.val();
        if (data) {
            Object.values(data).forEach(ev => {
                let displayTitle = ev.title;
                if (ev.extendedProps.status) displayTitle = `${ev.extendedProps.status} | ${ev.title}`;
                calendar.addEvent({ ...ev, title: displayTitle });
            });
        }
    });
}

function sendTG(msg) {
    const t = localStorage.getItem('st_tg_token');
    const c = localStorage.getItem('st_tg_chat');
    if (t && c) {
        fetch(`https://api.telegram.org/bot${t}/sendMessage?chat_id=${c}&text=${encodeURIComponent(msg)}`).catch(e => console.error(e));
    }
}

// Фільтрація
window.toggleFilter = (teacherName) => {
    calendar.getEvents().forEach(e => {
        if (e.extendedProps.type === 'tech') return;
        e.setProp('display', (e.extendedProps.teacher === teacherName) ? 'auto' : 'none');
    });
};

window.resetFilters = () => {
    calendar.getEvents().forEach(e => e.setProp('display', 'auto'));
};

// Модалки
window.closeModal = () => document.getElementById('modalOverlay').style.display = 'none';
window.closeStatusModal = () => document.getElementById('statusModalOverlay').style.display = 'none';
window.toggleTechBreak = (v) => document.getElementById('bookingFields').style.opacity = v ? '0.2' : '1';
window.toggleSidebar = () => {
    const s = document.querySelector('.sidebar');
    s.style.display = (window.getComputedStyle(s).display === 'none') ? 'block' : 'none';
};

// Звіти
window.openReport = () => {
    const events = calendar.getEvents().filter(e => e.extendedProps.type === 'lesson');
    document.getElementById('reportTableBody').innerHTML = events.map(e => `
        <tr>
            <td>${e.extendedProps.teacher}</td>
            <td>${e.start.toLocaleDateString()}</td>
            <td>${e.extendedProps.subject}</td>
            <td>${e.extendedProps.className}</td>
            <td>${e.extendedProps.count}</td>
            <td style="border-bottom: 1px solid #000; width: 50px;"></td>
        </tr>
    `).join('');
    document.getElementById('reportOverlay').style.display = 'flex';
};
window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';

// Авто-вхід
if (sessionStorage.getItem('st_token')) {
    const t = sessionStorage.getItem('st_token');
    // Невеликий таймер, щоб Firebase встиг завантажити актуальні USERS
    setTimeout(() => {
        if (USERS[t]) {
            currentUser = USERS[t];
            startApp();
        }
    }, 1000);
}