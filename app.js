//Copyright 2014-2015 Alex Benfaremo, Alessandro Chelli, Lorenzo Di Berardino, Matteo Di Sabatino

/********************************* LICENSE *******************************
*									 *
* This file is part of ApioOS.						 *
*									 *
* ApioOS is free software released under the GPLv2 license: you can	 *
* redistribute it and/or modify it under the terms of the GNU General	 *
* Public License version 2 as published by the Free Software Foundation. *
*									 *
* ApioOS is distributed in the hope that it will be useful, but		 *
* WITHOUT ANY WARRANTY; without even the implied warranty of		 *
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the		 *
* GNU General Public License version 2 for more details.		 *
*									 *
* To read the license either open the file COPYING.txt or		 *
* visit <http://www.gnu.org/licenses/gpl2.txt>				 *
*									 *
*************************************************************************/


"use strict";
var express = require("express");
var path = require("path");
var logger = require("morgan");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");
var http = require("http");
var app = express();
var Apio = require("./apio.js");
var fs = require('fs');
var domain = require('domain');
var async = require('async');
var request = require('request');
var net = require('net');
var targz = require('tar.gz');
var formidable = require('formidable');

var APIO_CONFIGURATION = {
    port : 8083
}
var ENVIRONMENT = "production";
if (process.argv.indexOf('--no-serial') > -1)
    ENVIRONMENT = "development"
if (process.argv.indexOf('--http-port') > -1) {
    var index = process.argv.indexOf('--http-port');
    APIO_CONFIGURATION.port = process.argv[index+1];
}
if (process.argv.indexOf('--serial-port') > -1) {
    var index = process.argv.indexOf('--serial-port');
    Apio.Serial.Configuration.port = process.argv[index+1];
}

if (process.argv.indexOf('--profile') > -1) {
    console.log("Profiling Apio Server")
    var memwatch = require('memwatch');
    var prettyjson = require('prettyjson');
    var hd = new memwatch.HeapDiff();
    memwatch.on('leak', function(info) {
        console.log("\n\nMEMORY LEAK DETECTED")
        console.log(prettyjson.render(info));
        console.log("\n\n")
    });
    memwatch.on('stats', function(stats) {
        console.log("Stats")
        console.log(prettyjson.render(stats));
        var diff = hd.end();
        console.log(prettyjson.render(diff));
        hd = new memwatch.HeapDiff();
    });

}

if (process.argv.indexOf('--logmemory') > -1) {
    fs.appendFileSync('memory.log',"--- "+(new Date()).toString()+"\n")
    setInterval(function(){
        fs.appendFileSync('memory.log', process.memoryUsage().heapUsed+"\n");
    },5*1000)
}


var HOST = '192.168.1.109';
var PORT = 6969;

var routes = {};
routes.dashboard = require('./routes/dashboard.route.js');
routes.core = require('./routes/core.route.js');



var d = domain.create();
// Because req and res were created before this domain existed,
    // we need to explicitly add them.
    // See the explanation of implicit vs explicit binding below.


    //Il domain è un "ambiente chiuso" in cui far finire gli errori per non crashare il server
    //L'alternativa è fail fast e restart ma non mi piace
d.on('error',function(err){
    //Apio.Util.debug("Apio.Server error : "+err);
    //Apio.Util.debug(err.stack);
    Apio.Util.printError(err);
});

d.run(function(){


function puts(error, stdout, stderr) {
    sys.puts(stdout);
}


if (ENVIRONMENT == 'production')
    Apio.Serial.init();

Apio.Socket.init(http);
Apio.Database.connect(function(){
    /*
    Inizializzazione servizi Apio
    Fatti nel callback della connessione al db perchè ovviamente devo avere il db pronto come prima cosa
    */

    Apio.System.resumeCronEvents(); //Ricarica dal db tutti i cron events
});

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");


app.use(logger("dev"));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
/*
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
*/
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));


