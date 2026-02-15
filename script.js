// 1. КОНФІГУРАЦІЯ FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDZWcQ7INpnZj1Hbf0fICcsPs2Wndus8AM",
  authDomain: "liceum-eit-manager.firebaseapp.com",
  databaseURL: "https://liceum-eit-manager-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "liceum-eit-manager",
  storageBucket: "liceum-eit-manager.firebasestorage.app",
  messagingSenderId: "854455059262",
  appId: "1:854455059262:web:e6282bed63182559c5a26f",
  measurementId: "G-NKS31DZ3MK"
};

// Ініціалізація
try {
    firebase.initializeApp(firebaseConfig);
} catch (e) {
    console.error("Помилка підключення Firebase:", e);
}
const db = firebase.database();

// Глобальні змінні
let USERS = {};
let currentUser = null;
let calendar = null;
let selectedSlot = null;
let clickedEvent = null;
let activeFilter = null;
let reportChartInstance = null;

// ==========================================
// 2. ВХІД / ВИХІД ТА ЗАПУСК
// ==========================================

// Функція входу (була відсутня)
window.tryLogin = () => {
    const pass = document.getElementById('passInput').value;
    if (USERS[pass]) {
        currentUser = USERS[pass];
        sessionStorage.setItem('st_token', pass);
        startApp();
    } else {
        alert("Невірний код доступу!");
    }
};

// Функція виходу (була відсутня)
window.logout = () => {
    sessionStorage.removeItem('st_token');
    location.reload();
};

// Запуск інтерфейсу (була відсутня)
function startApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('statusBar').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'grid'; // Важливо для CSS Grid
    
    // Оновлення бейджа користувача
    const badge = document.getElementById('roleBadge');
    badge.textContent = currentUser.role;
    badge.style.background = currentUser.color;

    // Показуємо панель техніка тільки техніку
    const tgPanel = document.getElementById('tgPanel');
    if(tgPanel) tgPanel.style.display = (currentUser.level === 'tech') ? 'block' : 'none';

    // Завантажуємо налаштування TG, якщо це технік
    if(currentUser.level === 'tech') {
        document.getElementById('tgToken').value = localStorage.getItem('st_tg_token') || '';
        document.getElementById('tgChatId').value = localStorage.getItem('st_tg_chat') || '';
    }

    initCalendar();
}

// ==========================================
// 3. КАЛЕНДАР
// ==========================================
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk',
        slotMinTime: '08:00:00',
        slotMaxTime: '20:00:00',
        selectable: true,
        allDaySlot: false,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' },
        
        // Клік на існуючу подію
        eventClick: (info) => {
            clickedEvent = info.event;
            const props = clickedEvent.extendedProps;
            
            document.getElementById('statusEventTitle').textContent = props.baseTitle || clickedEvent.title;
            document.getElementById('statusTeacherName').textContent = props.teacher || "—";
            document.getElementById('eventStatus').value = props.status || "";
            
            // Логіка показу кнопки видалення (15 хв або адмін)
            const diff = (Date.now() - (props.createdAt || 0)) / 1000 / 60;
            const isCreator = props.creator === sessionStorage.getItem('st_token');
            const canDelete = currentUser.level === 'admin' || currentUser.level === 'tech' || (isCreator && diff <= 15);
            
            const btnDelete = document.getElementById('btnDeleteEvent');
            if(btnDelete) btnDelete.style.display = canDelete ? 'block' : 'none';
            
            document.getElementById('statusModalOverlay').style.display = 'flex';
        },

        // Виділення часу для нового запису
        select: (info) => {
            selectedSlot = info;
            const startStr = info.startStr.split('T')[1].substring(0,5);
            const endStr = info.endStr.split('T')[1].substring(0,5);
            
            document.getElementById('startTimeInput').value = startStr;
            document.getElementById('endTimeInput').value = endStr;
            
            // Тільки технік і адмін бачать опцію блокування
            const adminOpts = document.getElementById('adminBlockOptions');
            if(adminOpts) adminOpts.style.display = (currentUser.level !== 'teacher') ? 'block' : 'none';
            
            document.getElementById('modalOverlay').style.display = 'flex';
        }
    });
    calendar.render();
    
    // Примусове оновлення розміру, щоб календар не був "сплюснутим"
    setTimeout(() => calendar.updateSize(), 200);
}

// ==========================================
// 4. СИНХРОНІЗАЦІЯ ДАНИХ (Real-time)
// ==========================================
function syncAllData() {
    // 1. Користувачі
    db.ref('users').on('value', (snap) => {
        USERS = snap.val() || {
            "777": { role: "Технік", level: "tech", color: "#6B7280" },
            "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
            "999": { role: "Викладач", level: "teacher", color: "#10B981" }
        };
    });

    // 2. Уроки
    db.ref('events').on('value', (snap) => {
        const events = [];
        const data = snap.val();
        if (data) {
            for(let id in data) events.push(data[id]);
        }
        if(calendar) {
            calendar.removeAllEvents();
            calendar.addEvents(events);
            filterEvents(); // Застосувати фільтр, якщо він активний
            updateStatusBar();
        }
    });

    // 3. Вчителі
    db.ref('teachers').on('value', (snap) => {
        const list = snap.val() || ["Шевченко", "Коваленко"];
        renderTeachersUI(list);
    });
}

