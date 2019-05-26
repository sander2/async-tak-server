// PTN Ninja by Craig Laparo is licensed under a Creative Commons
// Attribution-NonCommercial-ShareAlike 4.0 International License.
// http://creativecommons.org/licenses/by-nc-sa/4.0/

'use strict';

define(['ptn/js/app/grammar', 'lodash'], function (r, _) {

  var Comment = function (string, game) {
    var parts = string.match(r.grammar.comment_grouped);

    this.game = game;
    this.char_index = game.char_index;
    game.char_index += string.length;

    if (!parts) {
      this.prefix = string;
      this.text = '';
      this.suffix = '';
      return this;
    }

    this.prefix = parts[1];
    this.text = parts[2];
    this.suffix = parts[3];

    return this;
  };

  Comment.prototype.print = _.template(
    '<span class="comment">'+
      '<%=this.prefix%>'+
      '<span class="text"><%=this.text%></span>'+
      '<%=this.suffix%>'+
    '</span>'
  );

  Comment.prototype.print_text = function (update_char_index) {
    var text = this.prefix + this.text + this.suffix;

    if (update_char_index) {
      this.char_index = this.game.char_index;
      this.game.char_index += text.length;
    }

    return text;
  };

  Comment.parse = function(string, game) {
    var comments = _.map(
      string.match(r.grammar.comment_text),
      function (comment) {
        return new Comment(comment, game);
      }
    );

    return comments.length ? comments : null;
  };

  return Comment;

});
