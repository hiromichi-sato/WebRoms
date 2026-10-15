import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
test('Windows launcher serves a bounded NOAA ETOPO request', {skip: process.platform!=='win32'||process.env.LIVE_ETOPO!=='1', timeout:90000},async()=>{
  const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/windows-launcher/start-webroms.ps1','-NoBrowser','-Port','5198'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';
  try {
    const url=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(output||'Launcher timeout')),30000);
      child.stdout.on('data',chunk=>{output+=chunk;const match=/WebROMS: (http:\/\/127\.0\.0\.1:\d+)\//.exec(output); if(match){clearTimeout(timer);resolve(match[1]);}});
      child.stderr.on('data',chunk=>{output+=chunk;}); child.once('exit',()=>{clearTimeout(timer);reject(new Error(output));}); child.once('error',reject);
    });
    const response=await fetch(url+'/__webroms_etopo?y0=21600&y1=21601&x0=60000&x1=60001&stride=1');
    assert.equal(response.status,200,await response.clone().text()); assert.equal((await response.json()).table.rows.length,4);
    assert.equal((await fetch(url+'/__webroms_etopo?url=http://localhost')).status,502);
  } finally { child.kill(); }
});
