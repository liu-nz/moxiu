const assert = require('node:assert/strict');
// Browser tests use the actual shared rules; transport/CAS are simulated here.
exports.gameFixture = async (owned = () => []) => {
  const { initialGame, settleGame } = await import('../src/core/game-engine.js');
  const fixture = { state: initialGame(Date.now()), revision: 1, calls: [], receipts: new Map(), loseNext: false };
  fixture.handle = async route => {
    const intent = route.request().postDataJSON();
    fixture.calls.push(intent);
    assert.deepEqual(Object.keys(intent).sort(), intent.action === 'sync' ? ['action','args'] : ['action','args','request_id','revision']);
    if (fixture.expireOnce && intent.action !== 'sync') {
      fixture.expireOnce = false;
      return route.fulfill({status:401,contentType:'application/json',body:'{"error":"登录已过期"}'});
    }
    let status = 200, result, report;
    const previous = fixture.receipts.get(intent.request_id);
    if (fixture.syncConflictOnce && intent.action === 'sync') {
      fixture.syncConflictOnce = false; status = 409;
    } else if (previous) {
      assert.equal(JSON.stringify([intent.action,intent.args]), previous.signature);
      result = previous.result;
    } else if (intent.action !== 'sync' && intent.revision !== fixture.revision) status = 409;
    else {
      const settled = settleGame(fixture.state,intent.action,intent.args,Math.max(Date.now(),fixture.state.savedAt),owned());
      fixture.state = settled.state; result = settled.result; report = settled.report;
      fixture.revision++;
      if (intent.action !== 'sync') fixture.receipts.set(intent.request_id,{signature:JSON.stringify([intent.action,intent.args]),result});
      if (fixture.loseNext && intent.action !== 'sync') { fixture.loseNext = false; return route.abort(); }
    }
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify({state:fixture.state,revision:fixture.revision,result,report,replayed:!!previous,
      ...(status===409?{error:'另一设备已更新进度',conflict:true}:{})})});
  };
  return fixture;
};