app.get('/',function(req,res){
    res.sendfile('public/html/index.html');
})
app.post('/apio/authenticate',function(req,res){
    var user = req.body.user;
    var password = req.body.password;

    if (user === 'apio' && password === 'apio')
        res.send({
            status : true
        })
    else
        res.status(401).send({
            status : false,
            errors : [{
                code : 401,
                message : 'Username or password did not match.'
            }]
        })
})

app.post('/apio/adapter',function(req,res){
                var req_data = {
                        json : true,
                        uri : req.body.url,
                        method : "POST",
                        body : req.body.data
                }
                console.log("\n\n /apio/adapter sending the following request")
                console.log(req_data);
                console.log("\n\n")
                var _req = request(req_data,function(error,response,body){
                        if ('undefined' !== typeof response){
                            if ('200' === response.statusCode || 200 === response.statusCode) {
                            console.log("Apio Adapter method : got the following response from "+req.body.url)
                            console.log(body);
                            res.send(body)
                            }
                            else {
                                console.log("Apio Adapter : Something went wrong ")
                                res.status(response.statusCode).send(body);
                            }
                        } else {
                            res.status(500).send();
                        }

                });
})

app.get("/dashboard",routes.dashboard.index);


/*Shutdown*/
    app.get('/apio/shutdown', function(req, res){
        var sys = require('sys');
        var exec = require('child_process').exec;
        var child = exec("sudo shutdown -h now", function (error, stdout, stderr) {
            //sys.print('stdout: '+stdout);
            //sys.print('stderr: '+stderr);
            if (error !== null) {
                console.log('exec error: '+error);
            }
        });
    });



/*
*   Crea un nuovo evento
**/
app.post("/apio/event",routes.core.events.create);

