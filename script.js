// ==========================================
// 1. КОНФІГУРАЦІЯ FIREBASE
// ==========================================
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

let USERS = {}; // Буде завантажено з хмари
let currentUser = null;
let calendar;
let selectedSlot = null;
let clickedEvent = null;

// ==========================================
// 2. ФУНКЦІОНАЛ НАЛАШТУВАНЬ (Виправлено під твій HTML)
// ==========================================

// Активація кнопки при введенні тексту
window.checkCodeInput = () => {
    const val = document.getElementById('newCodeVal').value;
    const btn = document.getElementById('btnUpdateCode');
    
    if (val && val.length >= 3) {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
    } else {
        btn.disabled = true;
        btn.style.opacity = "0.6";
        btn.style.cursor = "not-allowed";
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
    }
};

// Збереження налаштувань Telegram (Назва як в HTML)
window.saveTgSettings = () => {
    const token = document.getElementById('tgToken').value;
    const chat = document.getElementById('tgChatId').value;
    
    if(!token || !chat) return alert("Заповніть обидва поля!");

    localStorage.setItem('st_tg_token', token);
    localStorage.setItem('st_tg_chat', chat);
    
    alert("✅ Telegram налаштування збережено локально!");
};

// Оновлення пароля в хмарі (Назва як в HTML)
window.updateAccessCodeCloud = () => {
    const newCode = document.getElementById('newCodeVal').value;
    const level = document.getElementById('codeLevel').value;
    const btn = document.getElementById('btnUpdateCode');

    if(newCode.length < 3) return alert("Мінімум 3 символи!");

    // Блокуємо кнопку
    btn.textContent = "⏳ Збереження...";
    btn.disabled = true;

    // Оновлюємо об'єкт USERS
    const newUsers = {...USERS};
    
    // Видаляємо старий код цього рівня
    for(let code in newUsers) {
        if(newUsers[code].level === level) delete newUsers[code];
    }
    
    // Додаємо новий
    const roles = { tech: "Технік", admin: "Адмін", teacher: "Викладач" };
    const colors = { tech: "#6B7280", admin: "#4F46E5", teacher: "#10B981" };
    
    newUsers[newCode] = { role: roles[level], level: level, color: colors[level] };

    // Відправляємо в Firebase
    db.ref('users').set(newUsers)
        .then(() => {
            alert(`✅ Пароль для "${roles[level]}" змінено на: ${newCode}`);
            document.getElementById('newCodeVal').value = '';
            checkCodeInput(); 
            btn.textContent = "Оновити пароль";
        })
        .catch((error) => {
            alert("❌ Помилка: " + error.message + "\nПеревірте Rules в консолі Firebase!");
            btn.textContent = "Спробувати ще раз";
            btn.disabled = false;
        });
};

// ==========================================
// 3. ОСНОВНА ЛОГІКА ДОДАТКУ
// ==========================================

// СИНХРОНІЗАЦІЯ ДАНИХ
function syncAllData() {
    // 1. Юзери
    db.ref('users').on('value', (snap) => {
        USERS = snap.val() || {
            "777": { role: "Технік", level: "tech", color: "#6B7280" },
            "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
            "999": { role: "Викладач", level: "teacher", color: "#10B981" }
        };
        const statusEl = document.getElementById('loadingStatus');
        if(statusEl) statusEl.textContent = "База підключена";
        
        // Якщо юзер вже залогінений - оновлюємо його дані
        const token = sessionStorage.getItem('st_token');
        if(token && USERS[token]) {
            currentUser = USERS[token];
        }
    });

    // 2. Події календаря
    db.ref('events').on('value', (snap) => {
        const events = [];
        const data = snap.val();
        if (data) for(let id in data) events.push(data[id]);
        
        if(calendar) {
            calendar.removeAllEvents();
            calendar.addEvents(events);
        }
    });

    // 3. Вчителі
    db.ref('teachers').on('value', (snap) => {
        const list = snap.val() || ["Вчитель 1"];
        renderTeachersUI(list);
    });
}

// ВХІД
window.tryLogin = () => {
    const pass = document.getElementById('passInput').value;
    if (USERS[pass]) {
        currentUser = USERS[pass];
        sessionStorage.setItem('st_token', pass);
        startApp();
    } else {
        alert("Невірний код або база ще вантажиться");
    }
};

function startApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'grid';
    document.getElementById('roleBadge').textContent = currentUser.role;
    document.getElementById('roleBadge').style.background = currentUser.color;

    // Показуємо панель техніка тільки техніку
    const tgPanel = document.getElementById('tgPanel');
    if(tgPanel) {
        tgPanel.style.display = (currentUser.level === 'tech') ? 'block' : 'none';
    }

    // Підтягуємо збережені дані TG в поля (якщо є)
    if(currentUser.level === 'tech') {
        document.getElementById('tgToken').value = localStorage.getItem('st_tg_token') || '';
        document.getElementById('tgChatId').value = localStorage.getItem('st_tg_chat') || '';
    }

    if(!calendar) initCalendar();
}

