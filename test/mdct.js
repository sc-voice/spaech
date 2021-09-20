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
  const KATAME_PANCA = path.join(__dirname, 'data/katame-panca.wav');
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
      [...mdct.encodeFrame(data2)].map(v=>Number(v.toFixed(3))), 
      [ -0.119, -0.042, 0.028, 0.024, ]);

    let data4 = [ -16, -16, -16, -16, 15, 15, 15, 15 ];
    should.deepEqual(
      [...mdct.encodeFrame(data4)].map(v=>Number(v.toFixed(3))), 
      [ -1.787, -0.628, 0.419, 0.355, ]);

    let data8 = [ -128, -128, -128, -128, 127, 127, 127, 127 ];
    should.deepEqual(
      [...mdct.encodeFrame(data8)].map(v=>Number(v.toFixed(3))), 
      [-15.131, -5.313, 3.550, 3.010, ]);

    let data16 = [ -32768, -32768, -32768, -32768, 32767, 32767, 32767, 32767 ];
    should.deepEqual(
      [...mdct.encodeFrame(data16)].map(v=>Number(v.toFixed(3))), 
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
  it ("encodeFrames(...) MDCT coefficients => data[1]", ()=>{
    let verbose = 0;
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let data = new Int16Array([ -10, 8, -4, 2, 0, 0, 0, 0 ]); // multiple of frameSize
    let mdct = new Mdct({frameSize});
    let type = Float32Array;
    let encodedGen = mdct.encodeFrames(data, {verbose, type});
    should(typeof encodedGen.next).equal('function');
    let encoded = [...encodedGen];
    should(encoded[0]).instanceOf(type);
    let nFrames = Math.floor((data.length + frameSize-1)/frameSize);
    let nCoeffBlocks = 2*nFrames;
    should(encoded.length).equal(nCoeffBlocks);
    let decoded = [...mdct.decodeFrames(encoded, {verbose, type})];
    should.deepEqual(decoded, [[...data]]);
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
    let data = [ -10,-10,-10,-10, 10,0,0,0, 
      0, 0, 0, 0,  0, 0, 0, 0];
    let mdct = new Mdct({frameSize});
    let encoded = mdct.encodeFrames(data, {verbose});
    let decoded = [...mdct.decodeFrames(encoded, {verbose})];
    let zeros = new Int16Array(frameSize - (data.length%frameSize));
    should.deepEqual(decoded, [ [...data.slice(0, frameSize) ], [...zeros] ]);
    verbose && console.log(...decoded);
  });
  it ("TESTTESTdecodeFrames(...) MDCT coefficients => data[7]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10, -10, -10, -10, 10, 10, 10, 0, 
      0, 0, 0, 0,  0, 0, 0, 0];
    let mdct = new Mdct({frameSize});
    let encoded = mdct.encodeFrames(data, {verbose});
    let decoded = [...mdct.decodeFrames(encoded, {verbose})];
    let zeros = new Int16Array(frameSize - (data.length%frameSize));
    should.deepEqual(decoded, [ [...data.slice(0, frameSize)], [...zeros] ]);
    verbose && console.log(...decoded);
  });
  it ("TESTTESTdecodeFrames(...) 3 blocks => 1 frame", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 1;
    let frames = [
      [-10,-10,-10,-10, 10,10,10,10,],
      [-6,-6,-6,-6, 6,6,6,6,],
      [-4, -4, -4, -4, 4, 4, 4, 4,],
    ];
    let data = [ ...frames[0], ...frames[1], ...frames[2] ];
    let mdct = new Mdct({frameSize});
    let encoded = [...mdct.encodeFrames(data, {verbose})];
    verbose && console.log(`encoded`, 
      encoded.map(f32 => [...f32].map(v=>Number(v.toFixed(2))).join(', ')));

    // first frame uses 3 coefficient blocks
    let decoded1 = [...mdct.decodeFrames([ encoded[0], encoded[1], encoded[2], ], {verbose})];
    should.deepEqual(decoded1, [ frames[0] ]);
    verbose && console.log(`decoded1`, decoded1.join(','));

    // second frame uses 3 coefficient blocks (notice overlap of encoded[2]
    let decoded2 = [...mdct.decodeFrames([ encoded[2], encoded[3], encoded[4], ], {verbose})];
    should.deepEqual(decoded2, [ frames[1] ]);
    verbose && console.log(`decoded2`, decoded2.join(','));

    // third frame uses 3 coefficient blocks (notice overlap of encoded[4]
    let decoded3 = [...mdct.decodeFrames([ encoded[4], encoded[5], /*zeros*/ ], {verbose})];
    should.deepEqual(decoded3, [ frames[2] ]);
    verbose && console.log(`decoded3`, decoded3.join(','));
  });
  it ("decodeFrames(...) MDCT coefficients => data[9]", ()=>{
    let frameSize = 8;
    let nCoeffs = frameSize/2;
    let verbose = 0;
    let data = [ -10,-10,-10,-10, 10,10,10,10,
      20,0,0,0,  0,0,0,0];
    let mdct = new Mdct({frameSize});
    let encoded = mdct.encodeFrames(data, {verbose});
    let decoded = [...mdct.decodeFrames(encoded, {verbose})];
    let zeros = new Int16Array(frameSize - (data.length%frameSize));
    should.deepEqual(decoded.map(v=>v || 0), [
      data.slice(0, frameSize),
      data.slice(frameSize), 
    ]);
    verbose && console.log(...decoded);
  });
  it ("TESTTESTdecodeFrames(...) MDCT windowed coefficients => data[8]", ()=>{
    let frameSize = 8;
    let verbose = 0;
    should(Mdct.WINDOWS.length).equal(3);
    for (let window of Mdct.WINDOWS) {
      verbose && console.log(`window`, window.name);
      let nCoeffs = frameSize/2;
      let data = [ -10,-10,-10,-10, 10,10,-100,-100,
        20,0,0,0,  0,0,0,0];
      let mdct = new Mdct({frameSize, window});
      let encoded = mdct.encodeFrames(data, {verbose});
      let decoded = [...mdct.decodeFrames(encoded, {verbose})];
      verbose && console.log(`decoded`, JSON.stringify(decoded));
      should.deepEqual(decoded, [
        data.slice(0, frameSize),
        data.slice(frameSize),
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
  it ("encode(...) coefficients same size as data", ()=>{
    let verbose = 1;
    let frameSize = 8;
    let type = Float32Array;
    let nCoeffs = frameSize/2;
    let data = [ -10, 8, -4, 2, 0, 0, 0, 0 ]; // multiple of frameSize
    let i16 = new Int16Array(data); // multiple of frameSize
    let signalLength = data.length;
    let mdct = new Mdct({frameSize});
    let encoded = mdct.encode(i16, {verbose, type});
    should(encoded.constructor).equal(Float32Array);
    let zeros = new type(nCoeffs);
    should(encoded).instanceOf(type);
    let decoded = mdct.decode(encoded, {verbose, signalLength});
    should(decoded.length).equal(data.length);
    should.deepEqual([...decoded], data);
    should(encoded.length).equal(data.length);
  });
  it ("encode/decode() EVAM_ME_SUTTAM", async()=>{
    let verbose = 1;
    let signal = await wavSamples(EVAM_ME_SUTTAM);
    for (let i=0; i<Mdct.WINDOWS.length; i++) {
      let window = Mdct.WINDOWS[i];
      let frameSize = 192;
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
      should(dataOut.length).equal(signal.length);
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
  it ("TESTTESTencode/decode() coeffs EVAM_ME_SUTTAM", async()=>{
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
    should(coeffs.length).equal(dataIn.length);
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
  it ("TESTTESTencodeFrames(...) katame panca", async()=>{
    let verbose = 0;
    let data = await wavSamples(KATAME_PANCA);
    should(data.length).equal(36864);
    let frameSize = 192;
    let zeroPad = 1;
    let nFrames = Math.floor((data.length + frameSize-1)/frameSize);
    should(nFrames).equal(192);
    let FINAL_ENCODING_BLOCK = 1;
    let nCoeffBlocks = 2*nFrames + FINAL_ENCODING_BLOCK;
    let type = Float32Array;
    let mdct = new Mdct({frameSize});
    let encodedGen = mdct.encodeFrames(data, {type});
    should(typeof encodedGen.next).equal('function');
    let encoded = [...encodedGen];
    should(encoded[0]).instanceOf(type);
    should(encoded.length).equal(nCoeffBlocks);
    let decoded = [...mdct.decodeFrames(encoded, {type})];
    for (let iData = 0; iData < data.length; iData += frameSize) {
      try {
        should(Signal.rmsErr(
          decoded[iData/frameSize], 
          [...data.slice(iData,iData+frameSize)]))
        .below(0.6);
      } catch(e) {
        console.error(`iData: ${iData} frame:`, 1+iData/frameSize, `of ${nFrames}`,  e);
        throw e;
      }
    }
  });

})
