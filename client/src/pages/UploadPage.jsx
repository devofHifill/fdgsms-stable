import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [campaigns, setCampaigns] = useState([]);
  const [enrollAfterImport, setEnrollAfterImport] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");

  useEffect(() => {
    loadCampaigns();
  }, []);

  // Prevent the browser from navigating to / opening a file if it's dropped
  // anywhere on the page (outside the dropzone).
  useEffect(() => {
    const prevent = (e) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  async function loadCampaigns() {
    try {
      const data = await apiFetch("/campaigns");
      setCampaigns(data.items || []);
    } catch (err) {
      setError(err.message || "Failed to load campaigns");
    }
  }

  function acceptFile(selected) {
    if (!selected) return;
    if (!/\.(csv|xlsx|xls)$/i.test(selected.name)) {
      setError("Unsupported file type. Please use .csv, .xlsx, or .xls");
      return;
    }
    setFile(selected);
    setPreview(null);
    setError("");
    setSuccess("");
  }

  function handleFileChange(e) {
    acceptFile(e.target.files?.[0] || null);
  }

  function handleDragOver(e) {
    e.preventDefault();
  }
  function handleDragEnter(e) {
    e.preventDefault();
    setDragging(true);
  }
  function handleDragLeave(e) {
    e.preventDefault();
    setDragging(false);
  }
  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer?.files?.[0] || null);
  }

  async function handlePreview() {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    try {
      setLoadingPreview(true);
      setError("");
      setSuccess("");

      const formData = new FormData();
      formData.append("file", file);

      const data = await apiFetch("/contact-import/upload-preview", {
        method: "POST",
        body: formData,
      });

      setPreview(data);
    } catch (err) {
      setError(err.message || "Failed to generate preview");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleImport() {
    if (!preview?.batchId || !preview?.validRows?.length) {
      setError("No valid rows available to import");
      return;
    }

    if (enrollAfterImport && !selectedCampaignId) {
      setError("Select a campaign to enroll imported contacts");
      return;
    }

    try {
      setImporting(true);
      setError("");
      setSuccess("");

      const importData = await apiFetch("/contact-import/import", {
        method: "POST",
        body: JSON.stringify({
          batchId: preview.batchId,
          validRows: preview.validRows,
        }),
      });

      let enrollMessage = "";

      if (enrollAfterImport) {
        const importedContactIds =
          (importData.items || []).map((item) => item._id).filter(Boolean);

        if (importedContactIds.length) {
          const enrollData = await apiFetch("/enrollments/bulk", {
            method: "POST",
            body: JSON.stringify({
              contactIds: importedContactIds,
              campaignId: selectedCampaignId,
            }),
          });

          enrollMessage = ` Enrolled: ${enrollData.createdCount}, Skipped: ${enrollData.skippedCount}.`;
        } else {
          enrollMessage = " No imported contacts were available for enrollment.";
        }
      }

      setSuccess(
        `Imported ${importData.importedCount} contacts successfully. Failed: ${importData.failedCount}.${enrollMessage}`
      );

      setPreview(null);
      setFile(null);
      setEnrollAfterImport(false);
      setSelectedCampaignId("");
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppLayout>
      <div className="upload-page">
        <div className="upload-header">
          <h1>Import Contacts</h1>
          <p>Upload CSV or Excel files to preview and import contacts.</p>
        </div>

        <div className="upload-card">
          <label
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="dz-ico">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 5v12"/></svg>
            </div>
            <div className="dz-title">Drag &amp; drop your file here</div>
            <div className="dz-sub">or click to browse — .csv, .xlsx, .xls (max 10MB)</div>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              hidden
            />
          </label>

          {file ? (
            <div className="dz-file">
              <div className="dz-file-main">
                <span className="row-avatar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                </span>
                <div>
                  <div className="t-primary">{file.name}</div>
                  <div className="t-sub">{(file.size / 1024).toFixed(0)} KB</div>
                </div>
              </div>
              <span className="status-badge status-active">Ready</span>
            </div>
          ) : null}

          <div className="upload-enroll-box">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={enrollAfterImport}
                onChange={(e) => setEnrollAfterImport(e.target.checked)}
              />
              <span>Enroll imported contacts into a campaign after import</span>
            </label>

            {enrollAfterImport ? (
              <select
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
              >
                <option value="">Select Campaign</option>
                {campaigns.map((campaign) => (
                  <option key={campaign._id} value={campaign._id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="upload-actions">
            <button onClick={handlePreview} disabled={loadingPreview}>
              {loadingPreview ? "Generating Preview..." : "Preview File"}
            </button>

            <button
              type="submit"
              onClick={handleImport}
              disabled={importing || !preview?.validRows?.length}
            >
              {importing ? "Importing..." : "Confirm Import"}
            </button>
          </div>

          {error ? <p className="status-error">{error}</p> : null}
          {success ? <p className="status-success">{success}</p> : null}
        </div>

        {preview ? (
          <div className="preview-section">
            <div className="preview-summary">
              <div>Total Rows: {preview.summary.totalRows}</div>
              <div>Valid Rows: {preview.summary.validRows}</div>
              <div>Invalid Rows: {preview.summary.invalidRows}</div>
            </div>

            <div className="preview-table-wrap">
              <h2>Valid Rows</h2>
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Normalized</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.validRows.map((row) => (
                    <tr key={`valid-${row.rowNumber}-${row.normalizedPhone}`}>
                      <td>{row.rowNumber}</td>
                      <td>{row.fullName}</td>
                      <td>{row.email || "-"}</td>
                      <td>{row.phone}</td>
                      <td>{row.normalizedPhone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="preview-table-wrap">
              <h2>Invalid Rows</h2>
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.invalidRows.map((row) => (
                    <tr key={`invalid-${row.rowNumber}-${row.phone}`}>
                      <td>{row.rowNumber}</td>
                      <td>{row.fullName || "-"}</td>
                      <td>{row.phone || "-"}</td>
                      <td>{row.errors.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
