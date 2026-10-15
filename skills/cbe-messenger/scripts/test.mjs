import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTarget, socketUrl, plain, Messenger } from './messenger.mjs';
import {positive} from './cli.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const target={type:'page',id:'a-b',url:'http://stmsg.cbe.go.kr:7880/ezmaru/pc/main',webSocketDebuggerUrl:'ws://127.0.0.1:9000/devtools/page/a-b'};
test('앱 메인 페이지만 선택하며 중복·다른 호스트는 거절',()=>{
  assert.equal(selectTarget([{...target,url:'about:blank'},target]),target);
  assert.throws(()=>selectTarget([target,target]));
  assert.throws(()=>selectTarget([{...target,url:'http://stmsg.cbe.go.kr.evil:7880/ezmaru/pc/main'}]));
});
test('디버깅 소켓은 같은 로컬 포트와 정확한 페이지 ID로 한정',()=>{
  assert.equal(socketUrl(target,9000),target.webSocketDebuggerUrl);
  for(const url of ['ws://example.com:9000/devtools/page/a-b','ws://127.0.0.1:9001/devtools/page/a-b','ws://127.0.0.1:9000/devtools/page/other','ws://user:pass@127.0.0.1:9000/devtools/page/a-b'])assert.throws(()=>socketUrl({...target,webSocketDebuggerUrl:url},9000));
});
test('서버를 변형하는 임의 API 경로는 호출하지 않음',async()=>{
  await assert.rejects(()=>new Messenger().query('/pc/note/deleteNote',{}),/지원하지/);
});
test('페이지 범위와 숫자 파싱 검증',()=>{
  assert.equal(positive('100','limit',100),100);
  for(const value of ['0','-1','1.5','101','NaN','1e2'])assert.throws(()=>positive(value,'limit',100));
});
test('메시지 HTML 및 엔티티를 실행 없이 텍스트로 변환',()=>{
  assert.equal(plain('<p>안녕 &amp; &lt;동료&gt;</p><div>다음<br>줄 &#x1F600;</div>'),'안녕 & <동료>\n다음\n줄 😀');
  assert.equal(plain('&#99999999;'),'&#99999999;');
});
test('보안 쪽지는 JSON 결과에서도 본문을 숨김',async()=>{
  const c=new Messenger();c.query=async()=>({RESULT:'SUCCESS',LIST:{NTE_SECURITY_YN:'Y',NTE_TITLE:'secret',NTE_CONTENT:'secret',NTE_CONTENT_HTML:'secret',RECEIVE_USER:[],ATTACH_IMAGE:[]}});
  const r=await c.note('id');assert.ok(!JSON.stringify(r).includes('secret'));
});
test('대화방 ID는 마지막 메시지 ID 대신 LCODE 사용',async()=>{
  const c=new Messenger();c.query=async()=>({RESULT:'SUCCESS',LIST_COUNT:-1,LIST:[{LCODE:'room',MCODE:'other',NMC_CODE:'message'}]});
  const r=await c.chats();assert.equal(r.items[0].id,'room');assert.equal(r.total,null);
});
test('쪽지 다음 페이지는 첫 행 날짜를 기준으로 조회',async()=>{
  const c=new Messenger();const calls=[];c.query=async(path,params)=>{calls.push(params);return {RESULT:'SUCCESS',LIST_COUNT:-1,LIST:[{NTE_REGDATE:'20261015090000000'},{NTE_REGDATE:'20261014090000000'}]};};
  const r=await c.notes({page:2,limit:2});assert.equal(calls.length,2);assert.equal(calls[0].pageNo,1);assert.equal(calls[1].offset,'20261015090000000');assert.equal(r.offset,'20261015090000000');
});
test('실제 CLI 진입점에서 도움말·잘못된 인자를 처리',()=>{
  const entry=fileURLToPath(new URL('./cli.mjs',import.meta.url));
  const help=spawnSync(process.execPath,[entry,'--help'],{encoding:'utf8'});
  assert.equal(help.status,0);assert.match(help.stdout,/cbe notes list/);
  const invalid=spawnSync(process.execPath,[entry,'notes','list','--limit','0','--json'],{encoding:'utf8'});
  assert.equal(invalid.status,1);assert.ok(JSON.parse(invalid.stderr).error);
});
test('전송은 수신자와 본문이 있어야 하며 기존 1:1 방으로 한정',async()=>{
  const c=new Messenger();await assert.rejects(()=>c.sendChat('bad','hi'));
  c.user=async()=>[{name:'테스트'}];c.query=async()=>({SCODE:''});
  await assert.rejects(()=>c.sendChat('111111111111111111111111','hi'),/기존 1:1/);
});
test('다른 참여자가 포함된 대화방에는 전송하지 않음',async()=>{
  const c=new Messenger();c.user=async()=>[{name:'테스트'}];c.status=async()=>({userId:'222222222222222222222222'});c.query=async()=>({SCODE:'333333333333333333333333',NMS_TYPE:'C',RUIDS:'111111111111111111111111,444444444444444444444444'});c.evaluate=async()=>{throw Error('must not call transport');};
  await assert.rejects(()=>c.sendChat('111111111111111111111111','hi'),/일치하지/);
});
test('백그라운드 전송은 한번 호출하고 서버의 같은 메시지 ID로 검증',async()=>{
  const c=new Messenger();const uid='111111111111111111111111',own='222222222222222222222222',room='333333333333333333333333',id='444444444444444444444444';
  c.user=async()=>[{name:'테스트'}];c.status=async()=>({userId:own});c.query=async()=>({SCODE:room,NMS_TYPE:'C',RUIDS:uid+','+own});const calls=[];c.evaluate=async expression=>{calls.push(expression);return calls.length===1?id:true;};c.messages=async()=>({items:[{id,senderId:own,text:'hello',date:'20261015'}]});
  const result=await c.sendChat(uid,'hello');assert.equal(result.verified,true);assert.equal(calls.length,2);assert.match(calls[1],/sendMessageChat/);assert.ok(!calls[1].includes('common_popup'));assert.equal(result.messageId,id);
});
test('기본 이름 검색은 내 조직 일치 결과만 반환하고 전체 검색을 생략',async()=>{
  const c=new Messenger();const calls=[];c.query=async(path)=>{calls.push(path);return {WITH_USER_LIST:[{NUR_UUID:'local',NUR_NIC:'홍길동',NCG_FULLNAME:'내학교>행정실'},{NUR_UUID:'local',NUR_NIC:'홍길동',NCG_FULLNAME:'내학교>행정실'},{NUR_UUID:'other',NUR_NIC:'김다른'}]};};
  const r=await c.users('홍길동');assert.deepEqual(calls,['/pc/common/pageInitInfo']);assert.equal(r.scope,'my');assert.equal(r.fallback,false);assert.equal(r.total,1);assert.equal(r.items[0].department,'내학교>행정실');
});
test('내 조직에 이름이 없으면 전체 조직 검색으로 전환하고 후보를 유지',async()=>{
  const c=new Messenger();const calls=[];c.query=async(path,params)=>{calls.push({path,params});return path==='/pc/common/pageInitInfo'?{WITH_USER_LIST:[{NUR_UUID:'local',NUR_NIC:'김다른'}]}:{TOTAL_LIST_COUNT:2,TOTAL_LIST:[{NUR_UUID:'a',NUR_NIC:'홍길동'},{NUR_UUID:'b',NUR_NIC:'홍길동'}]};};
  const r=await c.users('홍길동');assert.equal(calls.length,2);assert.equal(calls[1].path,'/pc/user/newUserSearch');assert.equal(r.scope,'all');assert.equal(r.fallback,true);assert.equal(r.items.length,2);
});
test('전체 조직을 지정하면 내 조직 조회를 생략',async()=>{
  const c=new Messenger();const calls=[];c.query=async(path)=>{calls.push(path);return {TOTAL_LIST_COUNT:1,TOTAL_LIST:[{NUR_UUID:'a',NUR_NIC:'홍길동'}]};};
  const r=await c.users('홍길동',{scope:'all'});assert.deepEqual(calls,['/pc/user/newUserSearch']);assert.equal(r.requestedScope,'all');assert.equal(r.fallback,false);
});
test('내 조직만 지정하거나 내 조직의 다음 페이지가 비어도 전체로 전환하지 않음',async()=>{
  const c=new Messenger();c.query=async(path)=>{assert.equal(path,'/pc/common/pageInitInfo');return {WITH_USER_LIST:[{NUR_UUID:'a',NUR_NIC:'홍길동'}]};};
  const empty=await c.users('없는이름',{scope:'my'});assert.equal(empty.items.length,0);assert.equal(empty.scope,'my');
  const next=await c.users('홍길동',{page:2,limit:1});assert.equal(next.items.length,0);assert.equal(next.total,1);assert.equal(next.scope,'my');assert.equal(next.fallback,false);
});
test('내 조직 조회 실패를 이름 없음으로 오해하지 않음',async()=>{
  const c=new Messenger();let calls=0;c.query=async()=>{calls++;return {};};await assert.rejects(()=>c.users('홍길동'),/내 조직 사용자 목록/);assert.equal(calls,1);
});
