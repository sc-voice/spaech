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
  this.timeout(10*1000);

  it("TESTTESTdefault ctor", ()=>{
    let resonator = new Resonator();
    let halfLifeSamples = 96;
    let r = Math.pow(0.5, 1/halfLifeSamples);
    should(resonator).properties({
      sampleRate: 22050,
      frequency: 200,
      r,
      t: 0,
      halfLifeSamples,
      x1: 0,
      x2: 0,
      y1: 0,
      y2: 0,
      scale: 1,
    });
  });
  it("TESTTESTcustom ctor", ()=>{
    let sampleRate = 22000;
    let halfLifeSamples = 48;
    let x1 = 1;
    let x2 = 2;
    let y1 = 3;
    let y2 = 4;
    let scale = 5;
    let t = 1;
    let frequency = 100;
    let r = Math.pow(0.5, 1/halfLifeSamples);

    let resonator = new Resonator({t, frequency, sampleRate, halfLifeSamples, x1, x2, y1, y2, scale});
    should(resonator).properties({ 
      frequency, t, sampleRate, halfLifeSamples, x1, x2, y1, y2, scale, r });

    let resonator2 = new Resonator({t, frequency, sampleRate, r, x1, x2, y1, y2, scale});
    halfLifeSamples = Math.log(0.5) / Math.log(r);
    should(resonator2).properties({ 
      frequency, t, sampleRate, halfLifeSamples, x1, x2, y1, y2, scale, r });
  });
  it("resonate() decays without input", ()=>{
    let verbose = 0;
    let r1 = new Resonator();
    let nSamples = 400;

    // resonate can be single-stepped with some degree of precision
    let s1 = r1.resonate({nSamples});
    let s2 = r1.resonate({nSamples, scale:0});
    let chart = new Chart();
    verbose && chart.plot({data:[s1,s2], xInterval:5});
    let stats1b = Signal.stats(s1.slice(nSamples/2));
    let stats2a = Signal.stats(s2.slice(0,nSamples/2));
    let stats2b = Signal.stats(s2.slice(nSamples/2));
    verbose && console.log({stats1b,stats2a,stats2b});

    // resonate with no signal energy results in a decaying signal
    should(stats2a.stdDev).above(stats1b.stdDev*0.7);   
    should(stats2b.stdDev).below(stats2a.stdDev/2);
  });
  it("oscillate()", ()=>{
    let verbose = 0;
    let frequency = 30*Math.random() + 150;
    let phase = 2*Math.PI*Math.random();
    let scale = 1000 * Math.random();
    let nSamples = 400;
    let sine = Signal.sineWave({frequency, phase, scale, nSamples});
    let r1 = new Resonator({frequency, phase, scale});
    let r2 = new Resonator({frequency, phase, scale});

    // oscillate can be single-stepped with some degree of precision
    let s1 = r1.oscillate({nSamples});
    should.deepEqual(s1, sine);
    let s2 = [...new Int8Array(nSamples)].map(()=>r2.oscillate()[0]);
    let precision = 10;
    should.deepEqual(s1.map(v=>v.toFixed(precision)), s2.map(v=>v.toFixed(precision)));
    let chart = new Chart();
    verbose && chart.plot({data:[s1], xInterval:5});
  });
  it("TESTTESTresonate() one or many", ()=>{
    let verbose = 0;
    let r1 = new Resonator();
    let r2 = new Resonator();
    let nSamples = 400;

    // resonate can be single-stepped with some degree of precision
    let s1 = r1.resonate({nSamples});
    let s2 = [...new Int8Array(nSamples)].map(()=>r2.resonate()[0]);
    let precision = 10;
    should(r1.y1.toFixed(precision), r2.y1.toFixed(precision));
    should(r1.y2.toFixed(precision), r2.y2.toFixed(precision));
    should(r1.x1.toFixed(precision), r2.x1.toFixed(precision));
    should(r1.x2.toFixed(precision), r2.x2.toFixed(precision));
    should.deepEqual(s1.map(v=>v.toFixed(precision)), s2.map(v=>v.toFixed(precision)));
    let chart = new Chart();
    verbose && chart.plot({data:[s1], xInterval:5});
    let stats = Signal.stats(s1);
    should(stats.iMax).equal(357);
    should(stats.max.toFixed(precision)).equal((0.9215343958).toFixed(precision));
  });
  it("resonate() changes frequency", ()=>{
    let verbose = 0;
    let r1 = new Resonator({r:0.99});
    let nSamples = 400;
    let xInterval = 4;
    let f1 = 220;
    let f2 = Number((1.2*f1).toFixed(1));
    let s1 = r1.resonate({nSamples, frequency:f1, scale:1});
    should(r1).properties({ frequency:f1, t:1*nSamples});
    let chart = new Chart();
    verbose && chart.plot({title: `resonate $ f1}...${f2} Hz`, data:[s1], xInterval});

    let s2 = r1.resonate({nSamples, frequency:f2});
    verbose && chart.plot({title: `resonate ${f2} Hz`, data:[s2], xInterval});
    should(r1).properties({ frequency:f2, scale:1, t:2*nSamples});

    let s3 = r1.resonate({nSamples, scale:0});
    verbose && chart.plot({title:`resonate scale:0`, data:[s3], xInterval});
    let stats = Signal.stats(s1);
    //should(stats).properties({iMax:358, max:0.8320586576302439});
    should(r1).properties({ frequency:f2, scale:0, t:3*nSamples});
  });
  it("resonate() tweens", ()=>{
    let verbose = 0;
    let scale = 1;
    // For pitch detection, the f2 and f1 must be close
    let f1 = 220;
    let f2 = Number((1.3*f1).toFixed(1));
    let scale1 = 1;
    let scale2 = 2;
    let r = 0.999;
    let r1 = new Resonator({r, frequency:f1});
    let r2 = new Resonator({r, frequency:f1});
    let r3 = new Resonator({r, frequency:f1, tween:true});
    let nSamples = 2000;
    let s1 = r1.resonate({nSamples, frequency:f2, tween:false, scale:scale1});
    let s2 = r2.resonate({nSamples, frequency:f2, tween:true, scale:scale2});
    let s3 = r3.resonate({nSamples, frequency:f2, scale:scale2}); // tween from instance
    let rFun = YinPitch.yinE1;
    let yp = new YinPitch({rFun});
    let xInterval = 5;
    let chart = new Chart();
    let title = `resonate(${f1}...${f2}Hz) 1:no-tween 2:tween`;
    verbose && chart.plot({title, data:[s1,s2], xInterval});
    should(r1).properties({ frequency:f2, scale:scale1, t:1*nSamples});
    should(r2).properties({ frequency:f2, scale:scale2, t:1*nSamples});
    should.deepEqual(s3, s2); // both are tweened

    // Tweening changes the resonator throughout the interval,
    // so the perceived pitch will be intermediate
    let {pitch:pitch1} = yp.pitch(s1);
    let {pitch:pitch2} = yp.pitch(s2);
    verbose && console.log({pitch1, pitch2});
    should(Math.round(pitch2)).above(f1).below(pitch1);
    should(Math.round(pitch1)).equal(f2);
  });
  it("TESTTESTlinear recurrence", ()=>{
    let verbose = 0;
    let fs = 22050;
    fs = 1*94;
    let N = 94;
    N = fs;
    let xInterval = Math.floor(fs/94);
    let fVoice = 800;
    fVoice = fs/2;
    let beta = 2*Math.PI*fVoice/fs;
    let phase = 2*Math.PI * Math.random();
    phase = 0; // TODO
    let amplitude = 100;
    let chart = new Chart({lines:29});
    let halfLife = N/4;
    let gamma = Math.pow(0.5, 1/halfLife);
    verbose && console.log({gamma})
    let a1 = -2 * gamma * Math.cos(beta);
    let a0 = gamma * gamma;
    let y0 = amplitude * Math.cos(phase);
    let y1 = amplitude * gamma * Math.cos(beta + phase);
    let yk0 = y0;
    let yk1 = y1;
    let samples = new Array(N).fill(0).map((v,i) => {
      if (i === 0) { return y0 };
      if (i === 1) { return y1 };
      let yk2 =  - a1 * yk1 - a0 * yk0;
      yk0 = yk1;
      yk1 = yk2;
      return yk2;
    });
    verbose && console.log({a1,a0,y1,y0, decay:Math.pow(gamma, N), halfLife});
    verbose && chart.plot({data:samples, xInterval});
  });
  it("TESTTESTcos identity", ()=>{
    let pi2 = Math.PI * 2;
    for (let i = 0; i < 100; i++) {
      let x = pi2*Math.random();
      let y = pi2*Math.random();
      let v1 = Math.cos(y)*Math.cos(x -y);
      let v2 = 0.5*(Math.cos(x)+Math.cos(x - 2*y));
      let v12 = v1 - v2;
      try {
        should(Math.abs(v12)).below(8e-16);
      } catch(e) {
        console.log({x,y,v1,v2,v12 });
        throw e;
      }
    }
  });

})
