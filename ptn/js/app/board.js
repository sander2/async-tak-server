// PTN Ninja by Craig Laparo is licensed under a Creative Commons
// Attribution-NonCommercial-ShareAlike 4.0 International License.
// http://creativecommons.org/licenses/by-nc-sa/4.0/

'use strict';

define([
  'ptn/js/app/board/piece',
  'ptn/js/app/board/square',
  'lodash'
], function (Piece, Square, _) {

  var Board = function () {
    this.turn = 1;
    this.ply_index = 0;
    this.current_ply = null;
    this.current_move = null;
    this.current_branch = '';
    this.target_branch = '';
    this.branch_options = [];
    this.current_id = '';
    this.ply_is_done = false;
    this.is_eog = false;
    this.size = 5;
    this.squares = {};
    this.rows = [];
    this.cols = [];
    this.all_pieces = [];
    this.pieces = {};
    this.flat_score = {1:0, 2:0};
    this.empty_count = this.size * this.size;
    this.selected_pieces = [];
    this.tmp_ply = null;
    this.init_callbacks = [];
    this.resize_callbacks = [];
    this.ply_callbacks = [];
    this.branch_callbacks = [];

    _.bindAll(this, [
      'update_view',
      'direction_name'
    ]);

    return this;
  };

  // Board.prototype.parse = function (input, is_from_URL, is_original) {
  //   var plaintext, header, body, i, file, missing_tags, tps;

  //   plaintext = input;

    
  //   this.original_ptn = plaintext;
  //   sessionStorage.ptn = this.original_ptn;
    
  //   // this.on_parse_start(false, is_original);

  //   this.is_valid = true;
  //   // this.tags.length = 0;
  //   // this.moves.length = 0;
  //   this.indexed_moves = {};
  //   this.branches = {};
  //   this.plys.length = 0;
  //   this.char_index = 0;

  //   file = plaintext.match(r.grammar.ptn_grouped);
  //   if (!file) {
  //     // todos: error handling
  //     // this.m.error(t.error.invalid_notation);
  //     // this.is_valid = false;
  //     // this.text = plaintext;
  //   } else {
  //     header = file[1];
  //     body = file[3];
  //     this.suffix = file[4] || '';

  //     // Header
  //     header = header.match(r.grammar.tag);
  //     this.config = {
  //       player1: t.Player1_name,
  //       player2: t.Player2_name
  //     };
  //     for (var i = 0; i < header.length; i++) {
  //       new Tag(header[i], this);
  //     }
  //     missing_tags = _.difference(
  //       r.required_tags,
  //       _.map(this.tags, 'key')
  //     );
  //     if (missing_tags.length) {
  //       this.m.error(t.error.missing_tags({tags: missing_tags}));
  //       this.is_valid = false;
  //     }

  //     // Game comments
  //     this.comment_text = Comment.parse(file[2], this);
  //     this.comments = this.comment_text ? _.map(this.comment_text, 'text') : null;

  //     // Body
  //     if (body) {
  //       // Recursively parse moves
  //       new Move(body, this);
  //     }

  //   }

  //   if (this.simulator.validate(this)) {
  //     this.on_parse_end(false, is_original);
  //     return true;
  //   } else {
  //     return false;
  //   }

  // };
  // Convert between [0, 0] and 'a1'
  Board.prototype.square_coord = function (square) {
    const a = 'a'.charCodeAt(0);
    if (_.isString(square)) {
      return [
        square[0].charCodeAt(0) - a,
        1*square[1] - 1
      ];
    } else if (_.isArray(square)) {
      return String.fromCharCode(a + square[0]) + (square[1] + 1);
    }
  };

  Board.prototype.on_init = function (fn) {
    if (fn) {
      this.init_callbacks.push(fn);
    } else {
      _.invokeMap(this.init_callbacks, 'call', this, this);
    }

    return this;
  };



  Board.prototype.on_ply = function (fn) {
    if (fn) {
      this.ply_callbacks.push(fn);
    } else {
      _.invokeMap(this.ply_callbacks, 'call', this, this.current_ply);
    }

    return this;
  };

  Board.prototype.do_ply = function () {
    var square, ply_result;

    if (this.ply_is_done) {
      return true;
    }

    if (!this.current_ply || this.selected_pieces.length) {
      return false;
    }

    square = this.squares[this.current_ply.square];

    if (this.current_ply.is_illegal || !this.current_ply.is_valid) {
      this.pause();
      return false;
    }

    if (this.current_ply.is_nop) {
      ply_result = true;
    } else if (this.current_ply.is_slide) {
      ply_result = square.slide(this.current_ply);
    } else {
      ply_result = square.place(this.current_ply);
    }

    this.ply_is_done = ply_result;
    this.is_eog = !!this.current_ply.result;
    this.turn = this.current_ply.turn == 1 ? 2 : 1;

    if (!this.defer_render) {
      this.on_ply();
    }

    if (!this.current_ply.next) {
      this.pause();
    }

    return ply_result;
  };


  Board.prototype.clear = function () {
    this.turn = 1;
    this.ply_index = 0;
    this.current_ply = null;
    this.current_move = null;
    this.current_branch = '';
    this.target_branch = '';
    this.branch_options.length = 0;
    this.current_id = '';
    this.ply_is_done = false;
    this.is_eog = false;
    this.squares = {};
    this.all_pieces = [];
    this.flat_score[1] = 0;
    this.flat_score[2] = 0;
    this.empty_count = this.size * this.size;
    this.selected_pieces.length = 0;
    this.tmp_ply = null;
    this.pieces = {
      1: {
        F: [],
        C: []
      },
      2: {
        F: [],
        C: []
      }
    };

    this.rows.length = 0;
    this.cols.length = 0;
  };


  Board.prototype.init = function (game, silent) {
    var that = this
      , i, j, row, col, col_letter, square, piece, tps
      , a = 'a'.charCodeAt(0);

    this.game = game;
    this.size = 1*6;//game.config.size;
    this.empty_count = this.size * this.size;
    const all_piece_counts = {
      3: { F: 10, C: 0, total: 10 },
      4: { F: 15, C: 0, total: 15 },
      5: { F: 21, C: 1, total: 22 },
      6: { F: 30, C: 1, total: 31 },
      7: { F: 40, C: 2, total: 42 },
      8: { F: 50, C: 2, total: 52 },
      9: { F: 60, C: 3, total: 63 }
    };
    this.piece_counts = _.clone(all_piece_counts[this.size]); // TODOS: fix this
    this.tps = undefined;

    this.saved_ply_index = this.ply_index;
    this.saved_ply_is_done = this.ply_is_done;
    this.clear();

    if (!this.piece_counts) {
      return false;
    }

    for (col = 0; col < this.size; col++) {
      col_letter = String.fromCharCode(a + col);
      this.cols[col] = col_letter;
    }

    for (row = 0; row < this.size; row++) {
      this.rows[row] = row + 1;
    }

    // Create all the squares and label the neighbors
    for (row = 0; row < this.size; row++) {
      for (col = 0; col < this.size; col++) {
        square = new Square(this, row, col);
        this.squares[square.coord] = square;
        if (row) {
          square.neighbors['-'] = this.squares[this.square_coord([col, row-1])];
          this.squares[this.square_coord([col, row-1])].neighbors['+'] = square;
        }
        if (col) {
          square.neighbors['<'] = this.squares[this.square_coord([col-1, row])];
          this.squares[this.square_coord([col-1, row])].neighbors['>'] = square;
        }
      }
    }
    var x = 5;
    // Create all the pieces
    _.each(this.pieces, function (stones, player) {
      _.each(stones, function (count, stone) {
        while (that.pieces[player][stone].length < that.piece_counts[stone]) {
          new Piece(that, player, stone);
        }
      })
    });

    

   this.set_current_ply(0, false);

    return true;
  };

  Board.prototype.last = function (event, silently) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
      this.pause();
    }

    if (!this.current_ply) {
      return;
    }

    this.defer_render = true;
    while (
      this.current_ply
      && this.do_ply()
      && this.current_ply.next
    ) {
      this.set_current_ply(
        this.current_ply.next.get_branch(this.target_branch).index,
        false
      );
    }

    if (!silently) {
      this.defer_render = false;
      this.update_view();
    }
  };
  Board.prototype.validate = function (game) {
    var branch;

    if (this.init(game, true)) {
      this.last(false, true);
      this.check_game_end();
      for (branch in this.game.branches) {
        this.go_to_ply(this.game.branches[branch].index, true, true);
        this.last(false, true);
        this.check_game_end();
      }
      // this.clear();
      return true;
    } else {
      return false;
    }
  };


  Board.prototype.trim_to_current_ply = function (remove_all) {
    if (this.game.plys.length) {
      this.game.trim_to_current_ply(this, remove_all);
    }
  };


  Board.prototype.current_linenum = function () {
    if (this.current_ply) {
      return this.current_move.linenum.value
        + 1*(this.ply_is_done && this.current_ply.turn == 2);
    } else {
      return this.game.config.tps && this.game.config.tps.move ?
        this.game.config.tps.move : 1;
    }
  };


  // Returns true if game end, or if not game end but ply has result
  Board.prototype.check_game_end = function () {
    var pieces = this.pieces[this.turn == 1 ? 2 : 1]
      , roads = this.find_roads()
      , result;

    this.is_eog = false;

    if (!this.current_ply) {
      return false;
    }

    if (roads && roads.length) {
      // Road
      if (roads[this.current_ply.turn].length) {
        result = this.current_ply.turn == 1 ? 'R-0' : '0-R';
      } else if (roads[this.current_ply.turn == 1 ? 2 : 1].length) {
        // Completed opponent's road
        result = this.current_ply.turn == 1 ? '0-R' : 'R-0';
      }
    } else if (this.empty_count == 0 || pieces.F.concat(pieces.C).length == 0) {
      // Last empty square or last piece
      if (this.flat_score[1] == this.flat_score[2]) {
        // Draw
        result = '1/2-1/2';
      } else if (this.flat_score[1] > this.flat_score[2]) {
        result = 'F-0';
      } else {
        result = '0-F';
      }
    } else if (this.current_move.result && this.current_move.result.type != '1') {
      this.current_move.result = null;
      this.game.update_text(true);
      // Return true to indicate a change was made
      return true;
    } else {
      return false;
    }

    result = this.current_move.insert_result(result, this.current_ply.turn);
    if (roads && roads.length) {
      result.roads = roads;
    }

    this.is_eog = true;
    return true;
  };


  Board.prototype.find_roads = function () {
    var possible_roads = { 1: {}, 2: {} };

    // Recursively follow a square and return all connected squares and edges
    function _follow_road(square) {
      var squares = {}
        , edges = {}
        , i, neighbor, road;

      squares[square.coord] = square;
      delete possible_roads[square.player][square.coord];

      if (square.is_edge) {
        // Note which edge(s) the road touches
        edges[square.edges[0]] = true;
        if (square.edges[1]) {
          edges[square.edges[1]] = true;
        }
      }

      for (i = 0; i < square.road_connections.length; i++) {
        neighbor = square.neighbors[square.road_connections[i]];
        if (_.has(possible_roads[square.player], neighbor.coord)) {
          // Haven't gone this way yet; find out where it goes
          road = _follow_road(neighbor);
          // Report back squares and edges
          _.assign(squares, road.squares);
          _.assign(edges, road.edges);
        }
      }

      return {
        squares: squares,
        edges: edges
      };
    }

    // Remove all dead_ends and their non-junction neighbors from squares
    // Mutates squares, but not dead_ends
    function _remove_dead_ends(dead_ends, squares, ordinality) {
      var next_neighbors
        , i, j, square, neighbor;

      dead_ends = dead_ends.concat();

      while (dead_ends.length) {
        for (i = 0; i < dead_ends.length; i++) {
          square = dead_ends[i];

          next_neighbors = [];
          for (var j = 0; j < square.road_connections.length; j++) {
            neighbor = square.neighbors[square.road_connections[j]];
            if (_.has(squares, neighbor.coord)) {
              next_neighbors.push(neighbor);
            }
          }

          if (
            next_neighbors.length < 2 && (
              !square.is_edge ||
              ordinality && square[ordinality == 'ns' ? 'is_ns' : 'is_ew']
            )
          ) {
            delete squares[square.coord];
            dead_ends[i] = next_neighbors[0];
          } else {
            dead_ends[i] = undefined;
          }
        }
        dead_ends = _.compact(dead_ends);
      }
    }

    // Gather player-controlled squares and dead ends
    var possible_dead_ends = {
          1: { ns: [], ew: [] },
          2: { ns: [], ew: [] }
        }
      , dead_ends = []
      , coord, square, edges;

    for (coord in this.squares) {
      square = this.squares[coord];
      edges = square.is_edge ? square.edges.join('') : null;

      if (square.road_connections.length == 1) {
        if (square.is_edge) {
          // An edge with exactly one friendly neighbor
          possible_roads[square.player][coord] = square;

          if (!square.is_corner) {
            if (square.is_ns) {
              possible_dead_ends[square.player].ns.push(square);
            } else if (square.is_ew) {
              possible_dead_ends[square.player].ew.push(square);
            }
          }
        } else {
          // A non-edge dead end
          dead_ends.push(square);
        }
      } else if (square.road_connections.length > 1) {
        // An intersection
        possible_roads[square.player][coord] = square;
      }
    }

    // Remove dead ends not connected to edges
    _remove_dead_ends(dead_ends, possible_roads[1]);
    _remove_dead_ends(dead_ends, possible_roads[2]);

    // Find roads that actually bridge opposite edges
    var roads = {
          1: [], 2: [],
          squares: {
            1: {}, 2: {}, all: {}
          }
        }
      , road;

    for (var i = 1; i <= 2; i++) {
      while (!_.isEmpty(possible_roads[i])) {
        // Start with any square in possible_roads
        for (coord in possible_roads[i]) break;

        // Follow the square to get all connected squares
        road = _follow_road(possible_roads[i][coord]);

        // Find connected opposite edge pair(s)
        road.edges.ns = road.edges['-'] && road.edges['+'] || false;
        road.edges.ew = road.edges['<'] && road.edges['>'] || false;

        if (road.edges.ns || road.edges.ew) {
          if (!road.edges.ns || !road.edges.ew) {
            // Remove dead ends connected to the non-winning edges
            _remove_dead_ends(
              possible_dead_ends[i][road.edges.ns ? 'ew' : 'ns'],
              road.squares,
							road.edges.ns ? 'ew' : 'ns'
            );
          }

          // Keep the road; at least one opposite edge pair is connected
          roads[i].push({
            ns: road.edges.ns,
            ew: road.edges.ew,
            squares: _.keys(road.squares)
          });
          _.assign(roads.squares[i], road.squares);
          _.assign(roads.squares.all, road.squares);
        }
      }
    }

    roads.squares[1] = _.keys(roads.squares[1]);
    roads.squares[2] = _.keys(roads.squares[2]);
    roads.squares.all = _.keys(roads.squares.all);
    roads.length = roads[1].length + roads[2].length;

    return roads;
  };


  Board.prototype.to_tps = function () {
    var ply = this.current_ply
      , squares = []
      , i, j;

    for (i = 0; i < this.size; i++) {
      squares[i] = [];
      for (j = 0; j < this.size; j++) {
        squares[i][j] = this.squares[
          this.square_coord([j, this.size - 1 - i])
        ].to_tps();
      }
      squares[i] = squares[i].join(',');
    }
    squares = squares.join('/');

    squares = squares.replace(/x((?:,x)+)/g, function (spaces) {
      return 'x'+(1 + spaces.length)/2;
    });

    return squares + ' ' +
      this.turn + ' ' +
      (ply.move.linenum.value + 1*(this.turn == 1 && this.ply_is_done));
  };


  Board.prototype.render = function () {
    var that = this;

    if (this.$view) {
      this.$ptn.off();
      this.$branch_button.off();
    }

    this.set_current_ply(0, false);
    this.$view = $(this.tpl.board(this));
    this.$board = this.$view.find('.board');
    this.$unplayed_bg = this.$view.find('.unplayed-bg').parent();
    this.$row_labels = this.$view.find('.row.labels');
    this.$col_labels = this.$view.find('.col.labels');
    this.$squares = this.$view.find('.squares');
    this.$pieces = this.$view.find('.pieces');
    this.$ptn = app.$viewer.find('.current-move');
    this.$branches = this.$ptn.find('.branches');
    this.$branch_button = this.$ptn.find('.branch_button');
    this.$ptn.$prev_move = this.$ptn.find('.prev_move');
    this.$ptn.$next_move = this.$ptn.find('.next_move');
    this.$scores = this.$view.find('.scores');
    this.$bar1 = this.$scores.find('.player1');
    this.$bar2 = this.$scores.find('.player2');
    this.$score1 = this.$bar1.find('.score');
    this.$score2 = this.$bar2.find('.score');

    this.$branch_button.on('touchstart click', this.toggle_branches);

    this.rotate();

    this.$squares.append.apply(
      this.$squares,
      _.invokeMap(this.squares, 'render')
    );

    this.$pieces.empty();
    this.$pieces.append.apply(
      this.$pieces,
      _.invokeMap(
        this.all_pieces,
        'render'
      )
    );

    if (this.game.plys.length) {
      this.go_to_ply(
        _.isUndefined(this.saved_ply_index) ? 0 : this.saved_ply_index,
        this.saved_ply_is_done
      );
    } else {
      this.on_ply();
    }

    this.$ptn.on('click tap', '.move .ply', function (event) {
      var $ply = $(event.currentTarget)
        , ply_index = $ply.data('index');

      that.go_to_ply(
        ply_index,
        that.ply_index == ply_index
          && !that.ply_is_done
      );
    }).on('click tap', '.prev_move', this.prev_move)
      .on('click tap', '.next_move', this.next_move);

    return this.$view;
  };




  Board.prototype.update_view = function() {
    this.update_pieces();
    this.update_squares();
    this.update_scores();
    this.on_ply();
  };


  Board.prototype.update_squares = function() {
    _.invokeMap(
      _.filter(this.squares, 'needs_updated'),
      'update_view'
    );
  };
  Board.prototype.set_current_ply = function (index, ply_is_done) {
    if (_.isBoolean(ply_is_done)) {
      this.ply_is_done = ply_is_done;
    }
    this.ply_index = index || 0;
    this.current_ply = this.game.plys[index] || null;
    this.current_move = this.current_ply ? this.current_ply.move : null;
    if (this.current_ply) {
      if (ply_is_done) {
        this.is_eog = !!this.current_ply.result;
        this.turn = this.current_ply.turn == 1 ? 2 : 1;
      } else {
        this.is_eog = false;
        this.turn = this.current_ply.turn;
      }
      this.current_branch = this.current_ply.branch;
      if (
        this.target_branch != this.current_branch
        && !this.current_ply.is_in_branch(this.target_branch)
      ) {
        // Switch to a different branch
        this.target_branch = this.current_branch;
        this.on_branch_change();
      }
    }
    this.current_id = this.current_move ? this.current_move.id : '';
  };

  Board.prototype.update_pieces = function() {
    _.invokeMap(
      _.filter(this.all_pieces, { needs_updated: true, captor: null }),
      'render'
    );
  };


  Board.prototype.update_ptn = function() {
    var ply1, ply2, $ply1, $ply2;

    if (this.current_ply && !this.current_ply.move.is_invalid) {
      ply1 = this.current_ply.move.plys[0];
      ply2 = this.current_ply.move.plys[1];

      if (this.$move && this.$move.length) {
        this.$move.remove();
      }
      this.$move = $(this.current_ply.move.print_for_board(this.target_branch));

      this.$branch_button.after(this.$move);
      $ply1 = this.$ptn.find('.ply:eq(0)');
      $ply2 = this.$ptn.find('.ply:eq(1)');

      if (ply1) {
        if (ply1.turn == this.current_ply.move.first_turn) {
          if (ply1 == this.current_ply) {
            $ply1.addClass('active');
          }
        }
      }
      if (ply2) {
        if (ply2 == this.current_ply) {
          $ply2.addClass('active');
        }
      }
    } else if (this.$move) {
      this.$move.empty();
    }

    this.show_branches();
  };


  Board.prototype.update_scores = function() {
    var total = (this.flat_score[1] + this.flat_score[2])/100;
    this.$score1.text(this.flat_score[1]);
    this.$score2.text(this.flat_score[2]);
    this.$bar1.width(total ? this.flat_score[1]/total+'%' : '');
    this.$bar2.width(total ? this.flat_score[2]/total+'%' : '');
  };



  Board.prototype.update_valid_squares = function () {
    if (!this.$view) {
      return;
    }

    var that = this
      , square, direction, neighbor;

    function clear_all() {
      var coord, square;
      for (coord in that.squares) {
        square = that.squares[coord];
        square.needs_updated = true;
        square.is_valid = false;
        square.is_selected = false;
        square.is_placed = false;
      }
    }

    if (this.tmp_ply && this.selected_pieces.length) {
      clear_all();
      square = this.selected_pieces[0].square;
      square.is_valid = true;
      square.is_selected = true;
      this.validate_neighbor(square, square.neighbors[this.tmp_ply.direction]);
    } else if (this.selected_pieces.length) {
      clear_all();
      square = this.selected_pieces[0].square;
      square.is_valid = true;
      square.is_selected = true;
      for (direction in square.neighbors) {
        this.validate_neighbor(square, square.neighbors[direction]);
      }
    } else if(!this.is_eog) {
      for (square in this.squares) {
        square = this.squares[square];
        square.needs_updated = true;
        if (square.piece) {
          if (this.current_ply && square.piece.ply === this.current_ply) {
            square.is_valid = true;
            square.is_selected = false;
            square.is_placed = true;
          } else if (square.piece.player == this.turn) {
            square.is_valid = true;
            square.is_selected = false;
            square.is_placed = false;
          } else {
            square.is_valid = false;
            square.is_selected = false;
            square.is_placed = false;
          }
        } else {
          square.is_valid = true;
          square.is_selected = false;
          square.is_placed = false;
        }
      }
    } else {
      clear_all();
      if (this.current_ply && !this.current_ply.is_slide) {
        square = this.squares[this.current_ply.square];
        square.is_valid = true;
        square.is_placed = true;
      }
    }

    if (this.$view) {
      this.update_squares();
    }
  };


  Board.prototype.validate_neighbor = function (square, neighbor, pending_drops) {
    if (
      neighbor && (
        !neighbor.piece
        || neighbor.piece.stone != 'C' && (
          neighbor.piece.stone != 'S'
          || this.selected_pieces[0].stone == 'C'
            && this.selected_pieces.length == 1 + (pending_drops || 0)
        )
      )
    ) {
      if (!neighbor.is_valid) {
        neighbor.needs_updated = true;
      }
      neighbor.is_valid = true;
      return true;
    }
    return false;
  };
  Board.prototype.illegal_ply = function (ply) {
    ply.is_illegal = true;
    this.game.is_valid = false;
    return false;
  };

  Board.prototype.do_ply = function () {
    var square, ply_result;

    if (this.ply_is_done) {
      return true;
    }

    if (!this.current_ply || this.selected_pieces.length) {
      return false;
    }

    square = this.squares[this.current_ply.square];

    if (this.current_ply.is_illegal || !this.current_ply.is_valid) {
      this.pause();
      return false;
    }

    if (this.current_ply.is_nop) {
      ply_result = true;
    } else if (this.current_ply.is_slide) {
      ply_result = square.slide(this.current_ply);
    } else {
      ply_result = square.place(this.current_ply);
    }

    this.ply_is_done = ply_result;
    this.is_eog = !!this.current_ply.result;
    this.turn = this.current_ply.turn == 1 ? 2 : 1;

    if (!this.defer_render) {
      this.on_ply();
    }

    // if (!this.current_ply.next) {
    //   this.pause();
    // }

    return ply_result;
  };




  Board.prototype.opposite_direction = {
    '+': '-',
    '-': '+',
    '<': '>',
    '>': '<'
  };

  Board.prototype.direction_names = {
    '+': 'up',
    '-': 'down',
    '<': 'left',
    '>': 'right'
  };

  Board.prototype.direction_name = function (direction) {
    return this.direction_names[direction];
  };

  
  return Board;

});
