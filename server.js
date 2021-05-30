const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const cors = require('cors');
const path = require("path");



const io = require("socket.io")(server, {

    pingInterval: 10000,

//     cors: {
//       origin: '*',
//     },

  });

let rooms = [];

class VideoPlayer {
    constructor(
        status = "paused",
        currentTime = 0,
        url = "https://nobar.jeremia.co/vid/%20%E3%80%90%E6%9D%B1%E6%96%B9Vocal%E3%80%91%E3%81%A8%E3%81%B3%E3%81%A0%E3%81%9B%EF%BC%81%E3%83%90%E3%83%B3%E3%82%AD%E3%83%83%E3%82%AD%20%E3%80%8CShibayanRecords%E3%80%8D.mp4",
        startTime = 0,
        pausedTime=0,
        offsetTime=0,
    ){
        this.status = status;
        this.currentTime = currentTime;
        this.url = url;
        this.startTime=startTime;
        this.pausedTime=pausedTime;
        this.offsetTime=offsetTime;
    }
}

class Room{
    constructor(
        roomid = makeid(10),
        videoplayer = new VideoPlayer(),
        users = [],
        refreshIntervalID,
        broadcastIntervalID
        ){ 
            this.roomid = roomid;
            this.videoplayer = videoplayer;
            this.users = users;
            this.refreshIntervalID = refreshIntervalID;
            this.broadcastIntervalID = broadcastIntervalID;
        }
}

class Message {
    constructor(
      type = "info",
      user,
      message = "",
      timestamp = new Date().getTime() + (new Date().getTimezoneOffset() * 60 * 1000),
    ) {
      this.type = type;
      this.user = user;
      this.message = message;
      this.timestamp = timestamp;
    }
  }
  

//app.use(cors())

app.use(express.static(path.join(__dirname, "..", "build")));
app.use(express.static("build"));

app.get('/join',(req,res) =>{
  return res.redirect('/')
});

app.get('/ping', (req, res) => {
  return res.send("pong");
});