app.get('/apio/notifications',routes.core.notifications.list);
app.get('/apio/notifications/listDisabled',routes.core.notifications.listdisabled);
app.post('/apio/notifications/markAsRead',routes.core.notifications.delete);
app.post('/apio/notifications/disable',routes.core.notifications.disable);
app.post('/apio/notifications/enable',routes.core.notifications.enable);


    app.post('/apio/notify',function(req,res){
        console.log("REQ");
        console.log(req.body);

        Apio.Database.db.collection('Objects').findOne({objectId : req.body.objectId}, function(err, data){
        //Apio.Database.db.collection('Objects').findOne({objectId : "1000"}, function(err, data){
            if(err){
                console.log("Unable to find object with id "+req.body.objectId);
                //console.log("Unable to find object with id 1000");
            }
            else{
                var notifica = {
                    objectId : req.body.objectId,
                    //objectId : "1000",
                    timestamp : new Date().getTime(),
                    objectName : data.name,
                    properties : {}
                };
                for(var i in req.body){
                    if(i !== "objectId"){
                        notifica.properties[i] = req.body[i];
                        notifica.message = data.notifications[i][req.body[i]];
                    }
                }
                Apio.System.notify(notifica);
                Apio.Database.db.collection("States").findOne({objectId : notifica.objectId, properties : notifica.properties}, function(err, foundState){
                    if(err){
                        console.log("Unable to find States for objectId "+notifica.objectId);
                    }
                    else if(foundState){
                        var stateHistory = {};

                        var getStateByName = function(stateName,callback) {
                            Apio.Database.db.collection('States').findOne({name : stateName},callback);
                        };
                        //Mi applica lo stato se non è già stato applicato
                        /*var applyStateFn = function(stateName) {

                         console.log("\n\nApplico lo stato "+stateName+"\n\n")
                         if (!stateHistory.hasOwnProperty(stateName)) { //se non è nella history allora lo lancio
                         getStateByName(stateName,function(err,state){
                         if (err) {
                         console.log("applyState unable to apply state")
                         console.log(err);
                         }
                         else if(state){
                         if (state.active == true){
                         Apio.Database.db.collection('States').update({name : state.name},{$set : {active : false}},function(errOnActive){
                         if (errOnActive) {
                         console.log("Impossibile settare il flag dello stato");
                         res.status(500).send({error : "Impossibile settare il flag dello stato"})
                         } else {
                         var s = state;
                         s.active = false;
                         Apio.io.emit('apio_state_update',s);
                         res.send({error:false});
                         }
                         })
                         }
                         else {
                         Apio.Database.db.collection('States').update({name : state.name},{$set : {active : true}},function(err){
                         if (err)
                         console.log("Non ho potuto settare il flag a true");
                         })
                         console.log("Lo stato che sto per applicare è ")
                         console.log(state)
                         Apio.Database.updateProperty(state,function(){
                         stateHistory[state.name] = 1;
                         //Connected clients are notified of the change in the database
                         Apio.io.emit("apio_server_update",state);
                         if (ENVIRONMENT == 'production') {
                         Apio.Serial.send(state, function(){
                         console.log("SONO LA CALLBACK");
                         //Ora cerco eventuali eventi
                         Apio.Database.db.collection("Events").find({triggerState : state.name}).toArray(function(err,data){
                         if (err) {
                         console.log("error while fetching events");
                         console.log(err);
                         }
                         console.log("Ho trovato eventi scatenati dallo stato "+state.name);
                         console.log(data)
                         //data è un array di eventi
                         data.forEach(function(ev,ind,ar){
                         var states = ev.triggeredStates;
                         states.forEach(function(ee,ii,vv){
                         applyStateFn(ee.name);
                         })
                         })
                         res.send({});
                         })
                         pause(500);
                         });
                         }
                         else{
                         Apio.Database.db.collection("Events").find({triggerState : state.name}).toArray(function(err,data){
                         if (err) {
                         console.log("error while fetching events");
                         console.log(err);
                         }
                         console.log("Ho trovato eventi scatenati dallo stato "+state.name);
                         console.log(data)
                         //data è un array di eventi
                         data.forEach(function(ev,ind,ar){
                         var states = ev.triggeredStates;
                         states.forEach(function(ee,ii,vv){
                         applyStateFn(ee.name);
                         })
                         })
                         res.send({});
                         })
                         pause(500);
                         }
                         });
                         }
                         }
                         })
                         } else {
                         console.log("Skipping State application because of loop.")
                         }
                         } //End of applyStateFn*/
                        var arr = [];
                        var applyStateFn = function(stateName, callback, eventFlag) {
                            console.log("\n\nApplico lo stato "+stateName+"\n\n")
                            if (!stateHistory.hasOwnProperty(stateName)) { //se non è nella history allora lo lancio
                                getStateByName(stateName,function(err,state){
                                    if (err) {
                                        console.log("applyState unable to apply state")
                                        console.log(err);
                                    }
                                    else if(eventFlag){
                                        arr.push(state);
                                        Apio.Database.db.collection('States').update({name : state.name},{$set : {active : true}},function(err){
                                            if (err)
                                                console.log("Non ho potuto settare il flag a true");
                                        });
                                        console.log("Lo stato che sto per applicare è ");
                                        console.log(state);
                                        Apio.Database.updateProperty(state,function(){
                                            stateHistory[state.name] = 1;
                                            //Connected clients are notified of the change in the database
                                            Apio.io.emit("apio_server_update",state);
                                            Apio.Database.db.collection("Events").find({triggerState : state.name}).toArray(function(err,data){
                                                if (err) {
                                                    console.log("error while fetching events");
                                                    console.log(err);
                                                }
                                                console.log("Ho trovato eventi scatenati dallo stato "+state.name);
                                                console.log(data);
                                                if(callback && data.length == 0){
                                                    callback();
                                                }
                                                //data è un array di eventi
                                                data.forEach(function(ev,ind,ar){
                                                    var states = ev.triggeredStates;
                                                    states.forEach(function(ee,ii,vv){
                                                        applyStateFn(ee.name, callback, true);
                                                    })
                                                });
                                                res.send({});
                                            });
                                        });
                                    }
                                    else{
                                        if (state.active == true){
                                            Apio.Database.db.collection('States').update({name : state.name},{$set : {active : false}},function(errOnActive){
                                                if (errOnActive) {
                                                    console.log("Impossibile settare il flag dello stato");
                                                    res.status(500).send({error : "Impossibile settare il flag dello stato"})
                                                } else {
                                                    var s = state;
                                                    s.active = false;
                                                    Apio.io.emit('apio_state_update',s);
                                                    res.send({error:false});
                                                }
                                            })
                                        }
                                        else {
                                            arr.push(state);
                                            Apio.Database.db.collection('States').update({name : state.name},{$set : {active : true}},function(err){
                                                if (err)
                                                    console.log("Non ho potuto settare il flag a true");
                                            });
                                            console.log("Lo stato che sto per applicare è ");
                                            console.log(state);
                                            Apio.Database.updateProperty(state,function(){
                                                stateHistory[state.name] = 1;
                                                //Connected clients are notified of the change in the database
                                                Apio.io.emit("apio_server_update",state);
                                                Apio.Database.db.collection("Events").find({triggerState : state.name}).toArray(function(err,data){
                                                    if (err) {
                                                        console.log("error while fetching events");
                                                        console.log(err);
                                                    }
                                                    console.log("Ho trovato eventi scatenati dallo stato "+state.name);
                                                    console.log(data);
                                                    if(callback && data.length == 0){
                                                        callback();
                                                    }
                                                    //data è un array di eventi
                                                    data.forEach(function(ev,ind,ar){
                                                        var states = ev.triggeredStates;
                                                        states.forEach(function(ee,ii,vv){
                                                            applyStateFn(ee.name, callback, true);
                                                        })
                                                    });
                                                    res.send({});
                                                });
                                            });
                                        }
                                    }
                                })
                            } else {
                                console.log("Skipping State application because of loop.")
                            }
                        }; //End of applyStateFn

                        applyStateFn(foundState.name, function(){
                            if(ENVIRONMENT == "production") {
                                var pause = function (millis) {
                                    var date = new Date();
                                    var curDate = null;
                                    do {
                                        curDate = new Date();
                                    } while (curDate - date < millis);
                                };
                                console.log("arr vale:");
                                console.log(arr);
                                for (var i in arr) {
                                    Apio.Serial.send(arr[i], function () {
                                        pause(100);
                                    });
                                }
                                arr = [];
                            }
                        }, false);
                    }
                });
            }
        });
    });

