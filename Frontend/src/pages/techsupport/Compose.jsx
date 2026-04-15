import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import styles from "./styles/Compose.module.css";
import API from "../../API/api";

function Compose() {
  const [numbers, setNumbers] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [showSidebar, setShowSidebar] = useState(false);

  const fileInputRef = useRef(null);

  const cleanNumbers = (value) => {
    return value.replace(/[^\d\n, ]/g, "");
  };

  const normalizeNumber = (num) => {
    return num.replace(/\D/g, "");
  };

  const formatNumbers = () => {
    return numbers
      .split(/[\n, ]+/)
      .map(normalizeNumber)
      .filter(Boolean);
  };

  const numberList = formatNumbers();

  // CSV upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const extracted = [];

      json.forEach((row) => {
        row.forEach((cell) => {
          if (!cell) return;
          const num = normalizeNumber(String(cell));
          if (num.length >= 10) extracted.push(num);
        });
      });

      setNumbers((prev) => prev + "\n" + extracted.join("\n"));
    };

    reader.readAsArrayBuffer(file);
  };

  // 🔥 FIXED MULTI FILE HANDLER
  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;

    const combined = [...files, ...selected].slice(0, 5); // ✅ FIX (5)

    setFiles(combined);

    const newPreviews = combined.map((file) =>
      file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
    );

    setPreviews(newPreviews);
  };

  const handleSend = async () => {
    if (
      !numberList.length ||
      (!(message && message.trim()) && files.length === 0)
    ) {
      return alert("Add numbers + message or file");
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("to", JSON.stringify(numberList));
      formData.append("message", message);

      // 🔥 FIXED KEY NAME
      files.forEach((f) => {
        formData.append("files", f); // ✅ MUST MATCH BACKEND
      });

      const res = await API.post("/compose/send", formData);

      const sent = res.data.results.filter((r) => r.status === "sent").length;
      const failed = res.data.results.filter((r) => r.status === "failed").length;

      alert(`✅ Sent: ${sent} | ❌ Failed: ${failed}`);

      setNumbers("");
      setMessage("");
      setFiles([]);
      setPreviews([]);
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.error || "Failed ❌");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {showSidebar && (
        <div
          className={styles.overlay}
          onClick={() => setShowSidebar(false)}
        />
      )}

      <div
        className={`${styles.sidebar} ${showSidebar ? styles.show : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Recipients</h2>

        <label className={styles.uploadBox}>
          <div className={styles.uploadIcon}>📂</div>
          <div className={styles.uploadTitle}>Upload CSV / Excel</div>
          <div className={styles.uploadBtn}>Choose File</div>

          <input
            type="file"
            accept=".csv, .xlsx, .xls"
            onChange={handleFileUpload}
          />
        </label>

        <div className={styles.section}>
          <label>Numbers</label>
          <textarea
            value={numbers}
            onChange={(e) => setNumbers(cleanNumbers(e.target.value))}
          />
        </div>

        <div className={styles.count}>
          {numberList.length} recipients
        </div>
      </div>

      <div className={styles.chat}>
        <div className={styles.header}>
          <button
            className={styles.menuBtn}
            onClick={() => setShowSidebar((prev) => !prev)}
          >
            ☰
          </button>
          <h2>Compose Message</h2>
          <span>{numberList.length} selected</span>
        </div>

        <div className={styles.empty}>
          <p>Start typing your message below</p>
        </div>

        {files.length > 0 && (
          <div className={styles.previewBox}>
            {files.map((file, i) => (
              <div key={i} className={styles.previewItem}>
                {previews[i] ? (
                  <img src={previews[i]} alt="preview" />
                ) : (
                  <div className={styles.filePreview}>
                    📎 {file.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={styles.inputBar}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
          />

          <div className={styles.fileActions}>
            <label className={styles.iconBtn}>
              📎
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileChange}
                hidden
              />
            </label>

            <label className={styles.iconBtn}>
              🖼️
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleFileChange}
                hidden
              />
            </label>
          </div>

          <button onClick={handleSend} disabled={loading}>
            {loading ? <div className={styles.loader}></div> : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Compose;