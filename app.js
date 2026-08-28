window.SHEETS_API_URL='https://script.google.com/macros/s/AKfycbzbbq3Re39qpntFatw1qPGcnhVT4c-9No8B4W37GqEPCnsDazQCGiLvYb1Kg3H9Igb0/exec';
if(!window.SheetsDB){const endpoint=()=>window.SHEETS_API_URL;const request=async body=>{const response=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow'}),result=await response.json();if(!result.ok)throw new Error(result.message||'요청을 처리하지 못했습니다.');return result};window.SheetsDB={isConfigured:()=>!!endpoint(),availability:async()=>{const response=await fetch(`${endpoint()}?action=availability`,{redirect:'follow'}),result=await response.json();if(!result.ok)throw new Error(result.message);return result.reservations||[]},create:data=>request({action:'create',data}),adminLogin:password=>request({action:'adminLogin',password}),adminList:password=>request({action:'adminList',password}),updateStatus:(password,id,status)=>request({action:'updateStatus',password,id,status}),delete:(password,id)=>request({action:'delete',password,id})}}
const STORAGE_KEY='mystery-school-reservations-v2';
// 일정 변경 시 아래 두 값만 한국시간(+09:00) 형식으로 수정하세요.
const LAUNCH_CONFIG={
  countdownStart:'2026-08-28T00:00:00+09:00',
  bookingOpen:'2026-09-07T10:00:00+09:00',
  eventWeekStart:'2026-09-14'
};
if(!SheetsDB.updateReservation)SheetsDB.updateReservation=async(password,id,data)=>{const response=await fetch(window.SHEETS_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'updateReservation',password,id,data}),redirect:'follow'}),result=await response.json();if(!result.ok)throw new Error(result.message||'수정하지 못했습니다.');return result};
const ADMIN_PIN='1234'; // 온라인 연결 전 로컬 미리보기 전용
const OPERATING_HOURS={1:['13:00','17:00'],2:['09:00','17:00'],3:['09:00','17:00'],4:['09:00','17:00'],5:['09:00','12:00']};
const SLOT_INTERVAL=15;
let selectedTime='',selectedDate='',activeFilter='all',selectedAdminDate='all',adminPassword='',reservationCache=[];
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const getReservations=()=>window.SheetsDB&&SheetsDB.isConfigured()?reservationCache:JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
const saveReservations=items=>{reservationCache=items;if(!window.SheetsDB||!SheetsDB.isConfigured())localStorage.setItem(STORAGE_KEY,JSON.stringify(items))};
const escapeHtml=value=>String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function getLaunchPhase(now=Date.now()){
  const countdownStart=new Date(LAUNCH_CONFIG.countdownStart).getTime(),bookingOpen=new Date(LAUNCH_CONFIG.bookingOpen).getTime();
  if(now>=bookingOpen)return'open';
  if(now>=countdownStart)return'countdown';
  return'waiting';
}
function formatKstDate(iso){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso))}
function openStaffEntrance(){document.body.classList.remove('launch-locked');$('#launchGate').hidden=true;switchView('admin')}
function renderLaunchGate(){
  if(location.hash==='#staff'){openStaffEntrance();return}
  const phase=getLaunchPhase();
  if(phase==='open'){document.body.classList.remove('launch-locked');$('#launchGate').hidden=true;return}
  document.body.classList.add('launch-locked');$('#launchGate').hidden=false;
  $('#launchDate').textContent=`접수 시작 · ${formatKstDate(LAUNCH_CONFIG.bookingOpen)}`;
  if(phase==='waiting'){$('#launchTitle').textContent='잠긴 교실은 아직 공개되지 않았습니다';$('#launchMessage').textContent=`카운트다운은 ${formatKstDate(LAUNCH_CONFIG.countdownStart)}부터 시작됩니다.`;$('#countdown').hidden=true;return}
  $('#launchTitle').textContent='미래직업 찾기 방탈출 접수가 곧 열립니다';$('#launchMessage').textContent='접수 시작까지 남은 시간';$('#countdown').hidden=false;
  const left=Math.max(0,new Date(LAUNCH_CONFIG.bookingOpen).getTime()-Date.now()),day=86400000,hour=3600000,minute=60000;
  $('#countDays').textContent=String(Math.floor(left/day)).padStart(2,'0');
  $('#countHours').textContent=String(Math.floor(left%day/hour)).padStart(2,'0');
  $('#countMinutes').textContent=String(Math.floor(left%hour/minute)).padStart(2,'0');
  $('#countSeconds').textContent=String(Math.floor(left%minute/1000)).padStart(2,'0');
}
function initLaunchGate(){renderLaunchGate();setInterval(renderLaunchGate,1000);window.addEventListener('hashchange',renderLaunchGate)}

