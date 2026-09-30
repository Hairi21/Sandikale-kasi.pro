import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Order, ShiftRecord, StoreSettings, CustomSablonDetails } from '../types';

interface OptimizedImageInfo {
  dataUrl: string;
  width: number;
  height: number;
  format: 'JPEG' | 'PNG';
}

// In-memory image cache to prevent repeated canvas re-compression
const pdfImageCache = new Map<string, OptimizedImageInfo>();

/**
 * Ultra-fast, zero-lag browser download helper for jsPDF.
 * Uses native Blob and ObjectURL to prevent jsPDF internal thread-blocking save routine.
 */
function triggerPdfDownload(doc: jsPDF, filename: string): void {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1200);
}

/**
 * Pre-processes images specifically for ultra-fast, zero-lag jsPDF insertion.
 * Scales down giant base64 payloads to crisp PDF-native dimensions and uses
 * hardware-accelerated canvas to prevent main thread freezing during PDF export.
 */
async function getOptimizedPdfImage(
  src: string | undefined,
  maxDimension = 600
): Promise<OptimizedImageInfo | null> {
  if (!src || (!src.startsWith('data:image') && !src.startsWith('blob:'))) return null;

  const cacheKey = `${src.slice(0, 80)}_${src.length}_${maxDimension}`;
  if (pdfImageCache.has(cacheKey)) {
    return pdfImageCache.get(cacheKey)!;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;
      if (origW <= 0 || origH <= 0) {
        resolve(null);
        return;
      }

      // Calculate scale to bound maximum dimension
      const scale = Math.min(1, maxDimension / Math.max(origW, origH));
      const targetW = Math.max(1, Math.round(origW * scale));
      const targetH = Math.max(1, Math.round(origH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';

      const isPng = src.startsWith('data:image/png');

      if (!isPng) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const result: OptimizedImageInfo = {
        dataUrl: isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85),
        width: origW,
        height: origH,
        format: isPng ? 'PNG' : 'JPEG',
      };

      pdfImageCache.set(cacheKey, result);
      resolve(result);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Downloads an authentic thermal receipt PDF formatted for 58mm or 80mm paper widths.
 * Automatically embeds uploaded store logo if available, keeping its natural proportions.
 */
export async function downloadReceiptPdf(order: Order, store: StoreSettings): Promise<void> {
  const is58mm = store.printerPaperSize === '58mm';
  const paperWidth = is58mm ? 58 : 80;
  const estimatedHeight = 145 + order.items.length * 10;

  // Pre-optimize logo before creating PDF
  const logoInfo = await getOptimizedPdfImage(store.logoUrl, 300);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [paperWidth, Math.max(150, estimatedHeight)],
  });

  const centerX = paperWidth / 2;
  let curY = 6;

  // Store Logo if available (proportional scaling)
  if (logoInfo) {
    try {
      const maxLogoW = is58mm ? 18 : 22;
      const maxLogoH = is58mm ? 14 : 16;
      let logoW = maxLogoW;
      let logoH = (logoInfo.height * maxLogoW) / logoInfo.width;
      if (logoH > maxLogoH) {
        logoH = maxLogoH;
        logoW = (logoInfo.width * maxLogoH) / logoInfo.height;
      }
      doc.addImage(logoInfo.dataUrl, logoInfo.format, centerX - logoW / 2, curY, logoW, logoH);
      curY += logoH + 3;
    } catch {
      // fallback
    }
  }

  // Header Store
  const storeDisplayName = store.storeName.replace(/\bPRO\s+POS\b/gi, '').replace(/\bPRO\b/gi, '').trim() || 'SANDIKALE';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(is58mm ? 10 : 12);
  doc.text(storeDisplayName, centerX, curY, { align: 'center' });
  curY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(is58mm ? 6.5 : 7.5);
  doc.text(store.tagline, centerX, curY, { align: 'center' });
  curY += 3.5;
  doc.text(store.address, centerX, curY, { align: 'center' });
  curY += 3.5;
  // Instagram tag replaces email
  doc.text(`WA: ${store.phone} | IG: ${store.instagram || '@_sandikale'}`, centerX, curY, { align: 'center' });
  curY += 4;

  // Dashed separator line
  doc.setLineDashPattern([1, 1], 0);
  doc.line(3, curY, paperWidth - 3, curY);
  curY += 4;

  // Metadata
  doc.setFontSize(is58mm ? 7 : 8);
  doc.text(`No. Struk : ${order.invoiceNumber}`, 4, curY);
  curY += 3.5;
  doc.text(`Tanggal   : ${order.date}`, 4, curY);
  curY += 3.5;
  doc.text(`Kasir     : ${order.cashierName}`, 4, curY);
  curY += 3.5;
  doc.text(`Pelanggan : ${order.customerName}`, 4, curY);
  curY += 4;

  doc.line(3, curY, paperWidth - 3, curY);
  curY += 4;

  // Items
  order.items.forEach((item) => {
    doc.setFont('helvetica', 'bold');
    doc.text(item.name.substring(0, is58mm ? 22 : 32), 4, curY);
    curY += 3.5;

    doc.setFont('helvetica', 'normal');
    doc.text(`${item.qty} x Rp ${item.price.toLocaleString('id-ID')}`, 6, curY);
    const itemTotal = item.qty * item.price - (item.discountAmount || 0);
    doc.text(`Rp ${itemTotal.toLocaleString('id-ID')}`, paperWidth - 4, curY, { align: 'right' });
    curY += 4;

    if (item.discountAmount > 0) {
      doc.setFont('helvetica', 'italic');
      doc.text(`(Diskon Item: -Rp ${item.discountAmount.toLocaleString('id-ID')})`, 6, curY);
      curY += 3.5;
    }
  });

  doc.line(3, curY, paperWidth - 3, curY);
  curY += 4.5;

  // Totals
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', 4, curY);
  doc.text(`Rp ${order.subtotal.toLocaleString('id-ID')}`, paperWidth - 4, curY, { align: 'right' });
  curY += 4;

  if (order.discountTotal > 0) {
    doc.text('Diskon:', 4, curY);
    doc.text(`-Rp ${order.discountTotal.toLocaleString('id-ID')}`, paperWidth - 4, curY, { align: 'right' });
    curY += 4;
  }

  if (order.taxAmount > 0) {
    doc.text(`PPN (${order.taxRate}%):`, 4, curY);
    doc.text(`Rp ${order.taxAmount.toLocaleString('id-ID')}`, paperWidth - 4, curY, { align: 'right' });
    curY += 4;
  }

  if (order.serviceCharge > 0) {
    doc.text('Layanan:', 4, curY);
    doc.text(`Rp ${order.serviceCharge.toLocaleString('id-ID')}`, paperWidth - 4, curY, { align: 'right' });
    curY += 4;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(is58mm ? 8.5 : 9.5);
  doc.text('TOTAL:', 4, curY);
  doc.text(`Rp ${order.grandTotal.toLocaleString('id-ID')}`, paperWidth - 4, curY, { align: 'right' });
  curY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(is58mm ? 7 : 8);
  doc.text(`Metode : ${order.paymentMethod}`, 4, curY);
  doc.text(`Bayar  : Rp ${order.amountPaid.toLocaleString('id-ID')}`, paperWidth - 4, curY, { align: 'right' });
  curY += 4;

  doc.text('Kembalian:', 4, curY);
  doc.text(`Rp ${order.change.toLocaleString('id-ID')}`, paperWidth - 4, curY, { align: 'right' });
  curY += 5;

  doc.line(3, curY, paperWidth - 3, curY);
  curY += 4;

  // Footer Message
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(is58mm ? 6.5 : 7);
  doc.text(store.receiptFooter || 'Terima kasih atas kunjungan Anda!', centerX, curY, { align: 'center' });
  curY += 3.5;
  doc.text('Barang yang sudah dibeli tidak dapat ditukar.', centerX, curY, { align: 'center' });

  // Microtask tick to ensure smooth UI animation before save
  await new Promise((r) => setTimeout(r, 20));
  triggerPdfDownload(doc, `Struk_${order.invoiceNumber}.pdf`);
}

/**
 * Downloads a professional Production Work Order (SPK) PDF in A4 format.
 * STRICTLY PRESERVES NATURAL ASPECT RATIO of uploaded design mockup (never distorted or pressed).
 * Fast, non-blocking generation with pre-optimized image embedding.
 */
export async function downloadProductionSpkPdf(
  custom: CustomSablonDetails,
  orderNumber: string,
  store: StoreSettings,
  cashierName: string
): Promise<void> {
  const storeDisplayName = store.storeName.replace(/\bPRO\s+POS\b/gi, '').replace(/\bPRO\b/gi, '').trim() || 'SANDIKALE';

  // Pre-optimize both logo and mockup concurrently for zero lag
  const [logoInfo, mockupInfo] = await Promise.all([
    getOptimizedPdfImage(store.logoUrl, 300),
    getOptimizedPdfImage(custom.designMockupUrl, 800),
  ]);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Header Banner in Deep Slate / Charcoal
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, 210, 30, 'F');

  // Store Logo in Banner if uploaded
  if (logoInfo) {
    try {
      const maxLw = 22;
      const maxLh = 22;
      let lw = maxLw;
      let lh = (logoInfo.height * maxLw) / logoInfo.width;
      if (lh > maxLh) {
        lh = maxLh;
        lw = (logoInfo.width * maxLh) / logoInfo.height;
      }
      doc.addImage(logoInfo.dataUrl, logoInfo.format, 12, 4 + (22 - lh) / 2, lw, lh);
    } catch {
      // fallback
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('SURAT PERINTAH KERJA (SPK) PRODUKSI', 105, 12, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${storeDisplayName} - DIVISI SABLON DTF & MERCHANDISE`, 105, 18, { align: 'center' });
  doc.setFontSize(7.5);
  doc.text(`Alamat: ${store.address} | WA: ${store.phone} | IG: ${store.instagram || '@_sandikale'}`, 105, 24, { align: 'center' });

  // Order Meta Card
  doc.setTextColor(15, 23, 42);
  let curY = 38;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, curY - 4, 180, 26, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(15, curY - 4, 180, 26, 2, 2, 'S');

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`No. Order SPK : ${orderNumber}`, 20, curY + 2);
  doc.text(`Tanggal Masuk : ${new Date().toLocaleString('id-ID')}`, 120, curY + 2);
  curY += 7;
  doc.text(`Nama Pemesan  : ${custom.customerName}`, 20, curY + 2);
  doc.text(`WhatsApp      : ${custom.customerPhone || '-'}`, 120, curY + 2);
  curY += 7;
  doc.text(`Kasir Input   : ${cashierName}`, 20, curY + 2);
  doc.text(`Total Order   : ${custom.totalPcs} pcs (Rp ${custom.totalPrice.toLocaleString('id-ID')})`, 120, curY + 2);

  curY += 15;

  // Garment & Size Matrix Box
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(15, curY - 3, 180, 28, 2, 2, 'F');
  doc.roundedRect(15, curY - 3, 180, 28, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SPESIFIKASI BAHAN & RINCIAN UKURAN KAOS', 20, curY + 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Jenis Garment: ${custom.garmentType}`, 20, curY + 10);
  doc.text(`Warna Kaos   : ${custom.garmentColor}`, 20, curY + 16);

  // Size matrix breakdown
  const sizeBreakdown = Object.entries(custom.garmentSizes || {})
    .filter(([_, q]) => q > 0)
    .map(([s, q]) => `${s}: ${q} pcs`)
    .join('  |  ') || 'All Size';

  doc.setFont('helvetica', 'bold');
  doc.text(`Rincian Ukuran (${custom.totalPcs} pcs total):`, 100, curY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(sizeBreakdown, 100, curY + 16);

  curY += 34;

  // Placement Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('POSISI DAN UKURAN SABLON DTF', 15, curY);
  curY += 4;

  const placementRows = (custom.placements || []).map((p, idx) => [
    `#${idx + 1}`,
    p.placement,
    p.printSize,
    `Rp ${p.price.toLocaleString('id-ID')}`,
    'DTF High Definition Elasticity',
    'Press 160°C - 15 detik (Cold Peel)',
  ]);

  autoTable(doc, {
    startY: curY,
    head: [['No', 'Posisi Sablon', 'Ukuran Desain', 'Harga Jasa', 'Teknik Sablon', 'Instruksi Mesin Press']],
    body: placementRows.length > 0 ? placementRows : [['1', 'Depan Dada', 'A3', 'Rp 25.000', 'DTF Digital', '160°C, 15 detik']],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8.5 },
    margin: { left: 15, right: 15 },
  });

  curY = (doc as any).lastAutoTable.finalY + 8;

  // Design Mockup Artwork Area (PRESERVES NATURAL ASPECT RATIO STRICTLY)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('REFERENSI VISUAL MOCKUP DESAIN DARI CUSTOMER (BENTUK ASLI)', 15, curY);
  curY += 5;

  if (mockupInfo) {
    try {
      const maxBoxWidth = 85;
      const maxBoxHeight = 65;

      let renderW = maxBoxWidth;
      let renderH = (mockupInfo.height * maxBoxWidth) / mockupInfo.width;

      if (renderH > maxBoxHeight) {
        renderH = maxBoxHeight;
        renderW = (mockupInfo.width * maxBoxHeight) / mockupInfo.height;
      }

      // Draw bounding box
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(15, curY, maxBoxWidth, maxBoxHeight, 2, 2, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(15, curY, maxBoxWidth, maxBoxHeight, 2, 2, 'S');

      // Center the image proportionally inside the box
      const posX = 15 + (maxBoxWidth - renderW) / 2;
      const posY = curY + (maxBoxHeight - renderH) / 2;

      doc.addImage(mockupInfo.dataUrl, mockupInfo.format, posX, posY, renderW, renderH);

      // Side notes box
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(105, curY, 90, maxBoxHeight, 2, 2, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(105, curY, 90, maxBoxHeight, 2, 2, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Petunjuk Teknis Operator & Press:', 110, curY + 8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`1. Dimensi File Asli: ${mockupInfo.width} x ${mockupInfo.height} px (Proporsi Alami)`, 110, curY + 15);
      doc.text(`2. Setting RIP: Pasang sheet DTF tanpa mengubah aspect ratio.`, 110, curY + 21);
      doc.text(`3. Catatan: ${custom.productionNotes || 'Press 160°C, 15 detik, cold peel.'}`, 110, curY + 28, { maxWidth: 80 });

      curY += maxBoxHeight + 6;
    } catch {
      doc.rect(15, curY, 80, 45);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.text('(Mockup Terlampir di Sistem Digital)', 20, curY + 22);
      curY += 50;
    }
  } else {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15, curY, 180, 24, 2, 2, 'F');
    doc.roundedRect(15, curY, 180, 24, 2, 2, 'S');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text('File desain siap cetak (RIP / Gang Sheet DTF) langsung dari komputer operator.', 20, curY + 10);
    doc.text(`Catatan Khusus: ${custom.productionNotes || 'Press sesuai standar 160°C selama 15 detik.'}`, 20, curY + 17);
    curY += 30;
  }

  // Operator Signatures
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PENGESAHAN & PENANGGUNG JAWAB PRODUKSI', 15, curY + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  doc.text('Operator Desain/RIP', 25, curY + 13);
  doc.line(20, curY + 26, 65, curY + 26);

  doc.text('Operator Cetak & Press', 85, curY + 13);
  doc.line(80, curY + 26, 130, curY + 26);

  doc.text('Quality Control (QC)', 150, curY + 13);
  doc.line(145, curY + 26, 195, curY + 26);

  // Microtask tick to ensure smooth UI animation before save
  await new Promise((r) => setTimeout(r, 20));
  triggerPdfDownload(doc, `SPK_${orderNumber}.pdf`);
}

/**
 * Downloads a Z-Report (Laporan Tutup Shift Kasir) in formal PDF.
 */
export async function downloadShiftReportPdf(shift: ShiftRecord, store: StoreSettings): Promise<void> {
  const storeDisplayName = store.storeName.replace(/\bPRO\s+POS\b/gi, '').replace(/\bPRO\b/gi, '').trim() || 'SANDIKALE';

  // Pre-optimize logo
  const logoInfo = await getOptimizedPdfImage(store.logoUrl, 300);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Header Banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, 210, 30, 'F');

  // Store Logo in Banner if uploaded
  if (logoInfo) {
    try {
      const maxLw = 20;
      const maxLh = 20;
      let lw = maxLw;
      let lh = (logoInfo.height * maxLw) / logoInfo.width;
      if (lh > maxLh) {
        lh = maxLh;
        lw = (logoInfo.width * maxLh) / logoInfo.height;
      }
      doc.addImage(logoInfo.dataUrl, logoInfo.format, 12, 5 + (20 - lh) / 2, lw, lh);
    } catch {
      // fallback
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('LAPORAN PENUTUPAN KASIR (Z-REPORT)', 105, 12, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${storeDisplayName} - ${store.address} | Telp: ${store.phone} | IG: ${store.instagram || '@_sandikale'}`, 105, 18, { align: 'center' });
  doc.setFontSize(7.5);
  doc.text(`Shift ID: ${shift.shiftNumber} | Dicetak: ${new Date().toLocaleString('id-ID')}`, 105, 24, { align: 'center' });

  // Shift Meta Box
  doc.setTextColor(15, 23, 42);
  let curY = 38;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, curY - 5, 180, 26, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(15, curY - 5, 180, 26, 2, 2, 'S');

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Kasir Bertugas : ${shift.cashierName}`, 20, curY);
  doc.text(`Status Shift  : ${shift.status.toUpperCase()}`, 120, curY);
  curY += 7;
  doc.setFont('helvetica', 'normal');
  doc.text(`Waktu Buka    : ${shift.startTime}`, 20, curY);
  doc.text(`Waktu Tutup   : ${shift.endTime || 'Masih Aktif'}`, 120, curY);
  curY += 7;
  doc.text(`Total Transaksi: ${shift.totalTransactions} transaksi`, 20, curY);
  doc.text(`Catatan       : ${shift.notes || 'Normal'}`, 120, curY);

  curY += 15;

  // Financial Breakdown Table
  const cashInTotal = shift.drawerTransactions
    .filter((d) => d.type === 'cash_in')
    .reduce((s, d) => s + d.amount, 0);
  const cashOutTotal = shift.drawerTransactions
    .filter((d) => d.type === 'cash_out')
    .reduce((s, d) => s + d.amount, 0);

  const summaryRows = [
    ['1', 'Modal Awal Kas (Starting Float)', `Rp ${shift.startingCash.toLocaleString('id-ID')}`],
    ['2', 'Total Penjualan Tunai (Cash Sales)', `Rp ${shift.totalSalesCash.toLocaleString('id-ID')}`],
    ['3', 'Kas Masuk Tambahan (Cash In)', `Rp ${cashInTotal.toLocaleString('id-ID')}`],
    ['4', 'Kas Keluar Operasional (Cash Out / Petty)', `- Rp ${cashOutTotal.toLocaleString('id-ID')}`],
    ['5', 'Total Saldo Kas Sistem (Expected Cash)', `Rp ${shift.expectedCashEnding.toLocaleString('id-ID')}`],
    ['6', 'Hitungan Kas Fisik Aktual (Actual Cash)', `Rp ${(shift.actualCashEnding ?? shift.expectedCashEnding).toLocaleString('id-ID')}`],
    [
      '7',
      'Selisih Kas (Difference Over/Short)',
      (shift.cashDifference ?? 0) === 0
        ? 'Rp 0 (PAS / SEIMBANG)'
        : (shift.cashDifference ?? 0) > 0
        ? `+ Rp ${(shift.cashDifference ?? 0).toLocaleString('id-ID')} (LEBIH)`
        : `- Rp ${Math.abs(shift.cashDifference ?? 0).toLocaleString('id-ID')} (KURANG)`,
    ],
    ['8', 'Total Penjualan Non-Tunai (QRIS/Card/Transfer)', `Rp ${shift.totalSalesNonCash.toLocaleString('id-ID')}`],
    [
      '9',
      'TOTAL OMZET SHIFT INI',
      `Rp ${(shift.totalSalesCash + shift.totalSalesNonCash).toLocaleString('id-ID')}`,
    ],
  ];

  autoTable(doc, {
    startY: curY,
    head: [['No', 'Uraian Kas & Penjualan', 'Nominal']],
    body: summaryRows,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 15, right: 15 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 14;

  // Signatures
  doc.setFontSize(9);
  doc.text('Kasir Yang Menyerahkan:', 25, finalY);
  doc.line(20, finalY + 24, 75, finalY + 24);
  doc.text(shift.cashierName, 25, finalY + 28);

  doc.text('Supervisor / Head Store:', 135, finalY);
  doc.line(130, finalY + 24, 185, finalY + 24);
  doc.text('Hairi Habibullah (Owner)', 135, finalY + 28);

  // Microtask tick to ensure smooth UI animation before save
  await new Promise((r) => setTimeout(r, 20));
  triggerPdfDownload(doc, `Z_Report_${shift.shiftNumber}.pdf`);
}

/**
 * Downloads a complete sales audit report in A4 PDF.
 */
export async function downloadSalesAuditPdf(orders: Order[], store: StoreSettings): Promise<void> {
  const storeDisplayName = store.storeName.replace(/\bPRO\s+POS\b/gi, '').replace(/\bPRO\b/gi, '').trim() || 'SANDIKALE';

  // Pre-optimize logo
  const logoInfo = await getOptimizedPdfImage(store.logoUrl, 300);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 30, 'F');

  // Store Logo in Banner if uploaded
  if (logoInfo) {
    try {
      const maxLw = 20;
      const maxLh = 20;
      let lw = maxLw;
      let lh = (logoInfo.height * maxLw) / logoInfo.width;
      if (lh > maxLh) {
        lh = maxLh;
        lw = (logoInfo.width * maxLh) / logoInfo.height;
      }
      doc.addImage(logoInfo.dataUrl, logoInfo.format, 12, 5 + (20 - lh) / 2, lw, lh);
    } catch {
      // fallback
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('LAPORAN AUDIT PENJUALAN KASIR', 105, 12, { align: 'center' });
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${storeDisplayName} | ${store.address} | IG: ${store.instagram || '@_sandikale'}`, 105, 18, { align: 'center' });

  const completedOrders = orders.filter((o) => o.status === 'completed');
  const totalOmzet = completedOrders.reduce((sum, o) => sum + o.grandTotal, 0);

  let curY = 36;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Transaksi: ${completedOrders.length} transaksi`, 15, curY);
  doc.text(`Total Omzet: Rp ${totalOmzet.toLocaleString('id-ID')}`, 120, curY);
  curY += 7;

  const tableRows = completedOrders.map((o, idx) => [
    `${idx + 1}`,
    o.invoiceNumber,
    o.date,
    o.customerName,
    o.paymentMethod,
    `Rp ${o.subtotal.toLocaleString('id-ID')}`,
    `Rp ${o.discountTotal.toLocaleString('id-ID')}`,
    `Rp ${o.grandTotal.toLocaleString('id-ID')}`,
    o.cashierName,
  ]);

  autoTable(doc, {
    startY: curY,
    head: [['No', 'No. Invoice', 'Tanggal', 'Pelanggan', 'Metode', 'Subtotal', 'Diskon', 'Grand Total', 'Kasir']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 7.5 },
    margin: { left: 15, right: 15 },
  });

  // Microtask tick to ensure smooth UI animation before save
  await new Promise((r) => setTimeout(r, 20));
  triggerPdfDownload(doc, `Laporan_Penjualan_${new Date().toISOString().slice(0, 10)}.pdf`);
}
