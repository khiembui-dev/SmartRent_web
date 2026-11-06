// Tải tệp bằng FilePond: xem trước ảnh, giới hạn dung lượng/định dạng, trạng thái tải, lỗi.
// Ở chế độ mock, tệp được "tải" vào bộ nhớ trình duyệt (mô phỏng quét an toàn). Giấy tờ riêng tư không bao giờ nằm ở public/.
import * as FilePond from 'filepond';
import FilePondPluginImagePreview from 'filepond-plugin-image-preview';
import FilePondPluginFileValidateSize from 'filepond-plugin-file-validate-size';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';
import 'filepond/dist/filepond.min.css';
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.min.css';
import { config } from '../config.js';
import { filesApi } from '../services/api.js';

FilePond.registerPlugin(FilePondPluginImagePreview, FilePondPluginFileValidateSize, FilePondPluginFileValidateType);

const LABELS = {
  labelIdle: 'Kéo thả tệp vào đây hoặc <span class="filepond--label-action">chọn tệp</span>',
  labelInvalidField: 'Có tệp không hợp lệ',
  labelFileWaitingForSize: 'Đang đọc dung lượng',
  labelFileSizeNotAvailable: 'Không đọc được dung lượng',
  labelFileLoading: 'Đang đọc tệp',
  labelFileLoadError: 'Lỗi khi đọc tệp',
  labelFileProcessing: 'Đang tải lên',
  labelFileProcessingComplete: 'Đã tải lên',
  labelFileProcessingAborted: 'Đã hủy tải lên',
  labelFileProcessingError: 'Tải lên thất bại',
  labelFileProcessingRevertError: 'Không gỡ được tệp',
  labelFileRemoveError: 'Không xóa được tệp',
  labelTapToCancel: 'chạm để hủy',
  labelTapToRetry: 'chạm để thử lại',
  labelTapToUndo: 'chạm để hoàn tác',
  labelButtonRemoveItem: 'Gỡ tệp',
  labelButtonAbortItemLoad: 'Hủy',
  labelButtonRetryItemLoad: 'Thử lại',
  labelButtonAbortItemProcessing: 'Hủy',
  labelButtonUndoItemProcessing: 'Hoàn tác',
  labelButtonRetryItemProcessing: 'Thử lại',
  labelButtonProcessItem: 'Tải lên',
  labelMaxFileSizeExceeded: 'Tệp quá lớn',
  labelMaxFileSize: 'Tối đa {filesize}',
  labelFileTypeNotAllowed: 'Định dạng không hỗ trợ',
  fileValidateTypeLabelExpectedTypes: 'Chấp nhận {allButLastType} hoặc {lastType}',
};

/**
 * @param {HTMLInputElement} input
 * @param {{ multiple?: boolean, maxFiles?: number, accept?: string[], visibility?: 'private'|'public', purpose?: string, onChange?: (files: object[]) => void }} options
 */
export function createUploader(input, { multiple = false, maxFiles = 5, accept = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], visibility = 'private', purpose = 'other', onChange } = {}) {
  const uploaded = new Map();
  const emit = () => onChange?.([...uploaded.values()]);
  const pond = FilePond.create(input, {
    ...LABELS,
    allowMultiple: multiple,
    maxFiles: multiple ? maxFiles : 1,
    maxFileSize: '10MB',
    acceptedFileTypes: accept,
    credits: false,
    instantUpload: true,
    allowRevert: true,
    imagePreviewHeight: 140,
    server: {
      process: (fieldName, file, metadata, load, error, progress, abort) => {
        const controller = new AbortController();
        progress(true, 0, file.size);
        filesApi.upload(file, { visibility, purpose }, { signal: controller.signal })
          .then((result) => {
            progress(true, file.size, file.size);
            uploaded.set(result.id, result);
            load(result.id);
            emit();
          })
          .catch((err) => error(err?.detail || err?.title || 'Tải lên thất bại'));
        return { abort: () => { controller.abort(); abort(); } };
      },
      revert: (fileId, load) => {
        uploaded.delete(fileId);
        emit();
        load();
      },
    },
  });
  const wrapper = input.closest('[data-uploader]') || input.parentElement;
  if (config.isMock && wrapper && !wrapper.querySelector('.sr-upload-sim')) {
    const hint = document.createElement('div');
    hint.className = 'form-text sr-upload-sim';
    hint.textContent = 'Mô phỏng: tệp được lưu tạm trong trình duyệt và "quét an toàn" giả lập; chưa gửi lên kho lưu trữ thật.';
    wrapper.append(hint);
  }
  return {
    pond,
    get files() { return [...uploaded.values()]; },
    get fileIds() { return [...uploaded.keys()]; },
    // Form Ticket không được gửi khi người dùng đã chọn ảnh nhưng ảnh đó tải lên thất bại.
    get hasErrors() { return pond.getFiles().some((f) => [FilePond.FileStatus.PROCESSING_ERROR, FilePond.FileStatus.LOAD_ERROR].includes(f.status)); },
    get busy() { return pond.getFiles().some((f) => f.status === FilePond.FileStatus.PROCESSING || f.status === FilePond.FileStatus.PROCESSING_QUEUED); },
    reset() { pond.removeFiles(); uploaded.clear(); emit(); },
    destroy() { pond.destroy(); },
  };
}
