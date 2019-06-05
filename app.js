const { readFileSync } = require('fs')
const express = require('express')
const app = express()
var https = require('https');
var httpsServer = https.createServer({
  key: readFileSync(`${__dirname}/tls/key.pem`),
  cert: readFileSync(`${__dirname}/tls/cert.pem`)
},app)
var expressWs = require('express-ws')(app, httpsServer);
var bcrypt = require('bcryptjs');
var requirejs = require('requirejs');
var pgp = require('pg-promise')()
var passport = require('passport');
var Strategy = require('passport-local').Strategy;
var bodyParser = require('body-parser');
var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;
var _ = require('lodash');
var moment = require('moment');
var redirectToHTTPS = require('express-http-to-https').redirectToHTTPS



const port = 80;
const ptn_ninja_path = '/root/tak-async/PTN-Ninja/';

// Load PTN module
requirejs(["ptn/js/app/game", "ptn/js/app/board", "ptn/js/app/game/move"], function(Game, Board, Move) {
  var db = pgp({
    host: 'localhost',
    port: 5432,
    database: 'takdb',
    user: 'takserver3',
    password: 'defaultpass'
  });

  // make sure https is used. Except on localhost, or for let's encrypt verification
  app.use(redirectToHTTPS([/localhost:(\d{4})/], [/^(\/.well-known\/.+)$/], 301));
  

  // setup user verification
  passport.use(new Strategy(
    function(username, password, done) {
      db.one('SELECT * from login where username = $1', username)
      .then(function (logindata) {
        return bcrypt.compare(password, logindata.passhash);
      })
      .then(function (res) {
        if (!res) {
          throw "Invalid password";
        }
        console.log("Login succesful for", username);
        return done(null, username);
      })
      .catch(function (error) {
        console.log('Login error:', error)
        return done(error);
      });
  }));
  
  // Use cookie to remember user login
  app.use(require('express-session')({
    secret: '123',
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
    },
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Remember to set this for non-ssl
  }));
  
  app.use(passport.initialize());
  app.use(passport.session());
  
  passport.serializeUser(function(user, done) {
    done(null, user);
  });
  passport.deserializeUser(function(user, done) {
    done(null, user);
  });

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended:true}));


  // Keep track of a list of all open websockets (which are used for notifications)
  var allSockets = [];
  app.ws('/mysocket',
   function(ws, req) {
    if (!req.isAuthenticated()) {
      console.log("Dropping unauthenticated websocket!");
      ws.close(1008); // Policy Violation error code
    } else {
      ws.user = req.user;
      allSockets.push(ws);

      ws.on('close', function() {
        console.log('The connection was closed!');
        allSockets.splice(allSockets.findIndex(x => x == ws));
      });
      ws.on('error', function() {
        console.log('The connection was errored!');
        allSockets.splice(allSockets.findIndex(x => x == ws));
      });
    }
  });

  app.get('/',
  ensureLoggedIn('/login') ,
  function(req, res) {
    console.log("redirecting root");
    res.redirect('/index.html'); // executed iff login was succesful
  });

  app.post('/invite',
  ensureLoggedIn('/login'),
  function(req, res) {
    db.none('SELECT * FROM invitations WHERE player1=$1 AND player2=$2', [req.user, req.body.opponent])
    .then(() => db.none('INSERT INTO invitations VALUES($1, $2, $3, $4)', [
      req.user, 
      req.body.opponent, 
      req.body.board_size, 
      moment(new Date()).format('YYYY-MM-DD HH:mm:ss')]))
    .catch(err => console.log('Failed to store invitation:', err));
  });
  app.post('/acceptinvite',
  ensureLoggedIn('/login'),
  function(req, res) {
    var now = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
    db.one('SELECT * FROM invitations WHERE player2=$1 AND id=$2', [req.user, req.body.invitationid])
    .then(invitation => {
      if (req.body.accept != false) {
        return db.none('insert into games (player1, player2, active_player, ptn, creation_timestamp, last_move_timestamp) values ($1, $2, $3, $4, $5, $6)', [
          invitation.player1, 
          invitation.player2, 
          invitation.player1, 
          `[Player1 "${invitation.player1}"]\n[Player2 "${invitation.player2}"]\n[Size "${invitation.board_size}"]\n[Result ""]\n`,
          now,
          now])
        }
    })
    .then(() => db.any('DELETE FROM invitations WHERE player2=$1 AND id=$2', [req.user, req.body.invitationid]))
    .catch(err => console.log('Failed to store invitation:', err));
  });
  // handle POST request that submits a move
  app.post('/domove',
    ensureLoggedIn('/login'),
    function(req, res) {
      console.log(`Received move from ${req.user}`);
      var body = req.body;
      
      db.one('SELECT * FROM games WHERE active_player=$1 AND gameID=$2', [req.user, body.gameID])
      .then(function (gamedata) {
        // load PTN from the database into a game object
        var board = new Board();
        global.app = board;
        var game = new Game(board);
        board.init(game);
        game.parse(gamedata.ptn);
        board.current_ply = game.plys[game.plys.length-1];

        // insert the received move
        game.insert_ply(
          body.move,
          board.current_branch,
          Math.floor(game.plys.length/2) + 1,
          game.plys.length%2+1
        );
        board.validate(game);

        if (!game.is_valid) {
          console.log(game.print_text());
          throw 'Invalid move attempt';
        }

        var next_player = game.plys.length % 2 == 0 ? gamedata.player1 : gamedata.player2;
        var thisplayer  = gamedata.player1 == req.user ? gamedata.player1 : gamedata.player2;
        var opponent    = gamedata.player1 != req.user ? gamedata.player1 : gamedata.player2;

        // update the ptn in the database
        var ret = db.none('UPDATE games set ptn=$1, active_player=$2, last_move_timestamp=$3 where gameID=$4', [game.print_text(), next_player, moment(new Date()).format('YYYY-MM-DD HH:mm:ss'), body.gameID]);

        // send notification to the opponent
        console.log(`${allSockets.length} sockets open. Notifying ${allSockets.filter(x => x.user == opponent).length}`);
        allSockets.filter(x => x.user == opponent).forEach(x => {x.send(JSON.stringify({opponent:thisplayer, gameID:body.gameID}))});
        console.log('Finished notifications');

        return ret;
      })
      .catch(function (error) {
        console.log('ERROR for ' + body.username + ': ', error);
      });
    }
  );

  // handle get request used to get the ptn with a given gameID
  app.get('/getgame',
  ensureLoggedIn('/login') ,
  function(req, res) {
    db.one('SELECT * FROM games WHERE (player1=$1 OR player2=$1) AND gameID=$2', [req.user, req.query.id])
    .then(function (gamedata) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.send(JSON.stringify({ptn: gamedata.ptn}));
    });
  });


  // quick login form
  app.get('/login',
  function(req, res){
    res.send('<form action="/dologin" method="post">\n<div>\n<label>Username:</label>\n<input type="text" name="username" id="username"/><br/>\n</div>\n<div>\n<label>Password:</label>\n<input type="password" name="password" id="password"/>\n</div>\n<div>\n<input type="submit" value="Submit"/>\n</div>\n</form>');
  });

  // performing a login action
  app.post('/dologin', 
  passport.authenticate('local', { failureRedirect: '/error' }),
  function(req, res) {
    res.redirect('/index.html'); // executed iff login was succesful
  });

  // login failure page
  app.get('/error', (req, res) => {
    res.send('Error; failed to log in!')
  })

  // allow user to log out  
  app.get('/logout',
  function(req, res){
    req.logout();
    res.redirect('/login');
  });

  // Get the game overview page
  app.get('/games',
  ensureLoggedIn('/login') ,
  function(req, res){
    var overall_template = _.template(
      '<!DOCTYPE html>' +
      '<html>' +
      '<head>' +
      '<title>Game overview</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">' +
      '<link rel="stylesheet" href="/css/material.css"></link>' +
      '</head>' +
      '<body>' +
      '<style>' +
      '.game-list {' +
      '  width: 300px;' +
      '}' +
      '</style>' +
      '<h1>Game overview</h1>' +
      '<p>Your turn:</p>' +
      '<ul class="game-list mdl-list">' +
      '<%= yourturn %>' +
      '</ul>' +
      '<p>Opponent\'s turn:</p>' +
      '<ul class="game-list mdl-list">' +
      '<%= theirturn %>' +
      '</ul>' +
      '</body>' +
      '</html>'
    );
    var item_template = _.template(    
      '<li onClick="window.location.href = \'/index.html?gameid=<%= linkid %>&color=<%= color %>\'" class="mdl-list__item mdl-list__item--two-line">' +
      '  <span class="mdl-list__item-primary-content">' +
      '    <i class="material-icons mdl-list__item-avatar">person</i>' +
      '    <span>Versus <%= name %></span>' +
      '    <span class="mdl-list__item-sub-title">Game started <%= creation_date %></span>' +
      '  </span>' +
      '  <span class="mdl-list__item-secondary-info"><%= time_since_move %></span>' +
      '</li>');
  
  // ' +'<a href="/index.html?gameid=<%= linkid %>">Versus <%= name %></a>');

    // get a list of the user's games and return them
    db.any('SELECT * FROM games WHERE player1=$1 OR player2=$1', req.user)
    .then(function (gamedata) {
      // group the games by whether it's player's turn or their opponent's 
      var grouped = _.groupBy(gamedata, x => x.active_player == req.user);
      var fn = y => _
        .chain(y)
        .map(x => item_template({
          linkid: x.gameid, 
          name: x.player1 == req.user ? x.player2 : x.player1,
          creation_date: x.creation_timestamp.toUTCString(),
          time_since_move: Math.floor((new Date().getTime() - x.last_move_timestamp) / (1000 * 3600)) + 'h',
          color: req.user == x.player1 ? 'white' : 'black',
        }))
        .join('\n\n')
        .value();
      
      var result = overall_template({yourturn: fn(grouped[true]), theirturn: fn(grouped[false])});
      res.send(result);
    });
  });

  // Get the game overview page
  app.get('/gamesinline',
  ensureLoggedIn('/login') ,
  function(req, res){
    var overall_template = _.template(
      '<div>' +
      '<p>Your turn:</p>' +
      '<ul class="game-list mdl-list">' +
      '<%= yourturn %>' +
      '</ul>' +
      '<p>Opponent\'s turn:</p>' +
      '<ul class="game-list mdl-list">' +
      '<%= theirturn %>' +
      '</ul>' +
      '<p>Invitations:</p>' +
      '<ul class="mdl-list">' +
      '<%= invites %>' +
      '</ul>' +
      '</div>'
    );
    var item_template = _.template(    
      '<li gameid="<%= linkid %>" playerColor=<%= color %> class="mdl-list__item mdl-list__item--two-line game-selector">' +
      '  <span class="mdl-list__item-primary-content">' +
      '    <i class="material-icons mdl-list__item-avatar">person</i>' +
      '    <span>Versus <%= name %></span>' +
      '    <span class="mdl-list__item-sub-title">Game started <%= creation_date %></span>' +
      '  </span>' +
      '  <span class="mdl-list__item-secondary-info"><%= time_since_move %></span>' +
      '</li>');
    var invite_template = _.template(    
      '<li invitationid="<%= invitationid %>" class="mdl-list__item mdl-list__item--two-line">' +
      '  <span class="mdl-list__item-primary-content">' +
      '    <i class="material-icons mdl-list__item-avatar">person</i>' +
      '    <span>Versus <%= opponent %></span>' +
      '    <span class="mdl-list__item-sub-title">Board size <%= board_size %>x<%= board_size %>; invited <%= time_since_invite %> ago</span>' +
      '  </span>' +
      '<span class="mdl-list__item-secondary-content">' + 
      '  <a class="mdl-list__item-secondary-action" href="#"><i class="material-icons invitation-btn" >clear</i></a>' + 
      '</span>' + 
      '<span class="mdl-list__item-secondary-content">' + 
      '  <a class="mdl-list__item-secondary-action" href="#"><i class="material-icons invitation-btn" accept="">done</i></a>' + 
      '</span>' + 
      '</li>');
  
  // ' +'<a href="/index.html?gameid=<%= linkid %>">Versus <%= name %></a>');

    // get a list of the user's games and return them
    db.any('SELECT * FROM games WHERE player1=$1 OR player2=$1', req.user)
    .then(function (gamedata) {
      // group the games by whether it's player's turn or their opponent's 
      var grouped = _.groupBy(gamedata, x => x.active_player == req.user);
      var fn = y => _
        .chain(y)
        .map(x => item_template({
          linkid: x.gameid, 
          name: x.player1 == req.user ? x.player2 : x.player1,
          creation_date: x.creation_timestamp.toUTCString(),
          time_since_move: Math.floor((new Date().getTime() - x.last_move_timestamp) / (1000 * 3600)) + 'h',
          color: req.user == x.player1 ? 'white' : 'black',
        }))
        .join('\n\n')
        .value();
      
      db.any('SELECT * FROM invitations WHERE player2=$1', req.user)
      .then(function (invites) {
        var q = _.chain(invites)
        .map(x => invite_template({
          opponent: x.player1,
          date: x.date,
          time_since_invite: Math.floor((new Date().getTime() - x.date) / (1000 * 3600)) + 'h',
          board_size: x.board_size,
          invitationid: x.id
        }))
        .join('\n\n')
        .value();
        var result = overall_template({yourturn: fn(grouped[true]), theirturn: fn(grouped[false]), invites:q});
        res.send(result);        
      });

    });
  });


  // Serve files required by let's encrypt
  app.get(/^(\/.well-known\/.+)$/, 
  function(req, res)
  { 
    var f = ptn_ninja_path + req.params[0];
    res.sendfile(f); 
  });

  // Serve all files used by ptn-ninja
  app.get(/^(.+)$/, 
  // ensureLoggedIn('/login') ,
  function(req, res)
  { 
    // if (!req.isAuthenticated()) {
    //   console.log("Dropping unauthenticated websocket!");
    //   res.status(403).send('403: Forbidden');
    // } else {
      console.log("serving", req.params[0]);
      var f = ptn_ninja_path + req.params[0];
      res.sendFile(f); 
    // }
  });

  // bcrypt.hash('some-pass', 10, function(err, hash) {
  //   db.none('INSERT INTO login (username, passhash) VALUES ($1, $2)', ['somename', hash]);
  // })

  app.listen(port, () => console.log(`App listening on port ${port}!`));
  httpsServer.listen(443);
  // httpsServer.listen(80);
});