/* Returns all the events */
app.get("/apio/event",routes.core.events.list)
/* Return event by name*/
app.get("/apio/event/:name",routes.core.events.getByName)

app.delete("/apio/event/:name",routes.core.events.delete)

app.put("/apio/event/:name",routes.core.events.update);

/****************************************************************
****************************************************************/

app.post("/apio/state/apply",routes.core.states.apply);
/*app.post("/apio/state/apply",function(req,res){
    console.log("Ciao vorresti applicare uno stato, ma non puoi.")
    res.send({});
});*/

app.delete("/apio/state/:name",function(req,res){
    console.log("Mi arriva da eliminare questo: "+req.params.name)
    Apio.Database.db.collection("States").findAndRemove({name : req.params.name}, function(err,removedState){
        if (!err) {
            Apio.io.emit("apio_state_delete", {name : req.params.name});
            Apio.Database.db.collection("Events").remove({triggerState : req.params.name}, function(err){
                if(err){
                    res.send({error : 'DATABASE_ERROR'});
                }
                else{
                    Apio.io.emit("apio_event_delete", {name : req.params.name});
                }
            });
            if (removedState.hasOwnProperty('sensors')) {

              removedState.sensors.forEach(function(e,i,a){
                var props = {};
                props[e] = removedState.properties[e];
                Apio.Serial.send({
                  'objectId' : removedState.objectId,
                  'properties' : props
                })

              })


            }

            res.send({error : false});
        }
        else
            res.send({error : 'DATABASE_ERROR'});
    })
})


app.put("/apio/state/:name",function(req,res){
    console.log("Mi arriva da modificare questo stato: "+req.params.name);
    console.log("Il set di modifiche è ")
    console.log(req.body.state);

    var packagedUpdate = { properties : {}};
    for (var k in req.body.state) {
        packagedUpdate.properties[k] = req.body.state[k];
    }

    Apio.Database.db.collection("States").update({name : req.params.name},{$set : packagedUpdate},function(err){
        if (!err) {
            Apio.io.emit("apio_state_update",{name : req.params.name, properties : req.body.state});
            res.send({error : false});
        }
        else
            res.send({error : 'DATABASE_ERROR'});
    })
})