io.on('connection', (socket) => {
  let addedUser = false;
  console.log("Incoming connection...")

  socket.on('setUsername', ({name}, cb) => {
    if(addedUser) return;
    if( !name ) return;
    
    addedUser = true;
    socket.username = name;

    console.log(`USER ${socket.id} choose username :"${name}"`);
  });

  socket.on('joinRoom', ({room},cb) => {
    if( !socket.username ) return;
    if( !room ) return;
    if (!rooms[room]){

      rooms[room] = new Room();

      rooms[room].refreshIntervalID = setInterval(()=>{
        updatePlayerTime(room)
        // console.log("[SET INTERVAL] Video Refresh on room "+room)
      },500)

      rooms[room].broadcastIntervalID = setInterval(function(){
        io.to(room).emit('broadcast', {msg:rooms[room].videoplayer});
        // console.log("[SET INTERVAL] Broadcast on room "+room)
      }, 3000);

    }


    if(checkExist(rooms[room].users,socket.username)){
      try{
        socket.username=""
        cb({msg:"Username telah ada !" });
      }catch{}
      return;
    }

    
    socket.roomid = rooms[room].roomid
    socket.room = room

    socket.join(room);
    rooms[room].users.push(socket.username);

    io.to(room).emit("usersChange",{msg:{users:rooms[room].users}});
    
    socket.to(room).emit("message",new Message("join",socket.username));
      
    console.log(`USER "${socket.username}" [${socket.id}] joined room "${room}"] `);

  });

  socket.on('getVideoData', ({room, callback = true },cb) => {
      if(!room || !socket.username) return;
      if(!rooms[room] ) return;
      if(!checkExist(rooms[room].users,socket.username)) return;

      let playerData = rooms[room].videoplayer;
      
      if(callback){
        try{
          cb({msg:playerData });
        }catch{}
        
        return
      }
      
      socket.emit("ansVideoData", { msg:playerData})
      // console.log(`[GET_VIDEO_DATA] ROOM "#${room}"`);
  });

  socket.on('setPlayerURL', ({room,URL},cb) => {
      if(!room || !URL || !socket.username) return;
      if(!rooms[room] ) return;
      if(!checkExist(rooms[room].users,socket.username)) return;

      let playerData = rooms[room].videoplayer;
      playerData.url = URL;
      playerData.currentTime = 0;
      playerData.startTime = 0;
      playerData.pausedTime = 0;
      playerData.offsetTime = 0;

      io.to(room).emit("updatePlayerURL",{msg:playerData});

      io.to(room).emit("message",new Message("updatePlayerURL",socket.username,URL));
  });

  socket.on('setPlayerStatus', ({room,status},cb) => {
      if(!room || !status || !socket.username) return;
      if(!rooms[room] ) return;
      if(!checkExist(rooms[room].users,socket.username)) return;

      let playerData = rooms[room].videoplayer;
      playerData.status = status;

      if(status === "started" && playerData.startTime !== 0 && playerData.pausedTime !== 0 ){
        let timedata = new Date();
        let timenow = timedata.getTime() + (timedata.getTimezoneOffset() * 60 * 1000);
        playerData.startTime += timenow - playerData.pausedTime;
        playerData.pausedTime = 0;

      } else if(status === "started"){
        let startdate = new Date();
        let starttime = startdate.getTime() + (startdate.getTimezoneOffset() * 60 * 1000);
        playerData.startTime = starttime;

      } else if(status === "paused" && playerData.startTime !== 0){
        let pauseddate = new Date();
        let pausedTime = pauseddate.getTime() + (pauseddate.getTimezoneOffset() * 60 * 1000);
        playerData.pausedTime = pausedTime;
        
      }

      io.to(room).emit("updatePlayerStatus",{msg:playerData});

      io.to(room).emit("message",new Message("updatePlayerStatus",socket.username,status));
  });

  socket.on('setTime', ({room,time},cb) => {
      if(!room || !time || !socket.username) return;
      if(!rooms[room] ) return;
      if(!checkExist(rooms[room].users,socket.username)) return;

      let playerData = rooms[room].videoplayer;
      playerData.offsetTime = time - playerData.currentTime;
      io.to(room).emit("updateForceServerTime",{msg:playerData});

      io.to(room).emit("message",new Message("updateForceServerTime",socket.username,time));
  });

  socket.on('setEndedVideo', ({room},cb) => {
      if(!room || !socket.username) return;
      if(!rooms[room] ) return;
      if(!checkExist(rooms[room].users,socket.username)) return;

      console.log(`[SET_ENDED_VIDEO] ROOM "#${room}"`);

      let playerData = rooms[room].videoplayer;
      playerData.status = "paused";
      playerData.currentTime = 0;
      playerData.startTime = 0;
      playerData.offsetTime = 0;

      io.to(room).emit("updateServerPlayerStatus",{msg:playerData});
  });

  socket.on('sendMessage', ({room,message},cb) => {
    if(!room || !socket.username || !message) return;
    if(!rooms[room] ) return;
    if(!checkExist(rooms[room].users,socket.username)) return;

    console.log(`${socket.username} in ${socket.room} : ${message}`)

    io.to(room).emit("message",new Message("message",socket.username,message));
  });

  socket.on('disconnect', () => {
    if(!socket.username || !socket.room) return;
    if(!rooms[socket.room] ) return;

    console.log(`Disconnected ! [${socket.id}]`)

    socket.to(socket.room).emit("message", new Message("leave",socket.username))

    rooms[socket.room].users = rooms[socket.room].users.filter(function(value, index, arr){ 
        return value !== socket.username;
    });

    io.to(socket.room).emit("usersChange",{msg:{users:rooms[socket.room].users}});
    
    if(rooms[socket.room].users.length === 0){
      setTimeout(()=>{ 
        if(rooms[socket.room].users.length === 0){
          clearInterval(rooms[socket.room].refreshIntervalID)
          clearInterval(rooms[socket.room].broadcastIntervalID)
          console.log("[INTERVAL CLEARED] on room " + socket.room)
        }
      },10000);
    }


  });

});


    


server.listen(3000, () => {
  console.log('listening on *:3000');
});


const checkExist = (arr, el) =>{
  if((arr.indexOf(el)) === -1){
    return false;
  }
  return true;
}

const updatePlayerTime = (room)=>{
  let playerData = rooms[room].videoplayer;
  
  if(playerData.status === "paused") return;

  let servercurrtime = 0
  let nowdate = new Date()
  let nowtime = nowdate.getTime() + (nowdate.getTimezoneOffset() * 60 * 1000)

  if(playerData.status === "started" && playerData.offsetTime !== 0){
    servercurrtime = Math.round((nowtime - playerData.startTime) / 1000) + playerData.offsetTime;
    if (servercurrtime < 0 ){
      servercurrtime = 0;
    } 

    playerData.startTime -= playerData.offsetTime*1000

    playerData.offsetTime = 0;
    
  }else if(playerData.status === "started"){
    servercurrtime = Math.round((nowtime - playerData.startTime) / 1000)
  }

  playerData.currentTime = servercurrtime;

}


//https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
const makeid = (length) => {
  var result           = [];
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < length; i++ ) {
    result.push(characters.charAt(Math.floor(Math.random() * 
charactersLength)));
 }
 return result.join('');
}