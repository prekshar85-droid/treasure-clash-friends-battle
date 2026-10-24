import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('project includes frontend and multiplayer server entry points',()=>{
  const root=path.resolve(import.meta.dirname,'..');
  assert.ok(fs.existsSync(path.join(root,'src/main.jsx')));
  assert.ok(fs.existsSync(path.join(root,'src/style.css')));
  assert.ok(fs.readFileSync(path.join(root,'server/index.js'),'utf8').includes("new WebSocketServer"));
});
test('server validates player names, rooms, turn actions and match time',()=>{
  const src=fs.readFileSync(path.resolve(import.meta.dirname,'index.js'),'utf8');
  for(const phrase of ['Room not found','already taken','room is full','MATCH_MS','type===\'move\'','type===\'start\'','type===\'rematch\'']) assert.ok(src.includes(phrase),`Missing expected server behavior: ${phrase}`);
});
