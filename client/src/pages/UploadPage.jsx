import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

export default function UploadPage() {
  const [file, setFile] = useState(null);
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

  async function loadCampaigns() {
    try {
      const data = await apiFetch("/campaigns");
      setCampaigns(data.items || []);
    } catch (err) {
      setError(err.message || "Failed to load campaigns");
    }
  }

  function handleFileChange(e) {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setPreview(null);
    setError("");
    setSuccess("");
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
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
          />

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