(typeof describe === 'function') && describe("mdct", function() {
  const should = require("should");
  const fs = require('fs');
  const path = require('path');
  const { WaveFile } = require('wavefile');
  let {
    Mdct,
    Signal,
  } = require('../index');
  this.timeout(10*1000);

  const EVAM_ME_SUTTAM = path.join(__dirname, 'data/evam-me-suttam.wav');
  const EVAM_ME_SUTTAM_MDCT = path.join(__dirname, 'data/evam-me-suttam.mdct');
  const EVAM_ME_SUTTAM_MDCT_WAV = path.join(__dirname, 'data/evam-me-suttam_mdct.wav');
  const AN9_20_4_3 = path.join(__dirname, 'data/an9.20_4.3.wav');

  async function wavSamples(fnam=EVAM_ME_SUTTAM) {
    let buf = await fs.promises.readFile(fnam);
    let wf = new WaveFile(buf);
    return wf.getSamples(false, Int16Array);
  }

  function assertValidWindow(window, tolerance=3.7e-16, frameSize=8) {
    let N = frameSize/2;
    for (let n = 0; n < frameSize; n++) {
      let left = window(n, N);
      let right = window(frameSize-n-1, N);
      let next = window(n+N, N);
      let diff = Math.abs(left-right);
      //console.log(`assertValidWindow`, JSON.stringify({n, left, right, next, diff}));
      let tolerance = 3.7e-16;
      should(diff).below(tolerance); // window is symmetric

      // Princen-Bradley condition
      should(Math.abs(left*left + next*next - 1)).below(tolerance);
    }
  }

  it("default ctor()", async()=>{
    let mdct = new Mdct();
    let frameSize = 32;
    let N = frameSize/2;
    should(mdct).properties({ frameSize, coeffsPerFrame:N });

    // default scale adjusts coefficients to fit within Compander a-int8 range
    let { scale, enc_kn, cos_kn, dec_kn } = mdct;
    should(scale).above(120.95).below(120.96);
    let k = 1;
    let n = 2;
    let sqrt2 = Math.sqrt(2);
    for (let k = 0; k < N; k++) { // cached cosine table
      //console.log({k}, cos_kn[k].map(coskn=>coskn.toFixed(1)).join(','));
      for (let n = 0; n < frameSize; n++) {
        let ckn = Math.cos((Math.PI/N)*(n + (1/2) + (N/2))*(k+1/2));
        let wn = Mdct.WINDOW_RECT(n,N);
        should(enc_kn[k][n]).equal(sqrt2 * wn * ckn / scale);
        should(dec_kn[k][n]).equal(sqrt2 * wn * ckn * scale/N);
      }
    }
  });
  it("encodeFrame(...) signal amplitude", ()=>{
    let frameSize = 8;
    let mdct = new Mdct({frameSize});
    let scale = mdct.scale;
    should(scale).above(30.422).below(30.423);

    let data2 = [ -2, -2, -2, -2, 1, 1, 1, 1 ];
    should.deepEqual(
      [...mdct.encodeFrame(data2).map(v=>v.toFixed(3))], 
      [ -0.119, -0.042, 0.028, 0.024, ]);

    let data4 = [ -16, -16, -16, -16, 15, 15, 15, 15 ];
    should.deepEqual(
      [...mdct.encodeFrame(data4).map(v=>v.toFixed(3))], 
      [ -1.787, -0.628, 0.419, 0.355, ]);

    let data8 = [ -128, -128, -128, -128, 127, 127, 127, 127 ];
    should.deepEqual(
      [...mdct.encodeFrame(data8).map(v=>v.toFixed(3))], 
      [-15.131, -5.313, 3.550, 3.010, ]);

    let data16 = [ -32768, -32768, -32768, -32768, 32767, 32767, 32767, 32767 ];
    should.deepEqual(
      [...mdct.encodeFrame(data16).map(v=>v.toFixed(3))], 
      [ -3903.881, -1370.861, 915.980, 776.530, ]);
  });
  it("encodeFrame(...) frameSize", ()=>{
    let data16 = [ 
      -32768, -32768, -32768, -32768, -32768, -32768, -32768, -32768, 
      32767, 32767, 32767, 32767, 32767, 32767, 32767, 32767,
    ];
    let mdct16 = new Mdct({frameSize:16});
    should.deepEqual(
      [...mdct16.encodeFrame(data16).map(v=>Math.round(v))], 
      [-3904, -1318, 812, 603, -495, -434, 400, 384,]);

    let data32 = [ 
      -32768, -32768, -32768, -32768, -32768, -32768, -32768, -32768, 
      -32768, -32768, -32768, -32768, -32768, -32768, -32768, -32768, 
      32767, 32767, 32767, 32767, 32767, 32767, 32767, 32767,
      32767, 32767, 32767, 32767, 32767, 32767, 32767, 32767,
    ];
    let mdct32 = new Mdct({frameSize:32});
    should.deepEqual(
      [...mdct32.encodeFrame(data32).map(v=>Math.round(v))], [
     -3904, -1305, 788, 569, -448, -373, 322, 285, 
     -259, -238, 223, 212, -203, -197, 194, 192,
    ]);
  });
  it("decodeFrame(...) => inverse MDCT(frame)", ()=>{
    let frameSize = 8;
    let mdct = new Mdct({frameSize});

    // MDCT is a lapped transform 
    let data2a = [ 0, 0, 0, 0, -32768, -32768, -32768, -32768, ]; 
    let data2b =             [ -32768, -32768, -32768, -32768, 32, 32, 32, 32 ];

    let decode2a = mdct.decodeFrame(mdct.encodeFrame(data2a));
    let decode2b = mdct.decodeFrame(mdct.encodeFrame(data2b));

    // MDCT produces frameSize/2 coeffecients, so two
    // overlapped frames produce all required coefficients
    // MDCT frame overlapping removes frame boundary artifacts
    should.deepEqual(decode2a,[ 0, 0, 0, 0, -32768, -32768, -32768, -32768]);
    should.deepEqual(decode2b,             [ 0,  0,  0,  0, 32, 32, 32, 32]);
  });
  it ("toCoefficients(...) => MDCT coefficients data[15]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ 
      1, 2, 4, 8, 16, 32, 64, 128, 
      256, 512, 1024, 2048, 4096, 8192, 16384, 
    ];
    let normalizedData = [...data];
    while (normalizedData.length % frameSize) { normalizedData.push(0); }
    normalizedData = [ 0, 0, 0, 0, ...normalizedData];
    let mdct = new Mdct({frameSize});
    let codeIterable = mdct.toCoefficients(data, {verbose});
    should(typeof codeIterable[Symbol.iterator]).equal('function');
    let encoded = [...codeIterable];

    // Encoded data should be MDCT of overlapping frames
    let iLastFrame = normalizedData.length - frameSize;
    for (let iFrame=0; iFrame <= iLastFrame; iFrame += frameSize) {
      let dataFrame = normalizedData.slice(iFrame, iFrame+frameSize);
      verbose && console.log(`dataFrame`, dataFrame.join(', '));
      should.deepEqual(encoded.slice(iFrame, iFrame+nCoeffs), 
        [...mdct.encodeFrame(dataFrame)]);
    }
    verbose && console.log(`encoded`, encoded);
  });
  it ("toCoefficients(...) => MDCT coefficients data[16]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ 
      1, 2, 4, 8, 16, 32, 64, 128, 
      256, 512, 1024, 2048, 4096, 8192, 16384, 32767,
    ];
    let normalizedData = [...data];
    while (normalizedData.length % frameSize) { normalizedData.push(0); }
    normalizedData = [ 0, 0, 0, 0, ...normalizedData];
    let mdct = new Mdct({frameSize});
    let encoded = [...mdct.toCoefficients(data, {verbose})];

    // Encoded data should be MDCT of overlapping frames
    let iLastFrame = normalizedData.length - frameSize;
    for (let iFrame=0; iFrame <= iLastFrame; iFrame += frameSize) {
      let dataFrame = normalizedData.slice(iFrame, iFrame+frameSize);
      verbose && console.log(`dataFrame`, dataFrame.join(', '));
      should.deepEqual(
        encoded.slice(iFrame, iFrame+nCoeffs), 
        [...mdct.encodeFrame(dataFrame)]);
    }
  });
  it ("toCoefficients(...) => MDCT coefficients data[17]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let data = [ 
      1, 2, 4, 8, 16, 32, 64, 128, 
      256, 512, 1024, 2048, 4096, 8192, 16384, 32767,
      -12345, 
    ];
    let verbose = 0;
    let normalizedData = [...data];
    while (normalizedData.length % frameSize) { normalizedData.push(0); }
    normalizedData = [ 0, 0, 0, 0, ...normalizedData];

    let mdct = new Mdct({frameSize});
    let encoded = [...mdct.toCoefficients(data, {verbose} )];

    // Encoded data should be MDCT of overlapping frames
    let iLastFrame = normalizedData.length - frameSize;
    for (let iFrame=0; iFrame <= iLastFrame; iFrame += frameSize) {
      let dataFrame = normalizedData.slice(iFrame, iFrame+frameSize);
      verbose && console.log(`dataFrame`, dataFrame.join(', '));
      should.deepEqual(
        encoded.slice(iFrame, iFrame+nCoeffs), 
        [...mdct.encodeFrame(dataFrame)]);
    }
  });
  it ("toCoefficients(...) => iterator", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 1;
    let data = [ -10, -10, 10, 10];
    let mdct = new Mdct({frameSize});
    let encoded = mdct.toCoefficients(data, {verbose});
    should(typeof encoded.next).equal('function');
  });
  it ("fromCoefficients(...) => iterator", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, 10, 10];
    let mdct = new Mdct({frameSize});
    let encoded = mdct.toCoefficients(data, {verbose});
    let decoded = mdct.fromCoefficients(encoded, {verbose});
    should(typeof decoded.next).equal('function');
  });
  it ("encodeFrames(...) MDCT coefficients => data[1]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, ];
    let mdct = new Mdct({frameSize});
    let type = Float64Array;
    let encoded = [...mdct.encodeFrames(data, {verbose, type})];
    let decoded = [...mdct.decodeFrames(encoded, {verbose, type})];
    should.deepEqual(decoded[0], [...data, 0, -0, 0, 0, 0, 0, 0]);
    verbose && encoded.forEach((e,i) => 
      console.log(`encoded${i} data[${data.length}]:`, JSON.stringify(e))); 
  });
  it ("fromCoefficients(...) MDCT coefficients => data[1]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, ];
    let mdct = new Mdct({frameSize});
    let encoded = [...mdct.toCoefficients(data, {verbose})];
    let decoded = [...mdct.fromCoefficients(encoded, {verbose})];
    should.deepEqual(decoded, [...data, 0, -0, 0, 0, 0, 0, 0]);
    verbose && console.log(`encoded data[${data.length}]:`, 
      JSON.stringify([...encoded]));
    verbose && console.log(`decoded data[${data.length}]:`, 
      JSON.stringify([...decoded]));
  });
  it ("fromCoefficients(...) MDCT coefficients => data[2]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, 10];
    let mdct = new Mdct({frameSize});
    let encoded = [...mdct.toCoefficients(data, {verbose})];
    let decoded = [...mdct.fromCoefficients(encoded, {verbose})];
    should.deepEqual(decoded, [...data, 0, 0, 0, 0, 0, 0]);
    verbose && console.log(`decoded${data.length}:`, [...decoded]);
  });
  it ("fromCoefficients(...) MDCT coefficients => data[3]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, 10];
    let mdct = new Mdct({frameSize});
    let encoded = [...mdct.toCoefficients(data, {verbose})];
    let decoded = [...mdct.fromCoefficients(encoded, {verbose})];
    should.deepEqual(decoded, [...data, 0, 0, 0, 0, 0]);
    verbose && console.log(`decoded${data.length}:`, [...decoded]);
  });
  it ("fromCoefficients(...) MDCT coefficients => data[4]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, 10, 10];
    let mdct = new Mdct({frameSize});
    let encoded = [...mdct.toCoefficients(data, {verbose})];
    let decoded = [...mdct.fromCoefficients(encoded, {verbose})];
    should.deepEqual(decoded, [...data, 0, 0, 0, 0]);
    verbose && console.log(`decoded${data.length}:`, [...decoded]);
  });
  it ("fromCoefficients(...) MDCT coefficients => data[5]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, 10, 10, 10];
    let mdct = new Mdct({frameSize});
    let encoded = [...mdct.toCoefficients(data, {verbose})];
    let decoded = [...mdct.fromCoefficients(encoded, {verbose})];
    should.deepEqual(decoded, [...data, 0, 0, 0]);
    verbose && console.log(`decoded${data.length}:`, [...decoded]);
  });
  it ("fromCoefficients(...) MDCT coefficients => data[7]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, -10, -10, 10, 10, 10];
    let mdct = new Mdct({frameSize});
    let encoded = [...mdct.toCoefficients(data, {verbose})];
    let decoded = [...mdct.fromCoefficients(encoded, {verbose})];
    should.deepEqual(decoded, [...data, 0]);
    verbose && console.log(`decoded${data.length}:`, [...decoded]);
  });
  it ("fromCoefficients(...) MDCT coefficients => data[8]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, -10, -10, 10, 10, 10, 10];
    let mdct = new Mdct({frameSize});
    let encoded = [...mdct.toCoefficients(data, {verbose})];
    let decoded = [...mdct.fromCoefficients(encoded, {verbose})];
    should.deepEqual(decoded, [...data]);
    verbose && console.log(...decoded);
  });
  it ("fromCoefficients(...) MDCT coefficients => data[9]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, -10, -10, 10, 10, 10, 10, 20];
    let mdct = new Mdct({frameSize});
    let encoded = [...mdct.toCoefficients(data, {verbose})];
    let decoded = [...mdct.fromCoefficients(encoded, {verbose})];
    should.deepEqual(decoded, [...data, 0, 0, 0, 0, 0, 0, 0]);
    verbose && console.log(...decoded);
  });
  it ("decodeFrames(...) MDCT coefficients => data[1]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, ];
    let type = Float64Array;
    let mdct = new Mdct({frameSize});
    let encoded = [...mdct.encodeFrames(data, {verbose})];
    let decoded = [...mdct.decodeFrames(encoded, {verbose})];
    let zeros = new Int16Array(frameSize - (data.length%frameSize));
    should.deepEqual(decoded, [ [...data.slice(0, frameSize), ...zeros] ]);
    verbose && encoded.forEach((e,i)=>console.log(`encoded${i}`, JSON.stringify(e)));
    verbose && console.log(`decoded`, JSON.stringify(decoded));
  });
  it ("decodeFrames(...) MDCT coefficients => data[2]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, 10 ];
    let mdct = new Mdct({frameSize});
    let encoded = mdct.encodeFrames(data, {verbose});
    let decoded = [...mdct.decodeFrames(encoded, {verbose})];
    let zeros = new Int16Array(frameSize - (data.length%frameSize));
    should.deepEqual(decoded, [ [...data.slice(0, frameSize), ...zeros] ]);
    verbose && console.log(...decoded);
  });
  it ("decodeFrames(...) MDCT coefficients => data[3]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, 10, ];
    let mdct = new Mdct({frameSize});
    let encoded = mdct.encodeFrames(data, {verbose});
    let decoded = [...mdct.decodeFrames(encoded, {verbose})];
    let zeros = new Int16Array(frameSize - (data.length%frameSize));
    should.deepEqual(decoded, [ [...data.slice(0, frameSize), ...zeros] ]);
    verbose && console.log(...decoded);
  });
  it ("decodeFrames(...) MDCT coefficients => data[4]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, 10, 10, ];
    let mdct = new Mdct({frameSize});
    let encoded = mdct.encodeFrames(data, {verbose});
    let decoded = [...mdct.decodeFrames(encoded, {verbose})];
    let zeros = new Int16Array(frameSize - (data.length%frameSize));
    should.deepEqual(decoded, [ [...data.slice(0, frameSize), ...zeros] ]);
    verbose && console.log(...decoded);
  });
  it ("decodeFrames(...) MDCT coefficients => data[5]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, -10, -10, 10, ];
    let mdct = new Mdct({frameSize});
    let encoded = mdct.encodeFrames(data, {verbose});
    let decoded = [...mdct.decodeFrames(encoded, {verbose})];
    let zeros = new Int16Array(frameSize - (data.length%frameSize));
    should.deepEqual(decoded, [ [...data.slice(0, frameSize), ...zeros] ]);
    verbose && console.log(...decoded);
  });
  it ("decodeFrames(...) MDCT coefficients => data[7]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, -10, -10, 10, 10, 10];
    let mdct = new Mdct({frameSize});
    let encoded = mdct.encodeFrames(data, {verbose});
    let decoded = [...mdct.decodeFrames(encoded, {verbose})];
    let zeros = new Int16Array(frameSize - (data.length%frameSize));
    should.deepEqual(decoded, [ [...data.slice(0, frameSize), ...zeros] ]);
    verbose && console.log(...decoded);
  });
  it ("decodeFrames(...) MDCT coefficients => data[8]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, -10, -10, 10, 10, 10, 10];
    let mdct = new Mdct({frameSize});
    let encoded = mdct.encodeFrames(data, {verbose});
    let decoded = [...mdct.decodeFrames(encoded, {verbose})];
    should.deepEqual(decoded, [
      data.slice(0, frameSize),
    ]);
    verbose && console.log(...decoded);
  });
  it ("decodeFrames(...) MDCT coefficients => data[9]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, -10, -10, 10, 10, 10, 10, 20];
    let mdct = new Mdct({frameSize});
    let encoded = mdct.encodeFrames(data, {verbose});
    let decoded = [...mdct.decodeFrames(encoded, {verbose})];
    let zeros = new Int16Array(frameSize - (data.length%frameSize));
    should.deepEqual(decoded, [
      data.slice(0, frameSize),
      [...data.slice(frameSize), ...zeros],
    ]);
    verbose && console.log(...decoded);
  });
  it ("decodeFrames(...) MDCT windowed coefficients => data[8]", ()=>{
    let frameSize = 8;
    let verbose = 0;
    should(Mdct.WINDOWS.length).equal(3);
    for (let window of Mdct.WINDOWS) {
      verbose && console.log(`window`, window.name);
      let nCoeffs = frameSize/2;
      let data = [ -10, -10, -10, -10, 10, 10, -100, -100];
      let mdct = new Mdct({frameSize, window});
      let encoded = mdct.encodeFrames(data, {verbose});
      let decoded = [...mdct.decodeFrames(encoded, {verbose})];
      verbose && console.log(`decoded`, JSON.stringify(decoded));
      should.deepEqual(decoded, [
        data.slice(0, frameSize),
      ]);
    }
  });
  it ("Generator populates ArrayBuffer", ()=>{
    let gen = function*() {
      for (let i=0; i < 5; i++) { yield i; }
    }();
    let nums = new Int8Array(gen);
    should(nums.buffer.byteLength).equal(5);
  });
  it ("TESTTESTencode(...) MDCT coefficients => data[1]", ()=>{
    let frameSize = 8;
    let type = Float32Array;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = new Int16Array([ -10, 0, 0, 0, 0, 0, 0, 0 ]).slice(0,4);
    let signalLength = data.length;
    let mdct = new Mdct({frameSize});
    let encoded = mdct.encode(data, {verbose, type});
    should(encoded.constructor).equal(Float32Array);
    console.log(`encoded`, encoded);
    let zeros = new type(nCoeffs);
    should(encoded).instanceOf(type);
    let decoded = mdct.decode(encoded, {verbose, signalLength});
    should(decoded.length).equal(data.length);
    should.deepEqual(decoded, data);
    should(encoded.length).equal(frameSize+nCoeffs);
  });
  it ("encode/decode() EVAM_ME_SUTTAM", async()=>{
    let verbose = 1;
    let signal = await wavSamples(EVAM_ME_SUTTAM);
    for (let i=0; i<Mdct.WINDOWS.length; i++) {
      let window = Mdct.WINDOWS[i];
      let frameSize = 256;
      let opts = {window};
      let nCoeffs = frameSize/2;
      let mdct = new Mdct({frameSize});
      let msStart = Date.now();
      let coeffs = mdct.encode(signal, opts);
      let msEncode = Date.now() - msStart;
      msStart = Date.now();
      let dataOut = mdct.decode(coeffs, opts);
      let msDecode = Date.now() - msStart;
      let padding = frameSize/2 + (frameSize-signal.length%frameSize);
      should(dataOut.length).equal(signal.length+padding);
      let threshold = 5;
      let nzSig = signal.findIndex(v=>Math.abs(v) > threshold);
      let nzDataOut = dataOut.findIndex(v=>Math.abs(v) > threshold);
      should(nzDataOut-nzSig).equal(0);
      let signal2 = dataOut.slice(signal.length);
      let rmsErr = Signal.rmsErr(signal, signal2);
      should(rmsErr).equal(0); // this is actually remarkable

      verbose && console.log(`encodeFrames() ${Date.now()-msStart}ms`, 
        JSON.stringify({
        rmsErr, 
        nzSig, 
        window:window.name,
        msEncode,
        msDecode,
      }));
    }
  });
  it ("WINDOW_VORBIS(n) => Vorbis MDCT window", ()=>{
    let frameSize = 8;
    let N = frameSize/2;
    let mdct = new Mdct({frameSize});
    let window = (n,N) => Mdct.WINDOW_VORBIS(n,N);
    assertValidWindow(window, 3.7e-16, frameSize);
    should(window(0,N)).equal(0.059749267564359984);
    should(window(1,N)).equal(0.4660661847984712);
    should(window(2,N)).equal(0.8847498580883736);
    should(window(3,N)).equal(0.9982134165725897);
    should(window(4,N)).equal(0.9982134165725897);
    should(window(5,N)).equal(0.8847498580883737);
    should(window(6,N)).equal(0.4660661847984712);
    should(window(7,N)).equal(0.05974926756436021);
  });
  it ("WINDOW_MP3(n) => MP3 MDCT window", ()=>{
    let frameSize = 8;
    let N = frameSize/2;
    let mdct = new Mdct({frameSize});
    let window = (n,N) => Mdct.WINDOW_MP3(n,N);
    assertValidWindow(window, 3.7e-16, frameSize);
    should(window(0,N)).equal(0.19509032201612825);
    should(window(1,N)).equal(0.5555702330196022);
    should(window(2,N)).equal(0.8314696123025452);
    should(window(3,N)).equal(0.9807852804032304);
    should(window(4,N)).equal(0.9807852804032304);
    should(window(5,N)).equal(0.8314696123025453);
    should(window(6,N)).equal(0.5555702330196022);
    should(window(7,N)).equal(0.1950903220161286);
  });
  it ("WINDOW_RECT(n) => rectangular MDCT window", ()=>{
    let frameSize = 8;
    let N = frameSize/2;
    let mdct = new Mdct({frameSize});
    let window = (n,N) => Mdct.WINDOW_RECT(n,N);
    assertValidWindow(window, 3.7e-16, frameSize);
    let sqrt05 = Math.sqrt(1/2);
    should(window(0,N)).equal(sqrt05);
    should(window(1,N)).equal(sqrt05);
    should(window(2,N)).equal(sqrt05);
    should(window(3,N)).equal(sqrt05);
    should(window(4,N)).equal(sqrt05);
    should(window(5,N)).equal(sqrt05);
    should(window(6,N)).equal(sqrt05);
    should(window(7,N)).equal(sqrt05);
  });
  it ("encode/decode() coeffs EVAM_ME_SUTTAM", async()=>{
    let verbose = 1;
    let dataIn = await wavSamples(EVAM_ME_SUTTAM);
    let window = Mdct.WINDOWS[1];
    let frameSize = 192;
    let opts = {window};
    let nCoeffs = frameSize/2;
    let mdct = new Mdct({frameSize});
    should(dataIn.length).equal(55296);

    // encode
    let coeffs = new Float32Array(mdct.encode(dataIn, opts));
    should(coeffs.length).equal(55584);
    let stats = Signal.stats(coeffs);
    await fs.promises.writeFile(EVAM_ME_SUTTAM_MDCT, coeffs);

    // decode
    let coeffBuf = await fs.promises.readFile(EVAM_ME_SUTTAM_MDCT);
    let coeffs2 = new Float32Array(coeffBuf.buffer);
    should.deepEqual(coeffs2, coeffs);
    let dataOut = mdct.decode(coeffs, opts).slice(0, dataIn.length);

    let mse = Signal.rmsErr(dataIn, dataOut);
    should(mse).equal(0.4871949722361903);
    let sigOut = new Signal(dataOut);
    let wavOut = sigOut.toWav();
    await fs.promises.writeFile(EVAM_ME_SUTTAM_MDCT_WAV, wavOut);
  });

})
