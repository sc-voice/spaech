(function(exports) {
  const isNode=new Function("try {return this===global;}catch(e){return false;}");
  const { logger } = require('log-instance');
  const tf = require(isNode() ? '@tensorflow/tfjs-node' : '@tensorflow/tfjs');

  // Dense class is not explicitly exported, so we acquire it indirectly
  const dummyDense = tf.layers.dense({inputShape: [1], units: 1, useBias: true});
  const Dense = dummyDense.constructor;

  /**
   * Copy of internal method
   * Reference: https://github.com/tensorflow/tfjs/blob/master/tfjs-layers/src/activations.ts#L25-L30
   */
  class Activation extends tf.serialization.Serializable {
    apply(tensor, axis) { throw new Error("abstract method"); }
    getConfig() { return {}; }
  }

  /**
   * Snake
   * Reference: https://arxiv.org/abs/2006.08195
   */
  class SnakeActivation extends Activation {
    constructor(args) {
      super(args);
    }

    /** @nocollapse */
    static get className() { return 'snakeActivation';}

    /**
     * Calculate the activation function.
     *
     * @param x: Input.
     * @param alpha: Scaling factor 
     * @return Output of the Snake activation.
     */
    apply(x, alpha = 1) {
      return tf.tidy(()=>{
        return tf.add(x, tf.square(tf.sin(x)));
      });
    }
  }

  class Snake extends Dense {
    static className = 'Snake';
    constructor(args) {
      super(args);
      this.activation = new SnakeActivation();
      this.addWeight(`magic`, [1], 'int32', tf.initializers.ones());
      tf.serialization.registerClass(Snake);
    }

    static get isNode() { return isNode(); }
    static get Activation() { return SnakeActivation; }

    //apply(inputs, kwargs) {
      //return super.apply(inputs, Object.assign({},kwargs, {alpha:1.2}));
    //}

    call(input, kwargs) {
      let { bias, kernel, activation } = this;
      return tf.tidy(()=>{
        this.invokeCallHook(input, kwargs);
        input = Array.isArray(input) ? input[0] : input;
        let output = tf.dot(input, kernel.read());
        if (bias) {
          if (output.rank >= 3) {
            throw new Error(`reshapeBias() not implemented for rank:${output.rank}`);
          }
          output = tf.add(output, bias.read());
        }
        if (activation != null) {
          output = activation.apply(output);
        }

        return output;
      });
    }

  }

  module.exports = exports.Snake = Snake;
})(typeof exports === "object" ? exports : (exports = {}));
