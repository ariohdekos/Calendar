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

// Початкові дані (використовуються, поки не завантажиться база)
let USERS = {
    "777": { role: "Технік", level: "tech", color: "#6B7280" },
    "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
    "999": { role: "Викладач", level: "teacher", color: "#10B981" }
};

let currentUser = null;
let calendar = null;
let selectedSlot = null;
let clickedEvent = null;

// =======================
// ЛОГІКА ВХОДУ ТА ЗАПУСКУ
// =======================
window.tryLogin = () => {
    const pass = document.getElementById('passInput').value.trim();
    if (USERS[pass]) {
        currentUser = USERS[pass];
        sessionStorage.setItem('st_token', pass);
        startApp();
    } else {
        alert("Невірний код або база ще завантажується...");
    }
};

function startApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'grid'; // Grid для ПК версії
    
    // Оновлення бейджа користувача
    document.getElementById('roleBadge').textContent = currentUser.role;
    document.getElementById('roleBadge').style.background = currentUser.color;

    // Права доступу до кнопок
    if (currentUser.level !== 'teacher') {
        document.getElementById('reportBtn').style.display = 'block';
    }
    if (currentUser.level === 'tech') {
        document.getElementById('settingsBtn').style.display = 'block';
        document.getElementById('techBlockOption').style.display = 'block';
        
        // Завантаження збережених налаштувань TG
        document.getElementById('tgToken').value = localStorage.getItem('st_tg_token') || '';
        document.getElementById('tgChatId').value = localStorage.getItem('st_tg_chat') || '';
    }
    
    if(!calendar) initCalendar();
    loadData(); // Запуск слухачів бази даних
}

function initCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk', 
        slotMinTime: '08:00:00', 
        slotMaxTime: '21:00:00',
        selectable: true,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' },
        select: (info) => {
            selectedSlot = info;
            // Автозаповнення часу
            const startStr = info.startStr.split('T')[1]?.substring(0,5) || "09:00";
            const endStr = info.endStr.split('T')[1]?.substring(0,5) || "10:00";
            document.getElementById('startTime').value = startStr;
            document.getElementById('endTime').value = endStr;
            document.getElementById('modalOverlay').style.display = 'flex';
        },
        eventClick: (info) => {
            clickedEvent = info.event;
            document.getElementById('statusModalOverlay').style.display = 'flex';
            document.getElementById('statusEventTitle').textContent = info.event.title;
            
            // Логіка видалення: Технік - завжди, Автор - 15 хв
            const isAuthor = info.event.extendedProps.creator === sessionStorage.getItem('st_token');
            const minutesSince = (Date.now() - (info.event.extendedProps.createdAt || 0)) / 60000;
            
            const canDelete = currentUser.level === 'tech' || (isAuthor && minutesSince < 15);
            document.getElementById('btnDeleteEvent').style.display = canDelete ? 'block' : 'none';
        }
    });
    calendar.render();
}

// =======================
// РОБОТА З БАЗОЮ ДАНИХ
// =======================

function loadData() {
    // 1. Слухаємо зміни в списку вчителів
    db.ref('teachers').on('value', snap => {
        const list = snap.val() || ["Вчитель 1"];
        document.getElementById('eventTeacher').innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
        document.getElementById('filterList').innerHTML = list.map(t => 
            `<div class="filter-item" onclick="toggleFilter('${t}')" style="cursor:pointer; padding:8px; border-bottom:1px solid #eee;">👤 ${t}</div>`
        ).join('');
    });

    // 2. Слухаємо зміни в подіях (календар)
    db.ref('events').on('value', snap => {
        calendar.removeAllEvents();
        const val = snap.val();
        if (val) {
            Object.values(val).forEach(ev => {
                // Додаємо статус до заголовка візуально, якщо він є
                if(ev.extendedProps && ev.extendedProps.status) {
                    // Перевіряємо, чи ще немає статусу в назві, щоб не дублювати
                    if(!ev.title.includes(ev.extendedProps.status)) {
                         ev.title = `${ev.extendedProps.status.split(' ')[0]} | ${ev.title}`;
                    }
                }
                calendar.addEvent(ev);
            });
        }
    });

    // 3. Слухаємо зміни кодів доступу (Щоб новий пароль працював відразу)
    db.ref('users').on('value', snap => {
        if(snap.exists()) {
            USERS = snap.val();
            console.log("Користувачі оновлені з хмари");
        }
    });
}