function switchView(view){$$('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$$('.view').forEach(s=>s.classList.remove('active'));$(`#${view}View`).classList.add('active');if(view==='admin'&&sessionStorage.getItem('mystery-admin')==='yes')showDashboard()}
function getEventWeek(){const monday=new Date(`${LAUNCH_CONFIG.eventWeekStart}T12:00:00`);return Array.from({length:5},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d})}
function dateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function formatDate(key,short=false){const d=new Date(`${key}T00:00:00`),days=['일','월','화','수','목','금','토'];return short?`${d.getMonth()+1}/${d.getDate()} (${days[d.getDay()]})`:`${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`}
function createTimes(start,end){const min=v=>{const[h,m]=v.split(':').map(Number);return h*60+m},out=[];for(let n=min(start);n+10<=min(end);n+=SLOT_INTERVAL)out.push(`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`);return out}
function renderDateSlots(){const dates=getEventWeek();if(!selectedDate)selectedDate=dateKey(dates[0]);$('#dateSlots').innerHTML=dates.map(d=>{const key=dateKey(d),day=['일','월','화','수','목','금','토'][d.getDay()];return `<button type="button" class="date-slot${selectedDate===key?' selected':''}" data-date="${key}">${day}요일<small>${d.getMonth()+1}.${d.getDate()}</small></button>`}).join('')}
function renderTimeSlots(){if(!selectedDate)return;const weekday=new Date(`${selectedDate}T00:00:00`).getDay(),[start,end]=OPERATING_HOURS[weekday],times=createTimes(start,end);const reserved=new Set(getReservations().filter(r=>r.status!=='취소'&&r.date===selectedDate).map(r=>r.time));$('#timeGuide').textContent=`${start}–${end} · 15분 간격`;$('#timeSlots').innerHTML=times.map(time=>`<button type="button" class="time-slot${selectedTime===time?' selected':''}" data-time="${time}" ${reserved.has(time)?'disabled':''}>${time}</button>`).join('')}
function normalizePhone(value){const d=value.replace(/\D/g,'').slice(0,11);if(d.length<4)return d;if(d.length<8)return`${d.slice(0,3)}-${d.slice(3)}`;return`${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`}

async function findGuestReservations(phone){
  if(window.SheetsDB&&SheetsDB.isConfigured())return (await SheetsDB.guestReservations(phone)).reservations||[];
  const digits=phone.replace(/\D/g,'');
  return getReservations().filter(r=>(r.phone||'').replace(/\D/g,'')===digits&&r.status==='예약').map(r=>({id:r.id,date:r.date,time:r.time,status:r.status}));
}
function renderCancelResults(items){
  $('#cancelResults').innerHTML=items.length?items.map(r=>`<article class="cancel-item"><p><strong>${formatDate(r.date)} ${escapeHtml(r.time)}</strong>예약번호 ${escapeHtml(r.id)}</p><button type="button" data-guest-cancel="${escapeHtml(r.id)}">예약 취소</button></article>`).join(''):'<p class="cancel-empty">취소 가능한 예약이 없습니다.</p>';
}
async function lookupGuestReservations(){
  const phone=$('#cancelPhone').value,error=$('#cancelError');error.textContent='';
  if(!/^010-\d{4}-\d{4}$/.test(phone)){error.textContent='010-0000-0000 형식으로 입력해 주세요.';$('#cancelResults').innerHTML='';return}
  const button=$('#guestCancelForm button');button.disabled=true;button.textContent='확인 중...';
  try{renderCancelResults(await findGuestReservations(phone))}catch(err){error.textContent=err.message||'예약을 확인하지 못했습니다.';$('#cancelResults').innerHTML=''}finally{button.disabled=false;button.textContent='내 예약 확인'}
}

const signatures={};
function setupSignature(id){const canvas=$(`#${id}`),ctx=canvas.getContext('2d');let drawing=false,hasInk=false;
  function resize(){const ratio=window.devicePixelRatio||1,rect=canvas.getBoundingClientRect(),saved=hasInk?canvas.toDataURL():null;canvas.width=rect.width*ratio;canvas.height=rect.height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.lineWidth=2;ctx.lineCap='round';ctx.strokeStyle='#171613';if(saved){const image=new Image();image.onload=()=>ctx.drawImage(image,0,0,rect.width,rect.height);image.src=saved}}
  function point(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
  canvas.addEventListener('pointerdown',e=>{drawing=true;canvas.setPointerCapture(e.pointerId);const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y)});
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();hasInk=true;canvas.closest('.consent-box').classList.add('consent-valid')});
  canvas.addEventListener('pointerup',()=>drawing=false);canvas.addEventListener('pointercancel',()=>drawing=false);
  signatures[id]={hasInk:()=>hasInk,clear:()=>{ctx.clearRect(0,0,canvas.width,canvas.height);hasInk=false;canvas.closest('.consent-box').classList.remove('consent-valid')},data:()=>canvas.toDataURL('image/png')};resize();window.addEventListener('resize',resize)
}

