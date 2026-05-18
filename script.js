'use strict';

/* ================================================================
   CONSTANTS
   ================================================================ */
const GRADES = ['الصف الأول','الصف الثاني','الصف الثالث','الصف الرابع','الصف الخامس','الصف السادس'];
const STAFF_ROLES = ['مدير','معاون','متابع','محاسب','فني','حارس','خدمات'];
const EXPENSE_CATS = ['مستلزمات مكتبية','صيانة','رواتب','مرافق عامة','نظافة','أجهزة وتقنية','احتفالات','أخرى'];
const MONTHS_AR = [
  'أيلول 2025','تشرين الأول 2025','تشرين الثاني 2025','كانون الأول 2025',
  'كانون الثاني 2026','شباط 2026','آذار 2026','نيسان 2026','أيار 2026'
];

/* ================================================================
   UTILITIES
   ================================================================ */
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function load(k, fb) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch(e) { return fb; }
}
function persist(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
function today()        { return new Date().toISOString().slice(0,10); }
function fmt(n)         { return Number(n || 0).toLocaleString(); }
function emptyInst()    { return [null,null,null,null,null,null,null,null]; }
function makeMonthly()  { return MONTHS_AR.map(m => ({month:m,sessions:0,bonus:0,deduction:0})); }
function totalPaid(s)   { return s.installments.reduce((a,x) => a + (x ? x.amount : 0), 0); }
function paidCount(s)   { return s.installments.filter(Boolean).length; }
function remAmt(s)      { return Math.max(0, s.totalFee - totalPaid(s)); }
function mTotal(base,m) { return base + (m.bonus || 0) - (m.deduction || 0); }
function yearsService(y){ return Math.max(0, new Date().getFullYear() - y); }

function gradeOpts(sel) {
  return GRADES.map(g => `<option value="${esc(g)}"${g===sel?' selected':''}>${esc(g)}</option>`).join('');
}
function roleOpts(sel) {
  return STAFF_ROLES.map(r => `<option value="${esc(r)}"${r===sel?' selected':''}>${esc(r)}</option>`).join('');
}
function catOpts(sel) {
  return EXPENSE_CATS.map(c => `<option value="${esc(c)}"${c===sel?' selected':''}>${esc(c)}</option>`).join('');
}

/* ================================================================
   STATE
   ================================================================ */
let students   = load('sm_students', []);
let staff      = load('sm_staff',    []);
let teachers   = load('sm_teachers', []);
let expenses   = load('sm_expenses', []);
let eodRecords = load('sm_eod',      []);

let activeTab   = 'tab-students';
let studSearch  = '';
let studGrade   = '';
let staffSubTab = 'admin';
let expSearch   = '';

let rcvQuery     = '';
let rcvStudentId = null;
let rcvInstNum   = 1;

let sfEditId   = null;
let sfSiblings = [];

/* ================================================================
   SAVE HELPERS
   ================================================================ */
function saveStudents(arr) { students = arr; persist('sm_students', arr); }
function saveStaff(arr)    { staff    = arr; persist('sm_staff',    arr); }
function saveTeachers(arr) { teachers = arr; persist('sm_teachers', arr); }
function saveExpenses(arr) { expenses = arr; persist('sm_expenses', arr); }
function saveEod(arr)      { eodRecords = arr; persist('sm_eod',    arr); }

/* ================================================================
   TAB MANAGEMENT
   ================================================================ */
function setTab(id) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === id));
  activeTab = id;
  renderTab(id);
}

function renderTab(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const map = {
    'tab-students':  renderStudentsTab,
    'tab-receive':   renderReceiveTab,
    'tab-eod':       renderEodTab,
    'tab-staff':     renderStaffTab,
    'tab-expenses':  renderExpensesTab,
    'tab-dashboard': renderDashboardTab,
  };
  el.innerHTML = (map[id] || (() => ''))();
  attachTabEvents(id, el);
}

function refresh() { renderTab(activeTab); }

/* ================================================================
   MODAL HELPERS
   ================================================================ */
function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = html;
  root.querySelector('.modal-overlay')?.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeModal();
  });
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* ================================================================
   TAB 1 — STUDENTS
   ================================================================ */
