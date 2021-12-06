(typeof describe === 'function') && describe("noise", function() {
  const should = require("should");
  let {
    Chart,
    Signal,
    Noise,
  } = require('../index');
  this.timeout(10*1000);

  it("createWhiteNoize", ()=>{
    let noise = Noise.createWhiteNoise();
    should(noise).properties({
      basis: 12,
      variance: 1,
      color: 'white',
      nSamples: 96,
      scale: 1,
    });
  });
  it("createPinkNoize", ()=>{
    let noise = Noise.createPinkNoise();
    let basis = 12;
    should(noise).properties({
      basis,
      variance: 1,
      color: 'pink',
      nSamples: 96,
      scale: 1,
    });
    let { randomBasis } = noise;
    should(randomBasis).instanceOf(Array);
    for (let i = 0; i < basis; i++) {
      should(isNaN(randomBasis[i])).equal(false);
    }
  });
  it("sample() steady-state white noise", ()=> {
    let verbose = 0;
    let nSamples = 1000;
    let scale = 5;
    let noise = Noise.createWhiteNoise({nSamples, scale});
    should(noise).properties({scale});
    let samples = noise.sample();
    let title = `1:white noise (scale:${scale})`;
    let chart = new Chart({title});
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
    verbose && console.log({stdDev2});

    try {
      should(count).equal(nSamples);
      should(max).below(5*stdDev);
      should(min).above(-5*stdDev);
      should(Math.abs(median)).below(7e-1);
      should(Math.abs(avg)).below(7e-1);
      should(Math.abs(stdDev - scale)).below(scale*0.1);
    } catch(e) {
      console.warn(`WARN ${__filename} may fail`, stats);
      throw e;
    }
  });
  it("sample() frequency synchronized white-noise", ()=> {
    let verbose = 0;
    let sampleRate = 22050;
    let frequency = 200;
    let periodSamples = sampleRate / frequency;
    let phase = Math.PI/2;
    let noise = Noise.createWhiteNoise({frequency, phase, });
    let nSamples = 95;
    let samples = noise.sample({nSamples});
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
  it("sample() steady-state pink noise", ()=> {
    let verbose = 0;
    let nSamples = 1000;
    let noise = Noise.createPinkNoise({nSamples});
    let samples = noise.sample();
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
    should(Math.abs(median)).below(1.3);
    should(Math.abs(avg)).below(1.3);
    should(Math.abs(stdDev - 1)).below(5e-1);
  });
  it("sample() frequency synchronized pink-noise", ()=> {
    let verbose = 0;
    let sampleRate = 22050;
    let frequency = 200;
    let periodSamples = sampleRate / frequency;
    let phase = Math.PI/2;
    let nSamples = 95*2;
    let noise = Noise.createPinkNoise({frequency, phase, nSamples});
    let samples = noise.sample();
    let envelope = Signal.cosineWave({frequency, phase, nSamples});
    let title = `1:envelope 2:pink-noise`;
    let chart = new Chart({lines:13, xInterval:Math.round(nSamples/95)});
    verbose && chart.plot({data:[envelope, samples]});
    let statsLo = Signal.stats(samples.slice(45,65)); // near zero-crossing
    let statsHi = Signal.stats(samples.slice(20,40)); // near peak
    verbose && console.log({periodSamples, statsLo, statsHi});

    // noise at signal peak is higher than at zero crossing
    should(Math.abs(statsLo.stdDev)).below(0.8*Math.abs(statsHi.stdDev)); // AC
  });

})