/*
    Creazione stato
 */
app.post("/apio/state",routes.core.states.create);


/*
    Returns state list
 */
app.get("/apio/state",routes.core.states.get);
/*
Returns a state by its name
 */
app.get("/apio/state/:name",routes.core.states.getByName);



app.get("/app",function(req,res){
    res.sendfile("public/html/app.html");
})


/*
*   Lancia l'evento
*/
app.get("/apio/event/launch",routes.core.events.launch)
/*
*   restituisce la lista degli eventi
*/
app.get("/apio/event",routes.core.events.list)

/// error handlers

// development error handler
// will print stacktrace
/*
if (app.get("env") === "development" || ENVIRONMENT === "development") {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        console.log("========== ERROR DETECTED ===========")
        console.log(err);
        res.send({
            status : false,
            errors: [{message : err.message}]
        });
        //Da testare
        next();
    });
}



// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.send({status : false});
    console.log(err);
    //Da testare
    next();
});
*/


//FIXME andrebbero fatte in post per rispettare lo standard REST
/*
app.post('/apio/serial/send',function(req,res){

         var keyValue = req.body.message;
            if (req.body.isSensor === true)
                keyValue = 'r'+keyValue;
            var keyValue = keyValue.slice(0,-1);
            var tokens = keyValue.split(":");
            var props = {};
            props[tokens[0]] = tokens[1];

            var obj = {
                objectId: req.body.objectId,
                properties : props
            };
            console.log("Questo è loggetto che arriva da /apio/serial/send")
            console.log(obj);

            Apio.Serial.send(obj);
            res.send();
});
*/
app.post('/apio/serial/send',function(req,res){

            var obj = req.body.data;
            console.log("\n\n%%%%%%%%%%\nAl seria/send arriva questp")
            console.log(obj)
            console.log("\n%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%\n\n")
            Apio.Serial.send(obj);
            res.send({status : true});
});



/* APIO creation and export of the .tar container of the App */
app.get('/apio/app/export', routes.dashboard.exportApioApp);

/* APIO export of the arduino sketchbook file NUOVA*/
app.get('/apio/app/exportIno', routes.dashboard.exportInoApioApp);

/* APIO upload of the App */
app.post('/apio/app/upload', routes.dashboard.uploadApioApp);

/* APIO recovery of the actual maximum id in mongo -> apio -> Objects */
app.post('/apio/app/maximumId', routes.dashboard.maximumIdApioApp);

/* APIO clone from the git repo of a standard Apio App*/
app.post('/apio/app/gitCloneApp', routes.dashboard.gitCloneApp);

/* APIO delete of the App */
app.post('/apio/app/delete', routes.dashboard.deleteApioApp);

/* APIO make an empty App folder */
app.post('/apio/app/folder', routes.dashboard.folderApioApp);

/* APIO modify of the App (it's binded in launch.js and it's used to launch the editor with the updating parameters)*/
app.post('/apio/app/modify', routes.dashboard.modifyApioApp);

/*APIO update of the application for a specified object (it's binded in editor.js and do the actual update of an application)*/
app.post('/apio/database/updateApioApp', routes.dashboard.updateApioApp);

/*APIO creation of the new ino html js mongo files from the wizard*/
app.post('/apio/database/createNewApioAppFromEditor', routes.dashboard.createNewApioAppFromEditor);

/*APIO creation of the new ino html js mongo files from the wizard*/
app.post('/apio/database/createNewApioApp', routes.dashboard.createNewApioApp);


app.get('/apio/database/getObjects',routes.core.objects.get);
app.get('/apio/database/getObject/:id',routes.core.objects.getById);

app.patch('/apio/object/:id',routes.core.objects.update);
app.put('/apio/object/:id',routes.core.objects.update);