// =======================
// ФУНКЦІЇ ДЛЯ КНОПОК
// =======================

// Створення запису
window.confirmBooking = () => {
    const isBreak = document.getElementById('isTechBreak').checked;
    const id = Date.now().toString();
    
    // Формуємо дати
    const datePart = selectedSlot.startStr.split('T')[0];
    const start = `${datePart}T${document.getElementById('startTime').value}:00`;
    const end = `${datePart}T${document.getElementById('endTime').value}:00`;

    let data = { 
        id, 
        start, 
        end, 
        extendedProps: { 
            createdAt: Date.now(), 
            creator: sessionStorage.getItem('st_token') 
        }
    };

    if (isBreak) {
        data.title = "⛔ ТЕХНІЧНА ПЕРЕРВА"; 
        data.backgroundColor = "#6B7280"; 
        data.extendedProps.type = "tech";
    } else {
        const subj = document.getElementById('eventSubject').value;
        const cls = document.getElementById('eventClass').value;
        if (!subj || !cls) return alert("Заповніть предмет та клас!");
        
        data.title = `${subj} (${cls})`;
        data.backgroundColor = document.getElementById('eventColor').value;
        data.extendedProps = { 
            ...data.extendedProps,
            teacher: document.getElementById('eventTeacher').value, 
            subject: subj, 
            className: cls, 
            count: document.getElementById('eventCount').value, 
            type: "lesson" 
        };
    }
    
    db.ref('events/' + id).set(data)
        .then(() => closeModal())
        .catch(e => alert("Помилка запису: " + e.message));
};

// --- ВИПРАВЛЕНО: Зміна паролів (Налаштування) ---
window.updatePassInDB = () => {
    const newCode = document.getElementById('newPassCode').value.trim();
    const roleKey = document.getElementById('passRoleSelector').value; // admin, teacher, tech

    if (newCode.length < 3) return alert("Код має бути мінімум 3 символи");
    if (!confirm(`Змінити пароль для ролі "${roleKey}" на "${newCode}"?`)) return;

    // Копіюємо поточних юзерів
    let updatedUsers = { ...USERS };

    // Видаляємо старий пароль цієї ролі (щоб не плодити коди)
    for (const [code, userData] of Object.entries(updatedUsers)) {
        if (userData.level === roleKey) {
            delete updatedUsers[code];
        }
    }

    // Додаємо новий
    const roleConfig = {
        "tech": { role: "Технік", level: "tech", color: "#6B7280" },
        "admin": { role: "Адмін", level: "admin", color: "#4F46E5" },
        "teacher": { role: "Викладач", level: "teacher", color: "#10B981" }
    };

    updatedUsers[newCode] = roleConfig[roleKey];

    // Зберігаємо в Firebase
    db.ref('users').set(updatedUsers)
        .then(() => {
            alert("✅ Пароль успішно змінено! Новий код: " + newCode);
            document.getElementById('newPassCode').value = '';
        })
        .catch(err => alert("Помилка: " + err.message));
};

// --- ВИПРАВЛЕНО: Збереження Telegram (Налаштування) ---
window.saveSettings = () => {
    const token = document.getElementById('tgToken').value;
    const chat = document.getElementById('tgChatId').value;
    
    localStorage.setItem('st_tg_token', token);
    localStorage.setItem('st_tg_chat', chat);
    
    alert("Налаштування Telegram збережено в цьому браузері.");
};

