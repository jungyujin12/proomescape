const SHEET_NAME = '예약목록';
const HEADERS = ['예약번호','날짜','시간','이름','전화번호','학번','학과','학년','개인정보서명','안전서명','상태','접수시각'];
// 접수 시작일 변경 시 홈페이지 app.js의 LAUNCH_CONFIG.bookingOpen도 같은 값으로 수정하세요.
const BOOKING_OPEN_AT = '2026-09-07T10:00:00+09:00';

// 처음 한 번만: 아래 두 값을 입력하고 initialSetup 함수를 실행하세요.
const INITIAL_SPREADSHEET_ID = '여기에_스프레드시트_ID_입력';
const INITIAL_ADMIN_PASSWORD = '여기에_8자_이상_관리자_비밀번호_입력';

function initialSetup() {
  if (INITIAL_SPREADSHEET_ID.indexOf('여기에_') === 0) throw new Error('INITIAL_SPREADSHEET_ID를 입력하세요.');
  if (INITIAL_ADMIN_PASSWORD.indexOf('여기에_') === 0 || INITIAL_ADMIN_PASSWORD.length < 8) throw new Error('8자 이상의 관리자 비밀번호를 입력하세요.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', INITIAL_SPREADSHEET_ID);
  setAdminPassword(INITIAL_ADMIN_PASSWORD);
  setup();
  return '설정 완료';
}

function doGet(e) {
  const action = String((e.parameter && e.parameter.action) || 'availability');
  if (action === 'availability') return json_({ ok: true, reservations: publicAvailability_() });
  return json_({ ok: false, message: '지원하지 않는 요청입니다.' });
}

function doPost(e) {
  try {
    const request = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (request.action === 'create') return json_(createReservation_(request.data));
    if (request.action === 'guestReservations') return json_(guestReservations_(request.phone));
    if (request.action === 'guestCancel') return json_(guestCancel_(request.phone, request.id));
    if (request.action === 'adminLogin') return json_({ ok: verifyAdmin_(request.password) });
    if (!verifyAdmin_(request.password)) return json_({ ok: false, message: '관리자 인증이 필요합니다.' });
    if (request.action === 'adminList') return json_({ ok: true, reservations: adminList_() });
    if (request.action === 'updateReservation') return json_(updateReservation_(request.id, request.data));
    if (request.action === 'updateStatus') return json_(updateStatus_(request.id, request.status));
    if (request.action === 'delete') return json_(deleteReservation_(request.id));
    return json_({ ok: false, message: '지원하지 않는 요청입니다.' });
  } catch (error) {
    return json_({ ok: false, message: error.message || '처리 중 오류가 발생했습니다.' });
  }
}

function setup() {
  const sheet = sheet_();
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#4b2d1b').setFontColor('#fff4d7');
  sheet.autoResizeColumns(1, HEADERS.length);
}

