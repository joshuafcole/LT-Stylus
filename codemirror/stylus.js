(function(mod) {
  //@FIXME: Figure out shim to get Lexer without relying on CommonJS
  var cm = window.CodeMirror;
  mod(cm);
})(function(CodeMirror) {
  "use strict";

  var Lexer = require('../node_modules/stylus/lib/lexer');

  function nextCount(stream, count) {
    var total = count;
    var out = '';
    while(count-- > 0) {
      if(stream.eol()) {
        throw new Error('Attempting to consume past end of line. Needed: ' + total + ' chars. Still need: ' + (count + 1) + ' chars.');
      }
      out += stream.next();
    }

    return out;
  }

  function identity(v) {
    return v;
  }

  var stuckTokens = 0;
  var MAX_STUCK = 3;

  CodeMirror.defineMode("stylus", function(config, parserConfig) {
    if (!parserConfig.propertyKeywords) {
      parserConfig = CodeMirror.resolveMode("text/x-styl");
    }

    var indentUnit = config.indentUnit,
        tokenHooks = parserConfig.tokenHooks,
        mediaTypes = parserConfig.mediaTypes || {},
        mediaFeatures = parserConfig.mediaFeatures || {},
        propertyKeywords = parserConfig.propertyKeywords || {},
        nonStandardPropertyKeywords = parserConfig.nonStandardPropertyKeywords || {},
        colorKeywords = parserConfig.colorKeywords || {},
        valueKeywords = parserConfig.valueKeywords || {},
        fontProperties = parserConfig.fontProperties || {},
        allowNested = parserConfig.allowNested;

    var type, override;

    function tokenStyle(token, state) {
      if(!token) {
        return null;
      }

      switch(token.type) {
        case 'indent':
          state.indent++;
          return null;
        case 'outdent':
          state.indent--;
          return null;

        case 'eos':
        case 'null':
        case 'newline':
        case 'space':
          return null;

        case 'keyword':
        case 'atrule':
        case 'function':
          return 'keyword';

        case 'comment':
          return 'comment';

        case 'op':
        case 'namedop':
        case '{':
        case '}':
        case '(':
        case ')':
        case '[':
        case ']':
          return 'operator';

        case 'ident':
          return 'variable';
        case 'boolean':
          return 'boolean';
        case 'literal':
          return 'atom';
        case 'unit':
          return 'number';
        case 'string':
          return 'string';
        case 'color':
          return 'string-2';
        case 'selector':
          return 'qualifier';
        default:
          console.log('WARN Style not found for token:', token.type, JSON.stringify(token.val));
          return null;
      }
    }

    return {
      startState: function(base) {
        return {
          indent: base || 0,
          multiComment: false,
          lexer: new Lexer('')
        };
      },

      copyState: function(state) {
        var ol = state.lexer;
        var nl = new Lexer('');
        // Shallow copy stash and indent stack.
        nl.stash = ol.stash.map(identity);
        nl.indentStack = ol.indentStack.map(identity);
        nl.indentRe = ol.indentRe;
        nl.lineno = ol.lineno;
        nl.column = ol.column;
        nl.str = ol.str;

        return {
          indent: state.indent || 0,
          multiComment: state.multiComment,
          lexer: nl
        };
      },

      token: function(stream, state) {
        // @FIXME: Speculatively buffer using short-circuited capture regexes from Lexer.
        var buf;
        if(!state.lexer.str || state.lexer.str === '\n') {
          stream.eatSpace();
          // Catch trailing whitespace.
          buf = stream.match(/.*/, false)[0].trim();

          // Bail if the line is effectively empty.
          if(buf.length === 0) { return null;}

          // The lexer uses newlines as end of line anchors in a few places.
          buf += '\n';
          state.lexer.setString(buf);
        } else {
          buf = state.lexer.str;
        }

        // Handle multiline comments for the lexer.
        var startMultiComment = buf.indexOf('/*');
        if(state.multiComment || startMultiComment === 0) {
          state.multiComment = true;
          var endMultiComment = buf.indexOf('*/');
          if(endMultiComment === -1) {
            stream.skipToEnd();
          } else {
            // Catch end of comment as well.
            endMultiComment += 2;
            state.multiComment = false;
            stream.match(/.*\*\//, true);
          }

          // This buffer is trashed, refetch it next token.
          state.lexer.setString('');
          return 'comment';
        }

        // Handle single line comments for the lexer.
        if(buf.indexOf('//') === 0) {
          state.lexer.setString('');
          stream.skipToEnd();
          return 'comment';
        }

        var tok = state.lexer.next();
        var delta = buf.length - state.lexer.str.length;

        // Guard agaist bugs completely exploding CM.
        if(delta < 1) {
          if(stuckTokens++ >= MAX_STUCK || delta < 0) {
            stream.skipToEnd();
            console.log('FATAL: Non-positive delta for ' + MAX_STUCK + ' consecutive tokens, aborting.');
            return null;
          }

          console.log('WARN: Non-positive delta ' + delta);
          return null;
        }

        var tokenizedStr = nextCount(stream, delta);

        if(!tok) {
          if(stuckTokens++ >= MAX_STUCK) {
            stream.skipToEnd();
            console.log('FATAL: Unable to match ' +  MAX_STUCK + ' consecutive tokens, aborting.');
            return null;
          }
          console.log('WARN: No token matched for string "' +  tokenizedStr + '"');
          return null;
        }

        stuckTokens = 0;
        if(tok.type.match(/^([.]{1,3}|&&|\|\||[!<>=?:]=|\*\*|[-+*\/%]=?|[,=?:!~<>&\[\]])([ \t]*)/)) {
          tok.type = 'op';
        } else if(tok.type.match(/^(not|and|or|is a|is defined|isnt|is not|is)(?!-)\b([ \t]*)/)) {
          tok.type = 'namedop';
        }


        //console.log('Tokenizing', delta, 'chars: "' + tokenizedStr + '" as ' + tok.type, 'remainder: "' + state.lexer.str.slice(0, -1) + '".');

        return tokenStyle(tok, state);
      },

      indent: function(state, textAfter) {
        return state.indent; // - indentUnit ???
      },

      electricChars: "}",
      blockCommentStart: "/*",
      blockCommentEnd: "*/",
      //fold: "brace"
    };
  });

  CodeMirror.defineMIME("text/x-styl", {
    allowNested: true,
    name: "stylus"
  });
});
