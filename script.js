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
    console.error("Помилка Firebase:", e);
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
let currentTeachersList = []; // Додано для збереження списку

// ==========================================
// 2. ВХІД / ВИХІД
// ==========================================

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
    sessionStorage.removeItem('st_token');
    location.reload();
};

function startApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('statusBar').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'grid';
    
    // Бейдж ролі
    const badge = document.getElementById('roleBadge');
    badge.textContent = currentUser.role;
    badge.style.background = currentUser.color;

    // Панель техніка
    const tgPanel = document.getElementById('tgPanel');
    if(tgPanel) tgPanel.style.display = (currentUser.level === 'tech') ? 'block' : 'none';

    if(currentUser.level === 'tech') {
        document.getElementById('tgToken').value = localStorage.getItem('st_tg_token') || '';
        document.getElementById('tgChatId').value = localStorage.getItem('st_tg_chat') || '';
    }

    initCalendar();
    
    // ВАЖЛИВО: Оновлюємо список вчителів вже з правами доступу (щоб з'явилися хрестики)
    renderTeachersUI(currentTeachersList);
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
        
        eventClick: (info) => {
            clickedEvent = info.event;
            const props = clickedEvent.extendedProps;
            
            document.getElementById('statusEventTitle').textContent = props.baseTitle || clickedEvent.title;
            document.getElementById('statusTeacherName').textContent = props.teacher || "—";
            document.getElementById('eventStatus').value = props.status || "";
            
            // Логіка кнопки видалення уроку
            const diff = (Date.now() - (props.createdAt || 0)) / 1000 / 60;
            const isCreator = props.creator === sessionStorage.getItem('st_token');
            const canDelete = currentUser.level === 'admin' || currentUser.level === 'tech' || (isCreator && diff <= 15);
            
            const btnDelete = document.getElementById('btnDeleteEvent');
            if(btnDelete) btnDelete.style.display = canDelete ? 'block' : 'none';
            
            document.getElementById('statusModalOverlay').style.display = 'flex';
        },

        select: (info) => {
            selectedSlot = info;
            const startStr = info.startStr.split('T')[1].substring(0,5);
            const endStr = info.endStr.split('T')[1].substring(0,5);
            
            document.getElementById('startTimeInput').value = startStr;
            document.getElementById('endTimeInput').value = endStr;
            
            const adminOpts = document.getElementById('adminBlockOptions');
            if(adminOpts) adminOpts.style.display = (currentUser.level !== 'teacher') ? 'block' : 'none';
            
            document.getElementById('modalOverlay').style.display = 'flex';
        }
    });
    calendar.render();
    setTimeout(() => calendar.updateSize(), 200);
}

