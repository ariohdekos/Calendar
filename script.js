// ==========================================
// 1. КОНФІГУРАЦІЯ (Встав свої дані!)
// ==========================================
const firebaseConfig = {
    apiKey: "ТВІЙ_API_KEY",
    authDomain: "ТВІЙ_PROJECT.firebaseapp.com",
    databaseURL: "ТВОЯ_URL_DATABASE",
    projectId: "ТВІЙ_PROJECT_ID",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
};

// Ініціалізація
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Глобальні змінні
let currentUser = null;
let calendar = null;
let selectedSlot = null; // Для створення
let clickedEventId = null; // Для редагування
let isCustomSubject = false;
let appSettings = { tgToken: "", tgChatId: "" };

// ==========================================
// 2. ВХІД ТА ЗАВАНТАЖЕННЯ ДАНИХ
// ==========================================

// Завантаження налаштувань (Telegram) при старті
db.ref('settings').on('value', (snapshot) => {
    const val = snapshot.val();
    if(val) appSettings = val;
    console.log("Налаштування завантажено:", appSettings);
});

window.tryLogin = () => {
    const pass = document.getElementById('passInput').value;
    const statusEl = document.getElementById('loginStatus');
    statusEl.innerText = "Перевірка...";

    db.ref('users').once('value').then(snapshot => {
        const users = snapshot.val() || {};
        // Якщо база порожня, створимо дефолтні
        if (!users["1111"]) {
            users["1111"] = { role: "admin", name: "Адміністратор" };
            users["2222"] = { role: "teacher", name: "Вчитель" };
            db.ref('users').set(users);
        }

        if (users[pass]) {
            currentUser = { ...users[pass], id: pass };
            loginSuccess();
        } else {
            statusEl.innerText = "❌ Невірний код";
        }
    });
};

function loginSuccess() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('mainContainer').style.display = 'block';
    
    document.getElementById('roleBadge').innerText = currentUser.name;
    
    // Запускаємо календар з невеликою затримкою для коректного рендеру
    setTimeout(initCalendar, 100);
}

window.logout = () => {
    location.reload();
};

// ==========================================
// 3. КАЛЕНДАР (АДАПТИВНИЙ)
// ==========================================
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    // Визначаємо вигляд залежно від ширини екрану
    const isMobile = window.innerWidth < 768;
    const initialView = isMobile ? 'timeGridDay' : 'timeGridWeek';

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: initialView,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: isMobile ? 'timeGridDay,listDay' : 'dayGridMonth,timeGridWeek'
        },
        slotMinTime: '08:00:00',
        slotMaxTime: '21:00:00',
        locale: 'uk',
        firstDay: 1, // Понеділок
        allDaySlot: false,
        height: '100%',
        selectable: true,
        editable: true, // Можна перетягувати
        
        // Клік по порожньому місцю -> Створення
        select: function(info) {
            selectedSlot = info;
            clickedEventId = null;
            openModal('eventModalOverlay', 'Створити урок');
        },

        // Клік по події -> Редагування
        eventClick: function(info) {
            clickedEventId = info.event.id;
            const props = info.event.extendedProps;
            
            // Заповнюємо поля
            document.getElementById('eventSubjectSelect').value = props.subject; // Спрощено
            document.getElementById('eventClass').value = props.sClass;
            document.getElementById('eventTitle').value = props.baseTitle || "";
            
            openModal('eventModalOverlay', 'Редагувати урок', true);
        },

        // Перетягування (Drag & Drop)
        eventDrop: function(info) {
            updateEventTime(info.event);
        },
        eventResize: function(info) {
            updateEventTime(info.event);
        },

        // Завантаження подій
        events: function(info, successCallback) {
            db.ref('events').on('value', snap => {
                const data = snap.val();
                const events = [];
                for(let id in data) {
                    events.push({
                        id: id,
                        title: `${data[id].subject} (${data[id].sClass})`,
                        start: data[id].start,
                        end: data[id].end,
                        backgroundColor: getColor(data[id].subject),
                        borderColor: getColor(data[id].subject),
                        extendedProps: data[id]
                    });
                }
                successCallback(events);
            });
        }
    });
    calendar.render();
}

function getColor(subject) {
    const colors = {
        'Математика': '#EF4444', // Червоний
        'Укр. мова': '#F59E0B', // Жовтий
        'Англійська': '#3B82F6', // Синій
        'Історія': '#10B981', // Зелений
        'tech': '#6B7280' // Сірий
    };
    return colors[subject] || '#6366F1'; // Фіолетовий за замовчуванням
}

function updateEventTime(event) {
    db.ref('events/' + event.id).update({
        start: event.start.toISOString(),
        end: event.end.toISOString()
    });
}

