const USERS = {
    "Paranoya01": { role: "Технік", level: "tech", color: "#6B7280" },
    "admin": { role: "Адмін", level: "admin", color: "#4F46E5" },
    "2026": { role: "Викладач", level: "teacher", color: "#10B981" }
};

let currentUser = null;
let calendar;
let selectedSlot = null;
let clickedEvent = null; // Виправлено: додано глобальну змінну
let reportChartInstance = null;
let activeFilter = null;

// ЛОГІН
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

    // ТГ ПАНЕЛЬ: Тільки для техніка
    document.getElementById('tgPanel').style.display = (currentUser.level === 'tech') ? 'block' : 'none';
    if(currentUser.level === 'tech') {
        document.getElementById('tgToken').value = localStorage.getItem('st_tg_token') || '';
        document.getElementById('tgChatId').value = localStorage.getItem('st_tg_chat') || '';
    }

    initCalendar();
    renderTeachers();
    renderFilters();
    updateStatusBar();
}

function initCalendar() {
  calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
    locale: 'uk',
    slotMinTime: '08:00:00',
    slotMaxTime: '21:00:00',
    selectable: true,
    allDaySlot: false,
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' },
    events: JSON.parse(localStorage.getItem('studioEvents') || '[]'),
    
    // ВІДКРИТТЯ ВІКНА СТАТУСІВ ПРИ КЛІКУ
    eventClick: (info) => {
        clickedEvent = info.event; // Зберігаємо подію глобально
        const props = clickedEvent.extendedProps;
        
        // Заповнюємо дані у вікні керування
        document.getElementById('statusEventTitle').textContent = props.baseTitle || clickedEvent.title;
        document.getElementById('statusTeacherName').textContent = props.teacher || "—";
        document.getElementById('eventStatus').value = props.status || ""; // Встановлюємо поточний статус
        
        // Показуємо/ховаємо кнопку видалення (тільки технік, адмін або автор протягом 15 хв)
        const diff = (Date.now() - (props.createdAt || 0)) / 1000 / 60;
        const canDelete = currentUser.level === 'admin' || currentUser.level === 'tech' || (props.creator === sessionStorage.getItem('st_token') && diff <= 15);
        document.getElementById('btnDeleteEvent').style.display = canDelete ? 'block' : 'none';
        
        document.getElementById('statusModalOverlay').style.display = 'flex';
    },

    select: (info) => {
        selectedSlot = info;
        // Автозаповнення часу
        const startStr = info.startStr.split('T')[1].substring(0,5);
        const endStr = info.endStr.split('T')[1].substring(0,5);
        
        document.getElementById('startTimeInput').value = startStr;
        document.getElementById('endTimeInput').value = endStr;
        
        document.getElementById('adminBlockOptions').style.display = currentUser.level !== 'teacher' ? 'block' : 'none';
        document.getElementById('modalOverlay').style.display = 'flex';
    }
  });
  calendar.render();
}

// ФУНКЦІЇ КЕРУВАННЯ ПОДІЄЮ (БУЛИ ВІДСУТНІ)
window.applyStatus = () => {
    if (!clickedEvent) return;

    const newStatus = document.getElementById('eventStatus').value;
    const props = clickedEvent.extendedProps;
    const baseTitle = props.baseTitle || clickedEvent.title;
    const baseColor = props.baseColor || "#4F46E5"; // Повертаємо оригінальний колір, якщо статус "Ок"

    let finalTitle = baseTitle;
    let finalColor = baseColor;

    // Логіка зміни кольорів
    if (newStatus === "✅ Проведено") {
        finalTitle = "✅ " + baseTitle;
        finalColor = "#10B981"; // Зелений
    } else if (newStatus === "❌ Скасовано") {
        finalTitle = "❌ " + baseTitle;
        finalColor = "#EF4444"; // Червоний
    } else if (newStatus.includes("Запізнююсь")) {
        finalTitle = "⏳ " + baseTitle;
        finalColor = "#F59E0B"; // Жовтий
    }

    // Оновлюємо візуалізацію
    clickedEvent.setProp('title', `${finalTitle} | ${props.sClass} | ${props.teacher}`);
    clickedEvent.setProp('backgroundColor', finalColor);
    clickedEvent.setProp('borderColor', finalColor);
    clickedEvent.setExtendedProp('status', newStatus); // Зберігаємо статус в об'єкт

    save();
    closeStatusModal();
};

window.handleDelete = () => {
    if (!clickedEvent) return;
    if (confirm("Ви впевнені, що хочете видалити цей запис?")) {
        clickedEvent.remove();
        save();
        closeStatusModal();
    }
};

window.closeStatusModal = () => {
    document.getElementById('statusModalOverlay').style.display = 'none';
    clickedEvent = null;
};

// ФІЛЬТРИ
function renderFilters() {
    const list = JSON.parse(localStorage.getItem('studioTeachers') || '["Шевченко", "Коваленко"]');
    const container = document.getElementById('filterList');
    container.innerHTML = list.map(t => `
        <div class="filter-item ${activeFilter === t ? 'active' : ''}" onclick="toggleFilter('${t}')">${t}</div>
    `).join('');
}

window.toggleFilter = (name) => {
    activeFilter = (activeFilter === name) ? null : name;
    calendar.getEvents().forEach(ev => {
        const p = ev.extendedProps;
        if (!activeFilter || p.teacher === activeFilter || p.type === 'block') {
            ev.setProp('display', 'auto');
        } else {
            ev.setProp('display', 'none');
        }
    });
    renderFilters();
};

