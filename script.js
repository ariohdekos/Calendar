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
// 1. АВТОРИЗАЦІЯ ТА ДАНІ
// ==========================================
db.ref('settings').on('value', snap => {
    const data = snap.val() || {};
    if(data.accessCodes) USERS = data.accessCodes;
    
    // Заповнюємо поля налаштувань, якщо вони є
    const tokenInput = document.getElementById('tgToken');
    const chatInput = document.getElementById('tgChatId');
    if(tokenInput) tokenInput.value = data.tgToken || "";
    if(chatInput) chatInput.value = data.tgChatId || "";
});

window.tryLogin = () => {
    const pass = document.getElementById('passInput').value.trim();
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

    // Показуємо кнопки залежно від ролі
    if (currentUser.level === 'admin' || currentUser.level === 'tech') {
        document.getElementById('reportBtn').style.display = 'block';
    }
    if (currentUser.level === 'tech') {
        document.getElementById('settingsBtn').style.display = 'block';
        document.getElementById('techBlockOption').style.display = 'block';
    }
    
    // Ініціалізація
    if(!calendar) initCalendar(); 
    loadData();
}

window.logout = () => { sessionStorage.clear(); location.reload(); }

// ==========================================
// 2. ФУНКЦІЇ НАЛАШТУВАНЬ (ЯКІ БУЛИ ВІДСУТНІ)
// ==========================================
window.saveSettings = () => {
    const token = document.getElementById('tgToken').value.trim();
    const chat = document.getElementById('tgChatId').value.trim();
    
    db.ref('settings').update({
        tgToken: token,
        tgChatId: chat
    }, (error) => {
        if (error) alert('Помилка збереження!');
        else {
            alert('Налаштування Telegram збережено!');
            document.getElementById('settingsModal').style.display='none';
        }
    });
};

window.updatePassInDB = () => {
    const roleKey = document.getElementById('passRoleSelector').value; // 'teacher', 'admin', 'tech'
    const newCode = document.getElementById('newPassCode').value.trim();
    
    if(!newCode) return alert("Введіть новий код!");
    if(newCode.length < 3) return alert("Код занадто короткий!");

    // Визначаємо назву ролі та колір для цього ключа
    let roleName = "Викладач";
    let roleColor = "#10B981";
    
    if(roleKey === 'admin') { roleName = "Адмін"; roleColor = "#4F46E5"; }
    if(roleKey === 'tech')  { roleName = "Технік"; roleColor = "#6B7280"; }

    // Видаляємо старий код цієї ролі (шукаємо по об'єкту USERS)
    let updates = {};
    // Спочатку завантажуємо поточні коди, щоб знайти старий код цієї ролі і видалити його
    // Для спрощення ми просто перезапишемо об'єкт accessCodes, але безпечніше так:
    
    // 1. Знаходимо старий код цієї ролі
    let oldCode = null;
    for(let code in USERS) {
        if(USERS[code].level === roleKey) oldCode = code;
    }

    // 2. Формуємо оновлення: видаляємо старий, додаємо новий
    if(oldCode && oldCode !== newCode) {
        updates[`settings/accessCodes/${oldCode}`] = null;
    }
    updates[`settings/accessCodes/${newCode}`] = {
        role: roleName,
        level: roleKey,
        color: roleColor
    };

    db.ref().update(updates, (error) => {
        if(error) alert("Помилка!");
        else {
            alert(`Код для "${roleName}" змінено на: ${newCode}`);
            document.getElementById('newPassCode').value = '';
        }
    });
};

// ==========================================
// 3. КАЛЕНДАР
// ==========================================
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
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
    
    const baseDate = selectedSlot.startStr.split('T')[0];
    const fullStart = baseDate + 'T' + document.getElementById('startTime').value + ':00';
    const fullEnd = baseDate + 'T' + document.getElementById('endTime').value + ':00';

    let eventData = {
        id, start: fullStart, end: fullEnd,
        extendedProps: { createdAt: Date.now(), creator: sessionStorage.getItem('st_token') }
    };

    if (isBreak) {
        eventData.title = "🛠 ТЕХНІЧНА ПЕРЕРВА";
        eventData.backgroundColor = "#6B7280";
        eventData.borderColor = "#6B7280";
        eventData.extendedProps.type = "tech";
    } else {
        const subj = document.getElementById('eventSubject').value;
        const cls = document.getElementById('eventName').value; // Це поле Клас
        const count = document.getElementById('eventCount').value;
        if (!subj || !cls) return alert("Заповніть предмет та клас!");

        eventData.title = `${subj} (${cls})`;
        eventData.backgroundColor = document.getElementById('eventColor').value;
        eventData.borderColor = document.getElementById('eventColor').value;
        eventData.extendedProps = {
            ...eventData.extendedProps,
            teacher: document.getElementById('eventTeacher').value,
            subject: subj, className: cls, count: count, type: "lesson"
        };
    }

    db.ref('events/' + id).set(eventData);
    sendTelegram(`🆕 ${eventData.title}\n📅 ${new Date(fullStart).toLocaleDateString()} ${new Date(fullStart).toLocaleTimeString().slice(0,5)}\n👨‍🏫 ${eventData.extendedProps.teacher || 'Адмін'}`);
    closeModal();
};

