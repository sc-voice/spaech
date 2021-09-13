(typeof describe === 'function') && describe("signal", function() {
  const should = require("should");
  const fs = require('fs');
  const path = require('path');
  const { WaveFile } = require('wavefile');
  let {
    WordWindow,
  } = require('../index');
  this.timeout(10*1000);

  const EVAM_ME_SUTTAM = path.join(__dirname, 'data/evam-me-suttam.wav');
  const AN9_20_4_3 = path.join(__dirname, 'data/an9.20_4.3.wav');

  it("default ctor", ()=>{
    let tw = new WordWindow();
    should.deepEqual(tw.window, [0.5,1,0.5]); // Normalized binomial coefficient
    should.deepEqual(tw.alphabet, ' est'.split(''));
    should(tw.alphaMap).properties({ ' ':0, e: 1, s: 2, t: 3, });
    should(tw.windowPeak).equal(1);
  });
  it("custom ctor", ()=>{
    let alphabet = 'xyz';
    let text = 'xyzx';
    let n = 1+4+6+4+1;
    let window = [1/n, 4/n, 6/n, 4/n, 1/n];
    let signalFirst = 10;
    let signalLast = 90;
    let tw = new WordWindow({text, window, signalFirst, signalLast});
    should(tw).properties({
      signalFirst,
      signalLast,
      window,
      windowPeak: 2,
      text,
      textSignalIndex: [10, 30, 50, 70],
    });
    should.deepEqual(tw.alphabet, ' xyz'.split(''));
    should(tw.alphaMap).properties({ ' ': 0, x: 1, y: 2, z: 3, });
  });
  it("alphabetOf(text)", ()=>{
    should.deepEqual(WordWindow.alphabetOf('xy zy xx'), ' xyz'.split(''));
  });
  it("factorial(x) => x!", ()=>{
    should(WordWindow.factorial(0)).equal(1);
    should(WordWindow.factorial(1)).equal(1);
    should(WordWindow.factorial(2)).equal(2);
    should(WordWindow.factorial(3)).equal(6);
    should(WordWindow.factorial(4)).equal(24);
    should(WordWindow.factorial(5)).equal(120);
    should(WordWindow.factorial(6)).equal(720);
    should(WordWindow.factorial(7)).equal(5040);
    should(WordWindow.factorial(8)).equal(40320);
  });
  it("binomialWindow(...)", ()=>{
    should.deepEqual(WordWindow.binomialWindow({width:3}), [0.5, 1, 0.5]);
    should.deepEqual(WordWindow.binomialWindow({width:3,range:'max1'}), [0.5, 1, 0.5]);
    should.deepEqual(WordWindow.binomialWindow({width:3,range:'sum1'}), [0.25, 0.5, 0.25]);
    should.deepEqual(WordWindow.binomialWindow({width:3,range:'standard'}), [1, 2, 1]);

    should.deepEqual(WordWindow.binomialWindow({width:5}), 
      [1/6, 4/6, 1, 4/6, 1/6]);
    should.deepEqual(WordWindow.binomialWindow({width:5,range:'max1'}), 
      [1/6, 4/6, 1, 4/6, 1/6]);
    should.deepEqual(WordWindow.binomialWindow({width:5,range:'sum1'}), 
      [1/16, 4/16, 6/16, 4/16, 1/16]);
    should.deepEqual(WordWindow.binomialWindow({width:5,range:'standard'}), 
      [1, 4, 6, 4, 1]);
  });
  it("binomialCoefficient(a,b)", ()=>{
    should(WordWindow.binomialCoefficient(3,0)).equal(1);
    should(WordWindow.binomialCoefficient(3,1)).equal(3);
    should(WordWindow.binomialCoefficient(3,2)).equal(3);
    should(WordWindow.binomialCoefficient(3,3)).equal(1);

    should(WordWindow.binomialCoefficient(4,0)).equal(1);
    should(WordWindow.binomialCoefficient(4,1)).equal(4);
    should(WordWindow.binomialCoefficient(4,2)).equal(6);
    should(WordWindow.binomialCoefficient(4,3)).equal(4);
    should(WordWindow.binomialCoefficient(4,4)).equal(1);

    should(WordWindow.binomialCoefficient(9,0)).equal(1);
    should(WordWindow.binomialCoefficient(9,1)).equal(9);
    should(WordWindow.binomialCoefficient(9,2)).equal(36);
    should(WordWindow.binomialCoefficient(9,3)).equal(84);
    should(WordWindow.binomialCoefficient(9,4)).equal(126);
    should(WordWindow.binomialCoefficient(9,5)).equal(126);
    should(WordWindow.binomialCoefficient(9,6)).equal(84);
    should(WordWindow.binomialCoefficient(9,7)).equal(36);
    should(WordWindow.binomialCoefficient(9,8)).equal(9);
    should(WordWindow.binomialCoefficient(9,9)).equal(1);
  });
  it("tween", ()=>{
    let v1 = [1,2,1,0];
    let v2 = [0,1,2,1];
    should.deepEqual(WordWindow.tween(v1,v2,0), v1);
    should.deepEqual(WordWindow.tween(v1,v2,1), v2);
    should.deepEqual(WordWindow.tween(v1,v2,.25), [0.75, 1.75, 1.25, 0.25]);
    should.deepEqual(WordWindow.tween(v1,v2,.26), [0.74, 1.74, 1.26, 0.26]);
    should.deepEqual(WordWindow.tween(v1,v2,.50), [0.50, 1.50, 1.50, 0.50]);
    should.deepEqual(WordWindow.tween(v1,v2,.75), [0.25, 1.25, 1.75, 0.75]);
  });
  it("textIndexAt(iSig) => text index at signal position", ()=>{
    let alphabet = ' abc';
    let signalFirst = 10;
    let signalLast = 110;
    let signalRange = signalLast - signalFirst;
    let text = 'cab';
    let tw = new WordWindow({alphabet, text, signalFirst, signalLast});
    should(tw.textIndexAt(signalFirst)).equal(0);
    for (let i=signalFirst; i<signalLast+1; i+=5) {
      //console.log(`textIndexAt`, i, tw.textIndexAt(i));
    }
    should(tw.textIndexAt(signalFirst + 0.33 * signalRange)).equal(0);
    should(tw.textIndexAt(signalFirst + 0.34 * signalRange)).equal(1);
    should(tw.textIndexAt(signalFirst + 0.66 * signalRange)).equal(1);
    should(tw.textIndexAt(signalFirst + 0.67 * signalRange)).equal(2);
    should(tw.textIndexAt(signalLast)).equal(2);
  });
  it("textAt(iSig) => text window at signal position", ()=>{
    let alphabet = ' abc';
    let text = 'cab';
    let signalFirst = 10;
    let signalLast = 110;
    let window = WordWindow.binomialWindow({width:5, range:'sum1'});
    let tw = new WordWindow({alphabet, text, signalFirst, signalLast, window});

    should.deepEqual(tw.textSignalIndex, [
      10, // c is [10...43] (34 elements)
      44, // a is [44...76] (33 elements)
      77, // b is [77...110]; (34 elements)
    ]); 

    let textFirst = tw.textAt(signalFirst);
    should.deepEqual(textFirst.map(t=>t.c), [' ', ' ', 'c', 'a', 'b', ' ']);
    should.deepEqual(textFirst.map(t=>t.w), [...window, 0]);

    // before text window shift
    let text43 = tw.textAt(43);
    should.deepEqual(text43.map(t=>t.c), [' ', ' ', 'c', 'a', 'b', ' ']);
    should.deepEqual(text43.map(t=>t.w), [
      0.0018382352941176475,
      0.06801470588235295,
      0.2536764705882353,   // c
      0.3713235294117647,   // a
      0.24448529411764705,  // b
      0.06066176470588235,
    ]);
    // after text window shift
    let text44 = tw.textAt(44);
    should.deepEqual(text44.map(t=>t.c), [' ', 'c', 'a', 'b', ' ', ' ']);
    should.deepEqual(text44.map(t=>t.w), [...window, 0]);
    should.deepEqual(text44.map(t=>t.w), [
      0.0625,
      0.25,   // c
      0.375,  // a
      0.25,   // b
      0.0625,
      0,
    ]);

    // penultimate signal
    let text109 = tw.textAt(109);
    should.deepEqual(text109.map(t=>t.c), ['c', 'a', 'b', ' ', ' ', ' ']);
    should.deepEqual(text109.map(t=>t.w), [
      0.0018939393939393992,  // c
      0.0681818181818182,     // a
      0.2537878787878788,     // b
      0.3712121212121212,  
      0.2443181818181818,   
      0.0606060606060606,
    ]);

    // last signal
    let textLast = tw.textAt(signalLast);
    should.deepEqual(textLast.map(t=>t.c),  ['c', 'a', 'b', ' ', ' ', ' ']);
    should.deepEqual(textLast.map(t=>t.w), [
      0,      // c
      0.0625, // a
      0.25,   // b
      0.375,  
      0.25,   
      0.0625,
    ]);
  });

})
