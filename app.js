const express = require('express')
const app = express()
var expressWs = require('express-ws')(app);
var bcrypt = require('bcryptjs');

var requirejs = require('requirejs');
var pgp = require('pg-promise')()

requirejs(["ptn/js/app/game", "ptn/js/app/board", "ptn/js/app/game/move"], function(Game, Board, Move) {
  // var x = new Board();
  // global.app = x;
  // var game = new Game(x);
  // x.init(game);
  // // game.parse('[Site "PlayTak.com"]\n[Event "Online Play"]\n[Date "2018.09.19"]\n[Time "21:22:37"]\n[Player1 "Whitez"]\n[Player2 "Blackz"]\n[Clock "10:0 +20"]\n[Result "R-0"]\n[Size "6"]\n1. a1 a1\n2. d3 e5\n3. e3 d5\n4. f3 c5\n5. c3 b3\n6. c2 b2\n7. c1 b5\n8. f4 f5\n9. 1f6-1 f6\n10. Ce6 1b2>1\n11. d2 a5\n12. 2f5<2 Ce4\n13. 1e6-1 d4\n14. d1 1e4-1\n15. c4 b4\n16. c6 2e3<2\n17. f2 e4\n18. f5 e6\n19. 1c6-1 b2\n20. f1 1e4>1\n21. c6 2c2+2\n22. 1c4-1 3d3<3\n23. b6 a2\n24. 1b6-1 c4\n25. 2c5-2 d3\n26. 3c4>3 a4\n27. a6 a3\n28. 4e5<31 e4\n29. e3 1e4-1\n30. 1f5-1 2e3>2\n31. 2f4-2 1d3+1\n32. 4d5-4 d5\n33. 5d4+5 d3\n34. 4f3<13 R-0');
  // game.parse('[Site "PlayTak.com"]\n[Event "Online Play"]\n[Date "2018.09.19"]\n[Time "21:22:37"]\n[Player1 "Whitez"]\n[Player2 "Blackz"]\n[Clock "10:0 +20"]\n[Result "R-0"]\n[Size "6"]\n1. a1 f6\n2. d3 e5\n3. e3 d5\n4. f3 c5\n5. c3 b3\n6. c2 b2\n7. c1 b5\n8. f4 f5\n9. 1f6-1 f6\n10. Ce6 1b2>1\n11. d2 a5\n12. 2f5<2 Ce4\n13. 1e6-1 d4\n14. d1 1e4-1\n15. c4 b4\n16. c6 2e3<2\n17. f2 e4\n18. f5 e6\n19. 1c6-1 b2\n20. f1 1e4>1\n21. c6 2c2+2\n22. 1c4-1 3d3<3\n23. b6 a2\n24. 1b6-1 c4\n25. 2c5-2 d3\n26. 3c4>3 a4\n27. a6 a3\n28. 4e5<31 e4\n29. e3 1e4-1\n30. 1f5-1 2e3>2\n31. 2f4-2 1d3+1\n32. 4d5-4 d5\n33. 5d4+5 d3\n34. 4f3<13 R-0');
  // x.last(false, true);
  console.log("Loaded ptn module");

  var cn = {
      host: 'localhost', // 'localhost' is the default
      port: 5432, // 5432 is the default;
      database: 'takdb',
      user: 'takserver3',
      password: 'defaultpass'
  };

  var db = pgp(cn);
  // var db = pgp('postgres://takserver3:defaultpass@localhost:5432/takdb');
  const port = 3000

  var hash = bcrypt.hashSync('mypass', 10);
  var res = bcrypt.compareSync("mypass", hash);
  console.log(`Result: ${res}, ${hash}`);
  app.get('/', (req, res) => {
    res.send('Hello World!')
  })

  db.one('SELECT * from login where username = $1', 'henk')
    .then(function (data) {
      console.log('DATA:', data.passhash)
      var res = bcrypt.compareSync("myp1ass", data.passhash);
      console.log(`DB Result: ${res}`);
    })
    .catch(function (error) {
      console.log('ERROR:', error)
    })


  app.ws('/', function(ws, req) {
    console.log("Connection!");
    ws.on('message', function(message) {
      console.log(`Received message => ${message}`);
      var q = JSON.parse(message);
      
      // authenticate user
      db.one('SELECT * from login where username = $1', q.username)
      .then(function (logindata) {
        console.log('DATA:', logindata.passhash)
        return bcrypt.compare(q.password, logindata.passhash);
      })
      .then(function (res) {
        if (!res) {
          throw "Invalid password";
        }
        // db.one('insert into games (player1, player2, active_player, ptn) values ($1, $2, $3, $4)', ["henk", "piet", "henk", '[Date "2019.05.20"]\n[Player1 "henk"]\n[Player2 "piet"]\n[Size "6"]\n[Result ""]\n\n1. a6 a6\n'])
        // .catch(function (error) {
        //   console.log('ERRORz for ' + q.username + ': ', error);
        // });
        return db.one('SELECT * FROM games WHERE active_player=$1 AND gameID=$2', [q.username, q.gameID]);
      })
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
    ws.send('ho!')
  })


  app.listen(port, () => console.log(`Example app listening on port ${port}!`))
});