window.applyStatus = () => {
    const s = document.getElementById('eventStatus').value;
    db.ref('events/' + clickedEvent.id + '/extendedProps/status').set(s);
    if(s) sendTelegram(`⚠️ СТАТУС: ${s}\nУрок: ${clickedEvent.title}`);
    closeStatusModal();
};

window.handleDelete = () => {
    if(confirm("Видалити запис?")) {
        db.ref('events/' + clickedEvent.id).remove();
        closeStatusModal();
    }
};

// ==========================================
// 4. ЗВІТНІСТЬ
// ==========================================
window.openReport = () => {
    // Беремо тільки уроки (не тех. перерви) і сортуємо за датою
    const events = calendar.getEvents()
        .filter(e => e.extendedProps.type === 'lesson')
        .sort((a,b) => a.start - b.start);

    document.getElementById('reportTableBody').innerHTML = events.map(e => `
        <tr>
            <td>${e.extendedProps.teacher}</td>
            <td>${e.start.toLocaleDateString('uk-UA')}</td>
            <td>${e.extendedProps.subject}</td>
            <td>${e.extendedProps.className}</td>
            <td style="text-align:center">${e.extendedProps.count || 1}</td>
            <td style="border-bottom:1px solid #000; width:100px;"></td>
        </tr>
    `).join('');
    document.getElementById('reportOverlay').style.display = 'flex';
};

window.printReport = () => {
    const printContent = document.getElementById('reportPrintArea').innerHTML;
    const originalContent = document.body.innerHTML;
    document.body.innerHTML = printContent;
    window.print();
    document.body.innerHTML = originalContent;
    location.reload(); // Перезавантаження щоб повернути події
};

// Додаткові
async function sendTelegram(msg) {
    const t = document.getElementById('tgToken').value;
    const c = document.getElementById('tgChatId').value;
    if(t && c) fetch(`https://api.telegram.org/bot${t}/sendMessage?chat_id=${c}&text=${encodeURIComponent(msg)}`);
}

function loadData() {
    db.ref('teachers').on('value', snap => {
        const list = snap.val() || ["Викладач 1"];
        const tSelect = document.getElementById('eventTeacher');
        if(tSelect) tSelect.innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
        
        const fList = document.getElementById('filterList');
        if(fList) fList.innerHTML = list.map(t => `<div class="filter-item" onclick="toggleFilter('${t}')">${t}</div>`).join('');
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

// UI Helpers
window.closeModal = () => document.getElementById('modalOverlay').style.display = 'none';
window.closeStatusModal = () => document.getElementById('statusModalOverlay').style.display = 'none';
window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';
window.toggleTechBreak = (v) => document.getElementById('bookingFields').style.opacity = v ? '0.2' : '1';
window.selectColor = (el, c) => {
    document.querySelectorAll('.color-picker').forEach(p => p.style.border='none');
    el.style.border = '2px solid #000';
    document.getElementById('eventColor').value = c;
};
window.toggleFilter = (teacher) => {
    // Проста логіка фільтрації
    const events = calendar.getEvents();
    events.forEach(e => {
        if(e.extendedProps.teacher !== teacher && e.extendedProps.type === 'lesson') {
            e.setProp('display', 'none');
        } else {
            e.setProp('display', 'auto');
        }
    });
};
window.resetFilters = () => {
    calendar.getEvents().forEach(e => e.setProp('display', 'auto'));
};

// Auto-run if refreshed
if (sessionStorage.getItem('st_token')) {
    setTimeout(() => {
        const token = sessionStorage.getItem('st_token');
        // Check hardcoded first, then DB async will catch up
        if(USERS[token]) { currentUser = USERS[token]; startApp(); }
    }, 500);
}
window.toggleSidebar = () => {
    const sb = document.querySelector('.sidebar');
    if(sb.style.display === 'block') {
        sb.style.display = 'none';
    } else {
        sb.style.display = 'block';
        sb.style.position = 'absolute';
        sb.style.zIndex = '1000';
        sb.style.height = 'calc(100vh - 60px)';
        sb.style.width = '100%';
    }
};