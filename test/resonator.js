(typeof describe === 'function') && describe("resonator", function() {
  const should = require("should");
  let {
    Chart,
    Resonator,
    Signal,
    YinPitch,
  } = require('../index');
  const SINE200 = [
    0,
    0.05980415394503417,
    0.11939422454024434,
    0.17855689479863665,
    0.2370803777154975,
    0.2947551744109042,
  ];

  it("TESTTESTdefault ctor", ()=>{
    let resonator = new Resonator();
    should(resonator).properties({
      sampleRate: 22050,
      frequency: 200,
      r: 0.995,
      t: 0,
      x1: 0,
      x2: 0,
      y1: 0,
      y2: 0,
    });
  });
  it("TESTTESTfilter()", ()=>{
    let frequency = 210;
    let tStart = 0;
    let phase = 0;
    let nSamples = 5;
    let scale = 1;
    let y0 = Resonator.sineWave({frequency, scale, phase, nSamples, tStart} );
    should.deepEqual(y0, SINE200.slice(0,5));
    let y1 = Resonator.sineWave({frequency, scale, phase, nSamples, tStart:1} );
    should.deepEqual(y1, SINE200.slice(1,6));
  });
  it("filter()", async()=>{
    let r = 0.995;
    let frequency = 210;
    let hr = new Resonator({r,frequency});
    let nSamples = 1000;
    let scale = 1;
    let x = YinPitch.sineWave({frequency, scale, phase:0.25*2*Math.PI, nSamples, });
    let y = [...hr.filter(x)];
    let chart = new Chart();
    let title = `resonator 1:input 2:output`;
    chart.plot({title, data:[x,y], xInterval:4});

    let yp = new YinPitch();
    let { pitch } = yp.pitch(x);
    console.log({pitch});
  });
  it("TESTTESTresonate() one or many", ()=>{
    let verbose = 0;
    let r1 = new Resonator();
    let r2 = new Resonator();
    let nSamples = 400;

    // resonate can be single-stepped
    let s1 = r1.resonate({nSamples});
    let s2 = [...new Int8Array(nSamples)].map(()=>r2.resonate()[0]);
    should.deepEqual(r1, r2);
    should.deepEqual(s1, s2);
    let chart = new Chart();
    verbose && chart.plot({data:[s1], xInterval:5});
    let stats = Signal.stats(s1);
    should(stats).properties({iMax:358, max:0.8320586576302439});
  });
  it("TESTTESTresonate() changes frequency", ()=>{
    let verbose = 1;
    let r1 = new Resonator({r:0.99});
    let nSamples = 400;
    // resonate can be single-stepped
    let xInterval = 4;
    let frequency1 = 220.5;
    let frequency2 = Number((2*frequency1).toFixed(1));
    let s1 = r1.resonate({nSamples, frequency1, });
    //should(r1).properties({ frequency:frequency2, t:1*nSamples});
    let chart = new Chart();
    verbose && chart.plot({title: `resonate ${frequency1}...${frequency2} Hz`, data:[s1], xInterval});

    let s2 = r1.resonate({nSamples, frequency1: frequency2});
    verbose && chart.plot({title: `resonate ${frequency2} Hz`, data:[s2], xInterval});
    should(r1).properties({ frequency:frequency2, t:2*nSamples});

    let s3 = r1.resonate({nSamples, scale1:0});
    verbose && chart.plot({title:`resonate scale:0`, data:[s3], xInterval});
    let stats = Signal.stats(s1);
    //should(stats).properties({iMax:358, max:0.8320586576302439});
    should(r1).properties({ frequency: frequency2, t:3*nSamples});
  });

})