function createReservation_(data) {
  if (new Date().getTime() < new Date(BOOKING_OPEN_AT).getTime()) {
    return { ok: false, code: 'BOOKING_NOT_OPEN', message: '아직 접수 기간이 아닙니다.' };
  }
  validateReservation_(data);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = sheet_();
    const rows = values_(sheet);
    const phoneKey = normalizePhone_(data.phone), studentKey = String(data.studentId || '').trim();
    const duplicateApplicant = rows.some(row => row[10] !== '취소' && (normalizePhone_(row[4]) === phoneKey || String(row[5] || '').trim() === studentKey));
    if (duplicateApplicant) return { ok: false, code: 'DUPLICATE_APPLICANT', message: '이미 신청한 예약이 있습니다. 기존 예약을 확인해 주세요.' };
    const duplicate = rows.some(row => row[1] === data.date && row[2] === data.time && row[10] !== '취소');
    if (duplicate) return { ok: false, code: 'DUPLICATE_SLOT', message: '이미 예약된 시간입니다.' };
    const id = 'MS-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
    sheet.appendRow([id, data.date, data.time, safe_(data.leader), safe_(data.phone), safe_(data.studentId), safe_(data.department), safe_(data.grade), safe_(data.privacySignature), safe_(data.safetySignature), '예약', new Date().toISOString()]);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function publicAvailability_() {
  return values_(sheet_()).filter(row => row[10] !== '취소').map(row => ({ date: row[1], time: row[2], status: row[10] }));
}

function guestReservations_(phone) {
  const normalized = normalizePhone_(phone);
  if (!normalized) throw new Error('올바른 전화번호를 입력해 주세요.');
  const reservations = values_(sheet_())
    .filter(row => normalizePhone_(row[4]) === normalized && row[10] === '예약')
    .map(row => ({ id: row[0], date: row[1], time: row[2], status: row[10] }));
  return { ok: true, reservations: reservations };
}

function guestCancel_(phone, id) {
  const normalized = normalizePhone_(phone);
  if (!normalized || !id) throw new Error('전화번호와 예약 정보가 필요합니다.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = sheet_(), rows = values_(sheet);
    const index = rows.findIndex(row => row[0] === String(id) && normalizePhone_(row[4]) === normalized);
    if (index < 0) return { ok: false, message: '일치하는 예약을 찾을 수 없습니다.' };
    if (rows[index][10] !== '예약') return { ok: false, message: '이미 취소되었거나 취소할 수 없는 예약입니다.' };
    sheet.getRange(index + 2, 11).setValue('취소');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function adminList_() {
  return values_(sheet_()).map(row => ({ id: row[0], date: row[1], time: row[2], leader: row[3], phone: row[4], studentId: row[5], department: row[6], grade: row[7], privacySignature: row[8], safetySignature: row[9], status: row[10], createdAt: row[11] }));
}

function updateStatus_(id, status) {
  if (!['예약','입장','완료','취소'].includes(status)) throw new Error('올바르지 않은 상태입니다.');
  const sheet = sheet_(), rows = values_(sheet), index = rows.findIndex(row => row[0] === id);
  if (index < 0) return { ok: false, message: '예약을 찾을 수 없습니다.' };
  sheet.getRange(index + 2, 11).setValue(status);
  return { ok: true };
}

function updateReservation_(id, data) {
  validateReservation_(Object.assign({}, data, { privacySignature: 'data:image/existing', safetySignature: 'data:image/existing' }));
  if (!['예약','입장','완료','취소'].includes(data.status)) throw new Error('올바르지 않은 상태입니다.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = sheet_(), rows = values_(sheet), index = rows.findIndex(row => row[0] === id);
    if (index < 0) return { ok: false, message: '예약을 찾을 수 없습니다.' };
    const duplicate = rows.some((row, rowIndex) => rowIndex !== index && row[1] === data.date && row[2] === data.time && row[10] !== '취소' && data.status !== '취소');
    if (duplicate) return { ok: false, message: '해당 시간에는 다른 예약이 있습니다.' };
    sheet.getRange(index + 2, 2, 1, 7).setValues([[data.date, data.time, safe_(data.leader), safe_(data.phone), safe_(data.studentId), safe_(data.department), safe_(data.grade)]]);
    sheet.getRange(index + 2, 11).setValue(data.status);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function deleteReservation_(id) {
  const sheet = sheet_(), rows = values_(sheet), index = rows.findIndex(row => row[0] === id);
  if (index < 0) return { ok: false, message: '예약을 찾을 수 없습니다.' };
  sheet.deleteRow(index + 2);
  return { ok: true };
}

function validateReservation_(data) {
  if (!data || !data.leader || !/^010-\d{4}-\d{4}$/.test(data.phone || '')) throw new Error('이름과 올바른 전화번호가 필요합니다.');
  if (!String(data.studentId || '').trim() || !String(data.department || '').trim() || !String(data.grade || '').trim()) throw new Error('재학생의 학번, 학과, 학년은 모두 필수입니다.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || '') || !/^\d{2}:\d{2}$/.test(data.time || '')) throw new Error('예약 일시가 올바르지 않습니다.');
  if (!String(data.privacySignature || '').startsWith('data:image/') || !String(data.safetySignature || '').startsWith('data:image/')) throw new Error('두 개의 동의 서명이 필요합니다.');
  if (String(data.privacySignature).length > 48000 || String(data.safetySignature).length > 48000) throw new Error('서명 데이터가 너무 큽니다. 다시 서명해 주세요.');
}

function verifyAdmin_(password) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD_HASH');
  return !!expected && hash_(String(password || '')) === expected;
}

function setAdminPassword(password) {
  if (!password || String(password).length < 8) throw new Error('관리자 비밀번호는 8자 이상이어야 합니다.');
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD_HASH', hash_(String(password)));
}

function hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(byte => ('0' + ((byte < 0 ? byte + 256 : byte).toString(16))).slice(-2)).join('');
}

function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID가 설정되지 않았습니다.');
  const file = SpreadsheetApp.openById(id);
  return file.getSheetByName(SHEET_NAME) || file.insertSheet(SHEET_NAME);
}
function values_(sheet) { const last = sheet.getLastRow(); return last < 2 ? [] : sheet.getRange(2, 1, last - 1, HEADERS.length).getDisplayValues(); }
function safe_(value) { return String(value == null ? '' : value).slice(0, 48000); }
function normalizePhone_(value) { const digits = String(value || '').replace(/\D/g, ''); return /^010\d{8}$/.test(digits) ? digits : ''; }
function json_(body) { return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON); }