// ==========================================
// 5. ЛОГІКА БРОНЮВАННЯ ТА РЕДАГУВАННЯ
// ==========================================
window.confirmBooking = () => {
    if (!selectedSlot) return alert("Помилка: час не вибрано");

    const isBlock = document.getElementById('isBlockTime').checked;
    const datePart = selectedSlot.startStr.split('T')[0];
    const start = `${datePart}T${document.getElementById('startTimeInput').value}:00`;
    const end = `${datePart}T${document.getElementById('endTimeInput').value}:00`;
    const eventId = "ev_" + Date.now();

    let eventData;

    if (isBlock) {
        eventData = {
            id: eventId, title: "⛔ ТЕХНІЧНА ПЕРЕРВА", start, end,
            backgroundColor: "#9CA3AF", borderColor: "#6B7280",
            extendedProps: { type: 'block' }
        };
    } else {
        const title = document.getElementById('eventTitle').value;
        const teacher = document.getElementById('eventTeacher').value;
        const sClass = document.getElementById('eventClass').value;
        const color = document.getElementById('eventColor').value;
        
        if(!title || !sClass) return alert("Заповніть назву предмету та клас!");

        eventData = {
            id: eventId, title: `${title} | ${sClass} | ${teacher}`, start, end,
            backgroundColor: color, borderColor: color,
            extendedProps: { 
                teacher, type: 'lesson', sClass, 
                count: document.getElementById('eventCount').value || 1,
                createdAt: Date.now(), 
                creator: sessionStorage.getItem('st_token'),
                baseTitle: title, 
                baseColor: color
            }
        };
        
        // Відправка в Telegram
        sendTelegram(`✅ <b>Новий запис:</b> ${title}\n🏫 Клас: ${sClass}\n👨‍🏫 ${teacher}\n🕒 ${start.split('T')[1]} - ${end.split('T')[1]}`);
    }
    
    db.ref('events/' + eventId).set(eventData);
    closeModal();
};

window.applyStatus = () => {
    if (!clickedEvent) return;
    const newStatus = document.getElementById('eventStatus').value;
    const props = clickedEvent.extendedProps;
    
    let finalTitle = props.baseTitle || clickedEvent.title; 
    let finalColor = props.baseColor || clickedEvent.backgroundColor;

    if (newStatus === "✅ Проведено") { finalTitle = "✅ " + finalTitle; finalColor = "#10B981"; }
    else if (newStatus === "❌ Скасовано") { finalTitle = "❌ " + finalTitle; finalColor = "#EF4444"; }
    else if (newStatus.includes("Запізнююсь")) { finalTitle = "⏳ " + finalTitle; finalColor = "#F59E0B"; }

    db.ref('events/' + clickedEvent.id).update({
        title: `${finalTitle} | ${props.sClass} | ${props.teacher}`,
        backgroundColor: finalColor,
        borderColor: finalColor,
        "extendedProps/status": newStatus
    });
    
    closeStatusModal();
};

window.handleDelete = () => {
    if (clickedEvent && confirm("Видалити запис?")) {
        db.ref('events/' + clickedEvent.id).remove();
        sendTelegram(`🗑 <b>Видалено урок:</b> ${clickedEvent.extendedProps.baseTitle}`);
        closeStatusModal();
    }
};

// ==========================================
// 6. НАЛАШТУВАННЯ ТА АДМІНКА
// ==========================================

// Виправлено: функція перейменована, щоб відповідати HTML (onclick="updateAccessCode(...)")
window.updateAccessCode = (level, newVal) => {
    if(!newVal || newVal.length < 3) return alert("Код має бути мінімум 3 символи");
    
    const newUsers = {...USERS};
    
    // Видаляємо старий код цього рівня
    for(let code in newUsers) {
        if(newUsers[code].level === level) delete newUsers[code];
    }
    
    const roles = { tech: "Технік", admin: "Адмін", teacher: "Викладач" };
    const colors = { tech: "#6B7280", admin: "#4F46E5", teacher: "#10B981" };
    
    newUsers[newVal] = { role: roles[level], level: level, color: colors[level] };

    db.ref('users').set(newUsers)
        .then(() => {
            alert(`✅ Код для "${roles[level]}" оновлено на: ${newVal}`);
            document.getElementById('code' + level.charAt(0).toUpperCase() + level.slice(1)).value = '';
        })
        .catch(e => alert("Помилка: " + e.message));
};

window.saveTgSettings = () => {
    localStorage.setItem('st_tg_token', document.getElementById('tgToken').value);
    localStorage.setItem('st_tg_chat', document.getElementById('tgChatId').value);
    alert("Налаштування Telegram збережено локально!");
};

async function sendTelegram(msg) {
    const t = localStorage.getItem('st_tg_token');
    const c = localStorage.getItem('st_tg_chat');
    if(t && c) {
        try {
            await fetch(`https://api.telegram.org/bot${t}/sendMessage?chat_id=${c}&text=${encodeURIComponent(msg)}&parse_mode=HTML`);
        } catch(e) { console.error("TG Error", e); }
    }
}

