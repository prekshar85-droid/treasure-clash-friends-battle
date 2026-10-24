import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
const PORT = Number(process.env.PORT || 3001);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const rooms = new Map();
const COLORS = ['#ff6b6b','#55d6be','#ffd166','#8b7cff'];
const W = 9, H = 7, MATCH_MS = 5 * 60 * 1000;
const rand = n => crypto.randomInt(n);
const code = () => { let s=''; const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for(let i=0;i<5;i++) s+=chars[rand(chars.length)]; return s; };
const key = () => crypto.randomUUID();
function makeBoard(){
  const cells=[]; const blocked=new Set(['4,0','4,1','4,5','4,6','1,3','7,3']);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const k=`${x},${y}`; let type='empty';
    if(blocked.has(k)) type='rock';
    else if((x===0&&y===0)||(x===8&&y===0)||(x===0&&y===6)||(x===8&&y===6)) type='empty';
    else {const r=Math.random(); if(r<.11)type='coin'; else if(r<.15)type='gem'; else if(r<.18)type='chest'; else if(r<.205)type='power';}
    cells.push({x,y,type});
  }
  return cells;
}
function publicRoom(room){return {code:room.code,players:[...room.players.values()].map(p=>({id:p.id,name:p.name,color:p.color,x:p.x,y:p.y,score:p.score,connected:p.connected,bonus:p.bonus||''})),board:room.board,phase:room.phase,turn:room.turn,turnMoves:room.turnMoves,remainingMs:room.phase==='playing'?Math.max(0,room.endsAt-Date.now()):MATCH_MS,hostId:room.hostId,feed:room.feed.slice(-5),winner:room.winner};}
function send(ws,obj){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function broadcast(room){const state=publicRoom(room);for(const p of room.players.values()) if(p.ws)send(p.ws,{type:'state',state});}
function note(room,msg){room.feed.push({id:key(),text:msg,at:Date.now()});room.feed=room.feed.slice(-12);}
function nextConnected(room,from){const list=[...room.players.values()];if(!list.length)return null;for(let i=1;i<=list.length;i++){const p=list[(from+i)%list.length];if(p.connected)return p.id;}return null;}
function finish(room){if(room.phase==='finished')return;room.phase='finished';const max=Math.max(0,...[...room.players.values()].map(p=>p.score));room.winner=[...room.players.values()].filter(p=>p.score===max).map(p=>p.id);note(room,room.winner.length>1?'It is a tie! What a battle!':`${room.players.get(room.winner[0])?.name||'A player'} wins the clash!`);broadcast(room);}
function start(room){if(room.players.size<2) return false;room.phase='playing';room.endsAt=Date.now()+MATCH_MS;room.turn=[...room.players.keys()][0];room.turnMoves=3;room.winner=[];room.board=makeBoard();for(const p of room.players.values()){p.score=0;p.x=p.startX;p.y=p.startY;p.bonus='';}note(room,'The treasure hunt is on! Find the gems.');broadcast(room);return true;}
function err(ws,message){send(ws,{type:'error',message});}
function validName(n){return typeof n==='string'&&n.trim().length>=2&&n.trim().length<=16&&!/[<>\n\r]/.test(n);}
function handle(ws,msg){
 if(!msg||typeof msg!=='object')return err(ws,'That request did not look right.');
 if(msg.type==='create'){
  if(!validName(msg.name))return err(ws,'Choose a name between 2 and 16 characters.');
  let roomCode;do{roomCode=code();}while(rooms.has(roomCode));
  const room={code:roomCode,players:new Map(),board:makeBoard(),phase:'lobby',turn:null,turnMoves:3,hostId:null,feed:[],winner:[],endsAt:0};rooms.set(roomCode,room);joinRoom(ws,room,msg.name);return;
 }
 if(msg.type==='join'){
  const c=String(msg.code||'').trim().toUpperCase();const room=rooms.get(c);
  if(!room)return err(ws,'Room not found. Check the 5-character code and try again.');
  return joinRoom(ws,room,msg.name);
 }
 const p=ws.player,room=ws.room;if(!p||!room)return err(ws,'Join a room before playing.');
 if(msg.type==='start'){
  if(p.id!==room.hostId)return err(ws,'Only the room host can start the match.');
  if(room.phase!=='lobby')return err(ws,'This match has already started.');
  if(room.players.size<2)return err(ws,'Invite at least one friend first.');start(room);return;
 }
 if(msg.type==='move'){
  if(room.phase!=='playing')return err(ws,'The match is not running.');if(room.turn!==p.id)return err(ws,'It is not your turn yet.');if(room.turnMoves<=0)return err(ws,'End your turn to let the next player play.');
  const dx=Number(msg.dx),dy=Number(msg.dy);if(!Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)+Math.abs(dy)!==1)return err(ws,'Choose one adjacent tile.');
  const x=p.x+dx,y=p.y+dy;if(x<0||x>=W||y<0||y>=H)return err(ws,'The edge of the island is right there!');
  if(room.board.some(c=>c.x===x&&c.y===y&&c.type==='rock'))return err(ws,'A rocky obstacle blocks that path.');
  if([...room.players.values()].some(q=>q.id!==p.id&&q.x===x&&q.y===y))return err(ws,'Another explorer is standing there.');
  p.x=x;p.y=y;room.turnMoves--;
  const tile=room.board.find(c=>c.x===x&&c.y===y);if(tile&&tile.type!=='empty'&&tile.type!=='rock'){
   if(tile.type==='coin'){p.score+=10;note(room,`${p.name} found 10 gold coins!`);}
   if(tile.type==='gem'){p.score+=25;note(room,`${p.name} discovered a rare gem (+25)!`);}
   if(tile.type==='chest'){const prize=[10,20,30,40][rand(4)];p.score+=prize;note(room,`${p.name} opened a mystery chest (+${prize})!`);}
   if(tile.type==='power'){p.bonus='Lucky boots';p.score+=5;room.turnMoves=Math.min(4,room.turnMoves+1);note(room,`${p.name} found lucky boots (+5 and an extra move)!`);}
   tile.type='empty';
  }
  if(room.turnMoves===0){room.turn=nextConnected(room,[...room.players.keys()].indexOf(p.id));room.turnMoves=3;}
  broadcast(room);return;
 }
 if(msg.type==='endTurn'){
  if(room.phase!=='playing'||room.turn!==p.id)return err(ws,'It is not your turn.');room.turn=nextConnected(room,[...room.players.keys()].indexOf(p.id));room.turnMoves=3;note(room,`${p.name} ended their turn.`);broadcast(room);return;
 }
 if(msg.type==='rematch'){
  if(room.phase!=='finished')return err(ws,'Finish this match before starting another.');if(p.id!==room.hostId)return err(ws,'Ask the host to start the rematch.');start(room);return;
 }
 if(msg.type==='leave'){removePlayer(ws);return;}
 err(ws,'Unknown game action.');
}
function joinRoom(ws,room,name){
 if(!validName(name))return err(ws,'Choose a name between 2 and 16 characters.');const clean=name.trim();
 if(room.phase!=='lobby')return err(ws,'This match is already in progress. Join a lobby or ask for a rematch.');
 if(room.players.size>=4)return err(ws,'This room is full (4 players maximum).');
 if([...room.players.values()].some(p=>p.name.toLowerCase()===clean.toLowerCase()))return err(ws,'That name is already taken in this room. Try another.');
 const id=key(),idx=room.players.size,starts=[[0,0],[8,0],[0,6],[8,6]],[x,y]=starts[idx];
 const p={id,name:clean,color:COLORS[idx],x,y,startX:x,startY:y,score:0,connected:true,ws,bonus:''};room.players.set(id,p);ws.player=p;ws.room=room;if(!room.hostId)room.hostId=id;
 note(room,`${clean} joined the island.`);send(ws,{type:'joined',playerId:id,code:room.code});broadcast(room);
}
function removePlayer(ws){const p=ws.player,room=ws.room;if(!p||!room)return;room.players.delete(p.id);note(room,`${p.name} left the room.`);if(room.hostId===p.id)room.hostId=room.players.keys().next().value||null;if(room.turn===p.id) {room.turn=nextConnected(room,-1);room.turnMoves=3;}ws.player=null;ws.room=null;if(room.players.size===0)rooms.delete(room.code);else broadcast(room);}
server.on('upgrade',(req,socket,head)=>{if(req.url?.split('?')[0]!=='/ws'){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
wss.on('connection',ws=>{ws.on('message',raw=>{try{handle(ws,JSON.parse(raw.toString()));}catch{err(ws,'Something went wrong. Please try again.');}});ws.on('close',()=>{const p=ws.player,room=ws.room;if(!p||!room)return;p.connected=false;p.ws=null;note(room,`${p.name} disconnected. They can rejoin by refreshing while the lobby is open.`);if(room.turn===p.id){room.turn=nextConnected(room,[...room.players.keys()].indexOf(p.id));room.turnMoves=3;}broadcast(room);setTimeout(()=>{if(room.players.get(p.id)===p&&!p.connected){room.players.delete(p.id);if(room.hostId===p.id)room.hostId=room.players.keys().next().value||null;if(room.players.size===0)rooms.delete(room.code);else broadcast(room);}},45000);});});
setInterval(()=>{for(const room of rooms.values()){if(room.phase==='playing'&&Date.now()>=room.endsAt)finish(room);}},500);
app.get('/health',(_,res)=>res.json({ok:true,service:'treasure-clash',rooms:rooms.size}));
app.use(express.static(DIST));app.get(/.*/,(req,res,next)=>{if(req.path.startsWith('/ws'))return next();res.sendFile(path.join(DIST,'index.html'),e=>{if(e)res.status(503).send('Frontend is not built yet. Run npm run build.');});});
server.listen(PORT,'0.0.0.0',()=>console.log(`Treasure Clash server listening on ${PORT}`));