// ==========================================
// 4. ЛОГІКА МОДАЛЬНИХ ВІКОН
// ==========================================
window.openModal = (id, title, isEdit = false) => {
    document.getElementById(id).style.display = 'flex';
    if(title) document.getElementById('modalTitle').innerText = title;
    
    if(id === 'eventModalOverlay') {
        if(isEdit) {
            document.getElementById('editActions').style.display = 'block';
            document.getElementById('saveBtn').innerText = "Зберегти зміни";
        } else {
            // Очистка форми для нового
            document.getElementById('editActions').style.display = 'none';
            document.getElementById('saveBtn').innerText = "Створити";
            document.getElementById('eventClass').value = "";
            document.getElementById('eventTitle').value = "";
        }
    }
};

window.closeModal = (id) => {
    document.getElementById(id).style.display = 'none';
};

window.toggleSubjectMode = () => {
    isCustomSubject = !isCustomSubject;
    const sel = document.getElementById('eventSubjectSelect');
    const inp = document.getElementById('eventSubjectInput');
    if(isCustomSubject) { sel.style.display='none'; inp.style.display='block'; inp.focus(); }
    else { sel.style.display='block'; inp.style.display='none'; }
};

// ==========================================
// 5. ЗБЕРЕЖЕННЯ ТА TELEGRAM
// ==========================================
window.saveEvent = () => {
    const subject = isCustomSubject 
        ? document.getElementById('eventSubjectInput').value 
        : document.getElementById('eventSubjectSelect').value;
    const sClass = document.getElementById('eventClass').value;
    const title = document.getElementById('eventTitle').value;
    const duration = parseInt(document.getElementById('eventDuration').value);

    if(!subject || !sClass) return alert("Заповніть предмет і клас!");

    // Якщо редагування існуючого
    if(clickedEventId) {
        db.ref('events/' + clickedEventId).update({
            subject, sClass, baseTitle: title
        });
    } 
    // Якщо створення нового
    else if (selectedSlot) {
        const start = new Date(selectedSlot.startStr);
        const end = new Date(start.getTime() + duration * 60000);

        const newEvent = {
            subject, sClass, baseTitle: title,
            start: start.toISOString(),
            end: end.toISOString(),
            teacher: currentUser.name,
            status: "Заплановано"
        };

        db.ref('events').push(newEvent).then(() => {
            sendTelegramNotification(newEvent);
        });
    }
    
    closeModal('eventModalOverlay');
};

// --- ВИПРАВЛЕНА ФУНКЦІЯ TELEGRAM ---
function sendTelegramNotification(eventData) {
    // 1. Перевіряємо чи є налаштування
    if (!appSettings.tgToken || !appSettings.tgChatId) {
        console.log("⚠️ Telegram не налаштовано. Повідомлення не відправлено.");
        return;
    }

    const text = `📅 *Новий урок*\n\n👨‍🏫 Вчитель: ${eventData.teacher}\n📚 Предмет: ${eventData.subject}\n🎓 Клас: ${eventData.sClass}\n🕒 Час: ${new Date(eventData.start).toLocaleString('uk-UA')}`;
    
    const url = `https://api.telegram.org/bot${appSettings.tgToken}/sendMessage`;

    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: appSettings.tgChatId,
            text: text,
            parse_mode: 'Markdown'
        })
    })
    .then(response => {
        if(response.ok) console.log("✅ Telegram надіслано");
        else console.error("❌ Telegram помилка", response);
    })
    .catch(err => console.error("❌ Помилка мережі TG:", err));
}

// ==========================================
// 6. НАЛАШТУВАННЯ
// ==========================================
window.openSettings = () => {
    document.getElementById('tgTokenInput').value = appSettings.tgToken || "";
    document.getElementById('tgChatIdInput').value = appSettings.tgChatId || "";
    openModal('settingsModal');
};

window.saveSettings = () => {
    const token = document.getElementById('tgTokenInput').value.trim();
    const chat = document.getElementById('tgChatIdInput').value.trim();
    
    db.ref('settings').set({
        tgToken: token,
        tgChatId: chat
    }).then(() => {
        alert("Налаштування збережено!");
        closeModal('settingsModal');
    });
};

window.updateUserPass = () => {
    const role = document.getElementById('roleSelect').value;
    const newCode = document.getElementById('newPassInput').value.trim();
    if(newCode.length < 3) return alert("Код занадто короткий");

    // Спочатку знайти старий код і видалити (спрощена логіка - просто додаємо новий)
    // У реальному проекті треба чистити старі коди, тут просто додамо новий
    db.ref('users/' + newCode).set({
        role: role,
        name: role === 'admin' ? "Адміністратор" : "Вчитель"
    }).then(() => alert("Новий код додано!"));
};

window.deleteEvent = () => {
    if(confirm("Видалити цей урок?")) {
        db.ref('events/' + clickedEventId).remove();
        closeModal('eventModalOverlay');
    }
};

window.updateStatus = (status) => {
    db.ref('events/' + clickedEventId).update({ status: status });
    closeModal('eventModalOverlay');
};