async function submitBooking(event){event.preventDefault();const form=event.currentTarget,error=$('#formError'),submit=form.querySelector('button[type="submit"]');if(!form.checkValidity()){error.textContent='필수 정보를 모두 입력해 주세요.';form.reportValidity();return}if(!selectedTime){error.textContent='희망 시간을 선택해 주세요.';return}if(!signatures.privacySignature.hasInk()||!signatures.safetySignature.hasInk()){error.textContent='개인정보 동의와 안전수칙 동의란에 각각 서명해 주세요.';return}const items=getReservations(),phoneKey=$('#phone').value.replace(/\D/g,''),studentKey=$('#studentId').value.trim();if(items.some(r=>r.status!=='취소'&&((r.phone||'').replace(/\D/g,'')===phoneKey||(r.studentId||'').trim()===studentKey))){error.textContent='이미 신청한 예약이 있습니다. 기존 예약을 확인해 주세요.';return}if(items.some(r=>r.date===selectedDate&&r.time===selectedTime&&r.status!=='취소')){error.textContent='방금 선택한 시간이 마감되었습니다. 다른 시간을 골라 주세요.';renderTimeSlots();return}const item={id:`MS-${Date.now().toString().slice(-6)}`,leader:$('#leaderName').value.trim(),phone:$('#phone').value,studentId:$('#studentId').value.trim(),department:$('#department').value.trim(),grade:$('#grade').value,date:selectedDate,time:selectedTime,privacySignature:signatures.privacySignature.data(),safetySignature:signatures.safetySignature.data(),status:'예약',createdAt:new Date().toISOString()};submit.disabled=true;submit.firstElementChild.textContent='접수 중...';try{if(window.SheetsDB&&SheetsDB.isConfigured()){const result=await SheetsDB.create(item);item.id=result.id;reservationCache.push(item)}else{items.push(item);saveReservations(items)}$('#successDetail').innerHTML=`<strong>${escapeHtml(item.leader)}</strong> 님의 <strong>${formatDate(item.date)} ${item.time}</strong> 예약이 접수되었습니다.<br>예약 시간 5분 전까지 와주세요.`;$('#reservationCode').textContent=`예약번호 ${item.id}`;$('#successModal').hidden=false;form.reset();Object.values(signatures).forEach(s=>s.clear());selectedTime='';error.textContent='';renderTimeSlots()}catch(err){error.textContent=err.message;await refreshAvailability()}finally{submit.disabled=false;submit.firstElementChild.textContent='도전 신청하기'}}
function showDashboard(){$('#adminLogin').hidden=true;$('#dashboard').hidden=false;const now=new Date();$('#todayText').textContent=`${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 · 실시간 예약 관리`;const dates=getEventWeek();$('#adminDateFilter').innerHTML='<option value="all">전체 날짜</option>'+dates.map(d=>`<option value="${dateKey(d)}">${formatDate(dateKey(d))}</option>`).join('');$('#adminDateFilter').value=selectedAdminDate;renderDashboard()}
function renderDashboard(){const items=getReservations(),query=$('#searchInput').value.trim().toLowerCase();const filtered=items.filter(r=>(selectedAdminDate==='all'||r.date===selectedAdminDate)&&(activeFilter==='all'||r.status===activeFilter)&&(!query||r.leader.toLowerCase().includes(query)||(r.studentId||'').toLowerCase().includes(query)||(r.department||'').toLowerCase().includes(query)||(r.phone||'').includes(query))).sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));$('#totalStat').textContent=items.length;$('#waitingStat').textContent=items.filter(r=>r.status==='예약').length;$('#doneStat').textContent=items.filter(r=>r.status==='완료').length;$('#peopleStat').textContent=items.length;$('#resultSummary').textContent=`조건에 맞는 예약 ${filtered.length}건`;$('#reservationRows').innerHTML=filtered.map(r=>{const student=[r.studentId,r.department,r.grade].filter(Boolean).map(escapeHtml).join(' · ')||'학생 정보 미입력';return `<tr><td><strong>${formatDate(r.date,true)} ${r.time}</strong></td><td class="team-cell"><strong>${escapeHtml(r.leader)}</strong><small>${r.id}</small></td><td>${student}</td><td>${escapeHtml(r.phone)}</td><td><button class="view-signatures" data-signatures="${r.id}">서명 보기</button></td><td><select class="status-select" data-status="${r.status}" data-id="${r.id}" aria-label="${escapeHtml(r.leader)} 상태"><option ${r.status==='예약'?'selected':''}>예약</option><option ${r.status==='입장'?'selected':''}>입장</option><option ${r.status==='완료'?'selected':''}>완료</option><option ${r.status==='취소'?'selected':''}>취소</option></select></td><td><button class="delete-btn" data-delete="${r.id}">삭제</button></td></tr>`}).join('');$('#emptyState').hidden=filtered.length>0}

