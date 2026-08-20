/**
 * Auto-Signature Bridge (Main World Script)
 *
 * DC의 글쓰기 페이지는 이미지 업로드를 반드시 페이지 자신의
 * window.imageUploader(file) 함수(editor_common.js)를 통해서만 처리한다.
 * 이 함수는 https://upimg.dcinside.com/upimg_file.php 로 업로드한 뒤,
 * 성공 시 에디터(Summernote)에 압축된 <img src="https://dcimg..."> 마크업을
 * 직접 삽입해준다. content script(격리된 월드)는 이 함수를 직접 호출할 수
 * 없으므로, 이 스크립트를 페이지의 메인 월드에 주입해 대신 호출하고
 * window.postMessage로 결과를 content script에 돌려준다.
 *
 * content script -> (postMessage: REQUEST) -> 이 스크립트
 * 이 스크립트 -> window.imageUploader(file) 호출
 * 이 스크립트 -> (postMessage: RESULT) -> content script
 */
(function () {
  const SOURCE = 'dc-ultimate-auto-sig';

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;

    if (data.type === 'PING') {
      window.postMessage({ source: SOURCE, type: 'BRIDGE_READY' }, '*');
      return;
    }

    if (data.type !== 'UPLOAD_REQUEST') return;

    const { requestId, fileDataUrl, fileName, mimeType } = data;

    try {
      if (typeof window.imageUploader !== 'function') {
        throw new Error('window.imageUploader가 이 페이지에 존재하지 않습니다.');
      }

      const file = dataUrlToFile(fileDataUrl, fileName, mimeType);

      // editor_common.js의 imageUploader는 보통 <input type="file"> change 이벤트의
      // file 객체(또는 FileList)를 받아 내부적으로 업로드 + 에디터 삽입까지 처리한다.
      // 반환값이 있는 구현도, 없는(부수효과만 있는) 구현도 있으므로 둘 다 대응한다.
      const maybeResult = window.imageUploader(file);
      if (maybeResult && typeof maybeResult.then === 'function') {
        await maybeResult;
      }

      window.postMessage({ source: SOURCE, type: 'UPLOAD_RESULT', requestId, success: true }, '*');
    } catch (err) {
      window.postMessage({
        source: SOURCE,
        type: 'UPLOAD_RESULT',
        requestId,
        success: false,
        error: err && err.message ? err.message : String(err)
      }, '*');
    }
  });

  function dataUrlToFile(dataUrl, filename, mimeType) {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeType || (mimeMatch ? mimeMatch[1] : 'image/png');
    const bstr = atob(arr[1] || arr[0]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  }

  window.postMessage({ source: SOURCE, type: 'BRIDGE_READY' }, '*');
})();
