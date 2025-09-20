import React, { useState, useRef } from "react";
import { Card } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function App() {
  const [formFields, setFormFields] = useState([]);
  const [iframeHtml, setIframeHtml] = useState("");
  const [fileUrl, setFileUrl] = useState(null);
  const lastObjectUrlRef = useRef(null);
  const [leftHtml, setLeftHtml] = useState("");
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [loadingDownloadRaw, setLoadingDownloadRaw] = useState(false);
  const filledIframeRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);

    // Show the exact uploaded form on the right immediately
    if (lastObjectUrlRef.current) URL.revokeObjectURL(lastObjectUrlRef.current);
    const url = URL.createObjectURL(file);
    lastObjectUrlRef.current = url;
    setFileUrl(url);

    // Build an embeddable preview HTML to avoid download behavior
    const type = file.type || "";
    const isDocx = /\.docx$/i.test(file.name) ||
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const pdfUrl = `${url}#zoom=page-width`;
    const previewHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0;height:100%;} .fill{width:100%;height:100%;border:0;} .docx{box-sizing:border-box;padding:16px;height:100%;overflow:auto;}</style>${isDocx ? '<script src="https://unpkg.com/mammoth/mammoth.browser.min.js"></script>' : ''}</head><body>${
      type.startsWith("image/")
        ? `<img src="${url}" class="fill" style="object-fit:contain" />`
        : isDocx
        ? `<div id="docx" class="docx">Loading DOCX preview...</div><script>(function(){fetch('${url}').then(function(r){return r.arrayBuffer();}).then(function(ab){return window.mammoth.convertToHtml({arrayBuffer:ab});}).then(function(res){document.getElementById('docx').innerHTML=res.value;}).catch(function(err){document.getElementById('docx').textContent='Unable to preview DOCX.'; console.error(err);});})();<\/script>`
        : type === "application/pdf"
        ? `<iframe src="${pdfUrl}" class="fill"></iframe>`
        : `<object data="${url}" type="${type || "application/octet-stream"}" class="fill">
             <iframe src="${url}" class="fill"></iframe>
           </object>`
    }</body></html>`;
    setIframeHtml(previewHtml);
    setFormFields([]); // clear previous fields while processing
    setLeftHtml(""); // clear previous HTML
    setExtractError(""); // clear previous errors
  };

  const handleProcessForm = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("file", selectedFile);

    setExtractError("");
    setLoadingExtract(true);
    try {
      const res = await fetch(`${API_BASE}/extract_html`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const data = await res.json();
      setFormFields(data.fields || []);
      // Show API-provided auto-filled HTML on the left panel
      setLeftHtml(data.html || "");
    } catch (err) {
      setExtractError("Failed to process the document. Please try again.");
      setLeftHtml("");
    } finally {
      setLoadingExtract(false);
    }
  };

  const handleChange = (index, value) => {
    const updated = [...formFields];
    updated[index].value = value;
    setFormFields(updated);
  };

  const handleReset = () => {
    // Reset all states
    setSelectedFile(null);
    setFormFields([]);
    setIframeHtml("");
    setFileUrl(null);
    setLeftHtml("");
    setExtractError("");
    setLoadingExtract(false);
    
    // Clean up object URL
    if (lastObjectUrlRef.current) {
      URL.revokeObjectURL(lastObjectUrlRef.current);
      lastObjectUrlRef.current = null;
    }
    
    // Reset the file input form
    const fileInput = document.getElementById('file');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleDownloadPDF = async () => {
    if (!leftHtml) {
      alert("Please process a form first to generate the filled HTML.");
      return;
    }

    try {
      setLoadingDownload(true);
      // Capture the latest edited HTML from the left iframe, if available
      let updatedHtml = leftHtml;
      try {
        const iframeEl = filledIframeRef.current;
        if (iframeEl && iframeEl.contentDocument) {
          const doc = iframeEl.contentDocument;
          // Normalize live values into attributes so they persist in outerHTML
          const inputs = doc.querySelectorAll('input');
          inputs.forEach((inp) => {
            const type = (inp.getAttribute('type') || 'text').toLowerCase();
            if (type === 'checkbox' || type === 'radio') {
              if (inp.checked) {
                inp.setAttribute('checked', '');
              } else {
                inp.removeAttribute('checked');
              }
              if (inp.value !== undefined) inp.setAttribute('value', inp.value);
            } else {
              if (inp.value !== undefined) inp.setAttribute('value', inp.value);
            }
          });
          const textareas = doc.querySelectorAll('textarea');
          textareas.forEach((ta) => {
            ta.textContent = ta.value || '';
          });
          const selects = doc.querySelectorAll('select');
          selects.forEach((sel) => {
            Array.from(sel.options).forEach((opt) => {
              if (opt.selected) opt.setAttribute('selected', ''); else opt.removeAttribute('selected');
            });
          });
          updatedHtml = "<!doctype html>\n" + (doc.documentElement ? doc.documentElement.outerHTML : '');
        }
      } catch (e) {
        // Fallback to leftHtml if access fails
      }

      const formData = new FormData();
      // updatedHtml='<div class="field">\n      <label>2.7.) Produkthaftpflichtversicherung vorhanden?</label>\n      <div class="col">\n        <div class="inline">\n          <label class="checkbox-label"><input type="radio" name="produckthaftpflicht" value="ja" checked=""> ja</label>\n          <label class="checkbox-label"><input type="radio" name="produckthaftpflicht" value="nein"> nein</label>\n          <span class="conf">Confidence: 0.82</span>\n        </div>\n   </div>\n  </div>\n     '
      formData.append("html", updatedHtml);
      if (selectedFile && selectedFile.name) {
        formData.append("file", selectedFile);
      }

      // Call the agent_fill_pdf API
      const response = await fetch(`${API_BASE}/agent_fill_pdf`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`PDF download failed: ${response.status}`);
      }

      // Get the PDF blob from the response
      const pdfBlob = await response.blob();
      
      // Create a download link and trigger download
      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      // Try to extract filename from Content-Disposition; fallback to a sensible default
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `filled_form_${new Date().toISOString().slice(0, 10)}.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
        if (match) {
          filename = decodeURIComponent(match[1] || match[2]);
        }
      }
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL object
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error("Error downloading PDF:", error);
      alert("Failed to download PDF. Please try again.");
    } finally {
      setLoadingDownload(false);
    }
  };

  const handleDownloadRawPDF = async () => {
    if (!leftHtml) {
      alert("Please process a form first to generate the filled HTML.");
      return;
    }

    try {
      setLoadingDownloadRaw(true);
      // Capture the latest edited HTML from the left iframe, if available
      let updatedHtml = leftHtml;
      try {
        const iframeEl = filledIframeRef.current;
        if (iframeEl && iframeEl.contentDocument) {
          const doc = iframeEl.contentDocument;
          // Normalize live values into attributes so they persist in outerHTML
          const inputs = doc.querySelectorAll('input');
          inputs.forEach((inp) => {
            const type = (inp.getAttribute('type') || 'text').toLowerCase();
            if (type === 'checkbox' || type === 'radio') {
              if (inp.checked) {
                inp.setAttribute('checked', '');
              } else {
                inp.removeAttribute('checked');
              }
              if (inp.value !== undefined) inp.setAttribute('value', inp.value);
            } else {
              if (inp.value !== undefined) inp.setAttribute('value', inp.value);
            }
          });
          const textareas = doc.querySelectorAll('textarea');
          textareas.forEach((ta) => {
            ta.textContent = ta.value || '';
          });
          const selects = doc.querySelectorAll('select');
          selects.forEach((sel) => {
            Array.from(sel.options).forEach((opt) => {
              if (opt.selected) opt.setAttribute('selected', ''); else opt.removeAttribute('selected');
            });
          });
          updatedHtml = "<!doctype html>\n" + (doc.documentElement ? doc.documentElement.outerHTML : '');
        }
      } catch (e) {
        // Fallback to leftHtml if access fails
      }

      const formData = new FormData();
      formData.append("html", updatedHtml);
      if (selectedFile && selectedFile.name) {
        formData.append("file", selectedFile);
      }

      // Call the raw_agent_fill_pdf API
      const response = await fetch(`${API_BASE}/raw_agent_fill_pdf`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`PDF download failed: ${response.status}`);
      }

      // Get the PDF blob from the response
      const pdfBlob = await response.blob();
      
      // Create a download link and trigger download
      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      // Try to extract filename from Content-Disposition; fallback to a sensible default
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `filled_form_${new Date().toISOString().slice(0, 10)}.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
        if (match) {
          filename = decodeURIComponent(match[1] || match[2]);
        }
      }
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL object
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error("Error downloading PDF:", error);
      alert("Failed to download PDF. Please try again.");
    } finally {
      setLoadingDownloadRaw(false);
    }
  };
  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
              <div className="bg-white border-b border-gray-100 px-8 py-6">
          <div className="flex items-center">
            <img src="/images/logo.svg" alt="Logo" className="h-16 w-64" />
            <div className="flex-1 flex justify-center">
              <h1 className="text-3xl font-bold text-teal-700">AI Agent Document Processing</h1>
            </div>
          </div>
        </div>
      
      {/* Main Content */}
      <div className="flex-1 grid grid-cols-2 gap-8 p-8">
              <div className="space-y-6 overflow-y-auto">
        <Card className="p-6 bg-white shadow-sm border border-gray-100">
          <Label htmlFor="file" className="mb-3 text-teal-700 font-semibold text-lg">Upload Customer Form</Label>
          <div className="flex gap-3">
            <Input type="file" id="file" onChange={handleUpload} className="flex-1 border-gray-200 focus:border-teal-500 focus:ring-teal-500" />
            <button
              onClick={handleProcessForm}
              disabled={!selectedFile || loadingExtract}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors whitespace-nowrap font-medium"
            >
              {loadingExtract ? "Processing..." : "Process Form"}
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-teal-700 text-white rounded-md hover:bg-teal-800 transition-colors whitespace-nowrap font-medium"
            >
              Reset
            </button>
          </div>
        </Card>

        <Card className="p-6 bg-white shadow-sm border border-gray-100 space-y-4">
          <Label className="text-teal-700 font-semibold text-lg">Auto-fill Form</Label>
          {extractError && (
            <div className="text-red-600 text-sm">{extractError}</div>
          )}
          {loadingExtract ? (
            <div className="w-full h-[70vh] flex items-center justify-center">
              <div className="h-8 w-8 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
          ) : leftHtml ? (
            <div className="w-full h-[70vh]">
              <iframe ref={filledIframeRef} title="Generated HTML" srcDoc={leftHtml} className="w-full h-full" />
            </div>
          ) : (
            <div className="w-full h-[70vh] flex items-center justify-center text-gray-500 text-lg">
              Auto-fill form will appear here after processing
            </div>
          )}
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleDownloadPDF}
            disabled={!leftHtml || loadingDownload}
            className="flex-1 px-6 py-3 bg-teal-700 text-white rounded-md hover:bg-teal-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
          >
            {loadingDownload && (
              <span className="h-5 w-5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
            )}
            {loadingDownload ? "Preparing Interactive PDF..." : "Download Interactive Form"}
          </button>
          <button
           onClick={handleDownloadRawPDF}
           disabled={!leftHtml || loadingDownloadRaw}
            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
             {loadingDownloadRaw && (
              <span className="h-5 w-5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
            )}
            {loadingDownloadRaw ? "Preparing Raw PDF..." : "Download Raw Form"}
            
          </button>
        </div>
      </div>

      <div>
        <Card className="h-full p-6 bg-white shadow-sm border border-gray-100">
          <Label className="mb-4 text-teal-700 font-semibold text-lg">File Preview</Label>
          {iframeHtml ? (
            <iframe title="Form Preview" srcDoc={iframeHtml} className="w-full h-full" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-lg">
              Upload a file to preview it here
            </div>
          )}
        </Card>
      </div>
      </div>
    </div>
  );
}

export default App;