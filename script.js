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

try {
    firebase.initializeApp(firebaseConfig);
} catch (e) {
    console.error("Firebase Error:", e);
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
let isMobileMenuOpen = false;

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
        alert("Невірний код!");
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
    
    document.getElementById('roleBadge').textContent = currentUser.role;
    document.getElementById('roleBadge').style.background = currentUser.color;

    const tgPanel = document.getElementById('tgPanel');
    if(tgPanel) tgPanel.style.display = (currentUser.level === 'tech') ? 'block' : 'none';

    if(currentUser.level === 'tech') {
        document.getElementById('tgToken').value = localStorage.getItem('st_tg_token') || '';
        document.getElementById('tgChatId').value = localStorage.getItem('st_tg_chat') || '';
    }

    initCalendar();
    syncEvents();
}

// ==========================================
// 3. КАЛЕНДАР (ВИПРАВЛЕНО ДЛЯ МОБІЛЬНИХ)
// ==========================================
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    // Визначаємо, чи це мобільний пристрій
    const isMobile = window.innerWidth < 768;

    calendar = new FullCalendar.Calendar(calendarEl, {
        // На мобільному показуємо 1 день, на ПК - тиждень
        initialView: isMobile ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk',
        slotMinTime: '08:00:00',
        slotMaxTime: '21:00:00',
        selectable: true,
        allDaySlot: false,
        
        // ВАЖЛИВО ДЛЯ МОБІЛЬНИХ: 0 затримка при натисканні
        selectLongPressDelay: 0, 
        eventLongPressDelay: 0,
        longPressDelay: 0,
        
        // Висота слотів (щоб легше було потрапити пальцем)
        slotDuration: '00:30:00',
        slotLabelInterval: '01:00',
        
        headerToolbar: { 
            left: 'prev,next today', 
            center: 'title', 
            right: isMobile ? '' : 'timeGridWeek,timeGridDay' // Ховаємо кнопки перемикання на мобільному
        },
        
        eventClick: (info) => {
            clickedEvent = info.event;
            const props = clickedEvent.extendedProps;
            
            document.getElementById('statusEventTitle').textContent = props.baseTitle || clickedEvent.title;
            document.getElementById('statusTeacherName').textContent = props.teacher || "—";
            document.getElementById('eventStatus').value = props.status || "";
            
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
}

// ==========================================
// 4. СИНХРОНІЗАЦІЯ
// ==========================================
function syncUsers() {
    db.ref('users').on('value', (snap) => {
        USERS = snap.val() || {
            "777": { role: "Технік", level: "tech", color: "#6B7280" },
            "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
            "999": { role: "Викладач", level: "teacher", color: "#10B981" }
        };
    });
}

function syncEvents() {
    db.ref('events').on('value', (snap) => {
        const events = [];
        const data = snap.val();
        if (data) {
            for(let id in data) events.push(data[id]);
        }
        if(calendar) {
            calendar.removeAllEvents();
            calendar.addEvents(events);
            filterEvents();
            updateStatusBar();
        }
    });

    db.ref('teachers').on('value', (snap) => {
        const list = snap.val() || ["Шевченко", "Коваленко"];
        renderTeachersUI(list);
    });
}

// ==========================================
// 5. ОСНОВНІ ФУНКЦІЇ
// ==========================================

// Відкриття/Закриття меню на мобільному
window.toggleSidebar = () => {
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    
    isMobileMenuOpen = !isMobileMenuOpen;
    if (isMobileMenuOpen) {
        sb.classList.add('show-mobile');
    } else {
        sb.classList.remove('show-mobile');
    }
};

window.confirmBooking = () => {
    if (!selectedSlot) return;

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
        sendTelegram(`⛔ ТЕХНІЧНА ПЕРЕРВА: ${start.split('T')[1]} - ${end.split('T')[1]}`);
    } else {
        const title = document.getElementById('eventTitle').value;
        const teacher = document.getElementById('eventTeacher').value;
        const sClass = document.getElementById('eventClass').value;
        const color = document.getElementById('eventColor').value;
        
        if(!title || !sClass) return alert("Заповніть поля!");

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
        sendTelegram(`✅ Новий: ${title} (${sClass})\n👨‍🏫 ${teacher}\n🕒 ${start.split('T')[1]} - ${end.split('T')[1]}`);
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
    if (clickedEvent && confirm("Видалити?")) {
        db.ref('events/' + clickedEvent.id).remove();
        sendTelegram(`🗑 Видалено: ${clickedEvent.extendedProps.baseTitle}`);
        closeStatusModal();
    }
};

window.updateAccessCode = (level, valFromHtml) => {
    const newVal = valFromHtml ? valFromHtml.trim() : "";
    if (newVal.length < 3) return alert("Мінімум 3 символи");

    db.ref('users').once('value').then(snap => {
        const currentUsers = snap.val() || {};
        const newUsers = { ...currentUsers };
        for (let code in newUsers) {
            if (newUsers[code].level === level) delete newUsers[code];
        }
        const roles = { tech: "Технік", admin: "Адмін", teacher: "Викладач" };
        const colors = { tech: "#6B7280", admin: "#4F46E5", teacher: "#10B981" };
        newUsers[newVal] = { role: roles[level], level: level, color: colors[level] };
        return db.ref('users').set(newUsers);
    }).then(() => {
        alert("Код оновлено!");
        document.getElementById('code' + level.charAt(0).toUpperCase() + level.slice(1)).value = '';
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

window.deleteTeacher = (name) => {
    if (!confirm(`Видалити ${name}?`)) return;
    db.ref('teachers').once('value').then(snap => {
        const list = snap.val() || [];
        const newList = list.filter(t => t !== name);
        db.ref('teachers').set(newList);
        if (activeFilter === name) { activeFilter = null; filterEvents(); }
    });
};

function renderTeachersUI(list) {
    const tList = document.getElementById('teacherList');
    const tSelect = document.getElementById('eventTeacher');
    const fList = document.getElementById('filterList');
    const canDelete = currentUser && (currentUser.level === 'admin' || currentUser.level === 'tech');

    if (tList) {
        tList.innerHTML = list.map(t => `
            <div class="teacher-item" style="display: flex; justify-content: space-between; align-items: center; padding: 5px; border-bottom: 1px solid #eee;">
                <span>👤 ${t}</span>
                ${canDelete ? `<span onclick="deleteTeacher('${t}')" style="cursor:pointer; color:red;">✕</span>` : ''}
            </div>
        `).join('');
    }
    if (tSelect) tSelect.innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
    if (fList) {
        fList.innerHTML = list.map(t => `
            <div class="filter-item ${activeFilter === t ? 'active' : ''}" onclick="toggleFilter('${t}')">${t}</div>
        `).join('');
    }
}

// Звітність
window.openReport = () => {
    const events = calendar.getEvents().filter(e => e.extendedProps && e.extendedProps.type === 'lesson');
    let totalLessons = 0;
    const stats = {};
    
    // Стилі для таблиці
    const tableStyle = "width:100%; border-collapse: collapse; margin-top:10px; font-size:14px;";
    const tdStyle = "padding:8px; border:1px solid #eee;";

    let html = `<div style="max-height:300px; overflow-y:auto;"><table style="${tableStyle}"><thead><tr><th>Дата</th><th>Вчитель</th><th>Предмет</th></tr></thead><tbody>`;
    
    events.forEach(e => {
        const p = e.extendedProps;
        if (p.status === "❌ Скасовано") return; 
        const count = parseInt(p.count) || 1;
        totalLessons += count;
        stats[p.teacher] = (stats[p.teacher] || 0) + count;
        html += `<tr><td style="${tdStyle}">${e.start.toLocaleDateString()}</td><td style="${tdStyle}">${p.teacher}</td><td style="${tdStyle}">${p.baseTitle}</td></tr>`;
    });
    
    html += `</tbody></table></div>`;
    html += `<p><b>РАЗОМ: ${totalLessons}</b></p>`;
    
    document.getElementById('reportResult').innerHTML = html;
    document.getElementById('reportOverlay').style.display = 'flex';
    
    setTimeout(() => {
        const ctx = document.getElementById('reportChart').getContext('2d');
        if (reportChartInstance) reportChartInstance.destroy();
        reportChartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels: Object.keys(stats), datasets: [{ label: 'Уроки', data: Object.values(stats), backgroundColor: '#4F46E5' }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }, 100);
};

// Helpers
window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';
window.closeModal = () => { document.getElementById('modalOverlay').style.display = 'none'; if(calendar) calendar.unselect(); };
window.closeStatusModal = () => { document.getElementById('statusModalOverlay').style.display = 'none'; clickedEvent = null; };
window.toggleBlockUI = (isChecked) => document.getElementById('bookingFields').style.display = isChecked ? 'none' : 'block';
window.saveTgSettings = () => {
    localStorage.setItem('st_tg_token', document.getElementById('tgToken').value);
    localStorage.setItem('st_tg_chat', document.getElementById('tgChatId').value);
    alert("Saved!");
};
async function sendTelegram(msg) {
    const t = localStorage.getItem('st_tg_token');
    const c = localStorage.getItem('st_tg_chat');
    if(t && c) fetch(`https://api.telegram.org/bot${t}/sendMessage?chat_id=${c}&text=${encodeURIComponent(msg)}`);
}
window.toggleFilter = (name) => { activeFilter = (activeFilter === name) ? null : name; filterEvents(); renderTeachersUI(currentTeachersList); };
window.resetFilters = () => { activeFilter = null; filterEvents(); renderTeachersUI(currentTeachersList); };
function filterEvents() {
    if(!calendar) return;
    calendar.getEvents().forEach(ev => {
        const p = ev.extendedProps;
        if (!activeFilter || p.teacher === activeFilter || p.type === 'block') { ev.setProp('display', 'auto'); } 
        else { ev.setProp('display', 'none'); }
    });
}
function updateStatusBar() {
    const now = new Date();
    const current = calendar.getEvents().find(e => now >= e.start && now < e.end && e.extendedProps.status !== "❌ Скасовано");
    const bar = document.getElementById('statusBar');
    if (current) {
        bar.style.background = current.extendedProps.type === 'block' ? '#6B7280' : '#EF4444';
        bar.textContent = `🔴 ЗАРАЗ: ${current.extendedProps.baseTitle || current.title}`;
    } else {
        bar.style.background = '#10B981'; bar.textContent = "🟢 СТУДІЯ ВІЛЬНА";
    }
}

// ЗАПУСК
syncUsers();
if (sessionStorage.getItem('st_token')) {
    setTimeout(() => {
        const token = sessionStorage.getItem('st_token');
        if(USERS[token]) { currentUser = USERS[token]; startApp(); }
    }, 1000);
}