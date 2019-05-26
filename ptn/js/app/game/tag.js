// PTN Ninja by Craig Laparo is licensed under a Creative Commons
// Attribution-NonCommercial-ShareAlike 4.0 International License.
// http://creativecommons.org/licenses/by-nc-sa/4.0/

'use strict';

define([
  'ptn/js/app/game/result',
  'ptn/js/app/grammar',
  'lodash'
], function (Result, r, _) {

  var Tag = function (string, game, index) {
    var that = this
      , parts = string.match(r.grammar.tag_grouped);

    this.game = game;
    this.index = _.isNumber(index) ? index : game.tags.length;
    game.tags[this.index] = this;

    this.char_index = game.char_index;
    game.char_index += string.length;

    this.text = string;

    if (!parts) {
      game.is_valid = false;
      this.print = game.print_invalid;
      return this;
    }

    this.prefix = parts[1];
    this.name = parts[2];
    this.separator = parts[3];
    this.q1 = parts[4];
    this.value = parts[5];
    this.q2 = parts[6];
    this.suffix = parts[7];

    this.key = this.name.toLowerCase();
    this.icon = this.key;

    if (!_.has(r.tags, this.key)) {
      this.icon = 'unknown';
      game.m.warning(
        t.error.unrecognized_tag({tag: parts[2]})
      ).click(function () {
        app.set_caret([
          that.char_index + that.prefix.length,
          that.char_index + that.prefix.length + that.name.length
        ]);
      });
      return this;
    } else if (r.required_tags.indexOf(this.key) >= 0) {
      this.is_required = true;
    }

    if (!r.tags[this.key].test(this.value) && this.key != 'tps') {
      game.m[this.is_required ? 'error' : 'warning'](
        t.error.invalid_tag_value({tag: this.name, value: this.value})
      ).click(function () {
        app.set_caret([
          that.char_index + string.length
            - that.value.length - that.q2.length - that.suffix.length,
          that.char_index + string.length
            - that.q2.length - that.suffix.length
        ]);
      });
      if (this.is_required) {
        game.is_valid = false;
        return false;
      }
      return this;
    }

    if (this.key == 'result') {
      if (this.value) {
        new Result(this.value, game);
      }
      this.print_value = function () {
        return game.config.result ? game.config.result.print_value() : '';
      };
    } else if(this.key == 'tps') {
      this.print_value = _.bind(game.config.tps.print, game.config.tps);
    }else{
      game.config[this.key] = this.value;
    }

    return this;
  };

 
  Tag.prototype.print_value = function () {
    return ''+this.value;
  };

  Tag.prototype.print_text = function (update_char_index) {
    if (this.key == 'result') {
      this.value = this.game.config.result ?
        this.game.config.result.text : '';
      this.text = this.prefix
        + this.name
        + this.separator
        + this.q1
        + this.value
        + this.q2
        + this.suffix;
    }

    if (update_char_index) {
      this.char_index = this.game.char_index;
      this.game.char_index += this.text.length;
    }

    return this.text;
  };

  return Tag;

});
