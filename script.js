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

let USERS = {
    "777": { role: "Технік", level: "tech", color: "#6B7280" },
    "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
    "999": { role: "Викладач", level: "teacher", color: "#10B981" }
};
let currentUser = null;
let calendar = null;
let selectedSlot = null;
let clickedEvent = null;

// ВХІД
window.tryLogin = () => {
    const pass = document.getElementById('passInput').value.trim();
    if (USERS[pass]) {
        currentUser = USERS[pass];
        sessionStorage.setItem('st_token', pass);
        startApp();
    } else alert("Невірний код");
};

function startApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'grid';
    document.getElementById('roleBadge').textContent = currentUser.role;
    document.getElementById('roleBadge').style.background = currentUser.color;

    if (currentUser.level !== 'teacher') document.getElementById('reportBtn').style.display = 'block';
    if (currentUser.level === 'tech') {
        document.getElementById('settingsBtn').style.display = 'block';
        document.getElementById('techBlockOption').style.display = 'block';
    }
    
    if(!calendar) initCalendar();
    loadData();
}

function initCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk', slotMinTime: '08:00:00', slotMaxTime: '21:00:00',
        selectable: true,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' },
        select: (info) => {
            selectedSlot = info;
            document.getElementById('startTime').value = info.startStr.split('T')[1].substring(0,5);
            document.getElementById('endTime').value = info.endStr.split('T')[1].substring(0,5);
            document.getElementById('modalOverlay').style.display = 'flex';
        },
        eventClick: (info) => {
            clickedEvent = info.event;
            document.getElementById('statusModalOverlay').style.display = 'flex';
            document.getElementById('statusEventTitle').textContent = info.event.title;
            
            const isAuthor = info.event.extendedProps.creator === sessionStorage.getItem('st_token');
            const minutesSince = (Date.now() - info.event.extendedProps.createdAt) / 60000;
            document.getElementById('btnDeleteEvent').style.display = (currentUser.level === 'tech' || (isAuthor && minutesSince < 15)) ? 'block' : 'none';
        }
    });
    calendar.render();
}

window.confirmBooking = () => {
    const isBreak = document.getElementById('isTechBreak').checked;
    const id = Date.now().toString();
    const start = selectedSlot.startStr.split('T')[0] + 'T' + document.getElementById('startTime').value + ':00';
    const end = selectedSlot.startStr.split('T')[0] + 'T' + document.getElementById('endTime').value + ':00';

    let data = { id, start, end, extendedProps: { createdAt: Date.now(), creator: sessionStorage.getItem('st_token') }};

    if (isBreak) {
        data.title = "⛔ ТЕХНІЧНА ПЕРЕРВА"; data.backgroundColor = "#6B7280"; data.extendedProps.type = "tech";
    } else {
        const subj = document.getElementById('eventSubject').value;
        const cls = document.getElementById('eventClass').value;
        if (!subj || !cls) return alert("Заповніть поля!");
        data.title = `${subj} (${cls})`;
        data.backgroundColor = document.getElementById('eventColor').value;
        data.extendedProps = { teacher: document.getElementById('eventTeacher').value, subject: subj, className: cls, count: document.getElementById('eventCount').value, type: "lesson" };
    }
    db.ref('events/' + id).set(data);
    closeModal();
};

// Системні функції
window.logout = () => { sessionStorage.clear(); location.reload(); };
window.closeModal = () => document.getElementById('modalOverlay').style.display = 'none';
window.closeStatusModal = () => document.getElementById('statusModalOverlay').style.display = 'none';
window.toggleTechBreak = (v) => document.getElementById('bookingFields').style.opacity = v ? '0.3' : '1';
window.toggleSidebar = () => {
    const s = document.querySelector('.sidebar');
    s.style.display = (s.style.display === 'block') ? 'none' : 'block';
};

window.applyStatus = () => {
    const s = document.getElementById('eventStatus').value;
    db.ref('events/' + clickedEvent.id + '/extendedProps/status').set(s);
    closeStatusModal();
};

window.handleDelete = () => {
    if(confirm("Видалити?")) { db.ref('events/' + clickedEvent.id).remove(); closeStatusModal(); }
};

window.openSettings = () => document.getElementById('settingsModal').style.display = 'flex';
window.closeSettings = () => document.getElementById('settingsModal').style.display = 'none';

window.openReport = () => {
    const events = calendar.getEvents().filter(e => e.extendedProps.type === 'lesson');
    document.getElementById('reportTableBody').innerHTML = events.map(e => `
        <tr><td>${e.extendedProps.teacher}</td><td>${e.start.toLocaleDateString()}</td><td>${e.extendedProps.subject}</td><td>${e.extendedProps.className}</td><td>${e.extendedProps.count}</td><td style="border-bottom:1px solid #000; width:60px;"></td></tr>
    `).join('');
    document.getElementById('reportOverlay').style.display = 'flex';
};
window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';

function loadData() {
    db.ref('teachers').on('value', snap => {
        const list = snap.val() || ["Вчитель 1"];
        document.getElementById('eventTeacher').innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
        document.getElementById('filterList').innerHTML = list.map(t => `<div class="filter-item" onclick="toggleFilter('${t}')" style="cursor:pointer; padding:5px; border-bottom:1px solid #eee;">${t}</div>`).join('');
    });
    db.ref('events').on('value', snap => {
        calendar.removeAllEvents();
        if (snap.val()) Object.values(snap.val()).forEach(ev => {
            if(ev.extendedProps.status) ev.title = `${ev.extendedProps.status} | ${ev.title}`;
            calendar.addEvent(ev);
        });
    });
}

window.toggleFilter = (t) => {
    calendar.getEvents().forEach(e => e.setProp('display', (e.extendedProps.teacher === t || e.extendedProps.type === 'tech') ? 'auto' : 'none'));
};
window.resetFilters = () => calendar.getEvents().forEach(e => e.setProp('display', 'auto'));

// Авто-вхід
if (sessionStorage.getItem('st_token')) {
    const t = sessionStorage.getItem('st_token');
    if(USERS[t]) { currentUser = USERS[t]; setTimeout(startApp, 500); }
}