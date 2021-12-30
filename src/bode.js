(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');
  const Chart = require('./chart');
  const Analyzer = require('./analyzer');

  class Bode {
    constructor(args={}) {
      let {
        fBase,              // base frequency
        fMax = 20000,       // maximum frequency
        width = 95,         // chart width
        sampleRate = 22050,
      } = args;

      this.chart = new Chart();
      this.analyzer = new Analyzer();

      Object.assign(this, {
        fBase, fMax, width, sampleRate,
      });
    }

    analyze(signal, opts={}) {
      let { fMax, width, chart, analyzer, sampleRate } = this;
      let fBase = 2 * sampleRate / signal.length; 
      let flogMax = Math.log10(fMax);
      let flogBase = Math.log10(fBase);
      let dflog = (flogMax - flogBase)/width;
      let { verbose, plot, label } = opts;

      let flog = flogBase;
      let results = [];
      let width1 = width - 1;
      for (let i = 0; i <= width1; i++) {
        flog = ((width1 - i)*flogBase + i*flogMax)/width1;
        let f = Math.pow(10, flog);
        let r = analyzer.phaseAmplitude({samples:signal, frequency:f});
        results.push(r);
      }
      let title = results.reduce((title, r,i)=> 
        ((i%10 === 0) ?  title += `   ${r.frequency.toExponential(1)} ` : title), 
        'f:');
      plot && chart.plot({data: results.map(r=>r.amplitude), title});
      plot && console.log(`Bode plot (${fBase}-${fMax}Hz): ${label}`);
      return { fBase, results };
    }

  }

  module.exports = exports.Bode = Bode;
})(typeof exports === "object" ? exports : (exports = {}));
