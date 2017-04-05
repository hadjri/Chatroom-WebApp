//below is taken from module 6 wiki
// Require the packages we will use:
var http = require("http"),
	socketio = require("/var/www/html/node_modules/socket.io"),
	fs = require("fs"),
    users = {};
    
    var lobby = {name:"lobby",owner:"", password:"", banned_users:[]};
    rooms = [lobby]; //start with initial room that you join at the start


// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
 
	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.
 
		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);
 
// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
    
//end course wiki citation
    console.log('Connection was established');
    refresh_rooms();
    
   
    socket.on('disconnect', function(data){      
        delete users[socket.name];
        io.sockets.in(socket.room).emit('user_leaves', {user:socket.name, room:socket.room});
        refresh_names();
    });
     
    socket.on('message_send', function(data, callback){
        //Got this idea from the guy who answered this question on StackOverflow
        //https://stackoverflow.com/questions/37206010/nodejs-private-message-with-w-in-chat
        var msg = data.trim();
        if(msg.substr(0,3)=='pm '){
            //check if message starts with pm and a space
            msg = msg.substr(3);
            var firstSpace = msg.indexOf(' '); //indicates where the username intended for the pm ends
            if(firstSpace !== -1){
                var pm = msg.substring(0,firstSpace); //this is the intended recipient name
                msg = msg.substring(firstSpace+1); //this is the actual secret message
                if(pm in users){
                    users[pm].emit('private_message', {msg:msg, user:socket.name, seconduser:pm});
                    users[socket.name].emit('private_message', {msg:msg, user:socket.name, seconduser:pm});
                }else{
                    callback('ERROR: That is not a valid user');
                }
            }
            else{
                callback('ERROR: You did not enter a message');
            }
        }
        else{
            //not a private message, will emit to everyone in the room
            io.sockets.in(socket.room).emit('new_message', {msg:msg, user:socket.name});
        }
    });

    
    
    socket.on('new_user', function(data,callback){
        if(data in users){
            callback(false);
        }
        else if (data.indexOf(" ")!==-1){//dont allow spaces anywhere in the username
   
            callback(false);
        }
        else if (data === ""){
            callback(false);
        }
        else{        
            callback(true);
            //following code was derived after looking at the following url, not copied, but similar idea to his 'adduser'
            //http://psitsmike.com/2011/10/node-js-and-socket-io-multiroom-chat-tutorial/
            socket.name = data;
            users[socket.name] = socket;
            
            socket.room = 'lobby';
            socket.join('lobby');
            refresh_names();
            console.log(data+' has connected to '+socket.room);
            //end citation
            io.sockets.in('lobby').emit('user_enters', {user:socket.name, room:socket.room});
        }
    });
    
        function refresh_names(){
        var clients = io.sockets.adapter.rooms[socket.room];
        var users_in_room = [];
        if(clients!==undefined){
            for (var clientId in clients.sockets){
                console.log(io.sockets.connected[clientId].name);
                users_in_room.push(io.sockets.connected[clientId].name);
            
            }
            var index=  -1;
            for(var i=0; i<rooms.length; i++){
                if (rooms[i].name == socket.room){
                    index = i;
                }
            }
            var data = {owner: rooms[index].owner, users: users_in_room};
            io.sockets.in(socket.room).emit('obtain_users',data);
            
        }
    }
    socket.on("kick", function(data){
        var index = -1;
        for(var i=0; i<rooms.length; i++){
            if (rooms[i].name == socket.room){
                index = i;
            }
        }
        
        if (socket.name == rooms[index].owner){
            console.log("let's kick out " + data);
            kickUser(data, socket.room);
            io.sockets.in(socket.room).emit('user_kicked', {user:data.substr(1), room:socket.room});
            //let everyone know this user was kicked
            
            
        }
    });
    
    socket.on("ban",function(data){
        
        var index = -1;
        for(var i=0; i<rooms.length; i++){
            if (rooms[i].name == socket.room){
                index = i;
            }
        }
        
        if (socket.name == rooms[index].owner){
            kickUser(data, socket.room);
            io.sockets.in(socket.room).emit('user_banned', {user:data.substr(1), room:socket.room});
            rooms[index].banned_users.push(data.substr(1));
            
        }
    });
    
    function kickUser(id, room){
        var user = id.substr(1);
        console.log("id:" + user);
        //io.sockets.adapter.rooms[socket.room];
        var clients = io.sockets.adapter.rooms[room];
        console.log(clients);
        for (var clientId in clients.sockets){
              console.log(io.sockets.connected[clientId].name);
               if (io.sockets.connected[clientId].name === user){
                    console.log("WOW");
                    var currentSocket =  io.sockets.connected[clientId];
                    console.log("Kicked out" + currentSocket.name)
                    currentSocket.leave( currentSocket.room);
                    currentSocket.emit("request_leave");
                    
               }
        
            }
           // refresh_names();
        
    }
    
    socket.on('new_room', function(data){
        var dupl = false;
        console.log('test');
        for(var i=0; i<rooms.length; i++){
            if (rooms[i].name == data.name){//prevents duplicate rooms from existing
                dupl = true;
            }
        }
        if(dupl){
        }
        else{
            var room_input = {name : data.name, password : data.password, owner : socket.name, banned_users: []};

            rooms.push(room_input);
            refresh_rooms();  
        }
        
    });


    
    function refresh_rooms(){
        io.sockets.emit('obtain_rooms',rooms);
    }

    
    socket.on('change_room', function(newroom){
        var index = -1;
        for(var i=0; i<rooms.length; i++){
            if (rooms[i].name == newroom){
                index = i;
            }
        }
        if(index!==-1){
            if(rooms[index].password==="" && rooms[index].banned_users.indexOf(socket.name)==-1){
            //notion of leaving current room, joining the newroom, and setting that new room to socket.room was derived from following url
            //from his switchRoom
            //http://psitsmike.com/2011/10/node-js-and-socket-io-multiroom-chat-tutorial/
            socket.leave(socket.room);
            refresh_names();
            console.log(socket.name+' has left '+socket.room);
            io.sockets.in(socket.room).emit('user_leaves', {user:socket.name, room:socket.room});
            socket.join(newroom);
            socket.room = newroom;
            refresh_names();
            //end citation
            
            console.log(socket.name+' has joined '+socket.room);
            io.sockets.in(socket.room).emit('user_enters', {user:socket.name, room:socket.room});
            
            
            var data = {status: true, room:socket.room, owner: rooms[index].owner};
             socket.emit('status',data);
                
            }
            else if (rooms[index].banned_users.indexOf(socket.name)==-1){
                socket.emit('prompt_password'); //prompt user for the password
                    socket.on('attempt_password',function(data){
                       if (data === rooms[index].password && rooms[index].banned_users.indexOf(socket.name)==-1){
                        //notion of leaving current room, joining the newroom, and setting that new room to socket.room was derived from following url
                         //from his switchRoom
                        //http://psitsmike.com/2011/10/node-js-and-socket-io-multiroom-chat-tutorial/
                        socket.leave(socket.room);
                        refresh_names();
                        console.log(socket.name+' has left '+socket.room);
                        io.sockets.in(socket.room).emit('user_leaves', {user:socket.name, room:socket.room});
                        socket.join(newroom);
                        socket.room = newroom;
                        refresh_names();
                        //end citation
                        console.log(socket.name+' has joined '+socket.room);
                        io.sockets.in(socket.room).emit('user_enters', {user:socket.name, room:socket.room});     
                         var _data = {status: true, room:socket.room, owner: rooms[index].owner};
                         socket.emit('status',_data);
                         console.log('on emit status');
                       }else{
                        var _data2 = {status: false, room:undefined};
                        console.log('help');
                         socket.emit('status',_data2);
                         console.log('on emit status');
                       }
                       

                    });
 
            }
            else {
                 var _data2 = {status: false, room:undefined};
                         socket.emit('status',_data2);
            }
        }

        

	});
    
    
});