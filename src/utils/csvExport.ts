import { Order, Product, ShiftRecord } from '../types';

export function exportOrdersCsv(orders: Order[], filename = 'Laporan_Penjualan_POS.csv') {
  const completedOrders = orders.filter((o) => o.status === 'completed');
  const totalOmzet = completedOrders.reduce((s, o) => s + o.grandTotal, 0);
  const totalDiskon = completedOrders.reduce((s, o) => s + o.discountTotal, 0);

  const headerBanner = [
    `"=== DOKUMEN RESMI LAPORAN PENJUALAN KASIR ==="`,
    `"Tanggal Cetak","${new Date().toLocaleString('id-ID')}"`,
    `"Penanggung Jawab","Hairi Habibullah (Owner)"`,
    `"Total Transaksi Berhasil",${completedOrders.length}`,
    `"Total Omzet Penjualan (Rp)",${totalOmzet}`,
    `"Total Potongan Diskon (Rp)",${totalDiskon}`,
    `""`,
    `"=== RINCIAN DETAIL TRANSAKSI ==="`,
  ];

  const headers = [
    'No Invoice',
    'Tanggal Transaksi',
    'Nama Pelanggan',
    'No Telepon',
    'Metode Pembayaran',
    'Subtotal Item (Rp)',
    'Diskon Nota (Rp)',
    'PPN Pajak (Rp)',
    'Biaya Layanan (Rp)',
    'Grand Total (Rp)',
    'Uang Diterima (Rp)',
    'Kembalian (Rp)',
    'Status Transaksi',
    'Kasir Bertugas',
  ];

  const rows = orders.map((o) => [
    `"${o.invoiceNumber}"`,
    `"${o.date}"`,
    `"${o.customerName.replace(/"/g, '""')}"`,
    `"${o.customerPhone || '-'}"`,
    `"${o.paymentMethod}"`,
    o.subtotal,
    o.discountTotal,
    o.taxAmount,
    o.serviceCharge,
    o.grandTotal,
    o.amountPaid,
    o.change,
    `"${o.status.toUpperCase()}"`,
    `"${o.cashierName}"`,
  ]);

  const footerSignatures = [
    `""`,
    `"=== PENGESAHAN LAPORAN KEUANGAN ==="`,
    `"Diverifikasi Oleh:","Hairi Habibullah (Owner)"`,
    `"Status Audit:","DISAHKAN & LENGKAP"`,
  ];

  const csvContent =
    '\uFEFF' +
    [
      ...headerBanner,
      headers.join(','),
      ...rows.map((r) => r.join(',')),
      ...footerSignatures,
    ].join('\n');

  downloadBlob(csvContent, filename);
}

export function exportShiftsCsv(shifts: ShiftRecord[], filename = 'Laporan_Shift_Kasir.csv') {
  const headerBanner = [
    `"=== LAPORAN RESMI BUKU SHIFT KASIR (Z-REPORTS) ==="`,
    `"Tanggal Audit","${new Date().toLocaleString('id-ID')}"`,
    `"Total Sesi Shift Terdata",${shifts.length}`,
    `""`,
    `"=== RINCIAN SESI SHIFT KASIR ==="`,
  ];

  const headers = [
    'Shift ID',
    'Kasir Bertugas',
    'Waktu Buka Shift',
    'Waktu Tutup Shift',
    'Modal Awal (Rp)',
    'Penjualan Tunai (Rp)',
    'Penjualan Non-Tunai (Rp)',
    'Total Transaksi Selesai',
    'Saldo Kas Sistem (Rp)',
    'Kas Fisik Aktual di Laci (Rp)',
    'Selisih Kas (+/- Rp)',
    'Status Shift',
    'Catatan Shift',
  ];

  const rows = shifts.map((s) => [
    `"${s.shiftNumber}"`,
    `"${s.cashierName}"`,
    `"${s.startTime}"`,
    `"${s.endTime || 'Aktif'}"`,
    s.startingCash,
    s.totalSalesCash,
    s.totalSalesNonCash,
    s.totalTransactions,
    s.expectedCashEnding,
    s.actualCashEnding ?? '-',
    s.cashDifference ?? 0,
    `"${s.status.toUpperCase()}"`,
    `"${(s.notes || '-').replace(/"/g, '""')}"`,
  ]);

  const footerSignatures = [
    `""`,
    `"=== TANDA TANGAN SERAH TERIMA KASIR ==="`,
    `"Disetujui Head Store / Owner:","Hairi Habibullah"`,
  ];

  const csvContent =
    '\uFEFF' +
    [
      ...headerBanner,
      headers.join(','),
      ...rows.map((r) => r.join(',')),
      ...footerSignatures,
    ].join('\n');

  downloadBlob(csvContent, filename);
}

export function exportProductsCsv(products: Product[], filename = 'Data_Katalog_Produk.csv') {
  const totalNilaiAset = products.reduce((s, p) => s + p.stock * p.costPrice, 0);

  const headerBanner = [
    `"=== LAPORAN STOK & KATALOG INVENTARIS PRODUK ==="`,
    `"Tanggal Audit","${new Date().toLocaleString('id-ID')}"`,
    `"Total SKU Produk Terdaftar",${products.length}`,
    `"Estimasi Total Nilai Aset Stok (HPP)",${totalNilaiAset}`,
    `""`,
    `"=== RINCIAN KATALOG PRODUK ==="`,
  ];

  const headers = [
    'SKU',
    'Barcode',
    'Nama Produk',
    'Kategori',
    'HPP Modal (Rp)',
    'Harga Jual (Rp)',
    'Margin Keuntungan (Rp)',
    'Stok Saat Ini',
    'Batas Min Alert',
    'Satuan',
    'Status Persediaan',
  ];

  const rows = products.map((p) => [
    `"${p.sku}"`,
    `"${p.barcode}"`,
    `"${p.name.replace(/"/g, '""')}"`,
    `"${p.category}"`,
    p.costPrice,
    p.sellingPrice,
    p.sellingPrice - p.costPrice,
    p.stock,
    p.minStock,
    `"${p.unit}"`,
    `"${p.stock <= 0 ? 'HABIS' : p.stock <= p.minStock ? 'MENIPIS' : 'AMAN'}"`,
  ]);

  const footerSignatures = [
    `""`,
    `"Penanggung Jawab Gudang & Stok:","Hairi Habibullah"`,
  ];

  const csvContent =
    '\uFEFF' +
    [
      ...headerBanner,
      headers.join(','),
      ...rows.map((r) => r.join(',')),
      ...footerSignatures,
    ].join('\n');

  downloadBlob(csvContent, filename);
}

function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
