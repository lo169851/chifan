/* 相册导入：独立入口，选完图后把文件塞回 #fileInput 并触发 change，
   这样 app.js 里原有的拍照→识别流程完全不用改。 */
(function () {
  'use strict';

  const STYLE = `
#albumBtn{
  width:100%;margin-top:10px;padding:14px;border-radius:16px;
  border:1px solid rgba(74,222,128,.45);background:rgba(74,222,128,.10);
  color:#4ade80;font-size:14.5px;font-family:inherit;font-weight:600;
}
#albumBtn:active{background:rgba(74,222,128,.18)}
`;

  function mount() {
    if (document.getElementById('albumBtn')) return;
    const area = document.getElementById('shootArea');
    const fileInput = document.getElementById('fileInput');
    if (!area || !fileInput) return;

    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    // 独立的相册选择框：故意不带 capture，这样系统才会给相册
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
        console.warn('相册导入转交失败，尝试直接处理', e);
        // 兜底：如果浏览器不支持给 input.files 赋值，就换一种方式
        const fakeEvt = { target: { files: [file], value: '' } };
        const handler = fileInput.__albumFallback;
        if (handler) handler(fakeEvt);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', mount);
})();
