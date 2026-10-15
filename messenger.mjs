import { randomUUID } from 'node:crypto';

const ORIGIN = 'http://stmsg.cbe.go.kr:7880';
const MAIN_PATH = '/ezmaru/pc/main';
const READ_ROUTES = new Set([
  '/pc/note/noteList', '/note/noteList', '/pc/note/noteDetail',
  '/pc/message/sessionlist', '/pc/message/newchatlist',
  '/pc/user/newUserSearch', '/pc/user/getUserInfo', '/pc/memo/list', '/message/chatlist1vs1', '/pc/common/pageInitInfo',
]);

export function selectTarget(targets) {
  const matches = targets.filter(t => {
    try { const u = new URL(t.url); return t.type === 'page' && u.origin === ORIGIN && u.pathname === MAIN_PATH; }
    catch { return false; }
  });
  if (matches.length !== 1) throw new Error(`충북소통메신저 메인 화면이 ${matches.length}개입니다. 앱을 열고 로그인해 주세요.`);
  return matches[0];
}

export function socketUrl(target, port) {
  const u = new URL(target.webSocketDebuggerUrl);
  if (u.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
      || Number(u.port) !== port || u.username || u.password || u.search || u.hash
      || u.pathname !== `/devtools/page/${target.id}`) throw new Error('예상과 다른 메신저 디버깅 주소입니다.');
  u.hostname = '127.0.0.1';
  return u.href;
}

