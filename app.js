const express = require('express')
const app = express()
var expressWs = require('express-ws')(app);
var bcrypt = require('bcryptjs');
var requirejs = require('requirejs');
var pgp = require('pg-promise')()
var passport = require('passport');
var Strategy = require('passport-local').Strategy;
var bodyParser = require('body-parser');
var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;
var _ = require('lodash');

const port = 3000;
const ptn_ninja_path = require('os').homedir() + '/workspace/tak-async/PTN-Ninja/';

// Load PTN module
requirejs(["ptn/js/app/game", "ptn/js/app/board", "ptn/js/app/game/move"], function(Game, Board, Move) {
  var db = pgp({
    host: 'localhost',
    port: 5432,
    database: 'takdb',
    user: 'takserver3',
    password: 'defaultpass'
  });
  
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
        var ret = db.none('UPDATE games set ptn=$1, active_player=$2 where gameID=$3', [game.print_text(), next_player, body.gameID]);

        // send notification to the opponent
        var other = allSockets.find(x => x.user == opponent);
        if (!_.isUndefined(other)) {
          other.send(JSON.stringify({opponent:thisplayer, gameID:body.gameID}));
        }
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
    res.redirect('/games'); // executed iff login was succesful
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
      '</head>' +
      '<body>' +
      '<h1>Game overview</h1>' +
      '<p>Your turn:</p>' +
      '<%= yourturn %>' +
      '<p>Opponent\'s turn:</p>' +
      '<%= theirturn %>' +
      '</body>' +
      '</html>'
    );
    var item_template = _.template('<a href="/index.html?gameid=<%= linkid %>">Versus <%= name %></a>');

    // get a list of the user's games and return them
    db.any('SELECT * FROM games WHERE player1=$1 OR player2=$1', req.user)
    .then(function (gamedata) {
      // group the games by whether it's player's turn or their opponent's 
      var grouped = _.groupBy(gamedata, x => x.active_player == req.user);
      var fn = y => _
        .chain(y)
        .map(x => item_template({linkid: x.gameid, name: x.player1 == req.user ? x.player2 : x.player1}))
        .join('\n\n')
        .value();
      
      var result = overall_template({yourturn: fn(grouped[true]), theirturn: fn(grouped[false])});
      res.send(result);
    });
  });

  // Serve all files used by ptn-ninja
  app.get(/^(.+)$/, 
  ensureLoggedIn('/login') ,
  function(req, res)
  { 
    var f = ptn_ninja_path + req.params[0];
    res.sendfile(f); 
  });

  app.listen(port, () => console.log(`App listening on port ${port}!`));
});