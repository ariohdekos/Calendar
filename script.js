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

// ==========================================
// 1. АВТОРИЗАЦІЯ ТА ПРАВА
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

    if (currentUser.level === 'admin' || currentUser.level === 'tech') document.getElementById('reportBtn').style.display = 'block';
    if (currentUser.level === 'tech') {
        document.getElementById('settingsBtn').style.display = 'block';
        document.getElementById('techBlockOption').style.display = 'block';
    }
    initCalendar(); loadData();
}

function logout() { sessionStorage.clear(); location.reload(); }

// ==========================================
// 2. КАЛЕНДАР ТА СТВОРЕННЯ (ТОЧНИЙ ЧАС)
// ==========================================
function initCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk', slotMinTime: '08:00:00', slotMaxTime: '21:00:00',
        selectable: true,
        select: (info) => {
            selectedSlot = info;
            // Виставляємо точний час у інпути з виділеного діапазону
            document.getElementById('startTime').value = info.startStr.split('T')[1].substring(0,5);
            document.getElementById('endTime').value = info.endStr.split('T')[1].substring(0,5);
            document.getElementById('modalOverlay').style.display = 'flex';
        },
        eventClick: (info) => {
            clickedEvent = info.event;
            document.getElementById('statusModalOverlay').style.display = 'flex';
            document.getElementById('statusEventTitle').textContent = info.event.title;
            document.getElementById('eventStatus').value = info.event.extendedProps.status || "";

            const isAuthor = info.event.extendedProps.creator === sessionStorage.getItem('st_token');
            const minutesSince = (Date.now() - info.event.extendedProps.createdAt) / 60000;

            if (currentUser.level === 'tech' || currentUser.level === 'admin' || (isAuthor && minutesSince <= 15)) {
                document.getElementById('btnDeleteEvent').style.display = 'block';
            } else {
                document.getElementById('btnDeleteEvent').style.display = 'none';
            }
        }
    });
    calendar.render();
}

window.confirmBooking = () => {
    const id = Date.now().toString();
    const isBreak = document.getElementById('isTechBreak').checked;
    
    // Отримуємо дату з виділення + точний час з інпутів
    const baseDate = selectedSlot.startStr.split('T')[0];
    const fullStart = baseDate + 'T' + document.getElementById('startTime').value + ':00';
    const fullEnd = baseDate + 'T' + document.getElementById('endTime').value + ':00';

    let eventData = {
        id, start: fullStart, end: fullEnd,
        extendedProps: { createdAt: Date.now(), creator: sessionStorage.getItem('st_token') }
    };

    if (isBreak) {
        eventData.title = "🛠 ТЕХНІЧНА ПЕРЕРВА";
        eventData.color = "#6B7280";
        eventData.extendedProps.type = "tech";
    } else {
        const subj = document.getElementById('eventSubject').value;
        const cls = document.getElementById('eventName').value;
        const count = document.getElementById('eventCount').value;
        if (!subj || !cls) return alert("Заповніть предмет та клас!");

        eventData.title = `${subj} (${cls})`;
        eventData.color = document.getElementById('eventColor').value;
        eventData.extendedProps = {
            ...eventData.extendedProps,
            teacher: document.getElementById('eventTeacher').value,
            subject: subj, className: cls, count: count, type: "lesson"
        };
    }

    db.ref('events/' + id).set(eventData);
    sendTelegram(`🆕 ${eventData.title}\nЧас: ${new Date(fullStart).toLocaleString('uk-UA')}\nК-сть: ${eventData.extendedProps.count || 1}`);
    closeModal();
};

// ==========================================
// 3. ЗВІТ ТА СТАТУСИ
// ==========================================
window.applyStatus = () => {
    const s = document.getElementById('eventStatus').value;
    db.ref('events/' + clickedEvent.id + '/extendedProps/status').set(s);
    if(s) sendTelegram(`⚠️ СТАТУС: ${s}\nУрок: ${clickedEvent.title}`);
    closeStatusModal();
};

window.openReport = () => {
    const events = calendar.getEvents().filter(e => e.extendedProps.type === 'lesson').sort((a,b) => a.start - b.start);
    document.getElementById('reportTableBody').innerHTML = events.map(e => `
        <tr>
            <td>${e.extendedProps.teacher}</td>
            <td>${new Date(e.start).toLocaleDateString('uk-UA')}</td>
            <td>${e.extendedProps.subject}</td>
            <td>${e.extendedProps.className}</td>
            <td style="text-align:center">${e.extendedProps.count || 1}</td>
            <td style="border-bottom:1px solid #000; width:100px;"></td>
        </tr>
    `).join('');
    document.getElementById('reportOverlay').style.display = 'flex';
};

window.handleDelete = () => {
    if(confirm("Видалити запис?")) {
        db.ref('events/' + clickedEvent.id).remove();
        closeStatusModal();
    }
};

// Решта функцій (TG, UI) залишається без змін...
async function sendTelegram(msg) {
    const t = document.getElementById('tgToken').value;
    const c = document.getElementById('tgChatId').value;
    if(t && c) fetch(`https://api.telegram.org/bot${t}/sendMessage?chat_id=${c}&text=${encodeURIComponent(msg)}`);
}

function loadData() {
    db.ref('teachers').on('value', snap => {
        const list = snap.val() || ["Викладач 1"];
        document.getElementById('eventTeacher').innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
        document.getElementById('filterList').innerHTML = list.map(t => `<div class="filter-item" onclick="toggleFilter('${t}')">${t}</div>`).join('');
    });
    db.ref('events').on('value', snap => {
        calendar.removeAllEvents();
        const data = snap.val();
        if (data) Object.values(data).forEach(ev => {
            let title = ev.title;
            if(ev.extendedProps.status) title = `${ev.extendedProps.status} | ${ev.title}`;
            calendar.addEvent({...ev, title});
        });
    });
}

window.closeModal = () => document.getElementById('modalOverlay').style.display = 'none';
window.closeStatusModal = () => document.getElementById('statusModalOverlay').style.display = 'none';
window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';
window.toggleTechBreak = (v) => document.getElementById('bookingFields').style.opacity = v ? '0.2' : '1';
window.selectColor = (el, c) => {
    document.querySelectorAll('.color-picker').forEach(p => p.style.border='none');
    el.style.border = '2px solid #000';
    document.getElementById('eventColor').value = c;
};