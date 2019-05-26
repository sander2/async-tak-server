// PTN Ninja by Craig Laparo is licensed under a Creative Commons
// Attribution-NonCommercial-ShareAlike 4.0 International License.
// http://creativecommons.org/licenses/by-nc-sa/4.0/

'use strict';

define(['lodash'], function (_) {

  var Piece = function (board, player, stone) {
    this.needs_updated = true;
    this.is_selected = false;
    this.board = board;
    this.player = 1*player || 1;
    this.stone = stone || 'F';
    this.true_stone = stone == 'C' ? stone : 'F';
    this.ply = null;
    this.square = null;
    this.captor = null;
    this.captives = [];
    this.piece_index = board.pieces[this.player][this.true_stone].length;
    if (this.stone == 'C') {
      this.piece_index += board.piece_counts.F;
    }

    board.all_pieces.push(this);
    board.pieces[this.player][this.true_stone].push(this);

    // _.bindAll(this, 'render');

    return this;
  };

  Piece.prototype.to_tps = function () {
    return _.map(this.captives, 'player').reverse().join('')
      + this.player
      + (this.stone == 'F' ? '' : this.stone);
  };

  Piece.prototype.set_ply = function (ply) {
    this.ply = ply;
    if (!ply.is_slide) {
      this.stone = ply.stone;
    }
  };

  Piece.prototype.set_captives = function (captives) {
    var that = this;

    this.captor = null;
    this.captives = captives || [];

    _.each(this.captives, function (captive, index) {
      captive.stack_index = index;
      captive.captor = that;
      captive.square = that.square;
      captive.stone = 'F';
      captive.captives.length = 0;
    });
  };



  return Piece;

});
