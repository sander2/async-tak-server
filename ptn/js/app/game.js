// PTN Ninja by Craig Laparo is licensed under a Creative Commons
// Attribution-NonCommercial-ShareAlike 4.0 International License.
// http://creativecommons.org/licenses/by-nc-sa/4.0/

'use strict';

define([
  'ptn/js/app/game/tag',
  'ptn/js/app/game/move',
  'ptn/js/app/game/linenum',
  'ptn/js/app/game/comment',
  'ptn/js/app/grammar',
  'lodash',
], function (Tag, Move, Linenum, Comment, r, _) {

  var Game = function (simulator) {
    this.simulator = simulator;
    this.is_valid = false;
    this.config = {};
    this.tags = [];
    this.moves = [];
    this.indexed_moves = {};
    this.branches = {};
    this.plys = [];
    this.ptn = '';

    return this;
  };
  Game.prototype.insert_ply = function (ply, branch, linenum, turn, is_done, flattens) {
    var move_id = branch + linenum + '.'
      , prev_move_id = branch + (linenum - 1) + '.'
      , move = this.indexed_moves[move_id]
      , prev_move, current_ply;

    if (!move) {
      if (prev_move_id in this.indexed_moves) {
        prev_move = this.indexed_moves[prev_move_id];
        move = new Move(move_id, this);
        this.moves.splice(prev_move.index + 1, 0, this.moves.pop());
        for (var i = prev_move.index + 1; i < this.moves.length; i++) {
          this.moves[i].index = i;
        }
        move.suffix = prev_move.suffix;
        prev_move.suffix = '\n';
      } else {
        move = new Move(this.suffix + move_id, this);
        this.suffix = '';
      }
    }

    if (current_ply = move.plys[turn - move.first_turn]) {
      if (current_ply.text == ply) {
        app.update_after_ply_insert(current_ply.index, is_done);
        return current_ply;
      }
      move = new Move('\n\n' + '1. ', this);

      if (turn == 2) {
        move.insert_ply('--', 1);
      }
    }

    ply = move.insert_ply(ply, turn, flattens);

    // app.update_after_ply_insert(ply.index, is_done);

    return ply;
  };
  Game.prototype.parse = function (input) {
    var plaintext, header, body, i, file, missing_tags, tps;


    plaintext = input;

    this.original_ptn = plaintext;

    this.text = false;
    this.comment_text = false;
    this.comments = false;
    this.is_valid = true;
    this.caret_moved = false;
    this.tags.length = 0;
    this.moves.length = 0;
    this.indexed_moves = {};
    this.branches = {};
    this.plys.length = 0;
    this.char_index = 0;

    file = plaintext.match(r.grammar.ptn_grouped);
    if (!file) {
      this.is_valid = false;
      this.text = plaintext;
    } else {

      header = file[1];
      body = file[3];
      this.suffix = file[4] || '';

      // Header
      header = header.match(r.grammar.tag);
      this.config = {
        player1: undefined,
        player2: undefined
      };
      // parse the header, including player names. Sets properties in _this_
      for (var i = 0; i < header.length; i++) {
        new Tag(header[i], this);
      }
      missing_tags = _.difference(
        r.required_tags,
        _.map(this.tags, 'key')
      );
      if (missing_tags.length) {
        this.is_valid = false;
      }

      // Game comments
      this.comment_text = Comment.parse(file[2], this);
      this.comments = this.comment_text ? _.map(this.comment_text, 'text') : null;

      // Body
      if (body) {
        // Recursively parse moves
        new Move(body, this);
      }
    }

    if (this.simulator.validate(this)) {
      return true;
    } else {
      return false;
    }
  };


  // Game.prototype.get_unique_id = function (linenum) {
  //   var new_id, prefix, suffix;

  //   if (_.isString(linenum)) {
  //     linenum = Linenum.parse_id(linenum);
  //   }

  //   if (config.branch_numbering) {
  //     new_id = 1;
  //     prefix = linenum.branch + linenum.value + '-';
  //     suffix = '.'+linenum.value+'.';
  //     while (_.has(this.indexed_moves, prefix + new_id + suffix)) {
  //       new_id++;
  //     }
  //   } else {
  //     new_id = linenum.id;
  //     prefix = '';
  //     suffix = linenum.value+'.';
  //     while (_.has(this.indexed_moves, new_id + suffix)) {
  //       new_id += '.';
  //     }
  //   }

  //   return prefix + new_id + suffix;
  // };

  Game.prototype.get_linenum = function () {
    var last_move = _.last(this.moves);

    if (last_move && last_move.linenum) {
      return Linenum.parse_id(
        last_move.linenum.branch+(last_move.linenum.value + 1)+'.'
      );
    } else {
      return Linenum.parse_id(this.get_first_linenum()+'.');
    }
  };

  Game.prototype.get_first_linenum = function () {
    return 1;
  };




  // create ptn of this game
  Game.prototype.print_text = function (update_char_index) {
    var output = '';

    if (update_char_index) {
      this.char_index = 0;
    }

    output += _.invokeMap(this.tags, 'print_text', update_char_index).join('');
    if (this.comment_text) {
      output += _.invokeMap(
        this.comment_text, 'print_text', update_char_index
      ).join('');
    }
    output += _.invokeMap(this.moves, 'print_text', update_char_index).join('');
    output += this.suffix;

    return output;
  };

  Game.prototype.get_bounds = function (token) {
    return [
      token.char_index + (token.prefix ? token.prefix.length : 0),
      token.char_index + (token.print_text ? token.print_text().length : 0)
        - (token.suffix ? token.suffix.length : '')
    ];
  };

  return Game;

});