// КАЛЕНДАР
function initCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk',
        firstDay: 1,
        slotMinTime: '08:00:00',
        slotMaxTime: '21:00:00',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' },
        selectable: true,
        select: (info) => {
            selectedSlot = info;
            const startStr = info.startStr.split('T')[1]?.substring(0,5) || "09:00";
            const endStr = info.endStr.split('T')[1]?.substring(0,5) || "10:00";
            if(document.getElementById('startTimeInput')) document.getElementById('startTimeInput').value = startStr;
            if(document.getElementById('endTimeInput')) document.getElementById('endTimeInput').value = endStr;
            document.getElementById('modalOverlay').style.display = 'flex';
        },
        eventClick: (info) => {
            clickedEvent = info.event;
            document.getElementById('statusModalOverlay').style.display = 'flex';
            document.getElementById('statusEventTitle').textContent = info.event.title;
        }
    });
    calendar.render();
}

// ЗАПИС УРОКУ
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
    } else {
        const title = document.getElementById('eventTitle').value;
        const teacher = document.getElementById('eventTeacher').value;
        const sClass = document.getElementById('eventClass').value;
        const color = document.getElementById('eventColor').value;
        eventData = {
            id: eventId, title: `${title} | ${sClass} | ${teacher}`, start, end,
            backgroundColor: color, borderColor: color,
            extendedProps: { 
                teacher, type: 'lesson', sClass, 
                createdAt: Date.now(), creator: sessionStorage.getItem('st_token'),
                baseTitle: title, baseColor: color
            }
        };
    }
    db.ref('events/' + eventId).set(eventData);
    closeModal();
};

// ЗМІНА СТАТУСУ
window.applyStatus = () => {
    if (!clickedEvent) return;
    const newStatus = document.getElementById('eventStatus').value;
    const props = clickedEvent.extendedProps;
    let finalTitle = props.baseTitle || clickedEvent.title;
    
    // Якщо статус вже є в назві, прибираємо його перед додаванням нового
    finalTitle = finalTitle.replace(/^[✅❌⏳]\s/, '');

    let finalColor = props.baseColor || clickedEvent.backgroundColor;

    if (newStatus === "✅ Проведено") { finalTitle = "✅ " + finalTitle; finalColor = "#10B981"; }
    else if (newStatus === "❌ Скасовано") { finalTitle = "❌ " + finalTitle; finalColor = "#EF4444"; }
    else if (newStatus.includes("Запізнююсь")) { finalTitle = "⏳ " + finalTitle; finalColor = "#F59E0B"; }

    db.ref('events/' + clickedEvent.id).update({
        title: finalTitle,
        backgroundColor: finalColor,
        borderColor: finalColor,
        "extendedProps/status": newStatus
    });
    closeStatusModal();
};

window.handleDelete = () => {
    if (clickedEvent && confirm("Видалити?")) {
        db.ref('events/' + clickedEvent.id).remove();
        closeStatusModal();
    }
};

// ІНТЕРФЕЙС
function renderTeachersUI(list) {
    const tList = document.getElementById('teacherList');
    const tSelect = document.getElementById('eventTeacher');
    const fList = document.getElementById('filterList');

    if(tList) tList.innerHTML = list.map(t => `<div class="teacher-item">👤 ${t}</div>`).join('');
    if(tSelect) tSelect.innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
    if(fList) fList.innerHTML = list.map(t => `<div class="filter-item" onclick="toggleFilter('${t}')">${t}</div>`).join('');
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

window.toggleFilter = (t) => {
    calendar.getEvents().forEach(e => {
        if (e.extendedProps.type === 'block') return;
        e.setProp('display', e.extendedProps.teacher === t ? 'auto' : 'none');
    });
};

window.resetFilters = () => calendar.getEvents().forEach(e => e.setProp('display', 'auto'));

window.closeModal = () => document.getElementById('modalOverlay').style.display = 'none';
window.closeStatusModal = () => document.getElementById('statusModalOverlay').style.display = 'none';
window.logout = () => { sessionStorage.clear(); location.reload(); };

// ЗАПУСК
syncAllData();
if (sessionStorage.getItem('st_token')) {
    setTimeout(() => {
        const t = sessionStorage.getItem('st_token');
        if(USERS[t]) { currentUser = USERS[t]; startApp(); }
    }, 1000);
}