// Зміна статусу уроку
window.applyStatus = () => {
    const s = document.getElementById('eventStatus').value;
    if(!clickedEvent) return;
    
    // Оновлюємо статус в базі
    db.ref('events/' + clickedEvent.id + '/extendedProps/status').set(s);
    
    // Змінюємо колір залежно від статусу
    let newColor = clickedEvent.backgroundColor;
    if(s.includes('Скасовано')) newColor = '#EF4444';
    else if(s.includes('Запізнююсь')) newColor = '#F59E0B';
    else if(s.includes('Проведено')) newColor = '#10B981';
    
    db.ref('events/' + clickedEvent.id + '/backgroundColor').set(newColor);
    
    closeStatusModal();
};

// Видалення
window.handleDelete = () => {
    if(confirm("Видалити цей запис безповоротно?")) { 
        db.ref('events/' + clickedEvent.id).remove(); 
        closeStatusModal(); 
    }
};

// Звітність
window.openReport = () => {
    const events = calendar.getEvents().filter(e => e.extendedProps.type === 'lesson');
    // Сортуємо за датою
    events.sort((a, b) => a.start - b.start);
    
    document.getElementById('reportTableBody').innerHTML = events.map(e => `
        <tr>
            <td>${e.extendedProps.teacher || '-'}</td>
            <td>${e.start.toLocaleDateString()} ${e.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
            <td>${e.extendedProps.subject || '-'}</td>
            <td>${e.extendedProps.className || '-'}</td>
            <td>${e.extendedProps.count || 1}</td>
            <td style="border-bottom:1px solid #000; width:60px;"></td>
        </tr>
    `).join('');
    document.getElementById('reportOverlay').style.display = 'flex';
};

// Допоміжні функції інтерфейсу
window.logout = () => { sessionStorage.clear(); location.reload(); };
window.closeModal = () => document.getElementById('modalOverlay').style.display = 'none';
window.closeStatusModal = () => document.getElementById('statusModalOverlay').style.display = 'none';
window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';
window.toggleTechBreak = (v) => document.getElementById('bookingFields').style.opacity = v ? '0.3' : '1';

window.toggleSidebar = () => {
    const s = document.querySelector('.sidebar');
    const display = window.getComputedStyle(s).display;
    if (display === 'none') {
        s.style.display = 'block';
        s.style.position = 'absolute';
        s.style.zIndex = '1000';
        s.style.height = '100%';
        s.style.width = '250px';
    } else {
        s.style.display = 'none';
    }
};

window.toggleFilter = (t) => {
    const events = calendar.getEvents();
    events.forEach(e => {
        if(e.extendedProps.type === 'tech') return; // Тех. перерви не ховаємо
        if(e.extendedProps.teacher === t) {
            e.setProp('display', 'auto');
        } else {
            // Якщо клікнули фільтр - ховаємо інших. 
            // Тут проста логіка: клік = показати тільки цього. 
            // Щоб скинути - є кнопка "Показати всіх"
            e.setProp('display', 'none'); 
        }
    });
};

window.resetFilters = () => {
    calendar.getEvents().forEach(e => e.setProp('display', 'auto'));
};

// Авто-вхід при перезавантаженні (чекаємо завантаження бази юзерів)
if (sessionStorage.getItem('st_token')) {
    // Чекаємо трохи, щоб Firebase встиг підтягнути USERS, або пробуємо старі дані
    setTimeout(() => {
        const t = sessionStorage.getItem('st_token');
        // Якщо база вже завантажилась і там є такий код
        if(USERS[t]) {
             currentUser = USERS[t];
             startApp();
        } else {
             // Спробуємо підтягнути дані примусово
             db.ref('users').once('value').then(snap => {
                 if(snap.exists()) {
                     USERS = snap.val();
                     if(USERS[t]) {
                         currentUser = USERS[t];
                         startApp();
                     }
                 }
             });
        }
    }, 800);
}