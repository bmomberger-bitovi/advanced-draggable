export const dragSymbol = Symbol("draggable");

/// SETTABLES BLOCK
// These variables and functions set up two
// settable items with side effects when they are set.

// isDragging is true when a drag is happening, false otherwise
let _isDragging = false
const isDragging = function(setVal) {
  if(arguments.length > 0) {
    if (!setVal) {
      dragFloater(null);
    }
    _isDragging = setVal;
  } else {
    return _isDragging;
  }
};

// dragFloater is the DOM elements that appear near the pointer
// when a drag is happening.  They can be configured or even turned
// off by event listeners.
let _dragFloater = null;
const dragFloater = function(setVal) {
  if(arguments.length > 0) {
    if (_dragFloater) {
      document.body.removeChild(_dragFloater);
    }
    if (setVal) {
      document.body.appendChild(setVal);
    }
    _dragFloater = setVal;
  } else {
    return _dragFloater;
  }
};
let activeDraggable = null;

/// END SETTABLES BLOCK

function assignMouseEventProperties(toEvent, fromEvent) {
  [MouseEvent, UIEvent, Event].forEach(cls => {
    Object.getOwnPropertyNames(cls.prototype).forEach(key => {
      if(typeof fromEvent[key] !== "function" && !(key in toEvent)) {
        toEvent[key] = fromEvent[key];
      }
    });
  });
  return toEvent;
}


// GLOBAL LISTENERS BLOCK
// these listeners need to always be listening on the document, and in capture
// phase to ensure they always run despite a possible stopPropagation() elsewhere.
/**
 * No matter where in the document it happens,
 * mouseup ends a drag.
 */
document.addEventListener(
  "mouseup",
  function endDragOnMouseUp() {
    isDragging(false);
    dragFloater(null);
    if (activeDraggable) {
      activeDraggable.isMouseDown = false;
      activeDraggable = null;
    }
  },
  true
);
/**
 * This handler is for the case when the user releases the mouse button outside
 * the document, then re-enters with the button up.
 */
document.addEventListener(
  "mouseenter",
  function cancelDragReenteringDocumentWithMouseUp(ev) {
    if (!ev.buttons) {
      if (activeDraggable) {
        activeDraggable.cleanupDocumentEvents();
        activeDraggable.isMouseDown = false;
        activeDraggable = null;
      }
      isDragging(false);
      dragFloater(null);
    }
  },
  true
);
// END GLOBAL LISTENERS

// PROPERTY UTILS
// These are used to set up automatic coercions and settables in the options object for dispatching synthetic events.
function booleanProperty(key) {
  return {
    set(val) {
      this._data[key] = !!val;
    },
    get() {
      return this._data[key];
    }
  };
}
function numberProperty(key) {
  return {
    set(val) {
      this._data[key] = +val;
    },
    get() {
      return this._data[key];
    }
  };
}
function setterProperty(settable) {
  return {
    set(val) {
      settable(val);
    },
    get() {
      return settable();
    }
  }
}
// END PROPERTY UTILS

const DraggableVMProperties = {
  /**
   * Whether to enable dragging for this item.
   * This is much more convenient in usage when some items
   * might not be draggable (like if a product list wants
   * one type of product to be draggable but not another).
   */
  enabled: booleanProperty("enabled"),
  /**
   * The draggable element itself is accessible from the view model.
   * This is set during connectedCallback
   */
  element: {
    writable: true,
    value: undefined
  },
  /**
   * Data is expected to be passed through binding to the draggable
   * view model. It defaults to an empty observable object for
   * convenience.
   */
  data: {
    writable: true,
    value: {}
  },
  /**
   * Whether a mouse down happened over the draggable element.  Used
   * for determining when to start a drag which requires mouse down
   * and some movement away from initialX/initialY
   */
  isMouseDown: booleanProperty("isMouseDown"),
  /**
   * The X position where mouse down happened.
   */
  initialX: numberProperty("initialX"),
  /**
   * The Y position where mouse down happend.
   */
  initialY: numberProperty("initialY"),
  /**
   * Whether to allow mouseup events when drop happens. Only needed
   * if drop cannot be handled by the drop target.
   */
  propagateMouseUp: booleanProperty("propagateMouseUp"),
  /**
   * Whether to allow mouseenter events when dragenter happens. Only needed
   * if dragenter cannot be handled by the dragover target but the event
   * is still required.
   */
  propagateMouseEnter: booleanProperty("propagateMouseEnter"),
  /**
   * Whether to allow mouseleave events when dragleave happens. Only needed
   * if dragleave cannot be handled by the dragover target but the event
   * is still required.
   */
  propagateMouseLeave: booleanProperty("propagateMouseLeave"),
  /**
   * Whether to allow mousemove events when dragmove happens. Only needed
   * if dragmove cannot be handled by the dragover target but the event
   * is still required.
   */
  propagateMouseMove: booleanProperty("propagateMouseMove"),
  /**
   * isDragging is a gettable/settable proxy to the "global" boolean value
   */
  isDragging: setterProperty(isDragging),
  /**
   * dragFloater is a gettable/settable proxy to the "global" boolean value
   */
  dragFloater: setterProperty(dragFloater),
};

