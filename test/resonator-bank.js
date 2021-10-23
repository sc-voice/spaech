(typeof describe === 'function') && describe("resonator-bank", function() {
  const should = require("should");
  const assert = require("assert");
  let {
    Chart,
    Resonator,
    ResonatorBank,
    Signal,
    YinPitch,
  } = require('../index');

  it("default ctor()", ()=>{
    let rb = new ResonatorBank();
    let length = 10;
    let sampleRate = 22050;
    let scale = 16384;
    let frameSize = 192;
    let frequency = 200;
    let phase = 0;
    let r = 0.98;
    should(rb).properties({ length, sampleRate, scale, frameSize, r, frequency, phase});

    let { resonators } = rb;
    should(resonators.length).equal(length);
    for (let i = 0; i < length; i++) {
      should(resonators[i] instanceof Resonator);
      should(resonators[i]).properties({ sampleRate, r, scale, });
    }
  });
  it("custom ctor()", ()=>{
    let length = 20;
    let sampleRate = 44100;
    let scale = 10000;
    let frameSize = 96;
    let frequency = 100;
    let phase = 1;
    let tween = true;
    let rFirst = 0.98;
    let rLast = 0.9;
    let r = rFirst;
    let rb = new ResonatorBank({
      length, sampleRate, scale, frameSize, r, frequency, phase, tween,
    });
    should(rb).properties({ 
      length, sampleRate, scale, frameSize, r, frequency, phase, tween,
    });

    let { resonators } = rb;
    should(resonators.length).equal(length);
    for (let i = 0; i < length; i++) {
      should(resonators[i] instanceof Resonator);
      should(resonators[i]).properties({ sampleRate, scale, r, tween});
    }

    // resonator bank r-factors can be tweened
    let rbTween = new ResonatorBank({
      length, sampleRate, scale, frameSize, r:[rFirst, rLast], frequency, phase, tween,
    });
    let { resonators: rTween } = rbTween;
    should(rTween[0].r).equal(rFirst);
    should(rTween.slice(-1)[0].r).equal(rLast);
    should(rTween[1].r).below(rFirst).above(rLast);
  });
  it("resonate()" , ()=>{
    let verbose = 0;
    let length = 3;
    let frameSize = 90;
    let rb = new ResonatorBank({length, frameSize});
    should(rb).properties({
      length, frameSize,
    });
    let f0 = 800;
    let amplitude = 10000;
    let harmonics = [
      { order: 1, frequency: f0, amplitude: amplitude, phase: 0.1*Math.PI, },
      { order: 2, frequency: 2*f0, amplitude: 0.8*amplitude, phase: -0.2*Math.PI, },
      { order: 3, frequency: 3*f0, amplitude: 0.4*amplitude, phase: 0.3*Math.PI, },
    ];
    let samples = [
      rb.resonate(harmonics),
      rb.resonate(harmonics),
      rb.resonate([]),  // no input energy
    ];
    let chart = new Chart();
    verbose && chart.plot({dataset:samples.flat(), lineLength: frameSize});
    let stats0 = Signal.stats(samples[0]);
    let stats1 = Signal.stats(samples[1]);
    let stats2a = Signal.stats(samples[2].slice(0, frameSize/2));
    let stats2b = Signal.stats(samples[2].slice(frameSize/2));
    should(stats0).properties({ count: frameSize, });
    should(stats1).properties({ count: frameSize, });

    // signal builds initially
    should(stats0.stdDev).above(1).below(stats1.stdDev);

    // signal decays without input
    should(stats2a.stdDev).above(1).below(stats1.stdDev);
    should(stats2b.stdDev).above(1).below(stats2a.stdDev);
  });

})
