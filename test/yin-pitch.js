(typeof describe === 'function') && describe("yin-pitch", function() {
  const should = require("should");
  const fs = require('fs');
  const path = require('path');
  const { WaveFile } = require('wavefile');
  let {
    Chart,
  } = require('../index');

  let {
    Signal,
    YinPitch,
  } = require('../index');

  const NSAMPLES = 270; // minimum samples for low male voice @ 22050
  const SAMPLE_RATE = 22050; // 2 * 3 * 3 * 5 * 5 * 7 * 7

  this.timeout(10*1000);

  function sineWave(f,n, phase=0, sampleRate=22050) {
    let samples = [];
    for (let t = 0; t < n; t++) {
      let v = Math.sin(2*Math.PI*f*t/sampleRate+phase);
      samples.push(v);
    }
    return samples;
  }

  function zeros(n) {
    return [...new Int8Array(n)];
  }

  it("TESTTESTctor()", ()=>{
    let verbose = 0;
    let window = 10;
    let sampleRate = 22050; // default
    let fMin = 85; // male speech low
    let fMax = 300; // child speech high
    let tauEnd = Math.round(sampleRate/fMin);
    let yp = new YinPitch({window});

    should(yp).properties({ window, tauEnd, sampleRate, fMin, fMax});
  });
  it("TESTTESTautoCorrelate()", ()=>{
    let verbose = 1;
    let n = 100;
    let samples = sineWave(700, n);
    let ypa = [
      new YinPitch({window: 8}),
      new YinPitch({window: 9}),
      new YinPitch({window: 10}),
      new YinPitch({window: 11}),
      new YinPitch({window: 12}),
    ];
    let t = 0; // pitch at time t
    let acva = ypa.map(yp=>zeros(n-yp.window)
      .map((v,tau)=>yp.autoCorrelate(samples, t,tau)));
    let stats = acva.map(acv=>Signal.stats(acv));
    verbose && (new Chart({data:acva})).plot();

    // peaks depend on window size
    should.deepEqual(stats.map(s=>s.iMax), [ 34, 2, 33, 64, 32 ]);
  });
  it("TESTTESTacfDifference()", ()=>{
    let verbose = 1;
    let n = 100;
    let Q = 40; // determines arbitrary frequency to be detected
    let f = SAMPLE_RATE / Q;
    let phase = Math.PI/3; // arbitrary phase
    let samples = sineWave(f, n, phase);
    let ypa = [
      new YinPitch({samples, window: 8}),
      new YinPitch({samples, window: 9}),
      new YinPitch({samples, window: 10}),
      new YinPitch({samples, window: 11}),
      new YinPitch({samples, window: 12}),
    ];
    let t = 0; // pitch at time t
    let da = ypa.map(yp=>zeros(n-yp.window)
      .map((v,tau)=>yp.acfDifference(samples, t,tau)));
    let daz = da.map(d=>
      d.reduce(((a,v,i) => a==null || (d[i] < d[a]) ? (i || undefined) : a),undefined)
    );

    // The computed Q will be an integer multiple of the original Q
    should.deepEqual(daz, [Q, 2*Q, 2*Q, 2*Q, Q]);
    let title=`LEGEND: 1:samples, 2:ACFdifference/10`;
    verbose && (new Chart({title,data:[samples, da[2].map(v=>v/10)]})).plot();
  });
  it("TESTTESTpitch() sin", ()=>{
    let verbose = 1;
    let Q = 40; // determines arbitrary frequency to be detected
    let f = SAMPLE_RATE / Q;
    //f = 255;
    let phase = Math.PI/3; // arbitrary phase
    let yp = new YinPitch({window: 8});
    let samples = sineWave(f, NSAMPLES, phase);
    let pitch = yp.pitch(samples);
    let title=`LEGEND: 1:samples, 2:ACFdifference/10`;
    verbose && (new Chart({title,data:[samples],xInterval:4})).plot();
    verbose && console.log(`pitch`, pitch);
    should(pitch).equal(f);
  });

})
