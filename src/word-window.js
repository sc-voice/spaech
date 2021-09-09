(function(exports) {
  const { logger } = require('log-instance');
  const FACTORIAL = [1,1];

  class WordWindow {
    constructor(opts={}) {
      let {
        text = 'test',
        window = WordWindow.binomialWindow({width:3, range:'max1'}),
        alphabet,
        range = 'unitArea',
        signalFirst = 0,
        signalLast = 10,
      } = opts;

      alphabet = alphabet || WordWindow.alphabetOf(text);

      let alphaMap = {};
      if (typeof alphabet === 'string') {
        alphabet = alphabet.split('');
      }
      let windowPeak = window.reduce((a,v,i)=>{
        return window[a] < v ? i : a;
      }, 0);
      alphabet.forEach((a,i)=>{alphaMap[a] = i});
      this.signalFirst = signalFirst;
      this.signalLast = signalLast;
      this.alphabet = alphabet;
      this.alphaMap = alphaMap;
      this.text = text;
      this.textRange = text.length;
      this.window = window;
      this.w1 = [...window, 0];
      this.w2 = [0, ...window];
      this.windowPeak = windowPeak;

      let textSignalIndex = [];
      for (let iSig=signalFirst; iSig <= signalLast; iSig++) {
        let ti = this.textIndexAt(iSig);
        if (textSignalIndex.length <= ti) {
          textSignalIndex.push(iSig);
        }
      }
      this.textSignalIndex = textSignalIndex;
    }

    static alphabetOf(text) {
      if (text == null) return null;

      let map = {' ':' '};
      let alphabet =  text.toLowerCase().split('').reduce((a,c) => {
        if (!map[c]) {
          map[c] = c;
          a.push(c);
        }
        return a;
      }, [' ']);
      alphabet.sort();
      return alphabet;
    }

    static tween(v1, v2, s) {
      if (!(v1 instanceof Array && v2 instanceof Array)) {
        throw new Error('Expected two number vectors');
      }
      if (v1.length !== v2.length) {
        throw new Error('Expected number vectors of equal length');
      }

      return v1.reduce((a,n1,i) => {
        let n2 = v2[i];
        let vtween = (1-s)*n1 + s*n2;
        a.push(vtween);
        return a;
      }, []);
    }

    static factorial(x) {
      if (x < 0 || Math.ceil(x) !== x) { 
        throw new Error("factorial requires non-negative integer"); 
      }

      for (let i=FACTORIAL.length; i<=x; i++) {
        FACTORIAL[i] = i * FACTORIAL[i-1];
      }
      return FACTORIAL[x];
    }

    static binomialCoefficient(a,b) {
      let numerator = WordWindow.factorial(a);
      let denominator = WordWindow.factorial(a-b) * WordWindow.factorial(b);
      return numerator / denominator;
    }

    static binomialWindow(opts={}) {
      let {width=3, range='max1'} = opts;
      let window = [];
      let n = width - 1;
      if (n % 2) {
        throw new Error(`Expected odd width:${width}`);
      }
      for (let i = 0; i <= n; i++) {
        window.push(this.binomialCoefficient(n, i));
      }
      let scale;
      if (range === 'max1') {
        scale = 1.0/this.binomialCoefficient(n, n/2);
      } else if (range === 'sum1') {
        scale = 1/window.reduce((a,v) => a+v, 0);
      } else { // standard binomial coefficient
        scale = 1;
      }
      return window.map(v=>v*scale);
    }

    textIndexAt(iSignal) {
      let { text, signalFirst, signalLast } = this;
      let s = (iSignal - signalFirst) / (signalLast - signalFirst);
      let textEnd = text.length - 1;
      return Math.min(textEnd, Math.floor(s*text.length));
    }

    textAt(iSignal) {
      let { text, signalFirst, signalLast, w1, w2, windowPeak, textSignalIndex } = this;
      let t0 = this.textIndexAt(iSignal);
      let t1 = t0+1;
      let s = (iSignal - signalFirst) / (signalLast - signalFirst);
      let tsiFirst = textSignalIndex[t0];
      let tsiLast = t1 < textSignalIndex.length && textSignalIndex[t1] || signalLast;
      let ts0 = (tsiFirst - signalFirst) / (signalLast - signalFirst);
      let ts1 = (tsiLast - signalFirst) / (signalLast - signalFirst);
      let ts = (s - ts0)/(ts1-ts0);
      let w = WordWindow.tween(w1, w2, ts);

      return w.reduce((a,w,i)=>{
        let t = i-windowPeak;
        let c = text[t0+t] || ' ';
        a.push({c,w});
        return a;
      }, []);
    }

  }

  module.exports = exports.WordWindow = WordWindow;

})(typeof exports === "object" ? exports : (exports = {}));
