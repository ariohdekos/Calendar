// Конфігурація Firebase
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

let USERS = {};
let currentUser = null;
let calendar = null;
let selectedSlot = null;
let clickedEvent = null;
let currentTeachersList = [];

// ==========================================
// 1. ПРАВА ДОСТУПУ ТА ВХІД
// ==========================================
db.ref('settings').on('value', snap => {
    const data = snap.val() || {};
    USERS = data.accessCodes || {
        "777": { role: "Технік", level: "tech", color: "#6B7280" },
        "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
        "999": { role: "Викладач", level: "teacher", color: "#10B981" }
    };
    document.getElementById('tgToken').value = data.tgToken || "";
    document.getElementById('tgChatId').value = data.tgChatId || "";
});

window.tryLogin = () => {
    const pass = document.getElementById('passInput').value;
    if (USERS[pass]) {
        currentUser = USERS[pass];
        sessionStorage.setItem('st_token', pass);
        startApp();
    } else alert("Невірний код");
};

function startApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('statusBar').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'grid';
    
    document.getElementById('roleBadge').textContent = currentUser.role;
    document.getElementById('roleBadge').style.background = currentUser.color;

    // ПРАВА: Кнопка звітності (Адмін та Технік)
    if (currentUser.level === 'admin' || currentUser.level === 'tech') {
        document.getElementById('reportBtn').style.display = 'block';
    }
    // ПРАВА: Кнопка налаштувань (Тільки Технік)
    if (currentUser.level === 'tech') {
        document.getElementById('settingsBtn').style.display = 'block';
        document.getElementById('techBlockOption').style.display = 'block';
    }

    initCalendar();
    loadData();
}

function logout() { sessionStorage.clear(); location.reload(); }

// ==========================================
// 2. КАЛЕНДАР ТА ВИДАЛЕННЯ
// ==========================================
function initCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk', slotMinTime: '08:00:00', slotMaxTime: '21:00:00',
        selectable: true,
        select: (info) => {
            selectedSlot = info;
            document.getElementById('isTechBreak').checked = false;
            toggleTechBreak(false);
            document.getElementById('modalOverlay').style.display = 'flex';
        },
        eventClick: (info) => {
            clickedEvent = info.event;
            document.getElementById('statusModalOverlay').style.display = 'flex';
            document.getElementById('statusEventTitle').textContent = info.event.title;
            document.getElementById('eventStatus').value = info.event.extendedProps.status || "";

            // ПРАВА НА ВИДАЛЕННЯ
            const isCreator = info.event.extendedProps.creator === sessionStorage.getItem('st_token');
            const ageMinutes = (Date.now() - info.event.extendedProps.createdAt) / 60000;
            
            // Видаляти можуть: 
            // 1. Технік або Адмін (завжди)
            // 2. Автор уроку (протягом 15 хв)
            if (currentUser.level === 'tech' || currentUser.level === 'admin' || (isCreator && ageMinutes <= 15)) {
                document.getElementById('btnDeleteEvent').style.display = 'block';
            } else {
                document.getElementById('btnDeleteEvent').style.display = 'none';
            }
        }
    });
    calendar.render();
}

// ==========================================
// 3. ТЕХНІЧНА ПЕРЕРВА ТА СТВОРЕННЯ
// ==========================================
window.toggleTechBreak = (isBreak) => {
    document.getElementById('bookingFields').style.opacity = isBreak ? '0.3' : '1';
    document.getElementById('bookingFields').style.pointerEvents = isBreak ? 'none' : 'auto';
};

