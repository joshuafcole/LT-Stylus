(function(mod) {
  //@FIXME: Figure out shim to get Lexer without relying on CommonJS
  var cm = window.CodeMirror;
  mod(cm);
})(function(CodeMirror) {
  'use strict';

  var Lexer = require('./tokenizer');

  function identity(v) {
    return v;
  }

  var stuckTokens = 0;
  var MAX_STUCK = 3;

  CodeMirror.defineMode("stylus", function(config, parserConfig) {
    if (!parserConfig.propertyKeywords) {
      parserConfig = CodeMirror.resolveMode('text/x-styl');
    }

    function tokenStyle(token) {
      if(!token) {
        return null;
      }

      switch(token.type) {
        case 'Indent':
        case 'Outdent':
        case 'Space':
          return null;

        case 'Comment':
          return 'comment';

        case 'Selector':
          return 'qualifier';

        case 'Property':
          return 'property';

        case 'Identifier':
          return 'variable';

        case 'FnCall':
        case 'MixCall':
          return 'variable-2';

        case 'Operator':
          return 'operator';

        case 'Keyword':
        case 'AtRule':
          return 'keyword';

        case 'Unit':
        case 'Number':
          return 'number';
        case 'String':
          return 'string';
        case 'Color':
          return 'string-2';

        default:
          console.log('WARN Style not found for token:', token.type, JSON.stringify(token.val));
          return null;
      }
    }

    return {
      startState: function(base) {
        var lex = new Lexer({
          indent: base || 0
        });
        lex.line = 0;
        return lex;
      },

      copyState: function(old) {
        var lex = new Lexer(old.state);
        lex.line = old.line + 1;
        return lex;
      },

      token: function(stream, lexer) {
        var tok = lexer.nextToken(stream);

        // Guard agaist bugs completely exploding CM.
        if(!tok) {
          console.warn('Failed to advance stream at: [' + lexer.line + '/' + stream.pos + '] "' +
                          stream.string.slice(0, stream.pos) + '|' + stream.string.slice(stream.pos) + '"');
          console.log('State', lexer.state);

          //stream.match(/^(\w|\s|.)/, true);
          if(stuckTokens++ >= MAX_STUCK) {
            stream.skipToEnd();
            console.log('FATAL: Unable to match ' +  MAX_STUCK + ' consecutive tokens, aborting.');
          }
          return null;
        }

        stuckTokens = 0;
        //console.log('Tokenizing', delta, 'chars: "' + tokenizedStr + '" as ' + tok.type, 'remainder: "' + state.lexer.str.slice(0, -1) + '".');

        return tokenStyle(tok);
      },

      indent: function(state, textAfter) {
        return state.indent; // - indentUnit ???
      },

      electricChars: '}',
      blockCommentStart: '/*',
      blockCommentEnd: '*/',
      //fold: 'brace'
    };
  });

  CodeMirror.defineMIME('text/x-styl', {
    allowNested: true,
    name: 'stylus'
  });
});
