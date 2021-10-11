(typeof describe === 'function') && describe("resonator", function() {
  const should = require("should");
  let {
    Chart,
    Resonator,
    YinPitch,
  } = require('../index');

  it("TESTTESTfilter()", async()=>{
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

})
