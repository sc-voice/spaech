(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');
  const OVERLAP = 9;

  class Chart {
    constructor(args={}) {
      let {
        dataset = args.data || [],
        lines=15,
        precision=2,
        yTicks=4,
        xTicks=10,
        xTicks2=50,
        title='Chart',
        lineLength=95,
        xInterval=1,
        yAxis=0,
      } = args;

      assert(dataset instanceof Array, `[E_CHART_DATASET] expected array of numbers for dataset`);

      Object.assign(this, { dataset, lines, precision, xTicks, yTicks,
        yAxis, title, lineLength, xInterval, });
    }

    stats(dataset=[]) {
      if (!Array.isArray(dataset[0]) && !ArrayBuffer.isView(dataset[0])) {
        dataset = [dataset];
      }
      let width = dataset.reduce((a,d)=> Math.max(a, d.length), 0);
      let data0 = dataset[0][0];
      let stats = dataset.reduce((ad,ds,i)=>{
        return ds.reduce((a,d,j) => {
          assert(!isNaN(d), `Expected number for ds[${j}]:${d}`);
          a.min = Math.min(d, a.min);
          a.max = Math.max(d, a.max);
          return a;
        }, ad);
      },{min:data0, max:data0, width});
      stats.range = stats.max - stats.min;
      //console.log(`stats`, stats);
      return stats;
    }

    plotRow({output,min,max,range, yAxis}) {
      let { lines, precision, yTicks, xTicks, xTicks2 } = this;
      let labelSize = 1+Math.max(
        min.toExponential(precision).length, 
        max.toExponential(precision).length);
      let lineLast = lines-1;
      let line = (x)=> Math.round(range ? (max-x)*lineLast/range : lines/2);
      let yOfLine = (line)=> (line*min + (lineLast - line)*max)/lineLast; 
      let iy0 = line(0);
      output.forEach((ds,iy)=>{
        let line = [...ds].map((v,ix)=>{
            let ix1 = ix+1;
            let xTick = ix1 % xTicks2 ? ':' : '|';
            let yTick = ix1 % xTicks 
              ? (ix1 % 5 ? '.' : ',')
              : ':';
            let c = '#';
            switch(v) {
              case 0:
                if (iy === iy0) { // x-axis
                  c = (ix1 % xTicks ? (ix1 % 5 ? '-' : '+') : xTick)
                } else {
                  c = ((iy-iy0) % yTicks 
                    ? (ix === yAxis ? '|' : ' ')
                    : yTick);
                }
                break;
              case OVERLAP: c = '*';
                break;
              default: c = v;
                break;
            }
            return c;
          });
        let label = yOfLine(iy).toExponential(precision);
        while (label.length < labelSize) { label = ' '+label}
        console.log(label, line.join(''));
      });
    }

    plot(args={}) {
      let {
        dataset = args.data || this.dataset,
        lines = this.lines,
        xTicks = this.xTicks,
        xInterval = this.xInterval,
        title = this.title,
        lineLength = this.lineLength,
        precision = this.precision,
        transpose = false,
        yAxis = this.yAxis,
      } = args;
      yAxis = Math.round(yAxis/xInterval);
      if (!Array.isArray(dataset[0]) && !ArrayBuffer.isView(dataset[0])) {
        dataset = [dataset];
      }
      dataset = dataset.map(ds=>ds.filter((v,i) => i%xInterval === 0));
      let stats = this.stats(dataset);
      let { min, max, range, width } = stats;
      assert(!isNaN(min), `expected min for dataset${dataset}`);
      assert(!isNaN(max), `expected max for dataset`);
      assert(!isNaN(width), `expected width for dataset`);
      let output = [...new Array(lines)].map(e=>new Int8Array(width));
      let line = (x)=> Math.round(range ? (max - x)*(lines - 1)/range : lines/2);
      dataset.forEach((ds,id)=>{
        ds.forEach((d,ix)=>{
          let iy = line(d);
          let oiy = output[iy];
          oiy[ix] = oiy[ix] ? OVERLAP : (id+1) ;
        });
      });
      for (let i=0; i < width; i+=lineLength) {
        i && console.log();
        let outRow = output.map(ds=>ds.slice(i, i+lineLength));
        this.plotRow({output:outRow, min, max, range, yAxis:yAxis-i});
      }
      if (title) {
        console.log(title);
      }

      return stats;
    }

  }

  module.exports = exports.Chart = Chart;
})(typeof exports === "object" ? exports : (exports = {}));