window.confirmBooking = () => {
    const isBreak = document.getElementById('isTechBreak').checked;
    const id = Date.now().toString();
    
    let eventData = {
        id, start: selectedSlot.startStr, end: selectedSlot.endStr,
        extendedProps: { createdAt: Date.now(), creator: sessionStorage.getItem('st_token') }
    };

    if (isBreak) {
        eventData.title = "🛠 ТЕХНІЧНА ПЕРЕРВА";
        eventData.color = "#6B7280";
        eventData.extendedProps.type = "tech";
    } else {
        const subj = document.getElementById('eventSubject').value;
        const cls = document.getElementById('eventName').value;
        const teacher = document.getElementById('eventTeacher').value;
        if (!subj || !cls) return alert("Заповніть предмет та клас!");
        
        eventData.title = `${subj} (${cls})`;
        eventData.color = document.getElementById('eventColor').value;
        eventData.extendedProps.teacher = teacher;
        eventData.extendedProps.subject = subj;
        eventData.extendedProps.className = cls;
        eventData.extendedProps.type = "lesson";
    }

    db.ref('events/' + id).set(eventData);
    sendTelegram(`🆕 ${eventData.title}\nЧас: ${new Date(selectedSlot.start).toLocaleString('uk-UA')}`);
    closeModal();
};

// ==========================================
// 4. СТАТУСИ (ЗАПІЗНЕННЯ / СКАСУВАННЯ)
// ==========================================
window.applyStatus = () => {
    const status = document.getElementById('eventStatus').value;
    if (!clickedEvent) return;

    db.ref('events/' + clickedEvent.id + '/extendedProps/status').set(status);
    
    if (status) {
        sendTelegram(`⚠️ УВАГА! Зміна статусу уроку:\nУрок: ${clickedEvent.title}\nСтатус: ${status}`);
    }
    closeStatusModal();
};

window.handleDelete = () => {
    if (confirm("Видалити цей запис?")) {
        db.ref('events/' + clickedEvent.id).remove();
        sendTelegram(`🗑 Видалено запис: ${clickedEvent.title}`);
        closeStatusModal();
    }
};

// ==========================================
// ІНШІ ФУНКЦІЇ (TG, Reports, UI)
// ==========================================
async function sendTelegram(msg) {
    const t = document.getElementById('tgToken').value;
    const c = document.getElementById('tgChatId').value;
    if(t && c) fetch(`https://api.telegram.org/bot${t}/sendMessage?chat_id=${c}&text=${encodeURIComponent(msg)}`);
}

window.openReport = () => {
    const events = calendar.getEvents().filter(e => e.extendedProps.type === 'lesson');
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = events.map(e => `
        <tr>
            <td>${e.extendedProps.teacher || '-'}</td>
            <td>${new Date(e.start).toLocaleDateString('uk-UA')}</td>
            <td>${e.extendedProps.subject || '-'}</td>
            <td>${e.extendedProps.className || '-'}</td>
            <td>1</td>
            <td style="border-bottom:1px solid #000; width:80px;"></td>
        </tr>
    `).join('');
    document.getElementById('reportOverlay').style.display = 'flex';
};

function loadData() {
    db.ref('teachers').on('value', snap => {
        currentTeachersList = snap.val() || ["Викладач 1"];
        document.getElementById('eventTeacher').innerHTML = currentTeachersList.map(t => `<option value="${t}">${t}</option>`).join('');
        document.getElementById('filterList').innerHTML = currentTeachersList.map(t => `<div class="filter-item" onclick="toggleFilter('${t}')">${t}</div>`).join('');
    });
    db.ref('events').on('value', snap => {
        calendar.removeAllEvents();
        const data = snap.val();
        if (data) Object.values(data).forEach(ev => {
            let dTitle = ev.title;
            if(ev.extendedProps.status) dTitle = `${ev.extendedProps.status} | ${ev.title}`;
            calendar.addEvent({...ev, title: dTitle});
        });
    });
}

// Стандартні закривашки
window.closeModal = () => document.getElementById('modalOverlay').style.display = 'none';
window.closeStatusModal = () => document.getElementById('statusModalOverlay').style.display = 'none';
window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';
window.selectColor = (el, color) => {
    document.querySelectorAll('.color-picker').forEach(c => c.style.border='none');
    el.style.border = '2px solid #000';
    document.getElementById('eventColor').value = color;
};

// Перевірка сесії
if (sessionStorage.getItem('st_token')) {
    setTimeout(() => {
        const t = sessionStorage.getItem('st_token');
        if (USERS[t]) { currentUser = USERS[t]; startApp(); }
    }, 500);
}