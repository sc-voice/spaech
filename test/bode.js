(typeof describe === 'function') && describe("bode", function() {
  const should = require("should");
  let {
    Bode,
    Chart,
    Signal,
    Noise,
  } = require('../index');
  this.timeout(10*1000);

  it('TESTTESTdefault ctor', ()=>{
     let bode = new Bode();
     let fMax = 20000; // maximum frequency
     let width = 95;  // chart width
     should(bode).properties({ fMax, width, });
  });
  it('TESTTESTplot()', ()=>{
    let verbose = 1;
    let width = 91;
    let bode = new Bode({width});
    let sampleRate = 22050;
    let msSample = 40;
    let nSamples =  Math.round(msSample * sampleRate / 1000);
    let whiteNoise = Noise.createWhiteNoise({nSamples});
    let sWhite = whiteNoise.sample();
    let rWhite = bode.analyze(sWhite, {label:'white noise', plot:verbose});
    should(rWhite).properties({fBase:50});
    let pinkNoise = Noise.createPinkNoise({nSamples});
    let sPink = pinkNoise.sample();
    let rPink = bode.analyze(sPink, {label:'pink noise', plot:verbose});

    should(rWhite.results.length).equal(width);
    should(rPink.results.length).equal(width);
  });


})
