// 1. КОНФІГУРАЦІЯ FIREBASE (Вставте свої дані з Firebase Console)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};

// Ініціалізація
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let USERS = {};
let currentUser = null;
let calendar;
let selectedSlot = null;
let clickedEvent = null;

// 2. СИНХРОНІЗАЦІЯ ДАНИХ (Real-time)
function syncAllData() {
    // Слухаємо коди користувачів
    db.ref('users').on('value', (snap) => {
        USERS = snap.val() || {
            "777": { role: "Технік", level: "tech", color: "#6B7280" },
            "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
            "999": { role: "Викладач", level: "teacher", color: "#10B981" }
        };
        document.getElementById('loadingStatus').textContent = "База готова до роботи";
    });

    // Слухаємо уроки
    db.ref('events').on('value', (snap) => {
        const events = [];
        const data = snap.val();
        for(let id in data) events.push(data[id]);
        if(calendar) {
            calendar.removeAllEvents();
            calendar.addEvents(events);
            updateStatusBar();
        }
    });

    // Слухаємо вчителів
    db.ref('teachers').on('value', (snap) => {
        const list = snap.val() || ["Шевченко", "Коваленко"];
        renderTeachersUI(list);
    });
}

// 3. ФУНКЦІЇ ЗАПИСУ В ХМАРУ
window.confirmBooking = () => {
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
                count: document.getElementById('eventCount').value,
                createdAt: Date.now(), creator: sessionStorage.getItem('st_token'),
                baseTitle: title, baseColor: color
            }
        };
    }
    
    db.ref('events/' + eventId).set(eventData);
    closeModal();
};

window.applyStatus = () => {
    if (!clickedEvent) return;
    const newStatus = document.getElementById('eventStatus').value;
    const props = JSON.parse(JSON.stringify(clickedEvent.extendedProps)); // Клонуємо
    
    let finalTitle = props.baseTitle;
    let finalColor = props.baseColor;

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
        closeStatusModal();
    }
};

window.updateAccessCodeCloud = () => {
    const newCode = document.getElementById('newCodeVal').value;
    const level = document.getElementById('codeLevel').value;
    if(newCode.length < 3) return alert("Занадто короткий код");

    const newUsers = {...USERS};
    // Видаляємо старий код цього рівня
    for(let code in newUsers) if(newUsers[code].level === level) delete newUsers[code];
    
    // Додаємо новий
    const roles = { tech: "Технік", admin: "Адмін", teacher: "Викладач" };
    const colors = { tech: "#6B7280", admin: "#4F46E5", teacher: "#10B981" };
    
    newUsers[newCode] = { role: roles[level], level: level, color: colors[level] };
    db.ref('users').set(newUsers).then(() => alert("Код оновлено хмарно!"));
};

// 4. ДОПОМІЖНІ ФУНКЦІЇ
function renderTeachersUI(list) {
    document.getElementById('teacherList').innerHTML = list.map(t => `<div class="teacher-item">👤 ${t}</div>`).join('');
    document.getElementById('eventTeacher').innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
    // Фільтри
    document.getElementById('filterList').innerHTML = list.map(t => `
        <div class="filter-item ${activeFilter === t ? 'active' : ''}" onclick="toggleFilter('${t}')">${t}</div>
    `).join('');
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

// Запуск програми
syncAllData();
if (sessionStorage.getItem('st_token')) {
    setTimeout(() => { // Чекаємо завантаження USERS з бази
        currentUser = USERS[sessionStorage.getItem('st_token')];
        if(currentUser) startApp();
    }, 1000);
}
// 1. Перевірка вводу (вмикає кнопку)
window.checkCodeInput = () => {
    const val = document.getElementById('newCodeVal').value;
    const btn = document.getElementById('btnUpdateCode');
    
    if (val.length >= 3) {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary'); // Стає синьою
    } else {
        btn.disabled = true;
        btn.style.opacity = "0.6";
        btn.style.cursor = "not-allowed";
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary'); // Стає сірою
    }
};

// 2. Оновлена логіка збереження з індикацією
window.updateAccessCodeCloud = () => {
    const newCode = document.getElementById('newCodeVal').value;
    const level = document.getElementById('codeLevel').value;
    const btn = document.getElementById('btnUpdateCode');

    // Блокуємо кнопку на час збереження
    btn.textContent = "⏳ Збереження...";
    btn.disabled = true;

    // Оновлюємо об'єкт USERS
    const newUsers = {...USERS};
    
    // Видаляємо старий код для вибраної ролі
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
            alert(`✅ Успішно! Новий код для ${roles[level]}: ${newCode}`);
            document.getElementById('newCodeVal').value = '';
            checkCodeInput(); // Скидаємо стан кнопки
            btn.textContent = "Оновити пароль";
        })
        .catch((error) => {
            alert("❌ Помилка: " + error.message);
            btn.textContent = "Спробувати ще раз";
            btn.disabled = false;
        });
};