export function DraggableVM(opts) {
  Object.defineProperties(
    this,
    Object.assign(DraggableVMProperties, {
      _data: {
        enumerable: false,
        writable: false,
        value: {
          enabled: true,
          isMouseDown: false,
          initialX: 0,
          initialY: 0,
          propagateMouseUp: false,
          propagateMouseEnter: false,
          propagateMouseLeave: false,
          propagateMouseMove: false
        }
      }
    })
  );
  /**
   * all draggable view models can read and set the values of isDragging
   * and dragFloater
   */
  Object.assign(this, opts);
  /**
   * Once the element is connected, reference it in the view model, then
   * set all images contained within to not be natively draggable.  If the
   * draggable is removed from the DOM while dragging, unbind its events.
   */
  this.connectedCallback = el => {
    this.element = el;
    el.querySelectorAll("img").forEach(img => {
      img.setAttribute("draggable", false);
    });
    return () => {
      this.cleanupDocumentEvents();
    };
  },

  /**
   * On init, set up the document event functions to be bound to the current
   * view model, for convenient binding an unbinding as event listeners.
   */
  [
    /**
     * Mousemove triggers dragover, and moves the floater
     * to the current mouse position.  Unlike native drag,
     * this drag places the floater's top left at the pointer's
     * position.
     */
    ["Move", "dragover", (event) => {
      const _dragFloater = dragFloater();
      if(_dragFloater) {
        _dragFloater.style.top = event.clientY + "px";
        _dragFloater.style.left = event.clientX + "px";
      }
    }],
    /**
     * mouseenter triggers dragenter
     */
    ["Enter", "dragenter"],
    /**
     * mouseleave triggers dragleave
     */
    ["Leave", "dragleave"],
    /**
     * mouseup triggers drop on the drop target and dragend on the
     * draggable.  It also cleans up the mousedown state on the view
     * model, and the global isDragging and floater compute values.
     */
    ["Up", "drop", () => {
      this.cleanupDocumentEvents();
      Object.assign(this, {
        isMouseDown: false,
        initialX: NaN,
        initialY: NaN,
      });
      dragFloater(null);
      activeDraggable = null;
      isDragging(false);
    }, (event) => {
      const endEvent = new DragEvent("draggable-dragend", assignMouseEventProperties({
        relatedTarget: this.element
      }, event));
      Object.assign(endEvent, {
        data: this.data,
        draggable: this
      });
      this.element.dispatchEvent(endEvent);
    }]
  ].forEach(([name, eventName, preHook, postHook]) => {
    this["documentMouse" + name] = event => {
      if (!this["propagateMouse" + name]) {
        event.stopPropagation();
        event.preventDefault();
      }
      preHook && preHook(event);
      const target = event.target;
      const dragEvent = new DragEvent("draggable-" + eventName, assignMouseEventProperties({
        relatedTarget: this.element
      }, event));
      Object.assign(dragEvent, {
        data: this.data,
        draggable: this
      });
      target.dispatchEvent(dragEvent);
      postHook && postHook(event);
    };
  });

}

