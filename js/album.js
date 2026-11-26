/* 相册导入：
   1) 首页加一个「从相册选一张」入口（原来的拍照按钮带 capture，只开相机）
   2) 结果页的「重拍」原来也只能开相机，改成弹一个小选择框，拍照/相册都能选 */
(function () {
  'use strict';

  const STYLE = `
#albumBtn{
  width:100%;margin-top:10px;padding:14px;border-radius:16px;
  border:1px solid rgba(74,222,128,.45);background:rgba(74,222,128,.10);
  color:#4ade80;font-size:14.5px;font-family:inherit;font-weight:600;
}
#albumBtn:active{background:rgba(74,222,128,.18)}
#pickMask{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:80;display:none}
#pickMask.on{display:block}
#pickSheet{
  position:fixed;left:0;right:0;bottom:0;z-index:81;background:#171b22;
  border-radius:20px 20px 0 0;padding:10px 16px calc(18px + env(safe-area-inset-bottom,0px));
  transform:translateY(101%);transition:transform .24s ease;
}
#pickSheet.on{transform:none}
#pickSheet .pk-grab{width:38px;height:4px;border-radius:2px;background:#262d38;margin:4px auto 14px}
#pickSheet button.pk-item{
  display:block;width:100%;padding:16px;margin-bottom:10px;border-radius:14px;
  border:1px solid #262d38;background:#1e242d;color:#e8edf4;font-size:16px;font-family:inherit;
}
#pickSheet button.pk-item.main{background:rgba(74,222,128,.10);border-color:rgba(74,222,128,.45);color:#4ade80;font-weight:600}
#pickSheet button.pk-cancel{
  display:block;width:100%;padding:14px;border:none;background:none;color:#8b95a5;font-size:15px;font-family:inherit;
}`;

  function mount() {
    if (document.getElementById('albumBtn')) return;
    const area = document.getElementById('shootArea');
    const fileInput = document.getElementById('fileInput');
    if (!area || !fileInput) return;

    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    // 独立的相册选择框：故意不带 capture，系统才会给相册
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.multiple = false;
    picker.hidden = true;
    picker.id = 'albumInput';
    area.appendChild(picker);

    const btn = document.createElement('button');
    btn.id = 'albumBtn';
    btn.type = 'button';
    btn.textContent = '从相册选一张';
    btn.onclick = () => picker.click();
    area.appendChild(btn);

    picker.addEventListener('change', () => {
      const file = picker.files && picker.files[0];
      picker.value = '';
      if (!file) return;
      // 把文件转交给原来的 input，复用 app.js 的处理逻辑
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {
        console.warn('相册导入转交失败', e);
        alert('这个浏览器不支持相册导入，请用相机拍或者手动选菜');
      }
    });

    /* ---- 重拍弹窗：拍照 / 相册 二选一 ---- */
    const mask = document.createElement('div');
    mask.id = 'pickMask';
    const sheet = document.createElement('div');
    sheet.id = 'pickSheet';
    sheet.innerHTML =
      '<div class="pk-grab"></div>' +
      '<button type="button" class="pk-item main" id="pickCam">用相机拍</button>' +
      '<button type="button" class="pk-item" id="pickAlbum">从相册选一张</button>' +
      '<button type="button" class="pk-cancel" id="pickCancel">取消</button>';
    document.body.appendChild(mask);
    document.body.appendChild(sheet);

    const closePick = () => { mask.classList.remove('on'); sheet.classList.remove('on'); };
    mask.addEventListener('click', closePick);
    sheet.querySelector('#pickCancel').addEventListener('click', closePick);
    sheet.querySelector('#pickCam').addEventListener('click', () => {
      closePick();
      fileInput.click();
    });
    sheet.querySelector('#pickAlbum').addEventListener('click', () => {
      closePick();
      picker.click();
    });

    // app.js 会给 #btnReshoot 绑 onclick，所以等它绑完再接管
    setTimeout(function () {
      const reshoot = document.getElementById('btnReshoot');
      if (!reshoot) return;
      reshoot.onclick = function () {
        mask.classList.add('on');
        sheet.classList.add('on');
      };
    }, 0);
  }

  document.addEventListener('DOMContentLoaded', mount);
})();
