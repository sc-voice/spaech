(typeof describe === 'function') && describe("white-noise", function() {
  const should = require("should");
  let {
    Chart,
    Signal,
    WhiteNoise,
  } = require('../index');
  this.timeout(10*1000);

  it("TESTTESTdefault ctor", ()=>{
    let wn = new WhiteNoise();
    should(wn).properties({
      variance: 1,
      supportSize: 256,
      type: Array,
    });
  });
  it("TESTTESTsample()", ()=> {
    let verbose = 0;
    let variance = 4;
    let supportSize = 1000;
    let type0 = Int32Array;
    let type = Int16Array;
    let wn = new WhiteNoise({supportSize, variance, type:type0});
    should(wn).properties({supportSize, variance, type:type0});
    let nSamples = 1000;
    let samples = wn.sample({nSamples, type});
    should(samples).instanceOf(type);
    let chart = new Chart();
    verbose && chart.plot({data:samples, xInterval:Math.round(nSamples/95)});
    let stats = Signal.stats(samples);
    verbose && console.log({stats});
    let { count, max, min, stdDev, median, avg } = stats;
    let stdDev2 = stdDev * stdDev;
    let distribution = samples.reduce((a,v) => {
      let iv = Math.round(v);
      a[iv] = (a[iv] || 0) + 1;
      return a;
    }, {});
    verbose && console.log({distribution, stdDev2});

    should(count).equal(nSamples);
    should(max).below(5*stdDev);
    should(min).above(-5*stdDev);
    should(Math.abs(median)).below(3e-1);
    should(Math.abs(avg)).below(3e-1);
    should(Math.abs(stdDev - Math.sqrt(variance))).below(5e-1);
  });

})