window.resetFilters = () => {
    activeFilter = null;
    calendar.getEvents().forEach(ev => ev.setProp('display', 'auto'));
    renderFilters();
};

// АНАЛІТИКА
window.openReport = () => {
    const events = calendar.getEvents().filter(e => e.extendedProps && e.extendedProps.type === 'lesson');
    let totalLessons = 0;
    const stats = {};

    let html = `<table><thead><tr><th>Дата</th><th>Вчитель</th><th>Предмет</th><th>Уроків</th></tr></thead><tbody>`;
    
    events.forEach(e => {
        const p = e.extendedProps;
        // Не рахуємо скасовані уроки
        if (p.status === "❌ Скасовано") return;

        const count = parseInt(p.count) || 1;
        totalLessons += count;
        stats[p.teacher] = (stats[p.teacher] || 0) + count;
        
        html += `<tr>
            <td>${new Date(e.start).toLocaleDateString()}</td>
            <td><b>${p.teacher}</b></td>
            <td>${p.subject || p.baseTitle} (${p.sClass})</td>
            <td>${count}</td>
        </tr>`;
    });
    
    html += `<tr style="background:#f3f4f6; font-weight:bold;"><td colspan="3">РАЗОМ (без скасованих):</td><td>${totalLessons}</td></tr></tbody></table>`;
    
    document.getElementById('reportResult').innerHTML = html;
    document.getElementById('reportOverlay').style.display = 'flex';
    
    setTimeout(() => drawChart(stats), 100);
};

function drawChart(stats) {
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
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';

// ЗБЕРЕЖЕННЯ ЗАПИСУ
function confirmBooking() {
    const isBlock = document.getElementById('isBlockTime').checked;
    const datePart = selectedSlot.startStr.split('T')[0];
    const start = `${datePart}T${document.getElementById('startTimeInput').value}:00`;
    const end = `${datePart}T${document.getElementById('endTimeInput').value}:00`;

    if (isBlock) {
        calendar.addEvent({
            id: String(Date.now()),
            title: "⛔ ТЕХНІЧНА ПЕРЕРВА",
            start, end,
            backgroundColor: "#9CA3AF",
            borderColor: "#6B7280",
            extendedProps: { type: 'block' }
        });
    } else {
        const title = document.getElementById('eventTitle').value;
        const teacher = document.getElementById('eventTeacher').value;
        const sClass = document.getElementById('eventClass').value;
        const count = document.getElementById('eventCount').value;
        const color = document.getElementById('eventColor').value;

        if (!title || !teacher || !sClass) return alert("Заповніть всі поля!");

        calendar.addEvent({
            id: String(Date.now()),
            title: `${title} | ${sClass} | ${teacher}`,
            start, end,
            backgroundColor: color,
            borderColor: color,
            extendedProps: { 
                teacher, 
                type: 'lesson', 
                sClass, 
                count, 
                createdAt: Date.now(), 
                creator: sessionStorage.getItem('st_token'), 
                baseTitle: title,
                baseColor: color // Зберігаємо оригінальний колір
            }
        });
        
        sendTelegram(`✅ <b>Новий запис:</b> ${title}\n🏫 Клас: ${sClass}\n👨‍🏫 ${teacher}\n🕒 ${document.getElementById('startTimeInput').value} - ${document.getElementById('endTimeInput').value}`);
    }
    save(); closeModal();
}

function save() {
    const evs = calendar.getEvents().map(e => ({
        id: e.id, title: e.title, start: e.startStr, end: e.endStr, 
        backgroundColor: e.backgroundColor, extendedProps: e.extendedProps
    }));
    localStorage.setItem('studioEvents', JSON.stringify(evs));
    updateStatusBar();
}

function updateStatusBar() {
    const now = new Date();
    const current = calendar.getEvents().find(e => {
        // Перевіряємо, чи подія відбувається зараз і чи вона не скасована
        const isNow = now >= new Date(e.start) && now < new Date(e.end);
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

// TG SETTINGS
window.saveTgSettings = () => {
    localStorage.setItem('st_tg_token', document.getElementById('tgToken').value);
    localStorage.setItem('st_tg_chat', document.getElementById('tgChatId').value);
    alert("Налаштування збережено");
};

async function sendTelegram(msg) {
    const t = localStorage.getItem('st_tg_token');
    const c = localStorage.getItem('st_tg_chat');
    if(t && c) fetch(`https://api.telegram.org/bot${t}/sendMessage?chat_id=${c}&text=${encodeURIComponent(msg)}`);
}

function renderTeachers() {
    const list = JSON.parse(localStorage.getItem('studioTeachers') || '["Шевченко", "Коваленко"]');
    document.getElementById('teacherList').innerHTML = list.map(t => `<div class="teacher-item">👤 ${t}</div>`).join('');
    document.getElementById('eventTeacher').innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
}

window.addTeacher = () => {
    const n = document.getElementById('newTeacherName').value;
    if(!n) return;
    const list = JSON.parse(localStorage.getItem('studioTeachers') || '[]');
    list.push(n);
    localStorage.setItem('studioTeachers', JSON.stringify(list));
    renderTeachers(); renderFilters();
    document.getElementById('newTeacherName').value = '';
};

window.closeModal = () => { document.getElementById('modalOverlay').style.display = 'none'; calendar.unselect(); };
window.toggleBlockUI = (v) => document.getElementById('bookingFields').style.display = v ? 'none' : 'block';

if (sessionStorage.getItem('st_token')) {
    currentUser = USERS[sessionStorage.getItem('st_token')];
    startApp();
}