$$('.mode-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));$('#timeSlots').addEventListener('click',e=>{const b=e.target.closest('.time-slot');if(!b)return;selectedTime=b.dataset.time;renderTimeSlots()});$('#dateSlots').addEventListener('click',e=>{const b=e.target.closest('.date-slot');if(!b)return;selectedDate=b.dataset.date;selectedTime='';renderDateSlots();renderTimeSlots()});$('#phone').addEventListener('input',e=>e.target.value=normalizePhone(e.target.value));$('#bookingForm').addEventListener('submit',submitBooking);$('#closeModal').addEventListener('click',()=>$('#successModal').hidden=true);$('#successModal').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.hidden=true});$('#loginForm').addEventListener('submit',e=>{e.preventDefault();if($('#pinInput').value===ADMIN_PIN){sessionStorage.setItem('mystery-admin','yes');$('#loginError').textContent='';showDashboard()}else $('#loginError').textContent='PIN이 올바르지 않습니다.'});$('#logoutBtn').addEventListener('click',()=>{sessionStorage.removeItem('mystery-admin');$('#dashboard').hidden=true;$('#adminLogin').hidden=false;$('#pinInput').value=''});$$('.filter').forEach(b=>b.addEventListener('click',()=>{activeFilter=b.dataset.filter;$$('.filter').forEach(x=>x.classList.toggle('active',x===b));renderDashboard()}));$('#searchInput').addEventListener('input',renderDashboard);$('#reservationRows').addEventListener('change',e=>{if(!e.target.matches('.status-select'))return;const items=getReservations(),target=items.find(r=>r.id===e.target.dataset.id);if(target){target.status=e.target.value;saveReservations(items);renderDashboard();renderTimeSlots()}});$('#reservationRows').addEventListener('click',e=>{const id=e.target.dataset.delete;if(id&&confirm('이 예약을 삭제할까요?')){saveReservations(getReservations().filter(r=>r.id!==id));renderDashboard();renderTimeSlots()}});$$('.clear-sign').forEach(b=>b.addEventListener('click',()=>signatures[b.dataset.clear].clear()));
$('#reservationRows').addEventListener('click',e=>{const id=e.target.dataset.signatures;if(!id)return;const item=getReservations().find(r=>r.id===id);if(!item)return;$('#privacySignatureImage').src=item.privacySignature||'';$('#safetySignatureImage').src=item.safetySignature||'';$('#signatureModal').hidden=false});
$('#closeSignatureModal').addEventListener('click',()=>$('#signatureModal').hidden=true);
$('#signatureModal').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.hidden=true});
function exportReservations(){const items=getReservations().filter(r=>(selectedAdminDate==='all'||r.date===selectedAdminDate)&&(activeFilter==='all'||r.status===activeFilter));if(!items.length){alert('내려받을 예약이 없습니다.');return}const header=['예약번호','날짜','시간','이름','전화번호','학번','학과','학년','상태','접수시각'];const rows=items.map(r=>[r.id,r.date,r.time,r.leader,r.phone,r.studentId||'',r.department||'',r.grade||'',r.status,r.createdAt]);const csv='\uFEFF'+[header,...rows].map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`방탈출_예약명단_${selectedAdminDate==='all'?'전체':selectedAdminDate}.csv`;link.click();URL.revokeObjectURL(url)}
$('#adminDateFilter').addEventListener('change',e=>{selectedAdminDate=e.target.value;renderDashboard()});
$('#exportCsvBtn').addEventListener('click',exportReservations);
async function refreshAvailability(){if(!window.SheetsDB||!SheetsDB.isConfigured())return;try{reservationCache=await SheetsDB.availability();renderTimeSlots()}catch(error){$('#formError').textContent='예약 현황을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.'}}
async function loadAdminReservations(){if(!SheetsDB.isConfigured())return;const result=await SheetsDB.adminList(adminPassword);reservationCache=result.reservations;renderDashboard();renderTimeSlots()}
$('#loginForm').addEventListener('submit',async e=>{if(!SheetsDB.isConfigured())return;e.preventDefault();e.stopImmediatePropagation();const button=e.currentTarget.querySelector('button');adminPassword=$('#pinInput').value;button.disabled=true;$('#loginError').textContent='';try{await SheetsDB.adminLogin(adminPassword);sessionStorage.setItem('mystery-admin','yes');showDashboard();await loadAdminReservations()}catch(error){sessionStorage.removeItem('mystery-admin');$('#loginError').textContent=error.message||'관리자 인증에 실패했습니다.'}finally{button.disabled=false}},true);
$('#reservationRows').addEventListener('change',async e=>{if(!SheetsDB.isConfigured()||!e.target.matches('.status-select'))return;e.stopImmediatePropagation();const previous=getReservations().find(r=>r.id===e.target.dataset.id)?.status;e.target.disabled=true;try{await SheetsDB.updateStatus(adminPassword,e.target.dataset.id,e.target.value);await loadAdminReservations()}catch(error){alert(error.message);e.target.value=previous||'예약'}finally{e.target.disabled=false}},true);
$('#reservationRows').addEventListener('click',async e=>{if(!SheetsDB.isConfigured()||!e.target.dataset.delete)return;e.stopImmediatePropagation();if(!confirm('이 예약을 삭제할까요?'))return;try{await SheetsDB.delete(adminPassword,e.target.dataset.delete);await loadAdminReservations()}catch(error){alert(error.message)}},true);
function decorateAdminRows(){document.querySelectorAll('#reservationRows tr').forEach(row=>{const del=row.querySelector('[data-delete]');if(!del||row.querySelector('.edit-btn'))return;const wrap=document.createElement('div');wrap.className='row-actions';const edit=document.createElement('button');edit.type='button';edit.className='edit-btn';edit.dataset.edit=del.dataset.delete;edit.textContent='수정';del.parentNode.insertBefore(wrap,del);wrap.append(edit,del)})}
new MutationObserver(decorateAdminRows).observe($('#reservationRows'),{childList:true});
function updateEditTimes(selected=''){const date=$('#editDate').value,weekday=new Date(`${date}T00:00:00`).getDay(),hours=OPERATING_HOURS[weekday];if(!hours)return;$('#editTime').innerHTML=createTimes(hours[0],hours[1]).map(time=>`<option ${time===selected?'selected':''}>${time}</option>`).join('')}
function openEditModal(id){const item=getReservations().find(r=>r.id===id);if(!item)return;$('#editId').value=item.id;$('#editLeader').value=item.leader;$('#editPhone').value=item.phone;$('#editStudentId').value=item.studentId||'';$('#editDepartment').value=item.department||'';$('#editGrade').value=item.grade||'';$('#editStatus').value=item.status;$('#editDate').innerHTML=getEventWeek().map(d=>`<option value="${dateKey(d)}" ${dateKey(d)===item.date?'selected':''}>${formatDate(dateKey(d))}</option>`).join('');updateEditTimes(item.time);$('#editError').textContent='';$('#editModal').hidden=false}
$('#reservationRows').addEventListener('click',e=>{const id=e.target.dataset.edit;if(id)openEditModal(id)});
$('#editDate').addEventListener('change',()=>updateEditTimes());
$('#editPhone').addEventListener('input',e=>e.target.value=normalizePhone(e.target.value));
$('#cancelEdit').addEventListener('click',()=>$('#editModal').hidden=true);
$('#editModal').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.hidden=true});
$('#editForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('[type="submit"]'),id=$('#editId').value,data={leader:$('#editLeader').value.trim(),phone:$('#editPhone').value,studentId:$('#editStudentId').value.trim(),department:$('#editDepartment').value.trim(),grade:$('#editGrade').value,date:$('#editDate').value,time:$('#editTime').value,status:$('#editStatus').value};button.disabled=true;$('#editError').textContent='';try{if(SheetsDB.isConfigured()){await SheetsDB.updateReservation(adminPassword,id,data);await loadAdminReservations()}else{const items=getReservations(),index=items.findIndex(r=>r.id===id);if(items.some((r,i)=>i!==index&&r.date===data.date&&r.time===data.time&&r.status!=='취소'&&data.status!=='취소'))throw new Error('해당 시간에는 다른 예약이 있습니다.');items[index]={...items[index],...data};saveReservations(items);renderDashboard();renderTimeSlots()}$('#editModal').hidden=true}catch(error){$('#editError').textContent=error.message}finally{button.disabled=false}});
$('#cancelPhone').addEventListener('input',e=>e.target.value=normalizePhone(e.target.value));
$('#guestCancelForm').addEventListener('submit',e=>{e.preventDefault();lookupGuestReservations()});
$('#cancelResults').addEventListener('click',async e=>{
  const button=e.target.closest('[data-guest-cancel]');if(!button)return;
  if(!confirm('이 예약을 취소할까요?'))return;
  button.disabled=true;$('#cancelError').textContent='';
  try{
    const phone=$('#cancelPhone').value;
    if(window.SheetsDB&&SheetsDB.isConfigured())await SheetsDB.guestCancel(phone,button.dataset.guestCancel);
    else{const items=getReservations(),item=items.find(r=>r.id===button.dataset.guestCancel&&(r.phone||'').replace(/\D/g,'')===phone.replace(/\D/g,''));if(!item||item.status!=='예약')throw new Error('취소할 수 있는 예약을 찾지 못했습니다.');item.status='취소';saveReservations(items)}
    await refreshAvailability();await lookupGuestReservations();alert('예약이 취소되었습니다.');
  }catch(err){$('#cancelError').textContent=err.message||'예약을 취소하지 못했습니다.';button.disabled=false}
});
initLaunchGate();
if(window.SheetsDB&&SheetsDB.isConfigured())sessionStorage.removeItem('mystery-admin');
setupSignature('privacySignature');setupSignature('safetySignature');renderDateSlots();renderTimeSlots();refreshAvailability();