// ==========================================
// 7. UI HELPER FUNCTIONS (Були відсутні)
// ==========================================

window.closeModal = () => { 
    document.getElementById('modalOverlay').style.display = 'none'; 
    if(calendar) calendar.unselect(); 
};

window.closeStatusModal = () => { 
    document.getElementById('statusModalOverlay').style.display = 'none'; 
    clickedEvent = null; 
};

window.toggleBlockUI = (isChecked) => {
    document.getElementById('bookingFields').style.display = isChecked ? 'none' : 'block';
};

// Рендер списку вчителів
function renderTeachersUI(list) {
    const tList = document.getElementById('teacherList');
    const tSelect = document.getElementById('eventTeacher');
    const fList = document.getElementById('filterList');

    if(tList) tList.innerHTML = list.map(t => `<div class="teacher-item">👤 ${t}</div>`).join('');
    if(tSelect) tSelect.innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
    
    if(fList) {
        fList.innerHTML = list.map(t => `
            <div class="filter-item ${activeFilter === t ? 'active' : ''}" onclick="toggleFilter('${t}')">${t}</div>
        `).join('');
    }
}

window.addTeacher = () => {
    const name = document.getElementById('newTeacherName').value;
    if(!name) return;
    db.ref('teachers').once('value', snap => {
        const list = snap.val() || [];
        list.push(name);
        db.ref('teachers').set(list);
        document.getElementById('newTeacherName').value = '';
    });
};

// Фільтри
window.toggleFilter = (name) => {
    activeFilter = (activeFilter === name) ? null : name;
    filterEvents();
    // Оновлюємо візуальний стан кнопок
    const list = JSON.parse(JSON.stringify(document.getElementById('eventTeacher').innerHTML)); // хак щоб взяти список
    db.ref('teachers').once('value', snap => renderTeachersUI(snap.val() || []));
};

window.resetFilters = () => {
    activeFilter = null;
    filterEvents();
    db.ref('teachers').once('value', snap => renderTeachersUI(snap.val() || []));
};

function filterEvents() {
    if(!calendar) return;
    calendar.getEvents().forEach(ev => {
        const p = ev.extendedProps;
        if (!activeFilter || p.teacher === activeFilter || p.type === 'block') {
            ev.setProp('display', 'auto');
        } else {
            ev.setProp('display', 'none');
        }
    });
}

function updateStatusBar() {
    const now = new Date();
    const current = calendar.getEvents().find(e => {
        const isNow = now >= e.start && now < e.end;
        const isNotCancelled = e.extendedProps.status !== "❌ Скасовано";
        return isNow && isNotCancelled;
    });

    const bar = document.getElementById('statusBar');
    if (current) {
        bar.style.background = current.extendedProps.type === 'block' ? '#6B7280' : '#EF4444';
        bar.textContent = `🔴 ЗАРАЗ: ${current.extendedProps.baseTitle || current.title}`;
    } else {
        bar.style.background = '#10B981'; bar.textContent = "🟢 СТУДІЯ ВІЛЬНА";
    }
}

// Звітність
window.openReport = () => {
    const events = calendar.getEvents().filter(e => e.extendedProps && e.extendedProps.type === 'lesson');
    let totalLessons = 0;
    const stats = {};
    
    let html = `<table><thead><tr><th>Дата</th><th>Вчитель</th><th>Предмет</th><th>Уроків</th></tr></thead><tbody>`;
    
    events.forEach(e => {
        const p = e.extendedProps;
        if (p.status === "❌ Скасовано") return;

        const count = parseInt(p.count) || 1;
        totalLessons += count;
        stats[p.teacher] = (stats[p.teacher] || 0) + count;
        
        html += `<tr>
            <td>${e.start.toLocaleDateString()}</td>
            <td><b>${p.teacher}</b></td>
            <td>${p.baseTitle} (${p.sClass})</td>
            <td>${count}</td>
        </tr>`;
    });
    
    html += `<tr style="background:#f3f4f6; font-weight:bold;"><td colspan="3">РАЗОМ:</td><td>${totalLessons}</td></tr></tbody></table>`;
    
    document.getElementById('reportResult').innerHTML = html;
    document.getElementById('reportOverlay').style.display = 'flex';
    
    // Графік
    setTimeout(() => {
        const ctx = document.getElementById('reportChart').getContext('2d');
        if (reportChartInstance) reportChartInstance.destroy();
        
        reportChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(stats),
                datasets: [{
                    label: 'Проведені уроки',
                    data: Object.values(stats),
                    backgroundColor: '#4F46E5',
                    borderRadius: 5
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }, 100);
};

window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';

// ==========================================
// 8. ЗАПУСК
// ==========================================
syncAllData();

// Перевірка сесії при старті
if (sessionStorage.getItem('st_token')) {
    // Чекаємо трохи, щоб USERS завантажились з бази
    setTimeout(() => {
        const token = sessionStorage.getItem('st_token');
        if(USERS[token]) {
            currentUser = USERS[token];
            startApp();
        }
    }, 1000);
}