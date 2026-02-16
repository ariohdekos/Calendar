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

// Глобальні змінні з вшитими кодами
let USERS = {
    "777": { role: "Технік", level: "tech", color: "#6B7280" },
    "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
    "999": { role: "Викладач", level: "teacher", color: "#10B981" }
};

let currentUser = null;
let calendar = null;
let selectedSlot = null;
let clickedEvent = null;
let activeFilter = null;
let reportChartInstance = null;
let currentTeachersList = [];

// ==========================================
// 2. ВХІД / ВИХІД
// ==========================================
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
    
    setInterval(updateStatusBar, 60000); // Оновлення статусу щохвилини
}

// ==========================================
// 3. КАЛЕНДАР ТА БАЗА ДАНИХ
// ==========================================
function initCalendar() {
    const el = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(el, {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk',
        slotMinTime: '08:00:00',
        slotMaxTime: '21:00:00',
        allDaySlot: false,
        height: '100%',
        selectable: true,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek,timeGridDay'
        },
        select: function(info) {
            if (currentUser.level !== 'admin' && currentUser.level !== 'tech' && currentUser.level !== 'teacher') {
                calendar.unselect();
                return;
            }
            selectedSlot = info;
            document.getElementById('modalOverlay').style.display = 'flex';
            
            // Очищення полів
            document.getElementById('eventSubject').value = '';
            document.getElementById('eventName').value = '';
        },
        eventClick: function(info) {
            clickedEvent = info.event;
            document.getElementById('statusModalOverlay').style.display = 'flex';
            document.getElementById('statusEventTitle').textContent = info.event.title;
            document.getElementById('eventStatus').value = info.event.extendedProps.status || "";
            
            // Захист видалення (15 хвилин)
            const isCreator = info.event.extendedProps.creator === sessionStorage.getItem('st_token');
            const ageMinutes = (Date.now() - info.event.extendedProps.createdAt) / 60000;
            const canDelete = (currentUser.level === 'admin' || currentUser.level === 'tech') || (isCreator && ageMinutes <= 15);
            
            document.getElementById('btnDeleteEvent').style.display = canDelete ? 'block' : 'none';
        }
    });
    calendar.render();
}

function loadData() {
    // Завантаження викладачів
    db.ref('teachers').on('value', snap => {
        currentTeachersList = snap.val() || ["Шевченко", "Коваленко"];
        renderTeachersUI(currentTeachersList);
    });

    // Завантаження уроків
    db.ref('events').on('value', snap => {
        calendar.removeAllEvents();
        const data = snap.val();
        if (data) {
            Object.values(data).forEach(ev => {
                let displayTitle = ev.title;
                if (ev.extendedProps.status) {
                    displayTitle = `${ev.extendedProps.status} | ${ev.title}`;
                }
                
                calendar.addEvent({
                    ...ev,
                    title: displayTitle,
                    backgroundColor: ev.extendedProps.status === "❌ Скасовано" ? '#9CA3AF' : ev.color,
                    borderColor: ev.extendedProps.status === "❌ Скасовано" ? '#9CA3AF' : ev.color
                });
            });
        }
        filterEvents();
        updateStatusBar();
    });
}

// ==========================================
// 4. ФУНКЦІЇ ДОДАВАННЯ ТА КЕРУВАННЯ
// ==========================================
window.selectColor = (el, color) => {
    document.querySelectorAll('.color-picker').forEach(c => c.style.border = 'none');
    el.style.border = '2px solid #1F2937';
    document.getElementById('eventColor').value = color;
};

window.confirmBooking = () => {
    const subject = document.getElementById('eventSubject').value.trim();
    const className = document.getElementById('eventName').value.trim();
    const teacher = document.getElementById('eventTeacher').value;
    const color = document.getElementById('eventColor').value || '#3b82f6';
    
    if (!subject || !className) return alert("Вкажіть предмет та клас!");
    
    const fullTitle = `${subject} (${className})`;
    const id = Date.now().toString();

    db.ref('events/' + id).set({
        id: id,
        title: fullTitle,
        start: selectedSlot.startStr,
        end: selectedSlot.endStr,
        color: color,
        extendedProps: {
            baseTitle: fullTitle,
            subject: subject,
            className: className,
            teacher: teacher,
            status: "",
            type: 'lesson',
            createdAt: Date.now(),
            creator: sessionStorage.getItem('st_token')
        }
    });
    closeModal();
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

window.updateStatusBar = () => {
    const now = new Date();
    const current = calendar.getEvents().find(e => now >= e.start && now < e.end && e.extendedProps.status !== "❌ Скасовано");
    const bar = document.getElementById('statusBar');
    if (current) {
        bar.style.background = '#EF4444';
        bar.textContent = `🔴 ЗАРАЗ: ${current.extendedProps.baseTitle || current.title} (${current.extendedProps.teacher})`;
    } else {
        bar.style.background = '#10B981'; 
        bar.textContent = "🟢 Вільно";
    }
};

// ==========================================
// 5. ФІЛЬТРИ, UI ТА АНАЛІТИКА
// ==========================================
window.closeModal = () => document.getElementById('modalOverlay').style.display = 'none';
window.closeStatusModal = () => document.getElementById('statusModalOverlay').style.display = 'none';
window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';

function renderTeachersUI(list) {
    const select = document.getElementById('eventTeacher');
    const filter = document.getElementById('filterList');
    if(select) select.innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
    if(filter) filter.innerHTML = list.map(t => `<div class="filter-item ${activeFilter===t?'active':''}" onclick="toggleFilter('${t}')">${t}</div>`).join('');
}

window.addTeacher = () => {
    const name = document.getElementById('newTeacherName').value.trim();
    if(!name) return;
    currentTeachersList.push(name);
    db.ref('teachers').set(currentTeachersList);
    document.getElementById('newTeacherName').value = '';
};

window.toggleFilter = (name) => { activeFilter = (activeFilter === name) ? null : name; filterEvents(); renderTeachersUI(currentTeachersList); };
window.resetFilters = () => { activeFilter = null; filterEvents(); renderTeachersUI(currentTeachersList); };

function filterEvents() {
    if(!calendar) return;
    calendar.getEvents().forEach(ev => {
        const p = ev.extendedProps;
        if (!activeFilter || p.teacher === activeFilter) { ev.setProp('display', 'auto'); } 
        else { ev.setProp('display', 'none'); }
    });
}

window.openReport = () => {
    document.getElementById('reportOverlay').style.display = 'flex';
    if (!calendar) return;

    // Збираємо тільки активні уроки
    const events = calendar.getEvents().filter(e => e.extendedProps.type === 'lesson' && e.extendedProps.status !== "❌ Скасовано");
    
    const stats = {};
    events.forEach(e => {
        const t = e.extendedProps.teacher;
        if (t) stats[t] = (stats[t] || 0) + 1;
    });

    const ctx = document.getElementById('reportChart').getContext('2d');
    if (reportChartInstance) reportChartInstance.destroy();

    reportChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                label: 'Заплановані та проведені уроки',
                data: Object.values(stats),
                backgroundColor: '#4F46E5',
                borderRadius: 4
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
};

// Запуск при завантаженні (якщо вже є токен)
if (sessionStorage.getItem('st_token')) {
    setTimeout(() => {
        const t = sessionStorage.getItem('st_token');
        if (USERS[t]) { currentUser = USERS[t]; startApp(); }
    }, 100);
}