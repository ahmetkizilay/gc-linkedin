"use strict";

var path = require("path");
var express = require("express");
var session = require("express-session");
var logger = require("morgan");
var bodyParser = require("body-parser");

var http = require("http");
var socketIO = require("socket.io");

var passport = require("passport");
var LinkedInStrategy = require("passport-linkedin-oauth2").Strategy;

var saveProfile = require("./integrate.js");
var db = require("./db.js");


var LINKEDIN_API_KEY = process.env.LINKEDIN_API_KEY;
var LINKEDIN_SECRET_KEY = process.env.LINKEDIN_SECRET_KEY;

var ensureAuthenticated = function (req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect("/");
};

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});

passport.use(new LinkedInStrategy({
  clientID: LINKEDIN_API_KEY,
  clientSecret: LINKEDIN_SECRET_KEY,
  callbackURL: "http://localhost:3000/auth/callback",
  scope: ["r_basicprofile", "r_emailaddress"],
  passReqToCallback: true
},
function(req, accessToken, refreshToken, profile, done) {
  req.session.accessToken = accessToken;
  process.nextTick(function() {
    db.get(profile.id).then(function (obj) {
      var userObj = {
        id: profile.id,
        name: profile.displayName
      };

      if (obj) {
        userObj.saved = true;
      }

      done(null, userObj);

    });
  });
}));

var app = express();
var server = http.createServer(app);
var io = socketIO(server);

var sessionMW = session({
  secret: "123123h123jk123hk",
  resave: false,
  saveUninitialized: false
});

var clients = {};

io.use(function (socket, next) {
  sessionMW(socket.request, socket.request.res, next);
});

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");
app.use(logger("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));
app.use(sessionMW);
app.use(passport.initialize());
app.use(passport.session());

io.on('connection', function(socket){
  clients[socket.request.sessionID] = socket.id;

  socket.on("start-save", function() {
    saveProfile(socket.request.session.passport.user.id, socket.request.session.accessToken).then(function (memberData) {
        return db.put(socket.request.session.passport.user.id);
      }).then(function() {
        socket.emit("login-completed");
      });
  });

});

app.get("/", function (req, res) {
  if (req.user) {
    res.render("index", { user: req.user });
  }
  else {
    res.redirect("/login");
  }

});

app.get("/map", ensureAuthenticated, function (req, res) {
  res.render("map", {});
});

app.get("/login", function (req, res) {
  res.render("login");
});

app.get("/process", function (req, res) {
  res.render("process");
});

app.get("/auth/login", passport.authenticate("linkedin", { state: "temp_state" }), function (req, res) {
  // wont be called
});

app.get("/auth/callback",
  passport.authenticate("linkedin", { failureRedirect: "/"}), function (req, res) {
    // if (!req.user.saved) {
    //
    //   saveProfile(req.user.id, req.session.accessToken).then(function (memberData) {
    //     return db.put(req.user.id);
    //   }).then(function() {
    //     console.log("this should be saved now");
    //     console.log("session id is", req.sessionID);
    //     console.log("the socket id is ", clients[req.sessionID]);
    //     io.sockets.socket(clients[req.sessionID]).emit("login-completed");
    //   });
    // }
    // else {
    //   console.log("session id is", req.sessionID);
    //   console.log("the socket id is ", clients[req.sessionID]);
    //   io.sockets.socket(clients[req.sessionID]).emit("login-completed");
    // }
    //saveProfile(req.user.id, req.session.accessToken):;
    //res.render("map");
    if (req.user) {
      res.redirect("/process");
    }
    else {
      res.redirect("/login", {err: true});
    }
  }

);

server.listen(process.env.PORT || 3000, function() {
  var host = server.address().address;
  var port = server.address().port;

  console.log("listening at http://%s:%s", host, port);
});