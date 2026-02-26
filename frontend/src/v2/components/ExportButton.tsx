import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════════
// Issue #17: Export Functionality
// ═══════════════════════════════════════════════════════════════════════════════

type ExportFormat = 'csv' | 'json' | 'pdf';

interface ExportButtonProps {
  data: unknown[];
  filename: string;
  columns?: Array<{ key: string; label: string }>;
  onExport?: (format: ExportFormat) => void;
  disabled?: boolean;
}

export function ExportButton({
  data,
  filename,
  columns,
  onExport,
  disabled = false,
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    setIsExporting(true);
    setIsOpen(false);

    try {
      if (format === 'csv') {
        exportAsCSV(data, filename, columns);
      } else if (format === 'json') {
        exportAsJSON(data, filename);
      } else if (format === 'pdf') {
        await exportAsPDF(data, filename, columns);
      }

      onExport?.(format);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="V2ExportButton" role="group" aria-label="Export options">
      <button
        className="V2ExportButton__trigger"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || isExporting}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {isExporting ? (
          <span className="V2ExportButton__spinner" aria-hidden="true" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        )}
        <span>Export</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="V2ExportButton__dropdown"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            role="menu"
          >
            <button
              className="V2ExportButton__option"
              onClick={() => handleExport('csv')}
              role="menuitem"
            >
              <span className="V2ExportButton__optionIcon" aria-hidden="true">📊</span>
              <span>Export as CSV</span>
            </button>
            <button
              className="V2ExportButton__option"
              onClick={() => handleExport('json')}
              role="menuitem"
            >
              <span className="V2ExportButton__optionIcon" aria-hidden="true">{ }</span>
              <span>Export as JSON</span>
            </button>
            <button
              className="V2ExportButton__option"
              onClick={() => handleExport('pdf')}
              role="menuitem"
            >
              <span className="V2ExportButton__optionIcon" aria-hidden="true">📄</span>
              <span>Export as PDF</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function exportAsCSV(
  data: unknown[],
  filename: string,
  columns?: Array<{ key: string; label: string }>
) {
  if (data.length === 0) return;

  const headers = columns
    ? columns.map((c) => c.label)
    : Object.keys(data[0] as object);

  const keys = columns ? columns.map((c) => c.key) : Object.keys(data[0] as object);

  const csvContent = [
    headers.join(','),
    ...data.map((row) =>
      keys
        .map((key) => {
          const value = (row as Record<string, unknown>)[key];
          const stringValue = value?.toString() || '';
          return stringValue.includes(',') ? `"${stringValue}"` : stringValue;
        })
        .join(',')
    ),
  ].join('\n');

  downloadFile(csvContent, `${filename}.csv`, 'text/csv');
}

function exportAsJSON(data: unknown[], filename: string) {
  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile(jsonContent, `${filename}.json`, 'application/json');
}

async function exportAsPDF(
  data: unknown[],
  filename: string,
  columns?: Array<{ key: string; label: string }>
) {
  // Simple HTML-to-PDF using print
  const headers = columns
    ? columns.map((c) => c.label)
    : Object.keys(data[0] as object);

  const keys = columns ? columns.map((c) => c.key) : Object.keys(data[0] as object);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${filename}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; }
        h1 { font-size: 24px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        tr:nth-child(even) { background: #fafafa; }
        .footer { margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <h1>${filename}</h1>
      <table>
        <thead>
          <tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${data
            .map(
              (row) =>
                `<tr>${keys
                  .map((key) => `<td>${(row as Record<string, unknown>)[key] ?? ''}</td>`)
                  .join('')}</tr>`
            )
            .join('')}
        </tbody>
      </table>
      <div class="footer">
        Generated on ${new Date().toLocaleString()} | PT Biz SMS Dashboard
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  }
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default ExportButton;