// ==========================================
// 4. СИНХРОНІЗАЦІЯ ДАНИХ
// ==========================================
function syncAllData() {
    // Користувачі
    db.ref('users').on('value', (snap) => {
        USERS = snap.val() || {
            "777": { role: "Технік", level: "tech", color: "#6B7280" },
            "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
            "999": { role: "Викладач", level: "teacher", color: "#10B981" }
        };
    });

    // Уроки
    // ОНОВЛЕНА ФУНКЦІЯ ЗАВАНТАЖЕННЯ ПОДІЙ
function syncEvents() {
    // Уроки
    db.ref('events').on('value', (snap) => {
        const events = [];
        const data = snap.val();
        
        if (data) {
            Object.keys(data).forEach(key => {
                const ev = data[key];
                
                // ЯВНО формуємо структуру події для FullCalendar
                // Це виправить проблему з відображенням і фільтрами
                let newEvent = {
                    id: key,
                    title: ev.title || ev.extendedProps?.baseTitle || "Без назви",
                    start: ev.start,
                    end: ev.end,
                    backgroundColor: ev.backgroundColor,
                    borderColor: ev.borderColor,
                    // Важливо: кладемо всі додаткові дані в extendedProps
                    extendedProps: {
                        teacher: ev.extendedProps?.teacher || ev.teacher,
                        type: ev.extendedProps?.type || ev.type,
                        sClass: ev.extendedProps?.sClass || ev.sClass,
                        status: ev.extendedProps?.status || ev.status,
                        count: ev.extendedProps?.count || ev.count,
                        creator: ev.extendedProps?.creator || ev.creator,
                        baseTitle: ev.extendedProps?.baseTitle || ev.title,
                        createdAt: ev.extendedProps?.createdAt || ev.createdAt
                    }
                };

                // Спеціальна обробка для Технічних перерв (щоб були сірими і фоновими)
                if (newEvent.extendedProps.type === 'block') {
                    newEvent.display = 'background';
                    newEvent.backgroundColor = '#d1d5db'; // Сірий колір
                    newEvent.classNames = ['tech-event']; // Додаємо клас для CSS
                }

                events.push(newEvent);
            });
        }

        if(calendar) {
            calendar.removeAllEvents();
            calendar.addEvents(events);
            filterEvents(); // Тепер фільтр спрацює коректно, бо дані структуровані
            updateStatusBar();
        }
    });

    // Вчителі
    db.ref('teachers').on('value', (snap) => {
        currentTeachersList = snap.val() || ["Шевченко", "Коваленко"];
        renderTeachersUI(currentTeachersList);
    });
}

// ==========================================
// 5. ЛОГІКА БРОНЮВАННЯ ТА ВИДАЛЕННЯ
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
        
        if(!title || !sClass) return alert("Заповніть назву та клас!");

        eventData = {
            id: eventId, title: `${title} | ${sClass} | ${teacher}`, start, end,
            backgroundColor: color, borderColor: color,
            extendedProps: { 
                teacher, type: 'lesson', sClass, 
                count: document.getElementById('eventCount').value || 1,
                createdAt: Date.now(), 
                creator: sessionStorage.getItem('st_token'),
                baseTitle: title, baseColor: color
            }
        };
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
    if (clickedEvent && confirm("Видалити урок?")) {
        db.ref('events/' + clickedEvent.id).remove();
        sendTelegram(`🗑 <b>Видалено урок:</b> ${clickedEvent.extendedProps.baseTitle}`);
        closeStatusModal();
    }
};

// ==========================================
// 6. НАЛАШТУВАННЯ ТА ВЧИТЕЛІ
// ==========================================

window.updateAccessCode = (level, valFromHtml) => {
    const newVal = valFromHtml ? valFromHtml.trim() : "";
    if (!newVal || newVal.length < 3) return alert("Код має бути мінімум 3 символи!");

    db.ref('users').once('value').then(snap => {
        const currentUsers = snap.val() || {};
        const newUsers = { ...currentUsers };
        
        for (let code in newUsers) {
            if (newUsers[code] && newUsers[code].level === level) delete newUsers[code];
        }

        const roles = { tech: "Технік", admin: "Адмін", teacher: "Викладач" };
        const colors = { tech: "#6B7280", admin: "#4F46E5", teacher: "#10B981" };

        newUsers[newVal] = { role: roles[level], level: level, color: colors[level] };
        return db.ref('users').set(newUsers);
    }).then(() => {
        alert(`✅ Код оновлено!`);
        const el = document.getElementById('code' + level.charAt(0).toUpperCase() + level.slice(1));
        if(el) el.value = '';
    });
};

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

// !!! ФУНКЦІЯ ВИДАЛЕННЯ ВЧИТЕЛЯ !!!
window.deleteTeacher = (name) => {
    if (!confirm(`Видалити викладача "${name}"?`)) return;
    db.ref('teachers').once('value').then(snap => {
        const list = snap.val() || [];
        const newList = list.filter(t => t !== name);
        db.ref('teachers').set(newList);
        
        if (activeFilter === name) {
            activeFilter = null;
            filterEvents();
        }
    });
};

