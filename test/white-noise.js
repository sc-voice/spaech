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
      basis: 12,
      variance: 1,
    });
  });
  it("sample() steady-state white noise", ()=> {
    let verbose = 0;
    let wn = new WhiteNoise();
    let nSamples = 1000;
    let samples = wn.sample({nSamples});
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
    should(Math.abs(stdDev - 1)).below(5e-2);
  });
  it("TESTTESTsample() frequency synchronized white-noise", ()=> {
    let verbose = 1;
    let sampleRate = 22050;
    let frequency = 200;
    let periodSamples = sampleRate / frequency;
    let phase = Math.PI/2;
    let wn = new WhiteNoise({frequency, phase, });
    let nSamples = 95;
    let samples = wn.sample({nSamples});
    let envelope = Signal.cosineWave({nSamples, frequency, phase});
    let chart = new Chart({lines:13});
    let title = `1:envelope 2:white-noise`;
    verbose && chart.plot({data:[envelope, samples]});
    let statsLo = Signal.stats(samples.slice(45,65)); // near zero-crossing
    let statsHi = Signal.stats(samples.slice(20,40)); // near peak
    verbose && console.log({periodSamples, statsLo, statsHi});
    should(statsLo.stdDev).below(0.5);  // noise is lower at zero-crossing
    should(statsHi.stdDev).above(0.6);  // noise is higher at peaks
    should(Math.abs(statsLo.stdDev)).below(0.5*Math.abs(statsHi.stdDev));
    should(Math.abs(statsLo.avg)).below(0.2); 
    should(Math.abs(statsHi.avg)).below(0.6); 
  });

})
