// 1. КОНФІГУРАЦІЯ FIREBASE
// ⚠️ ОБОВ'ЯЗКОВО: Замініть ці рядки на ваші реальні дані з Firebase Console!
const firebaseConfig = {
  apiKey: "ВАШ_REAL_API_KEY", 
  authDomain: "liceum-eit-manager.firebaseapp.com", // Приклад (взяв з ваших минулих файлів)
  databaseURL: "https://liceum-eit-manager-default-rtdb.europe-west1.firebasedatabase.app", // Приклад
  projectId: "liceum-eit-manager",
  storageBucket: "liceum-eit-manager.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};

// Ініціалізація
try {
    firebase.initializeApp(firebaseConfig);
} catch (e) {
    console.error("Помилка підключення Firebase. Перевірте config!", e);
}
const db = firebase.database();

let USERS = {};
let currentUser = null;
let calendar;
let selectedSlot = null;
let clickedEvent = null;

// ==========================================
// 2. ЛОГІКА ІНТЕРФЕЙСУ (КНОПКИ ТА ВВІД)
// ==========================================

// Перевірка вводу пароля (Розблоковує кнопку)
window.checkCodeInput = () => {
    const val = document.getElementById('newCodeVal').value;
    const btn = document.getElementById('btnUpdateCode');
    
    if (val && val.length >= 3) {
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

// Оновлення пароля в хмарі
window.updateAccessCodeCloud = () => {
    const newCode = document.getElementById('newCodeVal').value;
    const level = document.getElementById('codeLevel').value;
    const btn = document.getElementById('btnUpdateCode');

    if(newCode.length < 3) return alert("Занадто короткий код");

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

// ==========================================
// 3. СИНХРОНІЗАЦІЯ ДАНИХ (Real-time)
// ==========================================
function syncAllData() {
    // Слухаємо коди користувачів
    db.ref('users').on('value', (snap) => {
        USERS = snap.val() || {
            "777": { role: "Технік", level: "tech", color: "#6B7280" },
            "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
            "999": { role: "Викладач", level: "teacher", color: "#10B981" }
        };
        const statusEl = document.getElementById('loadingStatus');
        if(statusEl) statusEl.textContent = "База готова до роботи";
    });

    // Слухаємо уроки
    db.ref('events').on('value', (snap) => {
        const events = [];
        const data = snap.val();
        if (data) {
            for(let id in data) events.push(data[id]);
        }
        if(calendar) {
            calendar.removeAllEvents();
            calendar.addEvents(events);
            // updateStatusBar(); // Якщо у вас є ця функція, розкоментуйте
        }
    });

    // Слухаємо вчителів
    db.ref('teachers').on('value', (snap) => {
        const list = snap.val() || ["Шевченко", "Коваленко"];
        renderTeachersUI(list);
    });
}

// ==========================================
// 4. ФУНКЦІЇ КАЛЕНДАРЯ
// ==========================================
window.confirmBooking = () => {
    const isBlock = document.getElementById('isBlockTime').checked;
    // Перевірка на існування selectedSlot
    if (!selectedSlot) return alert("Помилка: час не вибрано");

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
    if(window.closeModal) window.closeModal();
};

window.applyStatus = () => {
    if (!clickedEvent) return;
    const newStatus = document.getElementById('eventStatus').value;
    const props = JSON.parse(JSON.stringify(clickedEvent.extendedProps));
    
    let finalTitle = props.baseTitle || clickedEvent.title; 
    let finalColor = props.baseColor || clickedEvent.backgroundColor;

    if (newStatus === "✅ Проведено") { finalTitle = "✅ " + finalTitle; finalColor = "#10B981"; }
    else if (newStatus === "❌ Скасовано") { finalTitle = "❌ " + finalTitle; finalColor = "#EF4444"; }
    else if (newStatus.includes("Запізнююсь")) { finalTitle = "⏳ " + finalTitle; finalColor = "#F59E0B"; }

    db.ref('events/' + clickedEvent.id).update({
        title: `${finalTitle}`,
        backgroundColor: finalColor,
        borderColor: finalColor,
        "extendedProps/status": newStatus
    });
    if(window.closeStatusModal) window.closeStatusModal();
};

window.handleDelete = () => {
    if (clickedEvent && confirm("Видалити запис?")) {
        db.ref('events/' + clickedEvent.id).remove();
        if(window.closeStatusModal) window.closeStatusModal();
    }
};

// ==========================================
// 5. ДОПОМІЖНІ ФУНКЦІЇ
// ==========================================
function renderTeachersUI(list) {
    const tList = document.getElementById('teacherList');
    const tSelect = document.getElementById('eventTeacher');
    const fList = document.getElementById('filterList');

    if(tList) tList.innerHTML = list.map(t => `<div class="teacher-item">👤 ${t}</div>`).join('');
    if(tSelect) tSelect.innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
    
    if(fList) {
        fList.innerHTML = list.map(t => `
            <div class="filter-item" onclick="toggleFilter('${t}')">${t}</div>
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

// Запуск програми
syncAllData();

if (sessionStorage.getItem('st_token')) {
    setTimeout(() => { 
        // Тут має бути логіка запуску календаря (startApp), 
        // переконайтеся, що startApp() визначена або додайте її сюди.
        // currentUser = USERS[sessionStorage.getItem('st_token')];
        // if(currentUser) startApp();
        console.log("Logged in as:", sessionStorage.getItem('st_token'));
    }, 1000);
}