function renderTeachersUI(list) {
    const tList = document.getElementById('teacherList');
    const tSelect = document.getElementById('eventTeacher');
    const fList = document.getElementById('filterList');

    // Перевірка прав (тільки адмін/технік бачить хрестик)
    const canDelete = currentUser && (currentUser.level === 'admin' || currentUser.level === 'tech');

    if (tList) {
        tList.innerHTML = list.map(t => `
            <div class="teacher-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding: 8px; background: #f9fafb; border-radius: 8px;">
                <span>👤 ${t}</span>
                ${canDelete ? `<span onclick="deleteTeacher('${t}')" style="cursor:pointer; color:#EF4444; font-weight:bold; padding: 0 8px; font-size: 16px;">✕</span>` : ''}
            </div>
        `).join('');
    }

    if (tSelect) {
        // У списку вибору при створенні уроку видаляти не можна
        tSelect.innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    
    if (fList) {
        fList.innerHTML = list.map(t => `
            <div class="filter-item ${activeFilter === t ? 'active' : ''}" onclick="toggleFilter('${t}')">${t}</div>
        `).join('');
    }
}

// ==========================================
// 7. ДОПОМІЖНІ ФУНКЦІЇ
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

window.saveTgSettings = () => {
    localStorage.setItem('st_tg_token', document.getElementById('tgToken').value);
    localStorage.setItem('st_tg_chat', document.getElementById('tgChatId').value);
    alert("Налаштування збережено!");
};

async function sendTelegram(msg) {
    const t = localStorage.getItem('st_tg_token');
    const c = localStorage.getItem('st_tg_chat');
    if(t && c) fetch(`https://api.telegram.org/bot${t}/sendMessage?chat_id=${c}&text=${encodeURIComponent(msg)}&parse_mode=HTML`);
}

// Фільтри
window.toggleFilter = (name) => {
    activeFilter = (activeFilter === name) ? null : name;
    filterEvents();
    renderTeachersUI(currentTeachersList); // Оновлюємо візуально (активний клас)
};

window.resetFilters = () => {
    activeFilter = null;
    filterEvents();
    renderTeachersUI(currentTeachersList);
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
// ==========================================
// ЗВІТНІСТЬ ТА ЕКСПОРТ
// ==========================================

window.openReport = () => {
    // 1. Збираємо дані
    const events = calendar.getEvents().filter(e => e.extendedProps && e.extendedProps.type === 'lesson');
    let totalLessons = 0;
    const stats = {};
    
    // Початок HTML (додаємо кнопку експорту зверху)
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h3 style="margin:0;">Статистика</h3>
            <button onclick="downloadCSV()" style="padding: 8px 16px; background: #10B981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                📥 Скачати Excel
            </button>
        </div>
        <table>
            <thead>
                <tr><th>Дата</th><th>Вчитель</th><th>Предмет</th><th>Уроків</th></tr>
            </thead>
            <tbody>
    `;
    
    // 2. Формуємо рядки таблиці
    events.forEach(e => {
        const p = e.extendedProps;
        if (p.status === "❌ Скасовано") return; // Не рахуємо скасовані

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
    
    // 3. Виводимо на екран
    document.getElementById('reportResult').innerHTML = html;
    document.getElementById('reportOverlay').style.display = 'flex';
    
    // 4. Малюємо графік
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

// НОВА ФУНКЦІЯ ЕКСПОРТУ (Додай її відразу після openReport)
window.downloadCSV = () => {
    const events = calendar.getEvents().filter(e => e.extendedProps && e.extendedProps.type === 'lesson');
    
    // Додаємо BOM (\uFEFF), щоб Excel коректно читав кирилицю
    let csvContent = "\uFEFFДата,Вчитель,Предмет,Клас,Кількість,Статус\n";

    events.forEach(e => {
        const p = e.extendedProps;
        // Якщо хочеш експортувати і скасовані, прибери цей if
        if (p.status === "❌ Скасовано") return; 

        const date = e.start.toLocaleDateString();
        // Екрануємо коми в назвах, щоб таблиця не поїхала
        const title = (p.baseTitle || "").replace(/,/g, " ");
        
        const row = `${date},${p.teacher},${title},${p.sClass},${p.count || 1},${p.status || "Проведено"}`;
        csvContent += row + "\n";
    });

    // Створення посилання для скачування
    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Звіт_Liceum_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';

// ==========================================
// 8. ЗАПУСК
// ==========================================
syncAllData();

if (sessionStorage.getItem('st_token')) {
    setTimeout(() => {
        const token = sessionStorage.getItem('st_token');
        if(USERS[token]) {
            currentUser = USERS[token];
            startApp();
        }
    }, 1000);
}