DraggableVM.prototype.setupDocumentEvents = function() {
  /**
   * During a drag, capture-phase mouse events are set up on the
   * document to intercept mouse movement and transform it into drag
   * events.
   */
  document.addEventListener("mousemove", this.documentMouseMove, true);
  document.addEventListener("mouseup", this.documentMouseUp, true);
  document.addEventListener("mouseenter", this.documentMouseEnter, true);
  document.addEventListener("mouseleave", this.documentMouseLeave, true);
};
  /**
   * Once a drag is ended, remove these events from the document.
   */
DraggableVM.prototype.cleanupDocumentEvents = function() {
  document.removeEventListener("mousemove", this.documentMouseMove, true);
  document.removeEventListener("mouseup", this.documentMouseUp, true);
  document.removeEventListener("mouseenter", this.documentMouseEnter, true);
  document.removeEventListener("mouseleave", this.documentMouseLeave, true);
};


export default function Draggable(el, data = {}) {

  var viewModel = el[dragSymbol] = new DraggableVM({
    data
  });
  /**
   * Mousedown starts the process of listening for a drag.
   * For a drag to start, the user must also move the pointer
   * 5px away from the location of this mousedown, so record
   * the initial x and y coords.
   */
  el.addEventListener("mousedown", ev => {
    if (viewModel.enabled) {
      Object.assign(viewModel, {
        isMouseDown: true,
        initialX: ev.clientX,
        initialY: ev.clientY,
      });
      activeDraggable = viewModel;
    }
  }, false);
  /**
   * moving the mouse on the element more than the 5px tolerance,
   * or leaving the element, causes the drag to start.
   */
  el.addEventListener("mousemove", ev => {
    const eventX = ev.clientX;
    const eventY = ev.clientY;
    const deltaEventX = Math.abs(eventX - viewModel.initialX);
    const deltaEventY = Math.abs(eventY - viewModel.initialY);
    if (
      viewModel.enabled &&
      viewModel.isMouseDown &&
      !isDragging() &&
      (deltaEventX >= 5 || deltaEventY >= 5)
    ) {
      startDragging(ev);
    }
  }, false);
  el.addEventListener("mouseleave", function(ev) {
    if (
      viewModel.enabled &&
      viewModel.isMouseDown &&
      !isDragging()
    ) {
      startDragging(ev);
    }
  }, false);
  /**
   * Begin the drag by signalling that drag is in effect,
   * then set up the bound events for this view model on the document,
   * then create a floater to follow the mouse around,
   * then dispatch dragstart.
   */
  function startDragging (ev) {
    // start dragging!
    isDragging(true);
    viewModel.setupDocumentEvents();

    var div = document.createElement("div");
    div.innerHTML = el.innerHTML;
    Object.assign(div.style, {
      "pointer-events": "none",
      opacity: 0.8,
      position: "fixed",
      top: ev.clientY,
      left: ev.clientX,
      height: el.clientHeight,
      width: el.clientWidth,
      "z-index": 10000,
    });
    dragFloater(div);
    var event = new DragEvent("draggable-dragstart", assignMouseEventProperties({
      relatedTarget: el,
    }, ev));
    Object.assign(event, {
      data: viewModel.data,
      draggable: viewModel
    });
    el.dispatchEvent(event);
  }
  /**
   * For any images which are added after this component is instantiated,
   * ensure their native drag handling does not interfere with the drag operation.
   */
  var imgObserver = new MutationObserver(function(observations) {
    observations.forEach(function(obs) {
      obs.addedNodes.forEach(function(node) {
        if(node.tagName === "IMG") {
          node.setAttribute("draggable", false);
        }
      })
    });
  });
  imgObserver.observe(el, {
    childList: true,
    subtree: true
  });

  // Sane teardown.  When element is removed from document, remove bindings.
  var disconnectedCallback = viewModel.connectedCallback(el);
  var draggableObserver = new MutationObserver(function(observations) {
    observations.forEach(function(obs) {
      obs.removedNodes.forEach(function(node) {
        if(node === el) {
          disconnectedCallback();
          imgObserver.disconnect();
          draggableObserver.disconnect();
          node[dragSymbol] = null;
        }
      })
    });
  });
  draggableObserver.observe(el.parentNode, { childList: true }); 
}