export class Messenger {
  static async connect(port = 9000) {
    let response;
    try { response = await fetch(`http://127.0.0.1:${port}/json`, {redirect:'error', signal:AbortSignal.timeout(5000)}); }
    catch { throw new Error(`메신저 연결 실패 (127.0.0.1:${port}). 충북소통메신저를 실행하고 로그인해 주세요.`); }
    if (!response.ok) throw new Error('메신저 디버깅 응답을 읽을 수 없습니다.');
    const targets = await response.json();
    if (!Array.isArray(targets)) throw new Error('메신저 디버깅 목록 형식이 달라졌습니다.');
    const target = selectTarget(targets);
    const client = new Messenger();
    client.target = target;
    client.pending = new Map();
    client.nextId = 0;
    client.ws = new WebSocket(socketUrl(target, port));
    client.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const pending = client.pending.get(message.id);
      if (!pending) return;
      client.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`메신저 디버깅 오류: ${message.error.message}`));
      else pending.resolve(message.result);
    });
    client.ws.addEventListener('close', () => client.rejectPending());
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('메신저 연결 시간 초과.')), 5000);
        client.ws.addEventListener('open', () => {clearTimeout(timer); resolve();}, {once:true});
        client.ws.addEventListener('error', () => {clearTimeout(timer); reject(new Error('메신저 연결이 끊겼습니다.'));}, {once:true});
      });
      const ready = await client.evaluate(`typeof EZAjax === 'function' && typeof common_activityData !== 'undefined' && !!common_activityData.getData('nurUuid')`);
      if (!ready) throw new Error('메신저 로그인이 완료되지 않았거나 앱 구조가 달라졌습니다.');
      return client;
    } catch (error) {client.close(); throw error;}
  }

  rejectPending() {
    for (const p of this.pending.values()) {clearTimeout(p.timer); p.reject(new Error('메신저 연결이 종료되었습니다.'));}
    this.pending.clear();
  }
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {reject(new Error('메신저 연결이 닫혔습니다.')); return;}
      const id = ++this.nextId;
      const timer = setTimeout(() => {this.pending.delete(id); reject(new Error(`메신저 응답 시간 초과: ${method}`));}, 15000);
      this.pending.set(id, {resolve,reject,timer});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  async evaluate(expression) {
    const r = await this.call('Runtime.evaluate', {expression,returnByValue:true});
    if (r.exceptionDetails || r.result?.subtype === 'error' || r.wasThrown) throw new Error('메신저 내부 함수 실행에 실패했습니다. 앱 버전 또는 로그인 상태를 확인해 주세요.');
    return r.result?.value;
  }
  close() {this.rejectPending(); this.ws.close();}

  async status() {
    return JSON.parse(await this.evaluate(`JSON.stringify({app:'충북소통메신저',connected:true,userId:common_activityData.getData('nurUuid'),name:common_activityData.getData('nurNic')||'',product:$('input[name=PRODUCT_NAME]').val(),page:location.href})`));
  }

  async query(path, params) {
    if (!READ_ROUTES.has(path)) throw new Error('지원하지 않는 조회 경로입니다.');
    const key = '__cbeCli_' + randomUUID().replaceAll('-', '');
    // Older CEF does not support awaitPromise. Poll an isolated callback result.
    await this.evaluate(`(function(){var k=${JSON.stringify(key)};window[k]={done:false};function finish(v){if(window[k])window[k]=v;}EZAjax({url:$('input[name=ContextRoot]').val()+${JSON.stringify(path)},async:true,data:${JSON.stringify(params)},type:'post',dataType:'json',cache:false,success:function(data){finish({done:true,data:data});},error:function(r,s){finish({done:true,error:'HTTP '+r.status+' '+s});},complete:function(){}});return true;})()`);
    try {
      const deadline = Date.now()+25000;
      while (Date.now()<deadline) {
        const state = JSON.parse(await this.evaluate(`JSON.stringify(window[${JSON.stringify(key)}])`));
        if (state.done) {
          if (state.error) throw new Error(state.error);
          if (!state.data || state.data.RESULT !== 'SUCCESS') throw new Error(`메신저 조회 실패: ${state.data?.RESULT || '응답 형식 변경'}`);
          return state.data;
        }
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error('조회 시간이 초과되었습니다. 조회 명령을 다시 실행해 주세요.');
    } finally {
      await this.evaluate(`delete window[${JSON.stringify(key)}]`).catch(()=>{});
    }
  }

  async notes({box='ALL',page=1,limit=30,search='',searchType='send',offset='0'}={}) {
    const path=search?'/note/noteList':'/pc/note/noteList';
    const params={mode:box,pageNo:page,pageSize:limit,searchValue:search,searchType,offset,listTempCode:randomUUID()};
    // The app anchors later pages to the FIRST row's date from page 1.
    if(page>1&&offset==='0'){
      const first=await this.query(path,{...params,pageNo:1});
      if(!first.LIST.length)return {page,limit,total:knownCount(first.LIST_COUNT),offset:null,items:[]};
      params.offset=first.LIST[0].NTE_REGDATE;
    }
    const d=await this.query(path,params);
    return {page,limit,total:knownCount(d.LIST_COUNT),offset:page===1?(d.LIST[0]?.NTE_REGDATE||null):params.offset,items:d.LIST.map(noteSummary)};
  }
  async note(id,type='R',reserved=false) {
    const d=await this.query('/pc/note/noteDetail',{nteCode:id,nteReservYn:reserved?'Y':'N',activeWindow:'false',noteType:type});
    const n=d.LIST;
    const hidden=n.NTE_SECURITY_YN==='Y'||n.NTE_WITHDRAW_YN==='Y';
    return {...noteSummary(n),text:hidden?'[보안 또는 회수된 쪽지: 앱에서 확인]':plain(n.NTE_CONTENT||n.NTE_CONTENT_HTML),recipients:(Array.isArray(n.RECEIVE_USER)?n.RECEIVE_USER:[]).map(u=>({id:u.NUR_UUID||u.NRU_UID,name:u.NUR_NIC||u.NRU_NIC||''})),files:hidden?[]:(n.ATTACH_IMAGE||[]).map(f=>({name:f.NNF_ORI_NAME,size:f.NNF_FILE_SIZE,valid:f.VALID_YN})),readDate:n.NRU_READ_DATE||null};
  }
  async chats({page=1,limit=30,search='',box='ALL',offset='0'}={}) {
    const d=await this.query('/pc/message/sessionlist',{pageNo:page,pageSize:limit,searchValue:search,searchType:'nic',nelStatus:box,offset});
    return {page,limit,total:knownCount(d.LIST_COUNT),items:d.LIST.map(r=>({id:r.LCODE,lastMessageId:r.NMC_CODE,title:plain(r.NMU_CHAT_NAME||r.CHAT_TITLE||r.NIC),participants:r.CHAT_USER_COUNT,date:r.REGDATE,preview:plain(r.CONTENTS),type:r.NMS_TYPE,offset:r.NMU_OFFSET}))};
  }
  async messages(id,{page=1,limit=30,offset=0}={}) {
    const params={pageNo:page,pageSize:limit,scode:id,ruids:'',mode:'',offset,contentsLength:500,type:'new',newMessageClick:false};
    const flags=JSON.parse(await this.evaluate(`JSON.stringify({v:$('input[name=CHATDETAIL_LIST]').val(),r:$('input[name=VER_CHAT_READ_HERE]').val()})`));
    if(flags.v==='1')params.ver='1';if(flags.r==='1')params.readVer='1';
    const d=await this.query('/pc/message/newchatlist',params);
    return {id,page,limit,title:plain(d.CHAT_INFO?.TITLE),items:d.LIST.map(m=>({id:m.NMC_CODE,number:m.NMC_NO,sender:m.NUR_NIC,senderId:m.NUR_UUID,date:m.NMC_REGDATE,type:m.NMC_CTYPE,text:(m.NMC_WITHDRAW_FLAG==='Y'||m.DELETE_YN==='Y')?'[삭제 또는 회수된 메시지]':plain(m.NMC_CONTENT),attachment:m.MAF_ORI_NAME?{name:m.MAF_ORI_NAME,size:m.MAF_FILE_SIZE}:null}))};
  }
  async users(search,{page=1,limit=30,scope='auto'}={}) {
    if(!['auto','my','all'].includes(scope))throw new Error('검색 범위는 auto, my, all 중 하나입니다.');
    if(scope!=='all'){
      const own=await this.query('/pc/common/pageInitInfo',{});
      if(!Array.isArray(own.WITH_USER_LIST))throw new Error('내 조직 사용자 목록을 확인할 수 없습니다. 전체 조직 검색으로 임의 전환하지 않았습니다.');
      const needle=search.trim().toLocaleLowerCase();
      const matches=[...new Map(own.WITH_USER_LIST.filter(u=>plain(u.NUR_NIC).toLocaleLowerCase().includes(needle)).map(u=>[u.NUR_UUID,u])).values()];
      if(matches.length||scope==='my')return {page,limit,total:matches.length,scope:'my',requestedScope:scope,fallback:false,items:matches.slice((page-1)*limit,page*limit).map(userSummary)};
    }
    const d=await this.query('/pc/user/newUserSearch',{searchType:'nic',searchValue:search,type:'mainUserSearch',pageNo:page,pageSize:limit});
    return {page,limit,total:knownCount(d.TOTAL_LIST_COUNT),scope:'all',requestedScope:scope,fallback:scope==='auto',items:(d.TOTAL_LIST||[]).map(userSummary)};
  }
  async user(id) {
    const d=await this.query('/pc/user/getUserInfo',{nurSuid:id});
    const rows=Array.isArray(d.LIST)?d.LIST:[d.LIST];
    if(!rows[0])throw new Error('사용자 정보가 없습니다.');
    return rows.map(userSummary);
  }
  async memos({page=1,limit=30,search=''}={}) {
    const d=await this.query('/pc/memo/list',{pageNo:page,pageSize:limit,searchValue:search,searchType:'contents',nelStatus:'ALL',offset:'0'});
    return {page,limit,total:knownCount(d.LIST_COUNT),items:d.LIST.map(m=>({id:m.MCODE||m.NMC_CODE,title:plain(m.CHAT_TITLE||m.TITLE||''),text:plain(m.CONTENTS||m.NMC_CONTENT||''),date:m.REGDATE||m.NMC_REGDATE}))};
  }
  async open(kind,id,type='R',reserved=false) {
    const arg=JSON.stringify(id);
    const calls={main:`pcFuncBringToFront('EZMARU')`,note:`common_popup.viewNote(${JSON.stringify(type)},${arg},${reserved?"'B'":"'ALL'"})`,chat:`common_popup.chat(${arg},'','','')`,profile:`common_popup.viewProfile(${arg},'your')`};
    if(!(kind in calls))throw new Error('지원하지 않는 열기 명령입니다.');
    await this.evaluate(`(function(){${calls[kind]};return true;})()`);
    return {opened:kind,id:id||null};
  }
  async compose(uid) {
    await this.evaluate(`(function(){common_popup.writeNote('favorite',${JSON.stringify(uid)});return true;})()`);
    return {opened:'note-composer',recipientId:uid,sent:false};
  }
  async sendChat(uid,text) {
    if(!/^[a-f0-9]{24}$/i.test(uid)||typeof text!=='string'||!text.trim())throw new Error('수신자 ID와 빈칸이 아닌 본문이 필요합니다.');
    const recipient=(await this.user(uid))[0];
    const direct=await this.query('/message/chatlist1vs1',{ruids:uid});
    if(!/^[a-f0-9]{24}$/i.test(direct.SCODE||''))throw new Error('기존 1:1 대화방이 없습니다. 백그라운드 전송은 기존 대화방만 지원합니다.');
    const room=direct.SCODE;
    const status=await this.status();
    const members=String(direct.RUIDS||'').split(',').filter(Boolean).sort();
    if(direct.NMS_TYPE!=='C'||members.length!==2||members.join(',')!==[uid,status.userId].sort().join(','))throw new Error('1:1 대화방 수신자 정보가 일치하지 않습니다. 전송하지 않았습니다.');
    const id=await this.evaluate(`new ObjectId().toString()`);
    const key='__cbeCliSend_'+id;
    const result=await this.evaluate(`(function(){var k=${JSON.stringify(key)};if(window[k])throw Error('already submitted');if(common_activityData.getData('subStatus')==='FAKEOFF')throw Error('offline');if(!realtimeConect_activityData.getData('XDMSocket'))throw Error('socket disconnected');if(common_activityData.getData('nurUuid')!==${JSON.stringify(status.userId)})throw Error('account changed');window[k]={submitted:true};var data={TYPE:'chat',ACTION:'SEND',INVITEID:'',RUIDS:${JSON.stringify(uid+','+status.userId)},NMC_SCODE:${JSON.stringify(room)},NMC_CODE:${JSON.stringify(id)},NMC_MCODE:'',NMC_REGDATE:common_controller.getTodayString(),NMC_CONTENT:${JSON.stringify(text)},NMC_CTYPE:'M',NUR_NIC:common_activityData.getData('nurNic'),NUR_UUID:common_activityData.getData('nurUuid'),NUR_THUMB_PIC:$('input[name=userImg]').val()||'',MAF_FILEURL:'',MAF_FILETHUMBURL:'',NMS_TYPE:'C',WINDOWNAME:'chat:'+${JSON.stringify(room)},NMS_TITLE:'',NMC_FONTCOLOR:'',NMC_FONTSIZE:''};var queued=realtimeConect_view.sendMessageChat(data);window[k].queued=queued;return queued===true;})()`);
    if(!result)throw new Error(`전송 접수 여부가 불확실합니다. 자동 재전송하지 않았습니다. 메시지 ID: ${id}`);
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){
      let history;
      try{history=await this.messages(room,{limit:30});}
      catch{throw new Error(`전송 요청 후 서버 기록 조회에 실패했습니다. 자동 재전송하지 않았습니다. 메시지 ID: ${id}`);}
      const found=history.items.find(m=>m.id===id&&m.senderId===status.userId&&m.text===text);
      if(found)return {sent:true,verified:true,recipient:{id:uid,name:recipient.name},room,messageId:id,date:found.date,text,background:true};
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    throw new Error(`전송 요청은 접수했지만 서버 기록을 아직 확인하지 못했습니다. 자동 재전송하지 않았습니다. 메시지 ID: ${id}`);
  }
}