app.get("/apio/object/:obj", function(req, res){
        Apio.Database.db.collection('Objects').findOne({objectId : req.params.obj},function(err, data){
            if (err) {
                console.log("Error while fetching object "+req.params.obj);
                res.status(500).send({error : "DB"});
            }
            else {
                res.status(200).send(data);
            }
        });
    });

    app.get("/apio/objects", function(req, res){
        Apio.Database.db.collection('Objects').find().toArray(function(err, data){
            if (err) {
                console.log("Error while fetching objects");
                res.status(500).send({error : "DB"});
            }
            else {
                var json = {};
                for(var i in data){
                    json[i] = data[i];
                }
                res.status(200).send(json);
            }
        });
    });

    app.post("/apio/updateListElements", function(req, res){
        for(var i in req.body){
            if(i != "objectId"){
                var update = {};
                update[i] = req.body[i];
            }
        }
        Apio.Database.db.collection('Objects').update({objectId : req.body.objectId}, {$set : {'db' : update, 'notifications' : update}}, function(err){
        //Apio.Database.db.collection('Objects').update({objectId : "1000"}, {$set : {'db' : update, 'notifications' : update}}, function(err){
            if (err) {
                res.status(500).send({status : false});
            }
            else {
                res.status(200).send({status : true});
                Apio.io.emit("list_updated", update);
            }
        });
    });


