import Quill from 'quill';
import {convertDraggable, filesMatching, getFileDataUrl, nullReturner} from './utils';

const image_content_type_pattern = '^image\/';
const DEFAULT_OPTIONS = {
  container: null,
  onDrop: null,
  draggable_content_type_patterns: [
    image_content_type_pattern
  ]
};

const private_data = new WeakMap();

export default class DragAndDropModule {

  constructor(quill, options) {
    const _private = new Map();

    private_data.set(this, _private);

    _private
      .set('quill', quill)
      .set('options', Object.assign({}, DEFAULT_OPTIONS, options))
      .set('container', options.container || quill.container.querySelector('.ql-editor'))
      .set('draggables', this.options.draggables.map(convertDraggable))
      .set('listeners', new Set());

    // Drop listener
    this.addListener(this.container, 'drop', event => {
      const onDrop = this.options.onDrop;
      const node = event.target['ql-data'] ? event.target : this.container;
      const files = event.dataTransfer.files;
      const file_infos = filesMatching(files, this.draggables);

      if (file_infos.length === 0) return;

      event.stopPropagation();
      event.preventDefault();

      const quillIndex = getQuillIndexAtCoordinates(event.clientX, event.clientY);

      // call onDrop for each dropped file
      Promise.all(file_infos.map(file_info => {
        return Promise
          .resolve((onDrop || nullReturner)(file_info.file, {embedType: file_info.embedType}))
          .then(ret => ({on_drop_ret_val: ret, file_info}));
      }))

      // map return vals of onDrop/nullReturner to file datas
      .then(datas => Promise.all(datas.map(({on_drop_ret_val, file_info}) => {
        if (on_drop_ret_val === false) {
          // if onDrop() returned false (or a false-bearing promise), it
          // means that we shouldn't do anything with this file
          return;
        }
        const {embedType} = file_info;
        // if ret is null, either onDrop() returned null (or a null-
        // bearing promise), or onDrop isn't defined, so just use the
        // file's base64 as the value
        //
        // if ret is non-false and non-null, it means onDrop returned
        // something (or promised something) that isn't null or false.
        // Assume it's what we should use for value
        let data;
        if (on_drop_ret_val === null)
          data = getFileDataUrl(file_info.file);
        else
          data = on_drop_ret_val;

        return Promise
          .resolve(data)
          .then(ret => ({value: ret, embedType}));
      })))
      .then(datas => datas.forEach(file_info => {
        const quill = _private.get('quill');

        // loop through each file_info and attach them to the editor
        // file_info is undefined if onDrop returned false
        if (file_info) {
          const {value, embedType} = file_info;
          quill.insertEmbed(quillIndex, embedType, value, 'user');
        }
      }));
    });
  }

  getQuillIndexAtCoordinates(x, y) {
    const quill = _private.get('quill');
    let textNode;
    let offset;
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      textNode = range.startContainer;
      offset = range.startOffset;
    } else if (document.caretPositionFromPoint) {
      const caretPosition = document.caretPositionFromPoint(x, y);
      textNode = caretPosition.offsetNode;
      offset = caretPosition.offset;
    } else {
      // return last index
      return quill.scroll.length;
    }

    const blot = Quill.find(textNode);
    return blot.offset(quill.scroll) + offset;
  }

  destroy() {
    // remove listeners
    const listeners = private_data.get(this).get('listeners');
    listeners.forEach(({node, event_name, listener}) => {
      node.removeEventListener(event_name, listener);
    });
  }

  addListener(node, event_name, listener_fn) {
    const listener = listener_fn.bind(this);
    node.addEventListener(event_name, listener, false);
    private_data.get(this).get('listeners').add({node, event_name, listener});
  }

  get quill() {
    return private_data.get(this).get('quill');
  }

  get draggables() {
    return private_data.get(this).get('draggables');
  }

  get container() {
    return private_data.get(this).get('container');
  }

  get options() {
    return private_data.get(this).get('options');
  }

  static get image_content_type_pattern() {
    return image_content_type_pattern;
  }

  static get utils() {
    return {
      getFileDataUrl
    };
  }
}

Quill.register('modules/dragAndDrop', DragAndDropModule);
