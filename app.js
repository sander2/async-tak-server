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

var cn = {
  host: 'localhost', // 'localhost' is the default
  port: 5432, // 5432 is the default;
  database: 'takdb',
  user: 'takserver3',
  password: 'defaultpass'
};

var db = pgp(cn);
// will be set at `req.user` in route handlers after authentication.
passport.use(new Strategy(
  function(username, password, done) {
    db.one('SELECT * from login where username = $1', username)
    .then(function (logindata) {
      console.log('DATA:', logindata.passhash)
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
      console.log('ERROR:', error)
      return done(error);
    });
}));
app.use(require('express-session')({
  secret: '123',
  cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
  },
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Remember to set this
}));

app.use(passport.initialize());
app.use(passport.session());
// The local strategy require a `verify` function which receives the credentials
// (`username` and `password`) submitted by the user.  The function must verify
// that the password is correct and then invoke `cb` with a user object, which

passport.serializeUser(function(user, done) {
  done(null, user);
});
 
passport.deserializeUser(function(user, done) {
  done(null, user);
});

requirejs(["ptn/js/app/game", "ptn/js/app/board", "ptn/js/app/game/move"], function(Game, Board, Move) {
  // var x = new Board();
  // global.app = x;
  // var game = new Game(x);
  // x.init(game);
  // // game.parse('[Site "PlayTak.com"]\n[Event "Online Play"]\n[Date "2018.09.19"]\n[Time "21:22:37"]\n[Player1 "Whitez"]\n[Player2 "Blackz"]\n[Clock "10:0 +20"]\n[Result "R-0"]\n[Size "6"]\n1. a1 a1\n2. d3 e5\n3. e3 d5\n4. f3 c5\n5. c3 b3\n6. c2 b2\n7. c1 b5\n8. f4 f5\n9. 1f6-1 f6\n10. Ce6 1b2>1\n11. d2 a5\n12. 2f5<2 Ce4\n13. 1e6-1 d4\n14. d1 1e4-1\n15. c4 b4\n16. c6 2e3<2\n17. f2 e4\n18. f5 e6\n19. 1c6-1 b2\n20. f1 1e4>1\n21. c6 2c2+2\n22. 1c4-1 3d3<3\n23. b6 a2\n24. 1b6-1 c4\n25. 2c5-2 d3\n26. 3c4>3 a4\n27. a6 a3\n28. 4e5<31 e4\n29. e3 1e4-1\n30. 1f5-1 2e3>2\n31. 2f4-2 1d3+1\n32. 4d5-4 d5\n33. 5d4+5 d3\n34. 4f3<13 R-0');
  // game.parse('[Site "PlayTak.com"]\n[Event "Online Play"]\n[Date "2018.09.19"]\n[Time "21:22:37"]\n[Player1 "Whitez"]\n[Player2 "Blackz"]\n[Clock "10:0 +20"]\n[Result "R-0"]\n[Size "6"]\n1. a1 f6\n2. d3 e5\n3. e3 d5\n4. f3 c5\n5. c3 b3\n6. c2 b2\n7. c1 b5\n8. f4 f5\n9. 1f6-1 f6\n10. Ce6 1b2>1\n11. d2 a5\n12. 2f5<2 Ce4\n13. 1e6-1 d4\n14. d1 1e4-1\n15. c4 b4\n16. c6 2e3<2\n17. f2 e4\n18. f5 e6\n19. 1c6-1 b2\n20. f1 1e4>1\n21. c6 2c2+2\n22. 1c4-1 3d3<3\n23. b6 a2\n24. 1b6-1 c4\n25. 2c5-2 d3\n26. 3c4>3 a4\n27. a6 a3\n28. 4e5<31 e4\n29. e3 1e4-1\n30. 1f5-1 2e3>2\n31. 2f4-2 1d3+1\n32. 4d5-4 d5\n33. 5d4+5 d3\n34. 4f3<13 R-0');
  // x.last(false, true);
  console.log("Loaded ptn module");


  // var db = pgp('postgres://takserver3:defaultpass@localhost:5432/takdb');
  const port = 3000
  app.use(bodyParser.urlencoded({extended:true}));

  var hash = bcrypt.hashSync('mypass', 10);
  var res = bcrypt.compareSync("mypass", hash);
  console.log(`Result: ${res}, ${hash}`);

  db.one('SELECT * from login where username = $1', 'henk')
  .then(function (data) {
    console.log('DATA:', data.passhash)
    var res = bcrypt.compareSync("myp1ass", data.passhash);
    console.log(`DB Result: ${res}`);
  })
  .catch(function (error) {
    console.log('ERROR:', error)
  })

  // app.get('/', (req, res) => {
  //   // res.send('Hello World!')
  //   res.redirect('/index.html');
  // })
  app.ws('/mysocket',
  // ensureLoggedIn('/login'),
   function(ws, req) {
    ws.on('close', function() {
      console.log('The connection was closed!');
    });
    ws.on('error', function() {
      console.log('The connection was errored!');
    });
    if (!req.isAuthenticated()) {
      console.log("Dropping unauthenticated websocket!");
      // ws.send('Not authenticated!', 401);
      ws.close(1008); // Policy Violation error code
      return;
    }
    ws.on('message', function(message) {
      console.log(`Received message from ${req.user}: ${message}`);
      var q = JSON.parse(message);
      
      db.one('SELECT * FROM games WHERE active_player=$1 AND gameID=$2', [req.user, q.gameID])
      .then(function (gamedata) {
        var x = new Board();
        global.app = x;
        var game = new Game(x);
        x.init(game);
        // game.parse('[Site "PlayTak.com"]\n[Event "Online Play"]\n[Date "2018.09.19"]\n[Time "21:22:37"]\n[Player1 "Whitez"]\n[Player2 "Blackz"]\n[Clock "10:0 +20"]\n[Result "R-0"]\n[Size "6"]\n1. a1 a1\n2. d3 e5\n3. e3 d5\n4. f3 c5\n5. c3 b3\n6. c2 b2\n7. c1 b5\n8. f4 f5\n9. 1f6-1 f6\n10. Ce6 1b2>1\n11. d2 a5\n12. 2f5<2 Ce4\n13. 1e6-1 d4\n14. d1 1e4-1\n15. c4 b4\n16. c6 2e3<2\n17. f2 e4\n18. f5 e6\n19. 1c6-1 b2\n20. f1 1e4>1\n21. c6 2c2+2\n22. 1c4-1 3d3<3\n23. b6 a2\n24. 1b6-1 c4\n25. 2c5-2 d3\n26. 3c4>3 a4\n27. a6 a3\n28. 4e5<31 e4\n29. e3 1e4-1\n30. 1f5-1 2e3>2\n31. 2f4-2 1d3+1\n32. 4d5-4 d5\n33. 5d4+5 d3\n34. 4f3<13 R-0');

        game.parse(gamedata.ptn);
       // console.log('Found0', q ? 'Valid' : 'Invalid', game);

        // console.log('State before move', game.is_valid ? 'Valid' : 'Invalid');
        x.current_ply = game.plys[game.plys.length-1];
        game.insert_ply(
          q.move,
          x.current_branch,
          Math.floor(game.plys.length/2) + 1,
          game.plys.length%2+1
        );
        // x.last(false, true);
        x.validate(game);
        // console.log('State after move', game.is_valid ? 'Valid' : 'Invalid');
        console.log(game.print_text());
        if (!game.is_valid) {
          console.log(game.print_text());
          throw 'Invalid move attempt';
        }
        return db.none('UPDATE games set ptn=$1 where gameID=$2', [game.print_text(), q.gameID]);
      })
      .catch(function (error) {
        console.log('ERROR for ' + q.username + ': ', error);
      });
    })
    // ws.send('ho!')
  })
  app.get('/getgame',
  ensureLoggedIn('/login') ,
  function(req, res) {
    console.log(`getgame for ${req.user} with id ${req.query.id}`);
    db.one('SELECT * FROM games WHERE (active_player=$1 OR active_player=$1) AND gameID=$2', [req.user, req.query.id])
    .then(function (gamedata) {
      res.send(JSON.stringify({ptn: gamedata.ptn}));
    });
  });

  app.get('/error', (req, res) => {
    res.send('Error; not logged in!')
  })
app.get('/login',
  function(req, res){
    res.send('<form action="/login23" method="post">\n<div>\n<label>Username:</label>\n<input type="text" name="username" id="username"/><br/>\n</div>\n<div>\n<label>Password:</label>\n<input type="password" name="password" id="password"/>\n</div>\n<div>\n<input type="submit" value="Submit"/>\n</div>\n</form>');
  });
  app.get('/failed',
  function(req, res){
    res.send('isAuthenticated: ' + req.isAuthenticated());
  });
app.post('/login23', 
passport.authenticate('local', { failureRedirect: '/error' }),
  function(req, res) {
    var adasd = req.body;
    res.redirect('/games');
  });

  // app.post('/login23', function(req, res, next) {
  //   passport.authenticate('local', function(err, user, info) {
  //     if (err) { return next(err); }
  //     if (!user) { return res.redirect('/login'); }
  //     req.logIn(user, function(err) {
  //       if (err) { return next(err); }
  //       return res.redirect('/users/' + user.username);
  //     });
  //   })(req, res, next);
  // });

// app.post('/login23', 
//   function(request, response, next) {
//     console.log(request.session)
//     passport.authenticate('local', 
//     function(err, user, info) {
//       if(!user){ response.send(info.message);}
//       else{
//         request.login(user, function(error) {
//             if (error) return next(error);
//             console.log("Request Login supossedly successful.");
//             return response.send('Login successful');
//         });
//         //response.send('Login successful');
//       }

//     })(request, response, next);
//   }
// );
app.get('/logout',
  function(req, res){
    req.logout();
    res.redirect('/bka');
  });

app.get('/profile',
  ensureLoggedIn('/failed') ,
  function(req, res){
    res.send("Great success!");
    // res.render('profile', { user: req.user });
});
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
    db.any('SELECT * FROM games WHERE player1=$1 OR player2=$1', req.user)
    .then(function (gamedata) {
      var tq = _.groupBy(gamedata, x => x.active_player == req.user);
      var fn = y => _
        .chain(y)
        .map(x => item_template({linkid: x.gameid, name: x.player1 == req.user ? x.player2 : x.player1}))
        .join('\n\n')
        .value();
      
      
      var result = overall_template({yourturn: fn(tq[true]), theirturn: fn(tq[false])});
      res.send(result);
    });

  // res.render('profile', { user: req.user });
});
app.get(/^(.+)$/, 
  ensureLoggedIn('/login') ,
  function(req, res)
{ 
  // console.log('static file request : ' + req.params);
  var f = '/home/sander/workspace/tak-async/PTN-Ninja/' + req.params[0];
  // console.log('Serving' + f);
  res.sendfile(f); 
});

  app.listen(port, () => console.log(`Example app listening on port ${port}!`))
});