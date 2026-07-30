import { useState } from "react";
import { KeyRound, X } from "lucide-react";

export default function GithubCodeDialog({ initialToken, isSaving, error, onClose, onSave, onClear }) {
  const [token, setToken] = useState(initialToken);

  return <div className="amy-dialog-backdrop" role="presentation">
    <section className="amy-dialog" role="dialog" aria-modal="true" aria-labelledby="github-access-title">
      <div className="amy-dialog-title">
        <KeyRound size={20} />
        <div><h2 id="github-access-title">上传代码</h2></div>
        <button aria-label="关闭" onClick={onClose}><X size={18} /></button>
      </div>
      <p className="amy-token-help">请上传代码，有问题咨询管理员</p>
      <label className="amy-token-field">
        代码
        <input type="password" value={token} onChange={(event) => setToken(event.target.value.trim())} placeholder="请输入代码" autoComplete="off" />
      </label>
      {error ? <p className="amy-dialog-error">{error}</p> : null}
      <div className="amy-dialog-actions">
        {initialToken ? <button className="danger" onClick={onClear}>清除代码</button> : <span />}
        <button className="secondary" onClick={onClose}>取消</button>
        <button className="primary" disabled={!token || isSaving} onClick={() => onSave(token)}>{isSaving ? "正在验证" : "保存"}</button>
      </div>
    </section>
  </div>;
}