function knownCount(value){return Number.isFinite(value)&&value>=0?value:null;}
// Convert markup without executing HTML or fetching embedded resources.
export function plain(value='') {
  return String(value??'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:p|div|li)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|[0-9]+);/gi,s=>{
    const entities={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
    if(entities[s.toLowerCase()]!==undefined)return entities[s.toLowerCase()];
    const n=s.toLowerCase().startsWith('&#x')?parseInt(s.slice(3,-1),16):parseInt(s.slice(2,-1),10);
    return Number.isInteger(n)&&n>=0&&n<=0x10ffff?String.fromCodePoint(n):s;
  }).replace(/\r\n/g,'\n').trim();
}
function noteSummary(n){
  const hidden=n.NTE_SECURITY_YN==='Y'||n.NTE_WITHDRAW_YN==='Y';
  return {id:n.NTE_CODE,type:n.NRU_TYPE,title:hidden?'[보안 또는 회수된 쪽지]':plain(n.NTE_TITLE||n.NTE_CONTENT).split('\n')[0],sender:n.NUR_NIC,recipient:n.RNIC,date:n.NTE_REGDATE,read:n.READ_YN?n.READ_YN==='Y':!!n.NRU_READ_DATE,reserved:n.NTE_RESERV_YN==='Y',secure:n.NTE_SECURITY_YN==='Y',withdrawn:n.NTE_WITHDRAW_YN==='Y',attachments:n.FILE_CNT??null,preview:hidden?'':plain(n.NTE_CONTENT).slice(0,180)};
}
function userSummary(u){return {id:u.NUR_UUID,name:u.NUR_NIC,department:u.GROUP_FULL_NAME||u.NCG_FULLNAME||u.CGG_NAME||u.PART_NAME||u.NCG_NAME||'',position:u.POSITION_NAME||u.NUR_GRADE||'',job:u.EXT_JOB||u.NUR_JOB||'',status:u.NUR_STATUS||'',phone:u.NUR_PHONE_OPENYN==='N'?null:(u.EXT_OFFICEPHONE||u.NUR_PHONE||''),email:u.NUR_EMAIL_OPENYN==='N'?null:(u.NUR_EMAIL||'')};}