function renderStudentsTab() {
  const filtered = students
    .filter(s =>
      (s.fullName.includes(studSearch) || s.code.includes(studSearch) || s.mobile.includes(studSearch)) &&
      (!studGrade || s.grade === studGrade)
    )
    .sort((a,b) => a.serial - b.serial);

  let tableHtml = `<div class="empty-state"><i class="fas fa-users-slash"></i><p>لا يوجد طلاب مسجلون بعد</p></div>`;
  if (filtered.length > 0) {
    const rows = filtered.map(s => {
      const paid = totalPaid(s), r = remAmt(s), cnt = paidCount(s);
      const pct  = s.totalFee > 0 ? Math.round((paid / s.totalFee) * 100) : 0;
      let badge  = '';
      if      (s.totalFee === 0) badge = `<span class="badge badge-purple">غير محدد</span>`;
      else if (pct >= 100)       badge = `<span class="badge badge-green">مكتمل</span>`;
      else if (pct >= 50)        badge = `<span class="badge badge-amber">${pct}%</span>`;
      else                       badge = `<span class="badge badge-red">${pct}%</span>`;
      return `<tr>
        <td data-label="ت" style="color:var(--text-muted)">${s.serial}</td>
        <td data-label="القيد"><span class="badge badge-blue">${esc(s.code) || '—'}</span></td>
        <td data-label="الاسم" style="font-weight:600;min-width:130px">${esc(s.fullName)}</td>
        <td data-label="الصف" style="font-size:.82rem;color:var(--text-secondary);white-space:nowrap">${esc(s.grade)}</td>
        <td data-label="الموبايل" style="font-size:.82rem;color:var(--text-secondary);direction:ltr;text-align:left">${esc(s.mobile) || '—'}</td>
        <td data-label="المبلغ">${s.totalFee ? fmt(s.totalFee) : '—'}</td>
        <td data-label="المدفوع" style="color:var(--green-light);font-weight:600">${paid ? fmt(paid) : '—'}</td>
        <td data-label="المتبقي" style="color:${r>0?'var(--red-light)':'var(--green-light)'};font-weight:600">${r > 0 ? fmt(r) : 'مكتمل'}</td>
        <td data-label="الأقساط" style="text-align:center"><span class="badge badge-purple">${cnt}/8</span></td>
        <td data-label="الحالة">${badge}</td>
        <td data-label="">
          <div class="action-btns">
            <button class="btn btn-sm btn-view"   data-action="view-student" data-id="${s.id}"><i class="fas fa-eye"></i></button>
            <button class="btn btn-sm btn-edit"   data-action="edit-student" data-id="${s.id}"><i class="fas fa-pen"></i></button>
            <button class="btn btn-sm btn-delete" data-action="del-student"  data-id="${s.id}"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');
    tableHtml = `<div class="table-wrap"><table>
      <thead><tr><th>ت</th><th>القيد</th><th>الاسم</th><th>الصف</th><th>الموبايل</th><th>المبلغ</th><th>المدفوع</th><th>المتبقي</th><th>الأقساط</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div class="card-title" style="margin:0"><i class="fas fa-users"></i> قائمة الطلاب</div>
        <button class="btn btn-sm btn-primary" style="width:auto" data-action="open-add-student"><i class="fas fa-plus"></i> إضافة</button>
      </div>
      <div class="search-bar">
        <input type="text" id="stud-search" placeholder="بحث بالاسم أو القيد أو الموبايل..." value="${esc(studSearch)}">
        <select id="stud-grade" style="max-width:160px">
          <option value="">كل الصفوف</option>${gradeOpts(studGrade)}
        </select>
      </div>
      <div style="margin-bottom:10px;font-size:.82rem;color:var(--text-muted)">
        العدد: <strong style="color:var(--accent-light)">${filtered.length}</strong> طالب
      </div>
      ${tableHtml}
    </div>`;
}

function openStudentDetail(id) {
  const s = students.find(x => x.id === id);
  if (!s) return;
  const paid = totalPaid(s), r = remAmt(s), cnt = paidCount(s);
  const pct = s.totalFee > 0 ? Math.min(100, Math.round((paid / s.totalFee) * 100)) : 0;

  const instGrid = s.installments.map((slot, i) => `
    <div class="installment-item${slot ? ' paid' : ''}">
      <div class="inst-label">القسط ${i+1}</div>
      ${slot
        ? `<div class="inst-amount">${fmt(slot.amount)} د.ع</div><div class="inst-date">${slot.date}</div>`
        : `<div class="inst-amount" style="color:var(--text-muted)">لم يُدفع</div>`
      }
    </div>`).join('');

  const siblingsHtml = (s.siblings && s.siblings.length)
    ? `<p class="section-title"><i class="fas fa-users"></i> الإخوة المسجلون</p>
       ${s.siblings.map(sib => `
         <div class="inner-panel" style="margin-bottom:8px">
           <div class="calc-row"><span class="label">الاسم</span><span class="value">${esc(sib.name)}</span></div>
           <div class="calc-row"><span class="label">الصف</span><span class="value">${esc(sib.grade)}</span></div>
           <div class="calc-row"><span class="label">القيد</span><span class="value">${esc(sib.code) || '—'}</span></div>
         </div>`).join('')}` : '';

  const notesHtml = s.notes
    ? `<div class="inner-panel" style="margin-top:10px">
         <div style="color:var(--text-secondary);font-size:.85rem"><i class="fas fa-sticky-note" style="margin-left:6px"></i>${esc(s.notes)}</div>
       </div>` : '';

  openModal(`
    <div class="modal-overlay" style="display:flex">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title"><i class="fas fa-user-graduate" style="margin-left:6px"></i>${esc(s.fullName)}</span>
          <button class="modal-close" data-action="close-modal"><i class="fas fa-times"></i></button>
        </div>
        <div class="inner-panel">
          <div class="info-row"><span class="info-label">القيد</span><span class="info-value"><span class="badge badge-blue">${esc(s.code) || '—'}</span></span></div>
          <div class="info-row"><span class="info-label">الصف</span><span class="info-value">${esc(s.grade)}</span></div>
          <div class="info-row"><span class="info-label">موبايل</span><span class="info-value" dir="ltr">${esc(s.mobile) || '—'}</span></div>
          <div class="info-row"><span class="info-label">تاريخ المباشرة</span><span class="info-value">${s.enrollDate || '—'}</span></div>
          <div class="info-row"><span class="info-label">الحالة الاجتماعية</span><span class="info-value">${esc(s.socialStatus) || '—'}</span></div>
        </div>
        <div class="inner-panel">
          <div class="calc-row"><span class="label">المبلغ الكلي</span><span class="value value-blue">${fmt(s.totalFee)} د.ع</span></div>
          <div class="calc-row"><span class="label">عدد الأقساط المدفوعة</span><span class="value value-blue">${cnt} / 8</span></div>
          <div class="calc-row"><span class="label">المجموع المدفوع</span><span class="value value-green">${fmt(paid)} د.ع</span></div>
          <div class="calc-row"><span class="label">المتبقي</span><span class="value value-red">${fmt(r)} د.ع</span></div>
          <div class="progress-bar-wrap" style="margin-top:10px">
            <div class="progress-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <p class="section-title"><i class="fas fa-coins"></i> سجل الأقساط الثمانية</p>
        <div class="installment-grid">${instGrid}</div>
        ${siblingsHtml}
        ${notesHtml}
      </div>
    </div>`);
  document.getElementById('modal-root').querySelectorAll('[data-action="close-modal"]')
    .forEach(b => b.addEventListener('click', closeModal));
}

function openStudentModal(editId) {
  sfEditId   = editId;
  const s    = editId ? students.find(x => x.id === editId) : null;
  sfSiblings = s ? [...(s.siblings || [])] : [];

  openModal(`
    <div class="modal-overlay" style="display:flex">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">${editId ? 'تعديل بيانات الطالب' : 'تسجيل طالب جديد'}</span>
          <button class="modal-close" data-action="close-modal"><i class="fas fa-times"></i></button>
        </div>
        <form id="student-form">
          <div class="form-row">
            <div class="form-group">
              <label>القيد</label>
              <input type="text" id="sf-code" value="${esc(s?.code || '')}" placeholder="مثال: 165ق2">
            </div>
            <div class="form-group">
              <label>الصف</label>
              <select id="sf-grade"><option value="">اختر الصف</option>${gradeOpts(s?.grade || GRADES[0])}</select>
            </div>
          </div>
          <div class="form-group">
            <label>الاسم الرباعي <span style="color:var(--red-light)">*</span></label>
            <input type="text" id="sf-name" value="${esc(s?.fullName || '')}" placeholder="الاسم الكامل للطالب" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>رقم الموبايل</label>
              <input type="tel" id="sf-mobile" value="${esc(s?.mobile || '')}" placeholder="07xxxxxxxxx" dir="ltr">
            </div>
            <div class="form-group">
              <label>تاريخ المباشرة</label>
              <input type="date" id="sf-enroll" value="${s?.enrollDate || today()}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>المبلغ الكلي (د.ع)</label>
              <input type="number" id="sf-fee" value="${s?.totalFee ?? ''}" placeholder="0" min="0">
            </div>
            <div class="form-group">
              <label>قيمة القسط الواحد</label>
              <input type="number" id="sf-inst-amt" value="${s?.installmentAmount ?? ''}" placeholder="0" min="0">
            </div>
          </div>
          <div class="form-group">
            <label>الحالة الاجتماعية</label>
            <input type="text" id="sf-social" value="${esc(s?.socialStatus || '')}" placeholder="مثال: يتيم / ذوي احتياجات...">
          </div>
          <div class="form-group">
            <label>ملاحظات</label>
            <input type="text" id="sf-notes" value="${esc(s?.notes || '')}" placeholder="أي ملاحظات إضافية...">
          </div>
          <p class="section-title" style="margin-top:18px"><i class="fas fa-users"></i> الإخوة في المدرسة</p>
          <div id="sibling-list"></div>
          <div class="inner-panel" style="margin-bottom:8px">
            <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:10px">إضافة أخ / أخت</div>
            <div class="form-group" style="margin-bottom:8px">
              <input type="text" id="sib-name" placeholder="اسم الأخ / الأخت">
            </div>
            <div class="form-row">
              <div class="form-group" style="margin-bottom:0">
                <select id="sib-grade">${gradeOpts(GRADES[0])}</select>
              </div>
              <div class="form-group" style="margin-bottom:0">
                <input type="text" id="sib-code" placeholder="القيد (اختياري)">
              </div>
            </div>
            <button type="button" class="btn btn-secondary"
              style="margin-top:10px;width:auto;padding:8px 16px" data-action="add-sibling">
              <i class="fas fa-plus"></i> إضافة
            </button>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:8px">
            <i class="fas fa-save"></i> ${editId ? 'حفظ التعديلات' : 'تسجيل الطالب'}
          </button>
          <button type="button" class="btn btn-secondary" data-action="close-modal">إلغاء</button>
        </form>
      </div>
    </div>`);

  const root = document.getElementById('modal-root');
  renderSiblingList();

  root.querySelectorAll('[data-action="close-modal"]').forEach(b => b.addEventListener('click', closeModal));

  root.querySelector('[data-action="add-sibling"]')?.addEventListener('click', () => {
    const name = document.getElementById('sib-name').value.trim();
    if (!name) return;
    sfSiblings.push({
      name,
      grade: document.getElementById('sib-grade').value || GRADES[0],
      code:  document.getElementById('sib-code').value.trim(),
    });
    document.getElementById('sib-name').value = '';
    document.getElementById('sib-code').value = '';
    renderSiblingList();
  });

  root.querySelector('#sibling-list')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="remove-sibling"]');
    if (!btn) return;
    sfSiblings.splice(Number(btn.dataset.idx), 1);
    renderSiblingList();
  });

  root.querySelector('#student-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const fullName = document.getElementById('sf-name').value.trim();
    if (!fullName) return;
    const existing = sfEditId ? students.find(s => s.id === sfEditId) : null;
    const data = {
      id:                sfEditId ?? Date.now(),
      serial:            existing?.serial ?? (students.length + 1),
      code:              document.getElementById('sf-code').value.trim(),
      fullName,
      mobile:            document.getElementById('sf-mobile').value.trim(),
      grade:             document.getElementById('sf-grade').value || GRADES[0],
      totalFee:          parseFloat(document.getElementById('sf-fee').value) || 0,
      installmentAmount: parseFloat(document.getElementById('sf-inst-amt').value) || 0,
      installments:      existing?.installments ?? emptyInst(),
      siblings:          [...sfSiblings],
      notes:             document.getElementById('sf-notes').value.trim(),
      enrollDate:        document.getElementById('sf-enroll').value || today(),
      socialStatus:      document.getElementById('sf-social').value.trim(),
    };
    if (sfEditId) saveStudents(students.map(s => s.id === sfEditId ? data : s));
    else saveStudents([...students, data]);
    closeModal();
    refresh();
  });
}

function renderSiblingList() {
  const div = document.getElementById('sibling-list');
  if (!div) return;
  div.innerHTML = sfSiblings.map((sib, i) => `
    <div class="sibling-item">
      <span class="sib-name">${esc(sib.name)}</span>
      <span class="sib-meta">${esc(sib.grade)}</span>
      ${sib.code ? `<span class="badge badge-blue" style="margin-right:4px">${esc(sib.code)}</span>` : ''}
      <button type="button" class="btn btn-sm btn-delete" style="padding:3px 8px"
        data-action="remove-sibling" data-idx="${i}"><i class="fas fa-times"></i></button>
    </div>`).join('');
}

/* ================================================================
   TAB 2 — RECEIVE PAYMENT
   ================================================================ */
function renderReceiveTab() {
  const rcvStudent = rcvStudentId ? students.find(s => s.id === rcvStudentId) : null;

  let infoHtml = '', gridHtml = '';
  if (rcvStudent) {
    const paid = totalPaid(rcvStudent), r = remAmt(rcvStudent), cnt = paidCount(rcvStudent);
    const pct  = rcvStudent.totalFee > 0 ? Math.min(100,(paid/rcvStudent.totalFee)*100) : 0;
    infoHtml = `
      <div class="inner-panel">
        <div class="calc-row"><span class="label">الاسم</span><span class="value">${esc(rcvStudent.fullName)}</span></div>
        <div class="calc-row"><span class="label">الصف</span><span class="value">${esc(rcvStudent.grade)}</span></div>
        <div class="calc-row"><span class="label">عدد الأقساط المدفوعة</span><span class="value value-blue">${cnt} / 8</span></div>
        <div class="calc-row"><span class="label">إجمالي المدفوع</span><span class="value value-green">${fmt(paid)} د.ع</span></div>
        <div class="calc-row">
          <span class="label">المتبقي</span>
          <span class="value value-red">${r > 0 ? fmt(r)+' د.ع' : '<span class="badge badge-green">مكتمل الدفع</span>'}</span>
        </div>
        ${rcvStudent.totalFee > 0 ? `<div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>` : ''}
      </div>`;
    gridHtml = `
      <div class="installment-grid" style="margin-bottom:14px">
        ${rcvStudent.installments.map((slot,i) => `
          <div class="installment-item${slot?' paid':''}${rcvInstNum===i+1?' active-inst':''}"
            style="${rcvInstNum===i+1?'border:1px solid var(--accent);background:rgba(59,130,246,.1);':''} cursor:pointer"
            data-action="pick-inst" data-num="${i+1}">
            <div class="inst-label">القسط ${i+1} ${rcvInstNum===i+1?'◀':''}</div>
            ${slot
              ? `<div class="inst-amount">${fmt(slot.amount)}</div><div class="inst-date">${slot.date}</div>`
              : `<div class="inst-amount" style="color:var(--text-muted)">—</div>`
            }
          </div>`).join('')}
      </div>`;
  }

  const instOpts = Array.from({length:8}, (_,i) => {
    const slot = rcvStudent?.installments[i];
    return `<option value="${i+1}"${rcvInstNum===i+1?' selected':''}>${'القسط'} ${i+1}${slot?` ✓ (${fmt(slot.amount)})`:''}
    </option>`;
  }).join('');

  const allPay = [];
  students.forEach(s => s.installments.forEach((sl,i) => {
    if (sl) allPay.push({name:s.fullName,grade:s.grade,date:sl.date,amount:sl.amount,num:i+1});
  }));
  allPay.sort((a,b) => b.date.localeCompare(a.date));
  const recentRows = allPay.slice(0,25).map(p => `
    <tr>
      <td data-label="التاريخ">${p.date}</td>
      <td data-label="اسم الطالب" style="font-weight:600">${esc(p.name)}</td>
      <td data-label="الصف" style="color:var(--text-secondary);font-size:.85rem">${esc(p.grade)}</td>
      <td data-label="القسط"><span class="badge badge-blue">#${p.num}</span></td>
      <td data-label="المبلغ" style="color:var(--green-light);font-weight:700">${fmt(p.amount)} د.ع</td>
    </tr>`).join('');

  return `
    <div class="card">
      <div class="card-title"><i class="fas fa-hand-holding-usd"></i> تسجيل دفعة</div>
      <div id="rcv-success" style="display:none;background:var(--green-glow);border:1px solid rgba(16,185,129,.4);
        border-radius:10px;padding:12px 16px;margin-bottom:16px;color:var(--green-light);font-weight:600;font-size:.9rem"></div>
      <form id="rcv-form">
        <div class="form-group">
          <label>بحث عن الطالب (بالاسم أو القيد أو الموبايل)</label>
          <div class="autocomplete-wrapper">
            <input type="text" id="rcv-query" value="${esc(rcvQuery)}" autocomplete="off" placeholder="اكتب اسم أو قيد الطالب...">
            <ul class="autocomplete-list" id="rcv-list" style="display:none"></ul>
          </div>
        </div>
        ${infoHtml}
        <div class="form-row">
          <div class="form-group">
            <label>رقم القسط (1–8)</label>
            <select id="rcv-inst-num">${instOpts}</select>
          </div>
          <div class="form-group">
            <label>تاريخ الدفع</label>
            <input type="date" id="rcv-date" value="${today()}" required>
          </div>
        </div>
        <div class="form-group">
          <label>المبلغ المستلم (د.ع)</label>
          <input type="number" id="rcv-amount" value="${rcvStudent?.installmentAmount||''}" placeholder="0" min="1" required>
        </div>
        ${gridHtml}
        <button type="submit" class="btn btn-primary" id="rcv-submit" ${!rcvStudent?'disabled':''}>
          <i class="fas fa-check"></i> تسجيل القسط ${rcvInstNum}
        </button>
      </form>
    </div>
    <div class="card">
      <div class="card-title"><i class="fas fa-history"></i> آخر الدفعات المسجلة</div>
      ${allPay.length === 0
        ? `<div class="empty-state"><i class="fas fa-inbox"></i><p>لا توجد دفعات مسجلة بعد</p></div>`
        : `<div class="table-wrap"><table>
            <thead><tr><th>التاريخ</th><th>اسم الطالب</th><th>الصف</th><th>القسط</th><th>المبلغ</th></tr></thead>
            <tbody>${recentRows}</tbody></table></div>`
      }
    </div>`;
}

/* ================================================================
   TAB 3 — END OF DAY
   ================================================================ */
function renderEodTab() {
  const dayMap = {};
  students.forEach(s => s.installments.forEach(sl => {
    if (!sl) return;
    dayMap[sl.date] = dayMap[sl.date] || {total:0,count:0};
    dayMap[sl.date].total += sl.amount;
    dayMap[sl.date].count++;
  }));
  const notesMap = {};
  eodRecords.forEach(r => { notesMap[r.date] = r.notes; });
  const days = Object.entries(dayMap)
    .map(([date,d]) => ({date,total:d.total,count:d.count,notes:notesMap[date]||''}))
    .sort((a,b) => b.date.localeCompare(a.date));
  const grand   = days.reduce((s,d) => s+d.total, 0);
  const pending = students.filter(s => s.totalFee > 0 && remAmt(s) > 0);
  const pendAmt = pending.reduce((s,st) => s+remAmt(st), 0);

  const pendRows = pending.map(s => `
    <tr>
      <td data-label="الطالب" style="font-weight:600">${esc(s.fullName)}</td>
      <td data-label="الصف" style="color:var(--text-secondary);font-size:.85rem">${esc(s.grade)}</td>
      <td data-label="الموبايل" style="color:var(--text-secondary);font-size:.82rem;direction:ltr;text-align:left">${esc(s.mobile)||'—'}</td>
      <td data-label="الكلي">${fmt(s.totalFee)}</td>
      <td data-label="المدفوع" style="color:var(--green-light)">${fmt(totalPaid(s))}</td>
      <td data-label="المتبقي" style="color:var(--red-light);font-weight:700">${fmt(remAmt(s))}</td>
    </tr>`).join('');

  const dayRows = days.map(d => `
    <tr>
      <td data-label="التاريخ" style="font-weight:600">${d.date}</td>
      <td data-label="عدد الدفعات"><span class="badge badge-blue">${d.count}</span></td>
      <td data-label="الكلي المستلم" style="color:var(--green-light);font-weight:700">${fmt(d.total)} د.ع</td>
      <td data-label="ملاحظات" style="color:var(--text-secondary);font-size:.85rem">${esc(d.notes)||'—'}</td>
    </tr>`).join('');

  return `
    <div class="card">
      <div class="card-title"><i class="fas fa-exclamation-circle"></i> المبالغ المعلقة</div>
      <div class="stats-grid" style="grid-template-columns:1fr 1fr">
        <div class="stat-card red"><div class="stat-icon"><i class="fas fa-clock"></i></div>
          <div class="stat-label">طلاب مع متبقي</div><div class="stat-value">${pending.length}</div></div>
        <div class="stat-card amber"><div class="stat-icon"><i class="fas fa-coins"></i></div>
          <div class="stat-label">إجمالي المعلق</div><div class="stat-value" style="font-size:1rem">${fmt(pendAmt)}</div></div>
      </div>
      ${pending.length > 0
        ? `<div class="table-wrap" style="margin-top:8px"><table>
            <thead><tr><th>الطالب</th><th>الصف</th><th>الموبايل</th><th>الكلي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
            <tbody>${pendRows}</tbody></table></div>`
        : ''
      }
    </div>
    <div class="card">
      <div class="card-title"><i class="fas fa-sticky-note"></i> إضافة ملاحظة يومية</div>
      <form id="eod-note-form">
        <div class="form-group">
          <label>التاريخ</label>
          <input type="date" id="eod-date" value="${today()}" required>
        </div>
        <div class="form-group">
          <label>الملاحظات</label>
          <input type="text" id="eod-notes" placeholder="ملاحظات نهاية اليوم...">
        </div>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> حفظ الملاحظة</button>
      </form>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="card-title" style="margin:0"><i class="fas fa-calendar-check"></i> ملخص الأيام</div>
        <span class="badge badge-green">${fmt(grand)} د.ع</span>
      </div>
      ${days.length === 0
        ? `<div class="empty-state"><i class="fas fa-calendar"></i><p>لا توجد حركات يومية بعد</p></div>`
        : `<div class="table-wrap"><table>
            <thead><tr><th>التاريخ</th><th>عدد الدفعات</th><th>الكلي المستلم</th><th>ملاحظات</th></tr></thead>
            <tbody>${dayRows}</tbody></table></div>`
      }
    </div>`;
}

/* ================================================================
   TAB 4 — STAFF
   ================================================================ */
function renderStaffTab() {
  return `
    <div class="card">
      <div class="sub-tabs">
        <button class="sub-tab${staffSubTab==='admin'?' active':''}" data-action="subtab-admin">
          <i class="fas fa-user-shield" style="margin-left:6px"></i>الإداريون
        </button>
        <button class="sub-tab${staffSubTab==='teachers'?' active':''}" data-action="subtab-teachers">
          <i class="fas fa-chalkboard-teacher" style="margin-left:6px"></i>المدرسون
        </button>
      </div>
      ${staffSubTab==='admin' ? renderAdminPanel() : renderTeachersPanel()}
    </div>`;
}

function renderAdminPanel() {
  const rows = staff.length === 0
    ? `<div class="empty-state"><i class="fas fa-user-slash"></i><p>لا يوجد موظفون مضافون بعد</p></div>`
    : staff.map(s => {
        const ann  = s.monthlyData.reduce((sum,m) => sum+mTotal(s.baseSalary,m), 0);
        const totB = s.monthlyData.reduce((x,m) => x+(m.bonus||0), 0);
        const totD = s.monthlyData.reduce((x,m) => x+(m.deduction||0), 0);
        const mRows = s.monthlyData.map((m,i) => `
          <tr>
            <td style="font-weight:600;white-space:nowrap">${esc(m.month)}</td>
            <td style="color:var(--text-secondary)">${fmt(s.baseSalary)}</td>
            <td><input type="number" value="${m.bonus||''}" placeholder="0"
              style="width:90px;padding:6px 8px;font-size:.85rem"
              data-action="upd-staff-month" data-sid="${s.id}" data-idx="${i}" data-field="bonus"></td>
            <td><input type="number" value="${m.deduction||''}" placeholder="0"
              style="width:90px;padding:6px 8px;font-size:.85rem"
              data-action="upd-staff-month" data-sid="${s.id}" data-idx="${i}" data-field="deduction"></td>
            <td style="color:var(--green-light);font-weight:700;white-space:nowrap">${fmt(mTotal(s.baseSalary,m))}</td>
          </tr>`).join('');
        return `
          <div class="inner-panel" style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <div>
                <div style="font-weight:700;font-size:1rem">${esc(s.fullName)}</div>
                <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
                  <span class="badge badge-purple">${esc(s.role)}</span>
                  <span class="badge badge-blue">خدمة ${yearsService(s.hireYear)} سنة</span>
                  <span class="badge badge-green">راتب: ${fmt(s.baseSalary)}</span>
                  <span class="badge badge-amber">سنوي: ${fmt(ann)}</span>
                </div>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-sm btn-edit"   data-action="edit-staff"   data-id="${s.id}"><i class="fas fa-pen"></i></button>
                <button class="btn btn-sm btn-delete" data-action="del-staff"    data-id="${s.id}"><i class="fas fa-trash"></i></button>
              </div>
            </div>
            <div class="table-wrap"><table style="min-width:480px">
              <thead><tr><th>الشهر</th><th>الراتب الأساسي</th><th>مكافأة (+)</th><th>خصم (−)</th><th>المجموع</th></tr></thead>
              <tbody>${mRows}
                <tr style="background:rgba(59,130,246,.07)">
                  <td style="font-weight:700;color:var(--accent-light)">السنوي</td>
                  <td style="color:var(--text-secondary)">${fmt(s.baseSalary*s.monthlyData.length)}</td>
                  <td style="color:var(--green-light);font-weight:700">${fmt(totB)}</td>
                  <td style="color:var(--red-light);font-weight:700">${fmt(totD)}</td>
                  <td style="color:var(--green-light);font-weight:700">${fmt(ann)}</td>
                </tr>
              </tbody>
            </table></div>
          </div>`;
      }).join('');
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div class="card-title" style="margin:0"><i class="fas fa-user-shield"></i> الموظفون الإداريون</div>
      <button class="btn btn-sm btn-primary" style="width:auto" data-action="open-add-staff"><i class="fas fa-plus"></i> إضافة</button>
    </div>${rows}`;
}

function renderTeachersPanel() {
  const rows = teachers.length === 0
    ? `<div class="empty-state"><i class="fas fa-chalkboard"></i><p>لا يوجد مدرسون مضافون بعد</p></div>`
    : teachers.map(t => {
        const ann  = t.monthlyData.reduce((sum,m) => sum+mTotal(t.baseSalary,m), 0);
        const totS = t.monthlyData.reduce((x,m) => x+(m.sessions||0), 0);
        const totB = t.monthlyData.reduce((x,m) => x+(m.bonus||0), 0);
        const totD = t.monthlyData.reduce((x,m) => x+(m.deduction||0), 0);
        const mRows = t.monthlyData.map((m,i) => `
          <tr>
            <td style="font-weight:600;white-space:nowrap">${esc(m.month)}</td>
            <td style="color:var(--text-secondary)">${fmt(t.baseSalary)}</td>
            <td><input type="number" value="${m.sessions||''}" placeholder="0"
              style="width:70px;padding:6px 8px;font-size:.85rem"
              data-action="upd-teacher-month" data-tid="${t.id}" data-idx="${i}" data-field="sessions"></td>
            <td><input type="number" value="${m.bonus||''}" placeholder="0"
              style="width:90px;padding:6px 8px;font-size:.85rem"
              data-action="upd-teacher-month" data-tid="${t.id}" data-idx="${i}" data-field="bonus"></td>
            <td><input type="number" value="${m.deduction||''}" placeholder="0"
              style="width:90px;padding:6px 8px;font-size:.85rem"
              data-action="upd-teacher-month" data-tid="${t.id}" data-idx="${i}" data-field="deduction"></td>
            <td style="color:var(--green-light);font-weight:700;white-space:nowrap">${fmt(mTotal(t.baseSalary,m))}</td>
          </tr>`).join('');
        return `
          <div class="inner-panel" style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <div>
                <div style="font-weight:700;font-size:1rem">${esc(t.fullName)}</div>
                <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
                  <span class="badge badge-blue">خدمة ${yearsService(t.hireYear)} سنة</span>
                  <span class="badge badge-green">راتب: ${fmt(t.baseSalary)}</span>
                  <span class="badge badge-amber">سنوي: ${fmt(ann)}</span>
                </div>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-sm btn-edit"   data-action="edit-teacher"  data-id="${t.id}"><i class="fas fa-pen"></i></button>
                <button class="btn btn-sm btn-delete" data-action="del-teacher"   data-id="${t.id}"><i class="fas fa-trash"></i></button>
              </div>
            </div>
            <div class="table-wrap"><table style="min-width:520px">
              <thead><tr><th>الشهر</th><th>الراتب الأساسي</th><th>الحصص</th><th>مكافأة (+)</th><th>خصم (−)</th><th>المجموع</th></tr></thead>
              <tbody>${mRows}
                <tr style="background:rgba(59,130,246,.07)">
                  <td style="font-weight:700;color:var(--accent-light)">السنوي</td>
                  <td style="color:var(--text-secondary)">${fmt(t.baseSalary*t.monthlyData.length)}</td>
                  <td style="color:var(--text-secondary)">${totS}</td>
                  <td style="color:var(--green-light);font-weight:700">${fmt(totB)}</td>
                  <td style="color:var(--red-light);font-weight:700">${fmt(totD)}</td>
                  <td style="color:var(--green-light);font-weight:700">${fmt(ann)}</td>
                </tr>
              </tbody>
            </table></div>
          </div>`;
      }).join('');
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div class="card-title" style="margin:0"><i class="fas fa-chalkboard-teacher"></i> المدرسون</div>
      <button class="btn btn-sm btn-primary" style="width:auto" data-action="open-add-teacher"><i class="fas fa-plus"></i> إضافة</button>
    </div>${rows}`;
}

function openStaffModal(editId) {
  const s = editId ? staff.find(x => x.id === editId) : null;
  openModal(`
    <div class="modal-overlay" style="display:flex"><div class="modal">
      <div class="modal-header">
        <span class="modal-title">${editId?'تعديل موظف':'إضافة موظف إداري'}</span>
        <button class="modal-close" data-action="close-modal"><i class="fas fa-times"></i></button>
      </div>
      <form id="staff-form">
        <div class="form-row">
          <div class="form-group"><label>الوظيفة</label>
            <select id="stf-role">${roleOpts(s?.role||STAFF_ROLES[0])}</select></div>
          <div class="form-group"><label>سنة التعيين</label>
            <input type="number" id="stf-year" value="${s?.hireYear||new Date().getFullYear()}" min="1990" max="2030"></div>
        </div>
        <div class="form-group">
          <label>الاسم الثلاثي <span style="color:var(--red-light)">*</span></label>
          <input type="text" id="stf-name" value="${esc(s?.fullName||'')}" placeholder="الاسم الكامل" required>
        </div>
        <div class="form-group"><label>الراتب الأساسي الشهري (د.ع)</label>
          <input type="number" id="stf-salary" value="${s?.baseSalary||''}" placeholder="0" min="0"></div>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> حفظ</button>
        <button type="button" class="btn btn-secondary" data-action="close-modal">إلغاء</button>
      </form>
    </div></div>`);
  const root = document.getElementById('modal-root');
  root.querySelectorAll('[data-action="close-modal"]').forEach(b => b.addEventListener('click', closeModal));
  root.querySelector('#staff-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('stf-name').value.trim();
    if (!name) return;
    const data = {
      id:          editId ?? Date.now(),
      role:        document.getElementById('stf-role').value,
      fullName:    name,
      hireYear:    parseInt(document.getElementById('stf-year').value) || 2020,
      baseSalary:  parseFloat(document.getElementById('stf-salary').value) || 0,
      monthlyData: editId ? (staff.find(x=>x.id===editId)?.monthlyData ?? makeMonthly()) : makeMonthly(),
    };
    if (editId) saveStaff(staff.map(x => x.id===editId ? data : x));
    else saveStaff([...staff, data]);
    closeModal(); refresh();
  });
}

function openTeacherModal(editId) {
  const t = editId ? teachers.find(x => x.id === editId) : null;
  openModal(`
    <div class="modal-overlay" style="display:flex"><div class="modal">
      <div class="modal-header">
        <span class="modal-title">${editId?'تعديل مدرس':'إضافة مدرس'}</span>
        <button class="modal-close" data-action="close-modal"><i class="fas fa-times"></i></button>
      </div>
      <form id="teacher-form">
        <div class="form-group">
          <label>الاسم الثلاثي <span style="color:var(--red-light)">*</span></label>
          <input type="text" id="tch-name" value="${esc(t?.fullName||'')}" placeholder="اسم المدرس" required>
        </div>
        <div class="form-row">
          <div class="form-group"><label>سنة التعيين</label>
            <input type="number" id="tch-year" value="${t?.hireYear||new Date().getFullYear()}" min="1990" max="2030"></div>
          <div class="form-group"><label>الراتب الأساسي الشهري (د.ع)</label>
            <input type="number" id="tch-salary" value="${t?.baseSalary||''}" placeholder="0" min="0"></div>
        </div>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> حفظ</button>
        <button type="button" class="btn btn-secondary" data-action="close-modal">إلغاء</button>
      </form>
    </div></div>`);
  const root = document.getElementById('modal-root');
  root.querySelectorAll('[data-action="close-modal"]').forEach(b => b.addEventListener('click', closeModal));
  root.querySelector('#teacher-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('tch-name').value.trim();
    if (!name) return;
    const data = {
      id:          editId ?? Date.now(),
      fullName:    name,
      hireYear:    parseInt(document.getElementById('tch-year').value) || 2020,
      baseSalary:  parseFloat(document.getElementById('tch-salary').value) || 0,
      monthlyData: editId ? (teachers.find(x=>x.id===editId)?.monthlyData ?? makeMonthly()) : makeMonthly(),
    };
    if (editId) saveTeachers(teachers.map(x => x.id===editId ? data : x));
    else saveTeachers([...teachers, data]);
    closeModal(); refresh();
  });
}

/* ================================================================
   TAB 5 — EXPENSES
   ================================================================ */
function renderExpensesTab() {
  const isFiltered = expSearch.trim().length > 0;
  const filtered = expenses
    .filter(e => e.description.includes(expSearch) || e.category.includes(expSearch) || e.notes.includes(expSearch))
    .sort((a,b) => b.date.localeCompare(a.date));
  const ledger    = expenses.reduce((s,e) => s+e.total, 0);
  const filtTotal = filtered.reduce((s,e) => s+e.total, 0);

  const rows = filtered.map(exp => `
    <tr>
      <td data-label="التاريخ">${exp.date}</td>
      <td data-label="الوصف" style="font-weight:600;min-width:120px">${esc(exp.description)}</td>
      <td data-label="الفئة"><span class="badge badge-purple">${esc(exp.category)}</span></td>
      <td data-label="الكمية" style="color:var(--text-secondary)">${exp.quantity}</td>
      <td data-label="السعر" style="color:var(--text-secondary)">${fmt(exp.unitPrice)}</td>
      <td data-label="الإجمالي" style="color:var(--red-light);font-weight:700">${fmt(exp.total)}</td>
      <td data-label="">
        <div class="action-btns">
          <button class="btn btn-sm btn-edit"   data-action="edit-expense" data-id="${exp.id}"><i class="fas fa-pen"></i></button>
          <button class="btn btn-sm btn-delete" data-action="del-expense"  data-id="${exp.id}"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="card-title" style="margin:0"><i class="fas fa-receipt"></i> سجل المصاريف</div>
        <button class="btn btn-sm btn-primary" style="width:auto" data-action="open-add-expense"><i class="fas fa-plus"></i> إضافة</button>
      </div>
      <div class="inner-panel" style="margin-bottom:14px">
        <div class="calc-row">
          <span class="label"><i class="fas fa-coins" style="margin-left:6px"></i>إجمالي جميع المصاريف</span>
          <span class="value value-red" style="font-size:1.1rem">${fmt(ledger)} د.ع</span>
        </div>
        ${isFiltered ? `<div class="calc-row">
          <span class="label" style="color:var(--amber-light)"><i class="fas fa-filter" style="margin-left:6px"></i>إجمالي النتائج المعروضة</span>
          <span class="value value-amber">${fmt(filtTotal)} د.ع</span>
        </div>` : ''}
        <div class="calc-row">
          <span class="label">عدد البنود الكلي</span>
          <span class="value" style="color:var(--text-secondary)">${expenses.length}</span>
        </div>
      </div>
      <div class="search-bar">
        <input type="text" id="exp-search" placeholder="بحث في المصاريف بالوصف أو الفئة..." value="${esc(expSearch)}">
      </div>
      ${filtered.length === 0
        ? `<div class="empty-state"><i class="fas fa-folder-open"></i><p>لا توجد مصاريف مسجلة</p></div>`
        : `<div class="table-wrap"><table>
            <thead><tr><th>التاريخ</th><th>الوصف</th><th>الفئة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
            <tbody>${rows}</tbody></table></div>`
      }
    </div>`;
}

function openExpenseModal(editId) {
  const exp = editId ? expenses.find(x => x.id === editId) : null;
  openModal(`
    <div class="modal-overlay" style="display:flex"><div class="modal">
      <div class="modal-header">
        <span class="modal-title">${editId?'تعديل مصروف':'إضافة مصروف جديد'}</span>
        <button class="modal-close" data-action="close-modal"><i class="fas fa-times"></i></button>
      </div>
      <form id="expense-form">
        <div class="form-row">
          <div class="form-group"><label>التاريخ</label>
            <input type="date" id="exp-date" value="${exp?.date||today()}" required></div>
          <div class="form-group"><label>الفئة</label>
            <select id="exp-cat">${catOpts(exp?.category||EXPENSE_CATS[0])}</select></div>
        </div>
        <div class="form-group">
          <label>البيان / الوصف <span style="color:var(--red-light)">*</span></label>
          <input type="text" id="exp-desc" value="${esc(exp?.description||'')}" placeholder="وصف المصروف" required>
        </div>
        <div class="form-row">
          <div class="form-group"><label>العدد / الكمية</label>
            <input type="number" id="exp-qty" value="${exp?.quantity||1}" min="0" step="0.01"></div>
          <div class="form-group"><label>السعر (د.ع)</label>
            <input type="number" id="exp-price" value="${exp?.unitPrice||''}" placeholder="0" min="0"></div>
        </div>
        <div class="inner-panel">
          <div class="calc-row">
            <span class="label">الإجمالي</span>
            <span class="value value-amber" id="exp-total-preview">${fmt((exp?.quantity||1)*(exp?.unitPrice||0))} د.ع</span>
          </div>
        </div>
        <div class="form-group"><label>ملاحظات</label>
          <input type="text" id="exp-notes" value="${esc(exp?.notes||'')}" placeholder="تفاصيل إضافية..."></div>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> حفظ المصروف</button>
        <button type="button" class="btn btn-secondary" data-action="close-modal">إلغاء</button>
      </form>
    </div></div>`);
  const root = document.getElementById('modal-root');
  root.querySelectorAll('[data-action="close-modal"]').forEach(b => b.addEventListener('click', closeModal));
  const updatePreview = () => {
    const qty   = parseFloat(document.getElementById('exp-qty')?.value)   || 0;
    const price = parseFloat(document.getElementById('exp-price')?.value) || 0;
    const el    = document.getElementById('exp-total-preview');
    if (el) el.textContent = fmt(qty * price) + ' د.ع';
  };
  root.querySelector('#exp-qty')?.addEventListener('input',   updatePreview);
  root.querySelector('#exp-price')?.addEventListener('input', updatePreview);
  root.querySelector('#expense-form').addEventListener('submit', e => {
    e.preventDefault();
    const desc = document.getElementById('exp-desc').value.trim();
    if (!desc) return;
    const qty   = parseFloat(document.getElementById('exp-qty').value)   || 1;
    const price = parseFloat(document.getElementById('exp-price').value) || 0;
    const data  = {
      id:          editId ?? Date.now(),
      date:        document.getElementById('exp-date').value,
      description: desc,
      category:    document.getElementById('exp-cat').value,
      quantity: qty, unitPrice: price, total: qty*price,
      notes:       document.getElementById('exp-notes').value.trim(),
    };
    if (editId) saveExpenses(expenses.map(x => x.id===editId ? data : x));
    else saveExpenses([...expenses, data]);
    closeModal(); refresh();
  });
}

/* ================================================================
   TAB 6 — DASHBOARD
   ================================================================ */
function renderDashboardTab() {
  const total    = students.length;
  const fees     = students.reduce((s,st) => s+st.totalFee, 0);
  const coll     = students.reduce((s,st) => s+totalPaid(st), 0);
  const rem_     = fees - coll;
  const full     = students.filter(s => s.totalFee>0 && totalPaid(s)>=s.totalFee).length;
  const rate     = fees > 0 ? Math.round((coll/fees)*100) : 0;
  const adminPay = staff.reduce((s,st)    => s+st.monthlyData.reduce((x,m) => x+mTotal(st.baseSalary,m),0), 0);
  const tchPay   = teachers.reduce((s,t)  => s+t.monthlyData.reduce((x,m)  => x+mTotal(t.baseSalary,m),0),  0);
  const expTotal = expenses.reduce((s,e)  => s+e.total, 0);
  const net      = coll - adminPay - tchPay - expTotal;

  const byGrade = {};
  students.forEach(s => {
    byGrade[s.grade] = byGrade[s.grade] || {count:0,collected:0,remaining:0};
    byGrade[s.grade].count++;
    byGrade[s.grade].collected += totalPaid(s);
    byGrade[s.grade].remaining += remAmt(s);
  });
  const gradeRows = Object.entries(byGrade).sort((a,b)=>a[0].localeCompare(b[0])).map(([g,d]) => `
    <tr>
      <td data-label="الصف" style="font-weight:600">${esc(g)}</td>
      <td data-label="العدد"><span class="badge badge-blue">${d.count}</span></td>
      <td data-label="المحصّل" style="color:var(--green-light);font-weight:600">${fmt(d.collected)}</td>
      <td data-label="المتبقي" style="color:var(--red-light);font-weight:600">${fmt(d.remaining)}</td>
    </tr>`).join('');

  return `
    <div class="card">
      <div class="card-title"><i class="fas fa-chart-pie"></i> الإحصاء العام</div>
      <div class="stats-grid">
        <div class="stat-card blue"><div class="stat-icon"><i class="fas fa-users"></i></div>
          <div class="stat-label">إجمالي الطلاب</div><div class="stat-value">${total}</div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fas fa-check-circle"></i></div>
          <div class="stat-label">مكتملو الدفع</div><div class="stat-value">${full}</div></div>
        <div class="stat-card amber"><div class="stat-icon"><i class="fas fa-percentage"></i></div>
          <div class="stat-label">نسبة التحصيل</div><div class="stat-value">${rate}%</div></div>
        <div class="stat-card red"><div class="stat-icon"><i class="fas fa-clock"></i></div>
          <div class="stat-label">مع متبقي</div><div class="stat-value">${total - full}</div></div>
      </div>
      <div class="progress-bar-wrap" style="margin-bottom:6px">
        <div class="progress-bar-fill" style="width:${rate}%"></div>
      </div>
      <div style="text-align:center;font-size:.82rem;color:var(--text-muted)">${rate}% نسبة التحصيل الكلية</div>
    </div>
    <div class="card">
      <div class="card-title"><i class="fas fa-coins"></i> الملخص المالي</div>
      <div class="inner-panel">
        <div class="calc-row"><span class="label">إجمالي الرسوم المقررة</span><span class="value value-blue">${fmt(fees)} د.ع</span></div>
        <div class="calc-row"><span class="label">إجمالي المحصّل</span><span class="value value-green">${fmt(coll)} د.ع</span></div>
        <div class="calc-row"><span class="label">إجمالي المتبقي</span><span class="value value-red">${fmt(rem_)} د.ع</span></div>
      </div>
      <div class="inner-panel">
        <div class="calc-row"><span class="label">رواتب الإداريين</span><span class="value value-amber">${fmt(adminPay)} د.ع</span></div>
        <div class="calc-row"><span class="label">رواتب المدرسين</span><span class="value value-amber">${fmt(tchPay)} د.ع</span></div>
        <div class="calc-row"><span class="label">إجمالي المصاريف التشغيلية</span><span class="value value-red">${fmt(expTotal)} د.ع</span></div>
      </div>
      <div class="inner-panel" style="border:${net>=0?'1px solid rgba(16,185,129,.4)':'1px solid rgba(239,68,68,.4)'}">
        <div class="calc-row">
          <span class="label" style="font-size:1rem;font-weight:700">الرصيد الصافي</span>
          <span class="value ${net>=0?'value-green':'value-red'}" style="font-size:1.3rem">${fmt(net)} د.ع</span>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><i class="fas fa-layer-group"></i> توزيع الطلاب بالصفوف</div>
      ${Object.keys(byGrade).length === 0
        ? `<div class="empty-state"><i class="fas fa-chart-bar"></i><p>لا توجد بيانات كافية</p></div>`
        : `<div class="table-wrap"><table>
            <thead><tr><th>الصف</th><th>العدد</th><th>المحصّل</th><th>المتبقي</th></tr></thead>
            <tbody>${gradeRows}</tbody></table></div>`
      }
    </div>`;
}

/* ================================================================
   EVENT ATTACHMENT
   ================================================================ */
function attachTabEvents(id, el) {

  if (id === 'tab-students') {
    el.querySelector('#stud-search')?.addEventListener('input', e => { studSearch = e.target.value; refresh(); });
    el.querySelector('#stud-grade')?.addEventListener('change', e => { studGrade  = e.target.value; refresh(); });
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action, bid = Number(btn.dataset.id);
      if      (action === 'open-add-student') openStudentModal(null);
      else if (action === 'view-student')     openStudentDetail(bid);
      else if (action === 'edit-student')     openStudentModal(bid);
      else if (action === 'del-student') {
        if (confirm('هل أنت متأكد من حذف هذا الطالب نهائياً؟')) { saveStudents(students.filter(s => s.id !== bid)); refresh(); }
      }
    });
  }

  else if (id === 'tab-receive') {
    const qInput = el.querySelector('#rcv-query');
    const list   = el.querySelector('#rcv-list');

    qInput?.addEventListener('input', e => {
      rcvQuery = e.target.value;
      const q  = rcvQuery.trim();
      if (!q) { list.style.display = 'none'; return; }
      const hits = students.filter(s =>
        s.fullName.includes(q) || s.code.includes(q) || s.mobile.includes(q)
      ).slice(0,8);
      if (!hits.length) { list.style.display = 'none'; return; }
      list.innerHTML = hits.map(s =>
        `<li data-action="pick-student" data-id="${s.id}">
          <strong>${esc(s.fullName)}</strong>
          <span style="color:var(--text-muted);font-size:.8rem;margin-right:8px">${esc(s.code)} — ${esc(s.grade)}</span>
        </li>`).join('');
      list.style.display = 'block';
    });

    qInput?.addEventListener('blur', () => { setTimeout(() => { if(list) list.style.display='none'; }, 200); });

    list?.addEventListener('mousedown', e => {
      const li = e.target.closest('[data-action="pick-student"]');
      if (!li) return;
      const s = students.find(x => x.id === Number(li.dataset.id));
      if (!s) return;
      rcvStudentId = s.id;
      rcvQuery     = s.fullName;
      const first  = s.installments.findIndex(sl => sl === null);
      rcvInstNum   = first === -1 ? 1 : first + 1;
      list.style.display = 'none';
      refresh();
    });

    el.querySelector('#rcv-inst-num')?.addEventListener('change', e => { rcvInstNum = Number(e.target.value); });

    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="pick-inst"]');
      if (!btn) return;
      rcvInstNum = Number(btn.dataset.num);
      el.querySelectorAll('.installment-item').forEach((item,i) => {
        const sel = (i+1) === rcvInstNum;
        item.style.border     = sel ? '1px solid var(--accent)' : '';
        item.style.background = sel ? 'rgba(59,130,246,.1)' : '';
        item.querySelector('.inst-label').textContent = `القسط ${i+1} ${sel?'◀':''}`;
      });
      const selEl = el.querySelector('#rcv-inst-num');
      if (selEl) selEl.value = rcvInstNum;
      const sub = el.querySelector('#rcv-submit');
      if (sub) sub.innerHTML = `<i class="fas fa-check"></i> تسجيل القسط ${rcvInstNum}`;
    });

    el.querySelector('#rcv-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const s = rcvStudentId ? students.find(x => x.id === rcvStudentId) : null;
      if (!s) { alert('يرجى اختيار الطالب أولاً'); return; }
      const amt = parseFloat(el.querySelector('#rcv-amount').value);
      if (!amt || amt <= 0) { alert('يرجى إدخال مبلغ صحيح'); return; }
      const idx = rcvInstNum - 1;
      if (s.installments[idx] !== null) {
        if (!confirm(`القسط رقم ${rcvInstNum} مسجل مسبقاً بمبلغ ${fmt(s.installments[idx].amount)} د.ع. هل تريد استبداله؟`)) return;
      }
      const newInst = [...s.installments];
      newInst[idx]  = { date: el.querySelector('#rcv-date').value, amount: amt };
      const updated = { ...s, installments: newInst };
      saveStudents(students.map(x => x.id === s.id ? updated : x));
      rcvStudentId = updated.id;
      const sDiv   = el.querySelector('#rcv-success');
      if (sDiv) {
        sDiv.style.display = 'block';
        sDiv.textContent   = `✓ تم تسجيل القسط ${rcvInstNum} بمبلغ ${fmt(amt)} د.ع للطالب ${updated.fullName}`;
        setTimeout(() => { if (sDiv) sDiv.style.display = 'none'; }, 4000);
      }
      const next = newInst.findIndex((sl,i) => i > idx && sl === null);
      rcvInstNum = next === -1 ? rcvInstNum : next + 1;
      refresh();
    });
  }

  else if (id === 'tab-eod') {
    el.querySelector('#eod-note-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const date  = el.querySelector('#eod-date').value;
      const notes = el.querySelector('#eod-notes').value;
      const found = eodRecords.find(r => r.date === date);
      if (found) saveEod(eodRecords.map(r => r.id === found.id ? {...r,notes} : r));
      else saveEod([...eodRecords, {id:Date.now(),date,notes}]);
      el.querySelector('#eod-notes').value = '';
      refresh();
    });
  }

  else if (id === 'tab-staff') {
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action, bid = Number(btn.dataset.id);
      if      (action === 'subtab-admin')     { staffSubTab = 'admin';    refresh(); }
      else if (action === 'subtab-teachers')  { staffSubTab = 'teachers'; refresh(); }
      else if (action === 'open-add-staff')   openStaffModal(null);
      else if (action === 'edit-staff')       openStaffModal(bid);
      else if (action === 'del-staff') {
        if (confirm('حذف هذا الموظف؟')) { saveStaff(staff.filter(x => x.id !== bid)); refresh(); }
      }
      else if (action === 'open-add-teacher') openTeacherModal(null);
      else if (action === 'edit-teacher')     openTeacherModal(bid);
      else if (action === 'del-teacher') {
        if (confirm('حذف هذا المدرس؟')) { saveTeachers(teachers.filter(x => x.id !== bid)); refresh(); }
      }
    });
    el.addEventListener('change', e => {
      const inp = e.target.closest('[data-action="upd-staff-month"]');
      if (inp) {
        const sid = Number(inp.dataset.sid), i = Number(inp.dataset.idx), f = inp.dataset.field;
        saveStaff(staff.map(s => s.id!==sid ? s : {
          ...s, monthlyData: s.monthlyData.map((m,j) => j!==i ? m : {...m,[f]:parseFloat(inp.value)||0})
        }));
        refresh(); return;
      }
      const inp2 = e.target.closest('[data-action="upd-teacher-month"]');
      if (inp2) {
        const tid = Number(inp2.dataset.tid), i = Number(inp2.dataset.idx), f = inp2.dataset.field;
        saveTeachers(teachers.map(t => t.id!==tid ? t : {
          ...t, monthlyData: t.monthlyData.map((m,j) => j!==i ? m : {...m,[f]:parseFloat(inp2.value)||0})
        }));
        refresh();
      }
    });
  }

  else if (id === 'tab-expenses') {
    el.querySelector('#exp-search')?.addEventListener('input', e => { expSearch = e.target.value; refresh(); });
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action, bid = Number(btn.dataset.id);
      if      (action === 'open-add-expense') openExpenseModal(null);
      else if (action === 'edit-expense')     openExpenseModal(bid);
      else if (action === 'del-expense') {
        if (confirm('حذف هذا المصروف؟')) { saveExpenses(expenses.filter(x => x.id !== bid)); refresh(); }
      }
    });
  }
}

/* ================================================================
   INIT
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => setTab(item.dataset.tab));
  });
  renderTab('tab-students');
});