//Handling Serial events and emitting
//APIO Serial Port Listener
//module.exports = app;
/*
*   Socket listener instantiation
*/
Apio.io.on("connection", function(socket){
    socket.on("input", function(data){
        console.log(data);
        Apio.Database.updateProperty(data, function(){
            socket.broadcast.emit("apio_server_update_", data);
        });
        Apio.Serial.send(data);
    });

    //Streaming
    socket.on("apio_client_stream", function(data){
        socket.broadcast.emit("apio_server_update", data);
        Apio.Serial.stream(data);
    })


    console.log("a socket connected");
    var sys = require('sys');
    var exec = require('child_process').exec;
    var child = exec("hostname -I", function (error, stdout, stderr) {
        sys.print("Your IP address is: "+stdout);
        //sys.print('stderr: '+stderr);
        if (error !== null) {
            console.log('exec error: '+error);
        }
    });
    socket.join("apio_client");

    socket.on("apio_client_update",function(data){
        var x = data;
        try{
            data = eval('('+data+')');
            var check = function(d){
                for(var i in d){
                    if(d[i] == 'true'){
                        d[i] = true;
                    }
                    else if(d[i] == 'false'){
                        d[i] = false;
                    }
                    else if(typeof d[i] === "number"){
                        d[i] = d[i].toString();
                    }
                    else if(d[i] instanceof Object){
                        check(d[i]);
                    }
                }
            };
            check(data);
        }
        catch(e){
            data = x;
        }



        console.log("+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++");
        console.log("App.js on(apio_client_update)  received a message");

        //Loggo ogni richiesta
        //Commentato per capire cosa fare con sti log
        //Apio.Logger.log("EVENT",data);

        //Scrivo sul db
        if (data.writeToDatabase === true) {
            Apio.Database.updateProperty(data, function () {
                //Connected clients are notified of the change in the database
                socket.broadcast.emit("apio_server_update", data);
                console.log("data vale: ");
                console.log(data);
                console.log("data.properties vale:");
                console.log(data.properties);

            });
        }
        else
            Apio.Util.debug("Skipping write to Database");


        //Invio i dati alla seriale se richiesto
        if (data.writeToSerial === true && ENVIRONMENT == 'production') {
            Apio.Serial.send(data);
        }
        else
            Apio.Util.debug("Skipping Apio.Serial.send");





    });
        socket.on('apio_notification', function(data) {
                console.log("> Arrivato un update, mando la notifica");
                //Prima di tutto cerco la notifica nel db
                console.log(data);
                //Controllo Se esiste uno stato che rispecchia lo stato attuale dell'oggetto
                if ('string' === typeof data)
                    data = JSON.parse(data)
                console.log(typeof data);

                Apio.Database.db.collection('Objects').findOne({
                    address : data.address
                }, function(err, document) {
                    if (err) {
                        console.log('Apio.Serial.read Error while looking for notifications');
                    } else {
                        console.log("Aggiorno data")
                        data.objectId = document.objectId;
                        
                        if (document.hasOwnProperty('notifications')) {
                            for (var prop in data.properties) //prop è il nome della proprietà di cui cerco notifiche
                                if (document.notifications.hasOwnProperty(prop)) {
                                //Ho trovato una notifica da lanciare
                                if (document.notifications[prop].hasOwnProperty(data.properties[prop])) {
                                    console.log("Ho trovato una notifica per la proprietà " + prop + " e per il valore corrispondente " + data.properties[prop])
                                    Apio.Database.getObjectById(data.objectId, function(result) {
                                        var notifica = {
                                            objectId: data.objectId,
                                            objectName: result.objectName,
                                            message: document.notifications[prop][data.properties[prop]],
                                            properties: data.properties,
                                            timestamp: new Date().getTime()
                                        };
                                        console.log("Mando la notifica");
                                        Apio.System.notify(notifica);
                                    });
                                } //Se ha una notifica per il valore attuale
                                else {
                                    console.log("Ho una notifica registarata per quella property ma non per quel valore")
                                }


                            } else {
                                console.log("L'oggetto non ha una notifica registrata per la proprietà " + prop)
                            }
                        }
                    }
                                    Apio.Database.db.collection('States')
                    .find({
                        objectId: data.objectId
                    })
                    .toArray(
                        function(err, states) {
                        console.log("CI sono " + states.length + " stati relativi all'oggetto " + data.objectId)
                        var sensorPropertyName = Object.keys(data.properties)[0]
                        states.forEach(function(state) {
                            if (state.hasOwnProperty('sensors') && state.sensors.length > 0) {
                                if (state.sensors.indexOf(sensorPropertyName) > -1 && state.properties[sensorPropertyName] == data.properties[sensorPropertyName]) {

                                    console.log("Lo stato " + state.name + " è relativo al sensore che sta mandando notifiche ed il valore corrisponde")
                                    data.message = state.name
                                    Apio.System.notify(data);
                                } else {
                                    console.log("Lo stato " + state.name + " NON è relativo al sensore che sta mandando notifiche")
                                }
                            }
                        })
                        Apio.Database.updateProperty(data, function() {
                        Apio.io.emit('apio_server_update', data);
                        //Apio.Remote.socket.emit('apio.server.object.update', data);

                        Apio.Database.db.collection('Objects')
                            .findOne({
                                objectId: data.objectId
                            }, function(err, obj_data) {
                                if (err || obj_data === null) {
                                    console.log("An error has occurred while trying to figure out a state name")
                                } else {
                                    Apio.Database.db.collection('States')
                                        .find({
                                            objectId: obj_data.objectId
                                        }).toArray(function(error, states) {
                                            console.log("\n\n@@@@@@@@@@@@@@@@@@@")
                                            console.log("Inizio controllo stati")
                                            console.log("Ho " + states.length + " stati relativi all'oggetto " + obj_data.objectId);
                                            states.forEach(function(state) {

                                                var test = true;
                                                for (var key in state.properties)
                                                    if (state.properties[key] !== obj_data.properties[key])
                                                        test = false;
                                                if (test === true) {
                                                    console.log("Lo stato " + state.name + " corrisponde allo stato attuale dell'oggetto")

                                                    Apio.System.applyState(state.name, function(err) {

                                                        if (err) {
                                                            console.log("An error has occurred while applying the matched state")
                                                        }
                                                    }, true)


                                                }
                                            })

                                            console.log("Fine controllo degli stati\n\n@@@@@@@@@@@@@@@@@@@@@@@")
                                        });
                                }
                            })
                        });
                    })
                })


                

        })

});


Apio.io.on("disconnect",function(){
    console.log("Apio.Socket.event A client disconnected");
});



var server = http.createServer(app);


Apio.io.listen(server);
server.listen(APIO_CONFIGURATION.port,function() {
console.log("APIO server started on port "+APIO_CONFIGURATION.port);
});






});
